import { describe, expect, it } from 'vitest';
import { advanceSimulationByClockUnits } from './advanceSimulation';
import {
  SIMULATION_CHECKPOINT_VERSION,
  createSimulationCheckpoint,
  hashDomainEventLedger,
  hashSimulationState,
} from './checkpoint';
import { createInitialState } from '../scenarios/greatPlains';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import { drawSimulationRandomInteger } from './random';
import type { ResourceChange } from './types';

describe('simulation checkpoint hash', () => {
  it('serializes checkpoint version 4 with exact RNG and station state', () => {
    const initial = createInitialState();
    const advanced = drawSimulationRandomInteger(initial, 0, 10).state;
    const checkpoint = createSimulationCheckpoint(advanced);
    const restored: unknown = JSON.parse(JSON.stringify(checkpoint));

    expect(SIMULATION_CHECKPOINT_VERSION).toBe(4);
    expect(checkpoint.rng).toEqual(advanced.rng);
    expect(checkpoint).toMatchObject({
      scenarioId: 'great-plains',
      scenarioVersion: 2,
      stationOccupancy: {
        gridDefinitionId: 'great-plains-station-grid',
        gridDefinitionVersion: 1,
      },
    });
    expect(restored).toEqual(checkpoint);
  });

  it('is stable when ID-keyed employees arrive in a different storage order', () => {
    const initial = createInitialState();
    const reordered = { ...initial, employees: [...initial.employees].reverse() };

    expect(hashSimulationState(reordered)).toBe(hashSimulationState(initial));
  });

  it('is stable when ID-keyed station occupants arrive in a different order', () => {
    const initial = createInitialState();
    const reordered = {
      ...initial,
      stationOccupancy: {
        ...initial.stationOccupancy,
        occupants: [...initial.stationOccupancy.occupants].reverse(),
      },
    };

    expect(hashSimulationState(reordered)).toBe(hashSimulationState(initial));
  });

  it('changes when authoritative station occupancy changes', () => {
    const initial = createInitialState();
    const changed = {
      ...initial,
      stationOccupancy: {
        ...initial.stationOccupancy,
        occupants: initial.stationOccupancy.occupants.slice(1),
      },
    };

    expect(hashSimulationState(changed)).not.toBe(hashSimulationState(initial));
  });

  it('creates a station occupancy snapshot detached from nested state', () => {
    const initial = createInitialState();
    const checkpoint = createSimulationCheckpoint(initial);
    const checkpointOccupant = checkpoint.stationOccupancy.occupants.find(
      (occupant) => occupant.placement === 'fixed',
    );
    const stateOccupant = initial.stationOccupancy.occupants.find(
      (occupant) => occupant.placement === 'fixed',
    );
    if (
      checkpointOccupant?.placement !== 'fixed' ||
      stateOccupant?.placement !== 'fixed'
    ) {
      throw new Error('Expected fixed station occupants are missing.');
    }

    (checkpointOccupant.origin as { x: number }).x = 100;

    expect(checkpointOccupant.origin).not.toEqual(stateOccupant.origin);
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

  it('rejects duplicate station occupant identities before checkpointing', () => {
    const initial = createInitialState();
    const firstOccupant = initial.stationOccupancy.occupants[0];
    if (firstOccupant === undefined) throw new Error('Expected an occupant fixture.');
    const invalid = {
      ...initial,
      stationOccupancy: {
        ...initial.stationOccupancy,
        occupants: [...initial.stationOccupancy.occupants, firstOccupant],
      },
    };

    expect(() => createSimulationCheckpoint(invalid)).toThrow(/duplicate ID/u);
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
