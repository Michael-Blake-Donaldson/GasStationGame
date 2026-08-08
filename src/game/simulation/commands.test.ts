import { describe, expect, it } from 'vitest';
import { advanceSimulationByClockUnits as advanceByClockUnitsWithContext } from './advanceSimulation';
import {
  dispatchSimulationCommand as dispatchWithContext,
  type CommandEnvelope,
  type SimulationCommand,
} from './commands';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import {
  createInitialState,
  dispatchSimulationCommand,
  greatPlainsSimulationContext,
} from '../scenarios/greatPlains';

const advanceSimulationByClockUnits = (
  state: ReturnType<typeof createInitialState>,
  clockUnits: number,
) => advanceByClockUnitsWithContext(state, clockUnits, greatPlainsSimulationContext);

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
    [
      { command: { employeeId: 'employee-ada', type: 'job.assign' } },
      'invalid-command-payload',
    ],
    [{ command: { employeeId: '', type: 'job.cancel' } }, 'invalid-command-payload'],
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

  it('sets bounded daytime retail prices with a causal event', () => {
    const initial = createInitialState();
    const result = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: { product: 'fuel', type: 'retail.price.set', unitPrice: 7 },
      id: 'price-fuel',
      sequence: 0,
    });

    expect(result.receipt).toMatchObject({
      changed: true,
      reason: 'retail-price-updated',
      status: 'accepted',
    });
    expect(result.state.business.prices.fuel).toBe(7);
    expect(result.state.eventLedger.at(-1)).toMatchObject({
      currentUnitPrice: 7,
      previousUnitPrice: 4,
      product: 'fuel',
      type: 'retail.price-changed',
    });
  });

  it('orders stock with exact integer cost and rejects unaffordable orders', () => {
    const initial = createInitialState();
    const ordered = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: { product: 'fuel', quantity: 10, type: 'inventory.order' },
      id: 'order-fuel',
      sequence: 0,
    });
    expect(ordered.receipt).toMatchObject({
      changed: true,
      reason: 'inventory-ordered',
    });
    expect(ordered.state.resources).toMatchObject({ cash: 400, fuel: 170 });
    expect(ordered.state.eventLedger.at(-1)).toMatchObject({
      cashAfter: 400,
      quantity: 10,
      stockAfter: 170,
      totalCost: 20,
      type: 'inventory.ordered',
    });

    const unaffordable = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: { product: 'fuel', quantity: 1_000, type: 'inventory.order' },
      id: 'too-much-fuel',
      sequence: 1,
    });
    expect(unaffordable.state).toBe(initial);
    expect(unaffordable.receipt).toMatchObject({
      changed: false,
      reason: 'inventory-insufficient-cash',
      status: 'rejected',
    });
  });

  it('places construction with exact cost, canonical identity, and event facts', () => {
    const initial = createInitialState();
    const result = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: {
        blueprintId: 'wall',
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 0 },
        type: 'construction.place',
      },
      id: 'build-wall',
      sequence: 0,
    });

    expect(result.receipt).toMatchObject({
      changed: true,
      emittedEventSequences: [1],
      reason: 'construction-placed',
      status: 'accepted',
    });
    expect(result.state.nextConstructionSequence).toBe(1);
    expect(result.state.resources).toMatchObject({ cash: 420, scrap: 30 });
    expect(result.state.stationOccupancy.occupants.at(0)).toMatchObject({
      id: 'beacon-sign',
    });
    expect(
      result.state.stationOccupancy.occupants.find(({ id }) => id === 'built-wall-0'),
    ).toMatchObject({
      footprint: { height: 1, width: 1 },
      origin: { x: 0, z: 4 },
      placement: 'flexible',
      rotation: 0,
      structureId: 'wall',
    });
    expect(result.state.eventLedger.at(-1)).toMatchObject({
      blueprintId: 'wall',
      cells: [{ x: 0, z: 4 }],
      constructionSequence: 0,
      costChanges: [
        { after: 420, before: 420, cost: 0, resource: 'cash' },
        { after: 30, before: 32, cost: 2, resource: 'scrap' },
      ],
      occupant: { id: 'built-wall-0' },
      type: 'construction.placed',
    });
  });

  it('rechecks stale placement and leaves rejected construction byte-identical', () => {
    const initial = createInitialState();
    const command = {
      blueprintId: 'wall',
      placement: {
        kind: 'flexible' as const,
        origin: { x: 0, z: 4 },
        rotation: 0 as const,
      },
      type: 'construction.place' as const,
    };
    const first = dispatchSimulationCommand(initial, {
      atTick: 0,
      command,
      id: 'first-wall',
      sequence: 0,
    });
    const second = dispatchSimulationCommand(first.state, {
      atTick: 0,
      command,
      id: 'stale-wall',
      sequence: 1,
    });

    expect(second.state).toBe(first.state);
    expect(second.receipt).toMatchObject({
      changed: false,
      reason: 'cell-occupied',
      status: 'rejected',
    });
  });

  it('rejects construction outside day operations and malformed client geometry', () => {
    const night = runningNight();
    const closed = dispatchSimulationCommand(night, {
      atTick: night.tick,
      command: {
        blueprintId: 'wall',
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 0 },
        type: 'construction.place',
      },
      id: 'night-wall',
      sequence: 0,
    });
    expect(closed.state).toBe(night);
    expect(closed.receipt.reason).toBe('construction-closed');

    const invalid = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: {
        blueprintId: 'wall',
        footprint: { height: 99, width: 99 },
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 9 },
        type: 'construction.place',
      },
      id: 'forged-wall',
      sequence: 1,
    });
    expect(invalid.receipt.reason).toBe('invalid-command-payload');
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

  it('rejects a state that does not match the injected scenario context', () => {
    const initial = createInitialState();
    const mismatched = { ...initial, scenarioVersion: initial.scenarioVersion + 1 };

    expect(() =>
      dispatchWithContext(
        mismatched,
        commandAtCurrentTick(mismatched, 'normal'),
        greatPlainsSimulationContext,
      ),
    ).toThrow(/does not match/u);
  });
});
