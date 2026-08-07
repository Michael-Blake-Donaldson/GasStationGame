import type { PlacedOccupant } from './grid';
import { hashCanonicalJson } from '../serialization/canonicalJson';
import type { SimulationContext } from './scenario';
import type { DomainEvent, Employee, SimulationState } from './types';
import { assertSimulationState } from './validation';

export const SIMULATION_CHECKPOINT_VERSION = 5;

const cloneDomainEvent = (event: DomainEvent): DomainEvent => {
  switch (event.type) {
    case 'resources.changed':
      return { ...event, changes: event.changes.map((change) => ({ ...change })) };
    case 'job.assigned':
    case 'employee.arrived':
      return { ...event, destination: { ...event.destination } };
    case 'job.cancelled':
    case 'job.completed':
      return { ...event, position: { ...event.position } };
    default:
      return { ...event };
  }
};

const cloneEmployee = (employee: Employee): Employee => ({
  activity:
    employee.activity.status === 'idle'
      ? { status: 'idle' }
      : employee.activity.status === 'traveling'
        ? {
            ...employee.activity,
            destination: { ...employee.activity.destination },
            path: employee.activity.path.map((cell) => ({ ...cell })),
          }
        : {
            ...employee.activity,
            destination: { ...employee.activity.destination },
          },
  fatigue: employee.fatigue,
  id: employee.id,
  name: employee.name,
  position: { ...employee.position },
  relationship: employee.relationship,
  role: employee.role,
});

const clonePlacedOccupant = (occupant: PlacedOccupant): PlacedOccupant =>
  occupant.placement === 'authored-plot'
    ? { ...occupant }
    : {
        ...occupant,
        footprint: { ...occupant.footprint },
        origin: { ...occupant.origin },
      };

export const createSimulationCheckpoint = (
  state: SimulationState,
  context: SimulationContext,
) => {
  assertSimulationState(context, state);

  return {
    version: SIMULATION_CHECKPOINT_VERSION as typeof SIMULATION_CHECKPOINT_VERSION,
    absoluteClockUnit: state.absoluteClockUnit,
    clockStepRemainderTimeUnits: state.clockStepRemainderTimeUnits,
    completedNights: state.completedNights,
    employees: [...state.employees]
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((employee) => cloneEmployee(employee)),
    eventLedger: state.eventLedger.map((event) => cloneDomainEvent(event)),
    isSliceComplete: state.isSliceComplete,
    nextEventSequence: state.nextEventSequence,
    phase: state.phase,
    rng: {
      algorithm: state.rng.algorithm,
      drawCount: state.rng.drawCount,
      version: state.rng.version,
      words: [...state.rng.words],
    },
    scenarioId: state.scenarioId,
    scenarioVersion: state.scenarioVersion,
    stationOccupancy: {
      gridDefinitionId: state.stationOccupancy.gridDefinitionId,
      gridDefinitionVersion: state.stationOccupancy.gridDefinitionVersion,
      occupants: [...state.stationOccupancy.occupants]
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
        .map((occupant) => clonePlacedOccupant(occupant)),
    },
    resources: {
      ammunition: state.resources.ammunition,
      cash: state.resources.cash,
      food: state.resources.food,
      fuel: state.resources.fuel,
      power: state.resources.power,
      scrap: state.resources.scrap,
    },
    seed: state.seed,
    targetNightCount: state.targetNightCount,
    tick: state.tick,
    timeMode: state.timeMode,
  };
};

export type SimulationCheckpointV5 = ReturnType<typeof createSimulationCheckpoint>;

export const hashSimulationState = (
  state: SimulationState,
  context: SimulationContext,
): string => hashCanonicalJson(createSimulationCheckpoint(state, context));

export const hashDomainEventLedger = (eventLedger: readonly DomainEvent[]): string =>
  hashCanonicalJson(eventLedger);
