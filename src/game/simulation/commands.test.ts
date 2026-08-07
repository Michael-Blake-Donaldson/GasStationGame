import { describe, expect, it } from 'vitest';
import { advanceSimulationByClockUnits } from './advanceSimulation';
import {
  dispatchSimulationCommand,
  type CommandEnvelope,
  type SimulationCommand,
} from './commands';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import { createInitialState } from '../scenarios/greatPlains';

const commandAtCurrentTick = (
  state: ReturnType<typeof createInitialState>,
  mode: 'paused' | 'slow' | 'normal' | 'fast',
  id = `set-${mode}`,
): CommandEnvelope => ({
  atTick: state.tick,
  command: { mode, type: 'time-mode.set' },
  id,
  sequence: 0,
});

const runningNight = (): ReturnType<typeof createInitialState> => {
  const initial = createInitialState();
  const running = dispatchSimulationCommand(
    initial,
    commandAtCurrentTick(initial, 'normal'),
  ).state;
  return advanceSimulationByClockUnits(running, 11 * 60 * CLOCK_UNITS_PER_MINUTE);
};

describe('simulation command dispatch', () => {
  it('emits a typed event and correlates its sequence to the receipt', () => {
    const initial = createInitialState();
    const result = dispatchSimulationCommand(
      initial,
      commandAtCurrentTick(initial, 'normal'),
    );
    const event = result.state.eventLedger.at(-1);

    expect(result.receipt).toMatchObject({
      changed: true,
      emittedEventSequences: [1],
      reason: 'time-mode-updated',
      status: 'accepted',
    });
    expect(event).toMatchObject({
      currentMode: 'normal',
      previousMode: 'paused',
      reason: 'player-request',
      requestedMode: 'normal',
      sequence: 1,
      tick: 0,
      type: 'time-mode.changed',
    });
  });

  it('accepts a valid no-op without copying state or emitting an event', () => {
    const initial = createInitialState();
    const result = dispatchSimulationCommand(
      initial,
      commandAtCurrentTick(initial, 'paused'),
    );

    expect(result.state).toBe(initial);
    expect(result.receipt).toMatchObject({
      changed: false,
      emittedEventSequences: [],
      reason: 'time-mode-unchanged',
      status: 'accepted',
    });
  });

  it('converts a night pause request to slow with a causal event', () => {
    const night = runningNight();
    const result = dispatchSimulationCommand(
      night,
      commandAtCurrentTick(night, 'paused'),
    );

    expect(result.state.timeMode).toBe('slow');
    expect(result.receipt.reason).toBe('night-pause-converted');
    expect(result.state.eventLedger.at(-1)).toMatchObject({
      currentMode: 'slow',
      reason: 'night-pause-converted',
      requestedMode: 'paused',
      type: 'time-mode.changed',
    });
  });

  it('records that fast mode is effectively capped during night', () => {
    const night = runningNight();
    const result = dispatchSimulationCommand(
      night,
      commandAtCurrentTick(night, 'fast'),
    );

    expect(result.receipt.reason).toBe('night-fast-capped');
    expect(result.state.eventLedger.at(-1)).toMatchObject({
      currentMode: 'fast',
      effectiveCurrentMode: 'normal',
      effectivePreviousMode: 'normal',
      reason: 'night-fast-capped',
      type: 'time-mode.changed',
    });
  });

  it('rejects a command scheduled in the future', () => {
    const initial = createInitialState();
    const result = dispatchSimulationCommand(initial, {
      ...commandAtCurrentTick(initial, 'normal'),
      atTick: 1,
    });

    expect(result.state).toBe(initial);
    expect(result.receipt).toMatchObject({
      changed: false,
      reason: 'command-scheduled-in-future',
      status: 'rejected',
    });
  });

  it('rejects a command scheduled in the past', () => {
    const initial = createInitialState();
    const running = dispatchSimulationCommand(
      initial,
      commandAtCurrentTick(initial, 'normal'),
    ).state;
    const advanced = {
      ...running,
      tick: 1,
    };
    const result = dispatchSimulationCommand(advanced, {
      ...commandAtCurrentTick(advanced, 'slow'),
      atTick: 0,
    });

    expect(result.state).toBe(advanced);
    expect(result.receipt).toMatchObject({
      changed: false,
      reason: 'command-scheduled-in-past',
      status: 'rejected',
    });
  });

  it.each([
    [{ id: '' }, 'invalid-command-envelope'],
    [{ sequence: -1 }, 'invalid-command-envelope'],
    [{ atTick: 0.5 }, 'invalid-command-envelope'],
    [{ command: { mode: 'warp', type: 'time-mode.set' } }, 'invalid-command-payload'],
    [{ command: null }, 'invalid-command-payload'],
    [{ command: { type: 'unknown' } }, 'unsupported-command-type'],
  ] as const)('rejects malformed runtime input %#', (override, reason) => {
    const initial = createInitialState();
    const envelope = {
      ...commandAtCurrentTick(initial, 'normal'),
      ...override,
    } as unknown as CommandEnvelope;
    const result = dispatchSimulationCommand(initial, envelope);

    expect(result.state).toBe(initial);
    expect(result.receipt).toMatchObject({
      changed: false,
      reason,
      status: 'rejected',
    });
  });

  it.each([null, undefined, 12, 'command'])(
    'rejects a malformed top-level envelope %# without throwing',
    (envelope) => {
      const initial = createInitialState();
      const result = dispatchSimulationCommand(initial, envelope);

      expect(result.state).toBe(initial);
      expect(result.receipt).toEqual({
        atTick: 0,
        changed: false,
        commandId: '<invalid-command>',
        commandSequence: 0,
        emittedEventSequences: [],
        reason: 'invalid-command-envelope',
        status: 'rejected',
      });
    },
  );

  it('rejects commands after slice completion without mutation', () => {
    const initial = createInitialState(1987, 1);
    const completed = advanceSimulationByClockUnits(
      initial,
      22 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    const result = dispatchSimulationCommand(
      completed,
      commandAtCurrentTick(completed, 'normal', 'too-late'),
    );

    expect(completed.isSliceComplete).toBe(true);
    expect(result.state).toBe(completed);
    expect(result.receipt).toMatchObject({
      changed: false,
      emittedEventSequences: [],
      reason: 'simulation-complete',
      status: 'rejected',
    });
  });

  it('keeps the dispatcher exhaustive while rejecting unknown command types', () => {
    const initial = createInitialState();
    const unknown = {
      atTick: 0,
      command: { type: 'weather.set' } as unknown as SimulationCommand,
      id: 'unsupported',
      sequence: 0,
    };

    expect(dispatchSimulationCommand(initial, unknown).receipt.reason).toBe(
      'unsupported-command-type',
    );
  });
});
