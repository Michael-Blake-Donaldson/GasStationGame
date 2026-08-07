import type { SimulationState } from './types';

export const SIMULATION_CHECKPOINT_VERSION = 2;

export const createSimulationCheckpoint = (state: SimulationState) => ({
  version: SIMULATION_CHECKPOINT_VERSION,
  absoluteClockUnit: state.absoluteClockUnit,
  clockStepRemainderTimeUnits: state.clockStepRemainderTimeUnits,
  completedNights: state.completedNights,
  employees: [...state.employees]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((employee) => ({
      id: employee.id,
      fatigue: employee.fatigue,
      name: employee.name,
      relationship: employee.relationship,
      role: employee.role,
    })),
  eventLedger: state.eventLedger,
  isSliceComplete: state.isSliceComplete,
  nextEventSequence: state.nextEventSequence,
  phase: state.phase,
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
});

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new RangeError('Cannot hash non-finite numbers.');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
    );
    return Object.fromEntries(entries.map(([key, item]) => [key, canonicalize(item)]));
  }
  throw new RangeError(`Cannot hash value of type ${typeof value}.`);
};

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const hashSimulationState = (state: SimulationState): string =>
  fnv1a(JSON.stringify(canonicalize(createSimulationCheckpoint(state))));
