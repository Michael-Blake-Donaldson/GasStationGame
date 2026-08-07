import { greatPlainsRegion } from '../../content/regions/greatPlains';
import { createInitialState as createSimulationInitialState } from '../simulation/createInitialState';
import {
  runClockReplay as runSimulationClockReplay,
  runScenarioReplay as runSimulationScenarioReplay,
  type ClockReplayV1,
  type ScenarioReplayV2,
} from '../simulation/replay';
import {
  GREAT_PLAINS_SCENARIO_ID,
  GREAT_PLAINS_SCENARIO_VERSION,
  type ScenarioDefinition,
} from '../simulation/scenario';

export {
  GREAT_PLAINS_SCENARIO_ID,
  GREAT_PLAINS_SCENARIO_VERSION,
} from '../simulation/scenario';
export type {
  ClockReplayResult,
  ClockReplayV1,
  ScenarioReplayResult,
  ScenarioReplayV2,
  ScenarioReplayStopReason,
} from '../simulation/replay';

export const greatPlainsStationGrid = greatPlainsRegion.stationGrid;
export const greatPlainsScenario = {
  id: GREAT_PLAINS_SCENARIO_ID,
  stationGridDefinition: greatPlainsStationGrid,
  version: GREAT_PLAINS_SCENARIO_VERSION,
} satisfies ScenarioDefinition;

export const createInitialState = (
  seed = 1987,
  targetNightCount = greatPlainsRegion.sliceNightCount,
) => createSimulationInitialState(greatPlainsScenario, seed, targetNightCount);

export const runScenarioReplay = (replay: ScenarioReplayV2) =>
  runSimulationScenarioReplay(replay, greatPlainsScenario);

export const runClockReplay = (replay: ClockReplayV1) =>
  runSimulationClockReplay(replay, greatPlainsScenario);
