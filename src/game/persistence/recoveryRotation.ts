import {
  decodeGameSave,
  encodeGameSave,
  type GameSaveContext,
  type GameSaveSnapshot,
  type SaveIssue,
  type SaveLoadResult,
} from './saveCodec';

export const RECOVERY_SLOT_IDS = [
  'recovery-slot-0',
  'recovery-slot-1',
  'recovery-slot-2',
] as const;

export type RecoverySlotId = (typeof RECOVERY_SLOT_IDS)[number];

export interface RecoverySlotStorage {
  readonly readSlot: (slotId: RecoverySlotId) => Promise<string | null>;
  /** Resolve only after the complete replacement is durable; reject with the old slot readable. */
  readonly replaceSlotAtomically: (
    slotId: RecoverySlotId,
    expectedSerialized: string | null,
    serialized: string,
  ) => Promise<boolean>;
}

export type RecoveryCandidateIssue =
  | {
      readonly issues: readonly SaveIssue[];
      readonly kind: 'codec-invalid';
      readonly slotId: RecoverySlotId;
    }
  | {
      readonly detail: string;
      readonly kind: 'storage-unreadable';
      readonly slotId: RecoverySlotId;
    };

export type RecoveryLoadResult =
  | ({
      readonly invalidCandidates: readonly RecoveryCandidateIssue[];
      readonly recoveredFromFallback: boolean;
      readonly slotId: RecoverySlotId;
    } & Extract<SaveLoadResult, { readonly ok: true }>)
  | {
      readonly invalidCandidates: readonly RecoveryCandidateIssue[];
      readonly ok: false;
      readonly reason: 'no-save-found' | 'no-valid-save';
    };

export type RecoveryWriteResult =
  | {
      readonly ok: true;
      readonly saveSequence: number;
      readonly serialized: string;
      readonly slotId: RecoverySlotId;
    }
  | {
      readonly detail: string;
      readonly ok: false;
      readonly reason:
        | 'save-sequence-exhausted'
        | 'snapshot-invalid'
        | 'snapshot-stale'
        | 'storage-read-failed'
        | 'storage-write-conflict'
        | 'storage-verification-failed'
        | 'storage-write-failed';
      readonly slotId?: RecoverySlotId;
    };

interface InspectedSlot {
  readonly load: SaveLoadResult | null;
  readonly readError: string | null;
  readonly serialized: string | null;
  readonly slotId: RecoverySlotId;
}

const inspectSlots = async (
  storage: RecoverySlotStorage,
  context: GameSaveContext,
): Promise<InspectedSlot[]> =>
  Promise.all(
    RECOVERY_SLOT_IDS.map(async (slotId): Promise<InspectedSlot> => {
      try {
        const serialized = await storage.readSlot(slotId);
        return {
          load: serialized === null ? null : decodeGameSave(serialized, context),
          readError: null,
          serialized,
          slotId,
        };
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Recovery slot read failed.';
        return {
          load: null,
          readError: detail,
          serialized: null,
          slotId,
        };
      }
    }),
  );

const invalidCandidatesFor = (
  inspected: readonly InspectedSlot[],
): RecoveryCandidateIssue[] => {
  const issues: RecoveryCandidateIssue[] = [];
  for (const { load, readError, slotId } of inspected) {
    if (readError !== null) {
      issues.push({ detail: readError, kind: 'storage-unreadable', slotId });
    } else if (load !== null && !load.ok) {
      issues.push({ issues: load.issues, kind: 'codec-invalid', slotId });
    }
  }
  return issues;
};

export const loadNewestValidRecovery = async (
  storage: RecoverySlotStorage,
  context: GameSaveContext,
): Promise<RecoveryLoadResult> => {
  const inspected = await inspectSlots(storage, context);
  const invalidCandidates = invalidCandidatesFor(inspected);
  const valid = inspected
    .flatMap(({ load, slotId }) => (load?.ok === true ? [{ ...load, slotId }] : []))
    .sort(
      (left, right) =>
        right.saveSequence - left.saveSequence ||
        RECOVERY_SLOT_IDS.indexOf(left.slotId) -
          RECOVERY_SLOT_IDS.indexOf(right.slotId),
    );
  const newest = valid[0];
  if (newest !== undefined) {
    return {
      ...newest,
      invalidCandidates,
      recoveredFromFallback: invalidCandidates.length > 0,
    };
  }
  return {
    invalidCandidates,
    ok: false,
    reason:
      invalidCandidates.length === 0 &&
      inspected.every(({ serialized }) => serialized === null)
        ? 'no-save-found'
        : 'no-valid-save',
  };
};

const chooseWriteSlot = (inspected: readonly InspectedSlot[]): RecoverySlotId => {
  const empty = inspected.find(
    ({ load, serialized }) => serialized === null && load === null,
  );
  if (empty !== undefined) return empty.slotId;
  const invalid = inspected.find(({ load }) => load?.ok === false);
  if (invalid !== undefined) return invalid.slotId;
  const oldest = inspected
    .flatMap(({ load, slotId }) =>
      load?.ok === true ? [{ saveSequence: load.saveSequence, slotId }] : [],
    )
    .sort(
      (left, right) =>
        left.saveSequence - right.saveSequence ||
        RECOVERY_SLOT_IDS.indexOf(left.slotId) -
          RECOVERY_SLOT_IDS.indexOf(right.slotId),
    )[0];
  if (oldest === undefined) {
    throw new RangeError('Recovery rotation has no writable slot.');
  }
  return oldest.slotId;
};

export const writeRotatingRecovery = async (
  storage: RecoverySlotStorage,
  snapshot: Omit<GameSaveSnapshot, 'saveSequence'>,
  context: GameSaveContext,
  remainingConflictRetries = 8,
): Promise<RecoveryWriteResult> => {
  let inspected: InspectedSlot[];
  try {
    inspected = await inspectSlots(storage, context);
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : 'Recovery slot reads failed.',
      ok: false,
      reason: 'storage-read-failed',
    };
  }
  const readFailure = inspected.find(({ readError }) => readError !== null);
  if (readFailure?.readError !== undefined && readFailure.readError !== null) {
    return {
      detail: readFailure.readError,
      ok: false,
      reason: 'storage-read-failed',
      slotId: readFailure.slotId,
    };
  }
  const validSequences = inspected.flatMap(({ load }) =>
    load?.ok === true ? [load.saveSequence] : [],
  );
  const latestSequence = validSequences.length === 0 ? -1 : Math.max(...validSequences);
  const newest = inspected
    .flatMap(({ load }) => (load?.ok === true ? [load] : []))
    .sort((left, right) => right.saveSequence - left.saveSequence)[0];
  if (
    newest !== undefined &&
    (snapshot.nextCommandSequence < newest.nextCommandSequence ||
      snapshot.simulation.absoluteClockUnit < newest.simulation.absoluteClockUnit ||
      snapshot.simulation.nextEventSequence < newest.simulation.nextEventSequence ||
      snapshot.simulation.rng.drawCount < newest.simulation.rng.drawCount ||
      snapshot.simulation.tick < newest.simulation.tick)
  ) {
    return {
      detail: 'Recovery snapshot is older than the newest persisted state.',
      ok: false,
      reason: 'snapshot-stale',
    };
  }
  if (latestSequence >= Number.MAX_SAFE_INTEGER) {
    return {
      detail: 'Recovery save sequence exhausted the safe integer range.',
      ok: false,
      reason: 'save-sequence-exhausted',
    };
  }
  const saveSequence = latestSequence + 1;
  const slotId = chooseWriteSlot(inspected);
  let serialized: string;
  try {
    serialized = encodeGameSave({ ...snapshot, saveSequence }, context);
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : 'Recovery snapshot is invalid.',
      ok: false,
      reason: 'snapshot-invalid',
      slotId,
    };
  }
  try {
    const expectedSerialized =
      inspected.find((candidate) => candidate.slotId === slotId)?.serialized ?? null;
    const replaced = await storage.replaceSlotAtomically(
      slotId,
      expectedSerialized,
      serialized,
    );
    if (!replaced) {
      if (remainingConflictRetries === 0) {
        return {
          detail: 'Recovery slot changed repeatedly during rotation.',
          ok: false,
          reason: 'storage-write-conflict',
          slotId,
        };
      }
      return await writeRotatingRecovery(
        storage,
        snapshot,
        context,
        remainingConflictRetries - 1,
      );
    }
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : 'Recovery slot write failed.',
      ok: false,
      reason: 'storage-write-failed',
      slotId,
    };
  }
  let persisted: string | null;
  try {
    persisted = await storage.readSlot(slotId);
  } catch (error) {
    return {
      detail:
        error instanceof Error
          ? error.message
          : 'Recovery slot verification read failed.',
      ok: false,
      reason: 'storage-verification-failed',
      slotId,
    };
  }
  const verified = persisted === serialized ? decodeGameSave(persisted, context) : null;
  if (verified?.ok !== true || verified.saveSequence !== saveSequence) {
    return {
      detail:
        'Recovery slot did not contain the exact validated payload after replacement.',
      ok: false,
      reason: 'storage-verification-failed',
      slotId,
    };
  }
  return { ok: true, saveSequence, serialized, slotId };
};

export interface RecoveryService {
  readonly loadNewest: () => Promise<RecoveryLoadResult>;
  readonly write: (
    snapshot: Omit<GameSaveSnapshot, 'saveSequence'>,
  ) => Promise<RecoveryWriteResult>;
}

export interface RecoveryRetryOptions {
  readonly delay?: (attempt: number) => Promise<void>;
  readonly maxAttempts?: number;
}

const defaultRetryDelay = (attempt: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, 100 * 2 ** (attempt - 1));
  });

export const writeRecoveryWithRetry = async (
  service: RecoveryService,
  snapshot: Omit<GameSaveSnapshot, 'saveSequence'>,
  options: RecoveryRetryOptions = {},
): Promise<RecoveryWriteResult> => {
  const maxAttempts = options.maxAttempts ?? 4;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 16) {
    throw new RangeError('maxAttempts must be a safe integer from 1 through 16.');
  }
  const delay = options.delay ?? defaultRetryDelay;
  let result: RecoveryWriteResult | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = await service.write(snapshot);
    if (
      result.ok ||
      result.reason === 'save-sequence-exhausted' ||
      result.reason === 'snapshot-invalid' ||
      result.reason === 'snapshot-stale'
    ) {
      return result;
    }
    if (attempt < maxAttempts) await delay(attempt);
  }
  if (result === undefined) {
    throw new Error('Recovery retry loop did not execute.');
  }
  return result;
};

export const createRecoveryService = (
  storage: RecoverySlotStorage,
  context: GameSaveContext,
): RecoveryService => {
  let pendingWrites: Promise<void> = Promise.resolve();

  return {
    loadNewest: () =>
      pendingWrites.then(() => loadNewestValidRecovery(storage, context)),
    write: (snapshot) => {
      const write = pendingWrites.then(
        () => writeRotatingRecovery(storage, snapshot, context),
        () => writeRotatingRecovery(storage, snapshot, context),
      );
      pendingWrites = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    },
  };
};
