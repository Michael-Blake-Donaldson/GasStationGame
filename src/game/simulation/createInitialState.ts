import { CLOCK_UNITS_PER_MINUTE } from './clock';
import { createStationOccupancyState } from './grid';
import { assertScenarioDefinition } from './jobs';
import {
  SEEDED_RANDOM_ALGORITHM,
  SEEDED_RANDOM_VERSION,
  createSeededRandomState,
} from './random';
import type { ScenarioDefinition } from './scenario';
import type { SimulationState } from './types';
import { createInitialBusinessState } from './business';

export const createInitialState = (
  scenarioDefinition: ScenarioDefinition,
  seed = 1987,
  targetNightCount = 3,
): SimulationState => {
  assertScenarioDefinition(scenarioDefinition);
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

  const employees = scenarioDefinition.initialEmployeePositions.map((employee) => {
    return {
      fatigue: employee.fatigue,
      id: employee.employeeId,
      name: employee.name,
      relationship: employee.relationship,
      role: employee.role,
      skills: employee.skills.map((skill) => ({ ...skill })),
      activity: { status: 'idle' as const },
      position: { ...employee.position },
    };
  });

  return {
    absoluteClockUnit,
    business: createInitialBusinessState(scenarioDefinition.business),
    clockStepRemainderTimeUnits: 0,
    completedNights: 0,
    employees,
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
