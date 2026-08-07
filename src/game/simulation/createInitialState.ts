import { CLOCK_UNITS_PER_MINUTE } from './clock';
import {
  SEEDED_RANDOM_ALGORITHM,
  SEEDED_RANDOM_VERSION,
  createSeededRandomState,
} from './random';
import { GREAT_PLAINS_SCENARIO_ID, GREAT_PLAINS_SCENARIO_VERSION } from './scenario';
import type { SimulationState } from './types';

export const createInitialState = (
  seed = 1987,
  targetNightCount = 3,
): SimulationState => {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError('seed must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(targetNightCount) || targetNightCount < 1) {
    throw new RangeError('targetNightCount must be a positive safe integer.');
  }

  const absoluteClockUnit = 8 * 60 * CLOCK_UNITS_PER_MINUTE;

  return {
    absoluteClockUnit,
    clockStepRemainderTimeUnits: 0,
    completedNights: 0,
    employees: [
      {
        id: 'employee-ada',
        name: 'Ada',
        role: 'Checkout',
        fatigue: 14,
        relationship: 12,
      },
      { id: 'employee-bo', name: 'Bo', role: 'Pumps', fatigue: 21, relationship: 8 },
      {
        id: 'employee-cora',
        name: 'Cora',
        role: 'Garage',
        fatigue: 18,
        relationship: 17,
      },
      {
        id: 'employee-dale',
        name: 'Dale',
        role: 'Security',
        fatigue: 26,
        relationship: 4,
      },
    ],
    eventLedger: [
      {
        absoluteClockUnit,
        minute: 8 * 60,
        reason: 'scenario-initialized',
        rngAlgorithm: SEEDED_RANDOM_ALGORITHM,
        rngVersion: SEEDED_RANDOM_VERSION,
        scenarioId: GREAT_PLAINS_SCENARIO_ID,
        scenarioVersion: GREAT_PLAINS_SCENARIO_VERSION,
        seed,
        sequence: 0,
        targetNightCount,
        tick: 0,
        type: 'simulation.started',
      },
    ],
    isSliceComplete: false,
    nextEventSequence: 1,
    phase: 'day',
    rng: createSeededRandomState(seed),
    scenarioId: GREAT_PLAINS_SCENARIO_ID,
    scenarioVersion: GREAT_PLAINS_SCENARIO_VERSION,
    resources: {
      ammunition: 36,
      cash: 420,
      food: 48,
      fuel: 160,
      power: 100,
      scrap: 32,
    },
    seed,
    targetNightCount,
    tick: 0,
    timeMode: 'paused',
  };
};
