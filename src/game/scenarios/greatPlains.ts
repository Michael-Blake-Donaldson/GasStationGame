import { greatPlainsRegion } from '../../content/regions/greatPlains';
import { dispatchSimulationCommand as dispatchCommand } from '../simulation/commands';
import {
  createSimulationCheckpoint as createCheckpoint,
  hashSimulationState as hashState,
} from '../simulation/checkpoint';
import { createInitialState as createSimulationInitialState } from '../simulation/createInitialState';
import { assertScenarioDefinition } from '../simulation/jobs';
import {
  decodeGameSave as decodeSave,
  encodeGameSave as encodeSave,
  type GameSaveSnapshot,
} from '../persistence/saveCodec';
import {
  runClockReplay as runSimulationClockReplay,
  runScenarioReplay as runSimulationScenarioReplay,
  type ClockReplayV1,
  type ScenarioReplayV3,
} from '../simulation/replay';
import {
  GREAT_PLAINS_SCENARIO_ID,
  GREAT_PLAINS_SCENARIO_VERSION,
  type SimulationContext,
  type ScenarioDefinition,
} from '../simulation/scenario';
import type { SimulationState } from '../simulation/types';

export {
  GREAT_PLAINS_SCENARIO_ID,
  GREAT_PLAINS_SCENARIO_VERSION,
} from '../simulation/scenario';
export type {
  ClockReplayResult,
  ClockReplayV1,
  ScenarioReplayResult,
  ScenarioReplayV3,
  ScenarioReplayStopReason,
} from '../simulation/replay';

export const greatPlainsStationGrid = greatPlainsRegion.stationGrid;
export const greatPlainsScenario = {
  id: GREAT_PLAINS_SCENARIO_ID,
  initialEmployeePositions: greatPlainsRegion.initialEmployeePositions,
  jobs: greatPlainsRegion.jobs,
  stationGridDefinition: greatPlainsStationGrid,
  version: GREAT_PLAINS_SCENARIO_VERSION,
  workTargets: greatPlainsRegion.workTargets,
} satisfies ScenarioDefinition;
export const greatPlainsSimulationContext = {
  scenario: greatPlainsScenario,
} satisfies SimulationContext;
export const greatPlainsSaveContext = {
  knownRegionIds: [GREAT_PLAINS_SCENARIO_ID],
  simulation: greatPlainsSimulationContext,
} as const;

assertScenarioDefinition(greatPlainsScenario);

export const createInitialState = (
  seed = 1987,
  targetNightCount = greatPlainsRegion.sliceNightCount,
) => createSimulationInitialState(greatPlainsScenario, seed, targetNightCount);

export const dispatchSimulationCommand = (state: SimulationState, envelope: unknown) =>
  dispatchCommand(state, envelope, greatPlainsSimulationContext);

export const createSimulationCheckpoint = (state: SimulationState) =>
  createCheckpoint(state, greatPlainsSimulationContext);

export const hashSimulationState = (state: SimulationState) =>
  hashState(state, greatPlainsSimulationContext);

export const encodeGameSave = (snapshot: GameSaveSnapshot) =>
  encodeSave(snapshot, greatPlainsSaveContext);

export const decodeGameSave = (serialized: string) =>
  decodeSave(serialized, greatPlainsSaveContext);

export const runScenarioReplay = (replay: ScenarioReplayV3) =>
  runSimulationScenarioReplay(replay, greatPlainsSimulationContext);

export const runClockReplay = (replay: ClockReplayV1) =>
  runSimulationClockReplay(replay, greatPlainsSimulationContext);
