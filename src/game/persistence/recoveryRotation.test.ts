import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialCampaignState } from '../campaign/campaignState';
import { createInitialState, greatPlainsSaveContext } from '../scenarios/greatPlains';
import { advanceSimulationByClockUnits } from '../simulation/advanceSimulation';
import { drawSimulationRandomInteger } from '../simulation/random';
import { encodeGameSave, type GameSaveSnapshot } from './saveCodec';
import {
  createRecoveryService,
  loadNewestValidRecovery,
  RECOVERY_SLOT_IDS,
  type RecoverySlotId,
  type RecoverySlotStorage,
  writeRotatingRecovery,
  writeRecoveryWithRetry,
} from './recoveryRotation';

class MemoryRecoveryStorage implements RecoverySlotStorage {
  readonly slots = new Map<RecoverySlotId, string>();
  readonly unreadable = new Set<RecoverySlotId>();
  corruptNextReadAfterWrite = false;
  failNextWrite = false;
  private corruptOnNextRead = false;
  writeBarrier: Promise<void> | null = null;

  readSlot = (slotId: RecoverySlotId): Promise<string | null> => {
    if (this.unreadable.has(slotId)) {
      return Promise.reject(new Error(`Cannot read ${slotId}.`));
    }
    const serialized = this.slots.get(slotId) ?? null;
    if (this.corruptOnNextRead && serialized !== null) {
      this.corruptOnNextRead = false;
      return Promise.resolve(serialized.slice(0, Math.max(0, serialized.length - 1)));
    }
    return Promise.resolve(serialized);
  };

  replaceSlotAtomically = (
    slotId: RecoverySlotId,
    expectedSerialized: string | null,
    serialized: string,
  ): Promise<boolean> => {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return Promise.reject(new Error('Injected atomic replacement failure.'));
    }
    const commit = () => {
      if ((this.slots.get(slotId) ?? null) !== expectedSerialized) return false;
      this.slots.set(slotId, serialized);
      this.corruptOnNextRead = this.corruptNextReadAfterWrite;
      this.corruptNextReadAfterWrite = false;
      return true;
    };
    return (this.writeBarrier ?? Promise.resolve()).then(commit);
  };
}

const campaign = createInitialCampaignState('great-plains');
const recoverySnapshot = (clockUnits = 0): Omit<GameSaveSnapshot, 'saveSequence'> => ({
  campaign,
  nextCommandSequence: clockUnits,
  simulation: advanceSimulationByClockUnits(createInitialState(), clockUnits),
});

const encodedAtSequence = (saveSequence: number, clockUnits = 0): string =>
  encodeGameSave(
    { ...recoverySnapshot(clockUnits), saveSequence },
    greatPlainsSaveContext,
  );

describe('recovery save rotation', () => {
  let storage: MemoryRecoveryStorage;

  beforeEach(() => {
    storage = new MemoryRecoveryStorage();
  });

  it('distinguishes empty storage from storage with no valid save', async () => {
    await expect(
      loadNewestValidRecovery(storage, greatPlainsSaveContext),
    ).resolves.toMatchObject({ ok: false, reason: 'no-save-found' });

    storage.slots.set('recovery-slot-1', '{');
    const invalid = await loadNewestValidRecovery(storage, greatPlainsSaveContext);
    expect(invalid).toMatchObject({ ok: false, reason: 'no-valid-save' });
    expect(invalid.invalidCandidates).toHaveLength(1);
    expect(invalid.invalidCandidates[0]).toMatchObject({ kind: 'codec-invalid' });
  });

  it('fills empty slots, then replaces only the oldest valid slot', async () => {
    for (let index = 0; index < 4; index += 1) {
      const written = await writeRotatingRecovery(
        storage,
        recoverySnapshot(index),
        greatPlainsSaveContext,
      );
      expect(written).toMatchObject({ ok: true, saveSequence: index });
    }

    const loaded = await loadNewestValidRecovery(storage, greatPlainsSaveContext);
    expect(loaded).toMatchObject({
      nextCommandSequence: 3,
      ok: true,
      saveSequence: 3,
      slotId: 'recovery-slot-0',
    });
    expect(storage.slots.size).toBe(3);
    expect(storage.slots.has('recovery-slot-1')).toBe(true);
    expect(storage.slots.has('recovery-slot-2')).toBe(true);
  });

  it('falls back when the newest recovery candidate is truncated', async () => {
    storage.slots.set('recovery-slot-0', encodedAtSequence(10, 1));
    storage.slots.set('recovery-slot-1', encodedAtSequence(11, 2));
    storage.slots.set('recovery-slot-2', encodedAtSequence(12, 3).slice(0, 200));

    const loaded = await loadNewestValidRecovery(storage, greatPlainsSaveContext);
    expect(loaded).toMatchObject({
      ok: true,
      recoveredFromFallback: true,
      saveSequence: 11,
      slotId: 'recovery-slot-1',
    });
    expect(loaded.invalidCandidates).toEqual([
      expect.objectContaining({ kind: 'codec-invalid', slotId: 'recovery-slot-2' }),
    ]);
  });

  it('replaces an invalid slot before touching valid recovery history', async () => {
    storage.slots.set('recovery-slot-0', encodedAtSequence(4));
    storage.slots.set('recovery-slot-1', '{bad');
    storage.slots.set('recovery-slot-2', encodedAtSequence(5));
    const oldestValid = storage.slots.get('recovery-slot-0');

    const written = await writeRotatingRecovery(
      storage,
      recoverySnapshot(7),
      greatPlainsSaveContext,
    );

    expect(written).toMatchObject({
      ok: true,
      saveSequence: 6,
      slotId: 'recovery-slot-1',
    });
    expect(storage.slots.get('recovery-slot-0')).toBe(oldestValid);
  });

  it('leaves every previous slot byte intact when atomic replacement fails', async () => {
    storage.slots.set('recovery-slot-0', encodedAtSequence(1));
    storage.slots.set('recovery-slot-1', encodedAtSequence(2));
    storage.slots.set('recovery-slot-2', encodedAtSequence(3));
    const before = new Map(storage.slots);
    storage.failNextWrite = true;

    const result = await writeRotatingRecovery(
      storage,
      recoverySnapshot(9),
      greatPlainsSaveContext,
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'storage-write-failed',
      slotId: 'recovery-slot-0',
    });
    expect(storage.slots).toEqual(before);
  });

  it('refuses to rotate when any slot cannot be read safely', async () => {
    storage.slots.set('recovery-slot-0', encodedAtSequence(1));
    storage.unreadable.add('recovery-slot-2');
    const before = new Map(storage.slots);

    const result = await writeRotatingRecovery(
      storage,
      recoverySnapshot(2),
      greatPlainsSaveContext,
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'storage-read-failed',
      slotId: 'recovery-slot-2',
    });
    expect(storage.slots).toEqual(before);
    const loaded = await loadNewestValidRecovery(storage, greatPlainsSaveContext);
    expect(loaded).toMatchObject({ ok: true, saveSequence: 1 });
    expect(loaded.invalidCandidates).toEqual([
      expect.objectContaining({
        kind: 'storage-unreadable',
        slotId: 'recovery-slot-2',
      }),
    ]);
  });

  it('reports failed read-back verification without touching other slots', async () => {
    storage.slots.set('recovery-slot-0', encodedAtSequence(1));
    storage.slots.set('recovery-slot-1', encodedAtSequence(2));
    storage.slots.set('recovery-slot-2', encodedAtSequence(3));
    const untouched = new Map(storage.slots);
    storage.corruptNextReadAfterWrite = true;

    const result = await writeRotatingRecovery(
      storage,
      recoverySnapshot(4),
      greatPlainsSaveContext,
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'storage-verification-failed',
      slotId: 'recovery-slot-0',
    });
    expect(storage.slots.get('recovery-slot-1')).toBe(untouched.get('recovery-slot-1'));
    expect(storage.slots.get('recovery-slot-2')).toBe(untouched.get('recovery-slot-2'));
  });

  it('rejects an invalid snapshot before mutating storage', async () => {
    const invalidSnapshot = {
      ...recoverySnapshot(),
      nextCommandSequence: -1,
    } as Omit<GameSaveSnapshot, 'saveSequence'>;

    await expect(
      writeRotatingRecovery(storage, invalidSnapshot, greatPlainsSaveContext),
    ).resolves.toMatchObject({ ok: false, reason: 'snapshot-invalid' });
    expect(storage.slots.size).toBe(0);
  });

  it('uses stable slot order for equal valid sequences', async () => {
    storage.slots.set('recovery-slot-0', encodedAtSequence(8, 1));
    storage.slots.set('recovery-slot-1', encodedAtSequence(8, 2));

    await expect(
      loadNewestValidRecovery(storage, greatPlainsSaveContext),
    ).resolves.toMatchObject({ saveSequence: 8, slotId: 'recovery-slot-0' });
  });

  it('does not wrap an exhausted recovery sequence', async () => {
    storage.slots.set(RECOVERY_SLOT_IDS[0], encodedAtSequence(Number.MAX_SAFE_INTEGER));

    await expect(
      writeRotatingRecovery(storage, recoverySnapshot(), greatPlainsSaveContext),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'save-sequence-exhausted',
    });
  });

  it('serializes concurrent writes so completion order cannot reverse freshness', async () => {
    let releaseWrite: (() => void) | undefined;
    storage.writeBarrier = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const service = createRecoveryService(storage, greatPlainsSaveContext);
    const first = service.write(recoverySnapshot(1));
    const second = service.write(recoverySnapshot(2));

    await Promise.resolve();
    expect(storage.slots.size).toBe(0);
    releaseWrite?.();
    const results = await Promise.all([first, second]);
    expect(results).toEqual([
      expect.objectContaining({ ok: true, saveSequence: 0 }),
      expect.objectContaining({ ok: true, saveSequence: 1 }),
    ]);
    await expect(service.loadNewest()).resolves.toMatchObject({
      nextCommandSequence: 2,
      ok: true,
      saveSequence: 1,
    });
  });

  it('retries atomic conflicts across independent services sharing storage', async () => {
    let releaseWrites: (() => void) | undefined;
    storage.writeBarrier = new Promise<void>((resolve) => {
      releaseWrites = resolve;
    });
    const firstService = createRecoveryService(storage, greatPlainsSaveContext);
    const secondService = createRecoveryService(storage, greatPlainsSaveContext);
    const older = recoverySnapshot(1);
    const newer = {
      ...older,
      simulation: drawSimulationRandomInteger(older.simulation, 0, 10).state,
    };
    const first = firstService.write(newer);
    const second = secondService.write(older);

    await Promise.resolve();
    releaseWrites?.();
    const results = await Promise.all([first, second]);
    expect(results[0]).toMatchObject({ ok: true, saveSequence: 0 });
    expect(results[1]).toMatchObject({ ok: false, reason: 'snapshot-stale' });
    await expect(firstService.loadNewest()).resolves.toMatchObject({
      nextCommandSequence: 1,
      ok: true,
      saveSequence: 0,
    });
    const loaded = await firstService.loadNewest();
    expect(loaded.ok && loaded.simulation.rng.drawCount).toBe(1);
  });

  it('retries transient stationary-state write failures with bounded delay', async () => {
    const service = createRecoveryService(storage, greatPlainsSaveContext);
    const write = vi.spyOn(service, 'write');
    storage.failNextWrite = true;
    const delays: number[] = [];

    const result = await writeRecoveryWithRetry(service, recoverySnapshot(3), {
      delay: (attempt) => {
        delays.push(attempt);
        return Promise.resolve();
      },
    });

    expect(result).toMatchObject({ ok: true, saveSequence: 0 });
    expect(write).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([1]);
  });
});
