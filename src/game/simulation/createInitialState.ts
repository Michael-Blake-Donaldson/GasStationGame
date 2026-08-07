import { CLOCK_UNITS_PER_MINUTE } from './clock';
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

  return {
    absoluteClockUnit: 8 * 60 * CLOCK_UNITS_PER_MINUTE,
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
    events: [
      {
        code: 'scenario-started',
        id: 0,
        minute: 8 * 60,
        message: 'Morning shift opened. The Beacon is stable.',
        tone: 'positive',
      },
    ],
    isSliceComplete: false,
    phase: 'day',
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
