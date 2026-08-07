import { describe, expect, it } from 'vitest';
import { advanceSimulationByClockUnits } from './advanceSimulation';
import { executeSimulationCommand } from './commands';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import { createInitialState } from './createInitialState';
import { runClockReplay, type ClockReplayV1 } from './replay';

const replayFixture = (): ClockReplayV1 => ({
  commands: [
    {
      atTick: 0,
      command: { type: 'time-mode.set', mode: 'normal' },
      id: 'start-clock',
      sequence: 0,
    },
    {
      atTick: 20,
      command: { type: 'time-mode.set', mode: 'fast' },
      id: 'speed-up',
      sequence: 1,
    },
  ],
  replayVersion: 1,
  seed: 1987,
  stopAfterTick: 100,
  targetNightCount: 3,
});

describe('clock commands and replay', () => {
  it('returns stable receipts for time-mode commands', () => {
    const initial = createInitialState();
    const started = executeSimulationCommand(initial, {
      type: 'time-mode.set',
      mode: 'normal',
    });
    const unchanged = executeSimulationCommand(started.state, {
      type: 'time-mode.set',
      mode: 'normal',
    });

    expect(started.receipt).toEqual({
      accepted: true,
      changed: true,
      code: 'time-mode-updated',
    });
    expect(unchanged.receipt.code).toBe('time-mode-unchanged');
    expect(unchanged.state).toBe(started.state);
  });

  it('canonicalizes a night pause request to slow time with a reason code', () => {
    const night = advanceSimulationByClockUnits(
      createInitialState(),
      11 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    const result = executeSimulationCommand(night, {
      type: 'time-mode.set',
      mode: 'paused',
    });

    expect(result.state.timeMode).toBe('slow');
    expect(result.receipt.code).toBe('night-cannot-pause');
  });

  it('replays the same commands to the same state, ledger, and hash', () => {
    const first = runClockReplay(replayFixture());
    const second = runClockReplay(replayFixture());
    const shuffled = runClockReplay({
      ...replayFixture(),
      commands: [...replayFixture().commands].reverse(),
    });

    expect(second).toEqual(first);
    expect(shuffled).toEqual(first);
    expect(first.receipts).toHaveLength(2);
    expect(first.unconsumedCommandIds).toEqual([]);
  });

  it('changes the checkpoint hash when a time command changes', () => {
    const baseline = runClockReplay(replayFixture());
    const changed = runClockReplay({
      ...replayFixture(),
      commands: replayFixture().commands.map((envelope) =>
        envelope.id === 'speed-up'
          ? {
              ...envelope,
              command: { type: 'time-mode.set', mode: 'slow' },
            }
          : envelope,
      ),
    });

    expect(changed.stateHash).not.toBe(baseline.stateHash);
  });

  it('orders commands sharing a tick by sequence', () => {
    const result = runClockReplay({
      ...replayFixture(),
      commands: [
        {
          atTick: 0,
          command: { type: 'time-mode.set', mode: 'fast' },
          id: 'fast-first',
          sequence: 0,
        },
        {
          atTick: 0,
          command: { type: 'time-mode.set', mode: 'slow' },
          id: 'slow-second',
          sequence: 1,
        },
      ],
      stopAfterTick: 1,
    });

    expect(result.state.timeMode).toBe('slow');
    expect(result.receipts.map((receipt) => receipt.id)).toEqual([
      'fast-first',
      'slow-second',
    ]);
  });

  it('reports future commands that cannot be reached while paused', () => {
    const result = runClockReplay({
      ...replayFixture(),
      commands: [
        {
          atTick: 1,
          command: { type: 'time-mode.set', mode: 'normal' },
          id: 'unreachable-start',
          sequence: 0,
        },
      ],
      stopAfterTick: 2,
    });

    expect(result.state.tick).toBe(0);
    expect(result.unconsumedCommandIds).toEqual(['unreachable-start']);
  });

  it('rejects duplicate command identity before replaying', () => {
    const fixture = replayFixture();
    const firstCommand = fixture.commands[0];
    if (firstCommand === undefined) throw new Error('Replay fixture is incomplete.');
    const duplicate = {
      ...firstCommand,
      sequence: 1,
    };

    expect(() =>
      runClockReplay({ ...fixture, commands: [firstCommand, duplicate] }),
    ).toThrow('unique');
  });

  it('rejects unsupported replay data before producing a partial result', () => {
    const invalidVersion = {
      ...replayFixture(),
      replayVersion: 2,
    } as unknown as ClockReplayV1;
    const invalidCommand = {
      ...replayFixture(),
      commands: [
        {
          atTick: 0,
          command: { type: 'unknown', mode: 'normal' },
          id: 'bad-command',
          sequence: 0,
        },
      ],
    } as unknown as ClockReplayV1;

    expect(() => runClockReplay(invalidVersion)).toThrow('version');
    expect(() => runClockReplay(invalidCommand)).toThrow('command');
  });

  it.each([
    [{ seed: -1 }, 'seed'],
    [{ stopAfterTick: 0.5 }, 'stopAfterTick'],
    [{ targetNightCount: 0 }, 'targetNightCount'],
    [
      {
        commands: [
          {
            atTick: 0,
            command: { type: 'time-mode.set', mode: 'normal' },
            id: '',
            sequence: 0,
          },
        ],
      },
      'ids',
    ],
    [
      {
        commands: [
          {
            atTick: 0,
            command: { type: 'time-mode.set', mode: 'normal' },
            id: 'one',
            sequence: 0,
          },
          {
            atTick: 0,
            command: { type: 'time-mode.set', mode: 'fast' },
            id: 'two',
            sequence: 0,
          },
        ],
      },
      'sequences',
    ],
  ] as const)('rejects malformed replay field %#', (override, message) => {
    const invalid = { ...replayFixture(), ...override } as ClockReplayV1;
    expect(() => runClockReplay(invalid)).toThrow(message);
  });
});
