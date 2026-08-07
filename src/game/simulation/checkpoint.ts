import type { SimulationState } from './types';

export const SIMULATION_CHECKPOINT_VERSION = 1;

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
  events: state.events.map((event) => ({
    code: event.code,
    id: event.id,
    message: event.message,
    minute: event.minute,
    tone: event.tone,
  })),
  isSliceComplete: state.isSliceComplete,
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

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const hashSimulationState = (state: SimulationState): string =>
  fnv1a(JSON.stringify(createSimulationCheckpoint(state)));
