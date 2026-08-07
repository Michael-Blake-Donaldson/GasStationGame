import { describe, expect, it } from 'vitest';
import { advanceSimulationByClockUnits } from './advanceSimulation';
import {
  SIMULATION_CHECKPOINT_VERSION,
  createSimulationCheckpoint,
  hashDomainEventLedger,
  hashSimulationState,
} from './checkpoint';
import { createInitialState } from './createInitialState';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import { drawSimulationRandomInteger } from './random';
import type { ResourceChange } from './types';

describe('simulation checkpoint hash', () => {
  it('serializes checkpoint version 3 with exact RNG continuation state', () => {
    const initial = createInitialState();
    const advanced = drawSimulationRandomInteger(initial, 0, 10).state;
    const checkpoint = createSimulationCheckpoint(advanced);
    const restored: unknown = JSON.parse(JSON.stringify(checkpoint));

    expect(SIMULATION_CHECKPOINT_VERSION).toBe(3);
    expect(checkpoint.rng).toEqual(advanced.rng);
    expect(checkpoint).toMatchObject({
      scenarioId: 'great-plains',
      scenarioVersion: 1,
    });
    expect(restored).toEqual(checkpoint);
  });

  it('is stable when ID-keyed employees arrive in a different storage order', () => {
    const initial = createInitialState();
    const reordered = { ...initial, employees: [...initial.employees].reverse() };

    expect(hashSimulationState(reordered)).toBe(hashSimulationState(initial));
  });

  it('changes when authoritative resources change', () => {
    const initial = createInitialState();
    const changed = {
      ...initial,
      resources: { ...initial.resources, fuel: initial.resources.fuel - 1 },
    };

    expect(hashSimulationState(changed)).not.toBe(hashSimulationState(initial));
  });

  it('changes when RNG state advances without another domain mutation', () => {
    const initial = createInitialState();
    const advanced = drawSimulationRandomInteger(initial, 0, 10).state;

    expect(hashSimulationState(advanced)).not.toBe(hashSimulationState(initial));
    expect(hashDomainEventLedger(advanced.eventLedger)).toBe(
      hashDomainEventLedger(initial.eventLedger),
    );
  });

  it('hashes scenario identity in both state and the self-describing ledger', () => {
    const initial = createInitialState();
    const changed = {
      ...initial,
      eventLedger: initial.eventLedger.map((event) =>
        event.type === 'simulation.started'
          ? { ...event, scenarioVersion: event.scenarioVersion + 1 }
          : event,
      ),
      scenarioVersion: initial.scenarioVersion + 1,
    };

    expect(hashSimulationState(changed)).not.toBe(hashSimulationState(initial));
    expect(hashDomainEventLedger(changed.eventLedger)).not.toBe(
      hashDomainEventLedger(initial.eventLedger),
    );
  });

  it('creates a ledger snapshot detached from state and nested event payloads', () => {
    const state = advanceSimulationByClockUnits(
      createInitialState(),
      60 * CLOCK_UNITS_PER_MINUTE,
    );
    const checkpoint = createSimulationCheckpoint(state);
    const checkpointLedger = checkpoint.eventLedger;
    const checkpointResourceEvent = checkpointLedger.find(
      (event) => event.type === 'resources.changed',
    );
    const stateResourceEvent = state.eventLedger.find(
      (event) => event.type === 'resources.changed',
    );
    if (
      checkpointResourceEvent?.type !== 'resources.changed' ||
      stateResourceEvent?.type !== 'resources.changed'
    ) {
      throw new Error('Expected resource events are missing.');
    }

    checkpointLedger.splice(0, 1);
    (checkpointResourceEvent.changes as ResourceChange[])[0] = {
      after: 0,
      appliedDelta: 0,
      before: 0,
      requestedDelta: 0,
      resource: 'cash',
    };

    expect(state.eventLedger).toHaveLength(checkpoint.eventLedger.length + 1);
    expect(stateResourceEvent.changes[0]).not.toEqual(
      checkpointResourceEvent.changes[0],
    );
  });

  it('rejects malformed persisted RNG state before checkpointing', () => {
    const initial = createInitialState();
    const invalid = {
      ...initial,
      rng: { ...initial.rng, words: [0, 0, 0, 0] as const },
    };

    expect(() => createSimulationCheckpoint(invalid)).toThrow('all zero');
  });

  it('includes employee names, event payloads, and clock-step remainder', () => {
    const initial = createInitialState();
    const renamed = {
      ...initial,
      employees: initial.employees.map((employee) =>
        employee.id === 'employee-ada' ? { ...employee, name: 'Ada Two' } : employee,
      ),
    };
    const changedEvent = {
      ...initial,
      eventLedger: initial.eventLedger.map((event) =>
        event.type === 'simulation.started'
          ? { ...event, targetNightCount: event.targetNightCount + 1 }
          : event,
      ),
    };
    const partialStep = { ...initial, clockStepRemainderTimeUnits: 1 };

    expect(hashSimulationState(renamed)).not.toBe(hashSimulationState(initial));
    expect(hashSimulationState(changedEvent)).not.toBe(hashSimulationState(initial));
    expect(hashSimulationState(partialStep)).not.toBe(hashSimulationState(initial));
  });
});
