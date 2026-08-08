import { describe, expect, it } from 'vitest';
import { advanceSimulationByClockUnits as advanceByClockUnitsWithContext } from './advanceSimulation';
import { SIMULATION_CHECKPOINT_VERSION, hashDomainEventLedger } from './checkpoint';
import {
  createInitialState,
  createSimulationCheckpoint,
  dispatchSimulationCommand,
  greatPlainsSimulationContext,
  hashSimulationState,
} from '../scenarios/greatPlains';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import { drawSimulationRandomInteger } from './random';
import type { ResourceChange } from './types';

const advanceSimulationByClockUnits = (
  state: ReturnType<typeof createInitialState>,
  clockUnits: number,
) => advanceByClockUnitsWithContext(state, clockUnits, greatPlainsSimulationContext);

describe('simulation checkpoint hash', () => {
  it('serializes checkpoint version 7 with exact RNG, station, and workforce state', () => {
    const initial = createInitialState();
    const advanced = drawSimulationRandomInteger(initial, 0, 10).state;
    const checkpoint = createSimulationCheckpoint(advanced);
    const restored: unknown = JSON.parse(JSON.stringify(checkpoint));

    expect(SIMULATION_CHECKPOINT_VERSION).toBe(7);
    expect(checkpoint.rng).toEqual(advanced.rng);
    expect(checkpoint).toMatchObject({
      scenarioId: 'great-plains',
      scenarioVersion: 5,
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

  it('hashes and deeply snapshots mid-route workforce progress', () => {
    const initial = createInitialState();
    const assigned = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: {
        employeeId: 'employee-dale',
        jobId: 'watch-beacon',
        type: 'job.assign',
      },
      id: 'assign-dale',
      sequence: 0,
    }).state;
    const progressed = advanceSimulationByClockUnits(assigned, 7);
    const checkpoint = createSimulationCheckpoint(progressed);
    const checkpointEmployee = checkpoint.employees.find(
      ({ id }) => id === 'employee-dale',
    );
    const stateEmployee = progressed.employees.find(({ id }) => id === 'employee-dale');
    if (
      checkpointEmployee?.activity.status !== 'traveling' ||
      stateEmployee?.activity.status !== 'traveling'
    ) {
      throw new Error('Expected Dale to be traveling.');
    }

    expect(hashSimulationState(progressed)).not.toBe(hashSimulationState(assigned));
    expect(checkpointEmployee.activity).toEqual(stateEmployee.activity);
    (checkpointEmployee.position as { x: number }).x = 31;
    (checkpointEmployee.activity.path[0] as { x: number }).x = 30;
    (checkpointEmployee.activity.destination as { x: number }).x = 29;

    expect(checkpointEmployee.position).not.toEqual(stateEmployee.position);
    expect(checkpointEmployee.activity.path).not.toEqual(stateEmployee.activity.path);
    expect(checkpointEmployee.activity.destination).not.toEqual(
      stateEmployee.activity.destination,
    );
  });

  it('changes when authoritative resources change', () => {
    const initial = createInitialState();
    const changed = advanceSimulationByClockUnits(initial, 60 * CLOCK_UNITS_PER_MINUTE);

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

  it('rejects state identity outside its context and hashes ledger identity', () => {
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

    expect(() => hashSimulationState(changed)).toThrow(/scenario context/u);
    expect(hashDomainEventLedger(changed.eventLedger)).not.toBe(
      hashDomainEventLedger(initial.eventLedger),
    );
  });

  it('creates a ledger snapshot detached from state and nested event payloads', () => {
    const state = advanceSimulationByClockUnits(
      createInitialState(),
      11 * 60 * CLOCK_UNITS_PER_MINUTE,
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

  it('detaches nested service performance in the ledger and active customer stage', () => {
    let state = createInitialState(1);
    state = dispatchSimulationCommand(state, {
      atTick: 0,
      command: { employeeId: 'employee-bo', jobId: 'staff-pumps', type: 'job.assign' },
      id: 'checkpoint-staff-pumps',
      sequence: 0,
    }).state;
    state = advanceSimulationByClockUnits(state, 61 * CLOCK_UNITS_PER_MINUTE);
    const checkpoint = createSimulationCheckpoint(state);
    const checkpointEvent = checkpoint.eventLedger.find(
      (event) => event.type === 'service.started',
    );
    const stateEvent = state.eventLedger.find(
      (event) => event.type === 'service.started',
    );
    const checkpointCustomer = checkpoint.business.activeCustomers[0];
    const stateCustomer = state.business.activeCustomers[0];
    if (
      checkpointEvent?.type !== 'service.started' ||
      stateEvent?.type !== 'service.started' ||
      checkpointCustomer?.stage.type !== 'pump-service' ||
      stateCustomer?.stage.type !== 'pump-service'
    ) {
      throw new Error('Expected active attributed service fixtures.');
    }

    (checkpointEvent.performance as { skillLevel: number }).skillLevel = 0;
    (checkpointCustomer.stage.performance as { fatigue: number }).fatigue = 100;

    expect(stateEvent.performance.skillLevel).toBe(4);
    expect(stateCustomer.stage.performance.fatigue).toBe(21);
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

  it('rejects malformed workforce progress before checkpointing', () => {
    const initial = createInitialState();
    const invalid = {
      ...initial,
      employees: initial.employees.map((employee) =>
        employee.id === 'employee-ada'
          ? {
              ...employee,
              activity: {
                assignmentId: 'assignment-ada',
                destination: { x: 10, z: 17 },
                jobId: 'open-checkout',
                movementProgressClockUnits: 0,
                nextPathIndex: 0,
                path: [],
                status: 'traveling' as const,
                targetId: 'checkout-counter',
                totalWorkClockUnits: 80,
              },
            }
          : employee,
      ),
    };

    expect(() => createSimulationCheckpoint(invalid)).toThrow(/empty travel path/u);
  });

  it('rejects teleporting, out-of-grid, and structurally blocked routes', () => {
    const initial = createInitialState();
    const assigned = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: {
        employeeId: 'employee-dale',
        jobId: 'watch-beacon',
        type: 'job.assign',
      },
      id: 'assign-dale-route-check',
      sequence: 0,
    }).state;
    const replaceFirstPathCell = (x: number, z: number) => ({
      ...assigned,
      employees: assigned.employees.map((employee) =>
        employee.id === 'employee-dale' && employee.activity.status === 'traveling'
          ? {
              ...employee,
              activity: {
                ...employee.activity,
                path: [{ x, z }, ...employee.activity.path.slice(1)],
              },
            }
          : employee,
      ),
    });

    expect(() => createSimulationCheckpoint(replaceFirstPathCell(30, 23))).toThrow(
      /not contiguous|cursor is disconnected/u,
    );
    expect(() => createSimulationCheckpoint(replaceFirstPathCell(-1, 0))).toThrow(
      /non-negative|leaves the station/u,
    );
    expect(() => createSimulationCheckpoint(replaceFirstPathCell(3, 6))).toThrow(
      /blocked cell/u,
    );
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
      targetNightCount: initial.targetNightCount + 1,
    };
    const partialStep = { ...initial, clockStepRemainderTimeUnits: 1 };

    expect(hashSimulationState(renamed)).not.toBe(hashSimulationState(initial));
    expect(hashSimulationState(changedEvent)).not.toBe(hashSimulationState(initial));
    expect(hashSimulationState(partialStep)).not.toBe(hashSimulationState(initial));
  });
});
