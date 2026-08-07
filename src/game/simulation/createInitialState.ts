import { CLOCK_UNITS_PER_MINUTE } from './clock';
import { createStationOccupancyState } from './grid';
import {
  SEEDED_RANDOM_ALGORITHM,
  SEEDED_RANDOM_VERSION,
  createSeededRandomState,
} from './random';
import type { ScenarioDefinition } from './scenario';
import type { SimulationState } from './types';

export const createInitialState = (
  scenarioDefinition: ScenarioDefinition,
  seed = 1987,
  targetNightCount = 3,
): SimulationState => {
  if (!/^[a-z0-9-]+$/u.test(scenarioDefinition.id)) {
    throw new TypeError('scenarioDefinition.id must be a technical ID.');
  }
  if (
    !Number.isSafeInteger(scenarioDefinition.version) ||
    scenarioDefinition.version < 1
  ) {
    throw new RangeError('scenarioDefinition.version must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError('seed must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(targetNightCount) || targetNightCount < 1) {
    throw new RangeError('targetNightCount must be a positive safe integer.');
  }

  const absoluteClockUnit = 8 * 60 * CLOCK_UNITS_PER_MINUTE;
  const stationOccupancy = createStationOccupancyState(
    scenarioDefinition.stationGridDefinition,
  );

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
        gridDefinitionId: stationOccupancy.gridDefinitionId,
        gridDefinitionVersion: stationOccupancy.gridDefinitionVersion,
        rngAlgorithm: SEEDED_RANDOM_ALGORITHM,
        rngVersion: SEEDED_RANDOM_VERSION,
        scenarioId: scenarioDefinition.id,
        scenarioVersion: scenarioDefinition.version,
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
    scenarioId: scenarioDefinition.id,
    scenarioVersion: scenarioDefinition.version,
    stationOccupancy,
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
