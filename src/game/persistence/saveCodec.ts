import {
  assertCampaignState,
  canonicalizeCampaignState,
  type CampaignStateV1,
} from '../campaign/campaignState';
import {
  createSimulationCheckpoint,
  SIMULATION_CHECKPOINT_VERSION,
} from '../simulation/checkpoint';
import { SEEDED_RANDOM_ALGORITHM, SEEDED_RANDOM_VERSION } from '../simulation/random';
import type { SimulationContext } from '../simulation/scenario';
import type { SimulationState } from '../simulation/types';
import { assertSimulationState } from '../simulation/validation';
import {
  hashCanonicalJson,
  stringifyCanonicalJson,
} from '../serialization/canonicalJson';
import {
  SAVE_CHECKSUM_ALGORITHM,
  SAVE_DIFFICULTY_VERSION,
  SAVE_FORMAT_ID,
  SAVE_SCHEMA_VERSION,
  SAVE_SETTINGS_VERSION,
  campaignStateV1Schema,
  saveDocumentV1Schema,
  savePayloadV1Schema,
  type SaveDocumentV1,
  type SavePayloadV1,
} from './saveSchema';

export interface GameSaveContext {
  readonly knownRegionIds: readonly string[];
  readonly simulation: SimulationContext;
}

export interface GameSaveSnapshot {
  readonly campaign: CampaignStateV1;
  readonly nextCommandSequence: number;
  readonly saveSequence: number;
  readonly simulation: SimulationState;
}

export type SaveIssueCode =
  | 'checksum-mismatch'
  | 'content-id-mismatch'
  | 'invalid-campaign'
  | 'invalid-json'
  | 'invalid-save-structure'
  | 'semantic-invariant-failed'
  | 'unsupported-checkpoint-version'
  | 'unsupported-content-version'
  | 'unsupported-rng-version'
  | 'unsupported-save-format'
  | 'unsupported-save-version';

export interface SaveIssue {
  readonly code: SaveIssueCode;
  readonly detail: string;
  readonly path: string;
}

export type SaveLoadResult =
  | {
      readonly campaign: CampaignStateV1;
      readonly difficulty: { readonly schemaVersion: 1 };
      readonly nextCommandSequence: number;
      readonly ok: true;
      readonly saveSequence: number;
      readonly settings: { readonly schemaVersion: 1 };
      readonly simulation: SimulationState;
    }
  | { readonly issues: readonly SaveIssue[]; readonly ok: false };

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const failure = (
  code: SaveIssueCode,
  path: string,
  detail: string,
): SaveLoadResult => ({ issues: [{ code, detail, path }], ok: false });

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

const createPayload = (
  snapshot: GameSaveSnapshot,
  context: GameSaveContext,
): SavePayloadV1 => {
  assertNonNegativeSafeInteger(snapshot.nextCommandSequence, 'nextCommandSequence');
  assertNonNegativeSafeInteger(snapshot.saveSequence, 'saveSequence');
  const campaign = canonicalizeCampaignState(
    campaignStateV1Schema.parse(snapshot.campaign),
  );
  assertCampaignState(campaign, context.knownRegionIds);
  if (campaign.activeRegionId !== context.simulation.scenario.id) {
    throw new RangeError('Campaign active region does not match the station scenario.');
  }
  const station = createSimulationCheckpoint(snapshot.simulation, context.simulation);
  const scenario = context.simulation.scenario;
  const payload = {
    campaign: {
      ...campaign,
      completedRegionIds: [...campaign.completedRegionIds],
    },
    content: {
      gridDefinitionId: scenario.stationGridDefinition.id,
      gridDefinitionVersion: scenario.stationGridDefinition.version,
      rngAlgorithm: SEEDED_RANDOM_ALGORITHM,
      rngVersion: SEEDED_RANDOM_VERSION,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
    },
    difficulty: { schemaVersion: SAVE_DIFFICULTY_VERSION },
    format: SAVE_FORMAT_ID,
    metadata: { saveSequence: snapshot.saveSequence },
    schemaVersion: SAVE_SCHEMA_VERSION,
    session: { nextCommandSequence: snapshot.nextCommandSequence },
    settings: { schemaVersion: SAVE_SETTINGS_VERSION },
    station,
  };
  return savePayloadV1Schema.parse(payload);
};

export const encodeGameSave = (
  snapshot: GameSaveSnapshot,
  context: GameSaveContext,
): string => {
  const payload = createPayload(snapshot, context);
  const document: SaveDocumentV1 = {
    ...payload,
    checksum: {
      algorithm: SAVE_CHECKSUM_ALGORITHM,
      value: hashCanonicalJson(payload),
    },
  };
  return stringifyCanonicalJson(saveDocumentV1Schema.parse(document));
};

const restoreSimulationState = (
  station: SaveDocumentV1['station'],
): SimulationState => ({
  absoluteClockUnit: station.absoluteClockUnit,
  clockStepRemainderTimeUnits: station.clockStepRemainderTimeUnits,
  completedNights: station.completedNights,
  employees: station.employees,
  eventLedger: station.eventLedger,
  isSliceComplete: station.isSliceComplete,
  nextEventSequence: station.nextEventSequence,
  phase: station.phase,
  resources: station.resources,
  rng: station.rng,
  scenarioId: station.scenarioId,
  scenarioVersion: station.scenarioVersion,
  seed: station.seed,
  stationOccupancy: station.stationOccupancy,
  targetNightCount: station.targetNightCount,
  tick: station.tick,
  timeMode: station.timeMode,
});

const headerFailure = (value: unknown): SaveLoadResult | undefined => {
  if (!isRecord(value)) {
    return failure('invalid-save-structure', '$', 'Save document must be an object.');
  }
  if (value.format !== SAVE_FORMAT_ID) {
    return failure(
      'unsupported-save-format',
      'format',
      'Save format identifier is unsupported.',
    );
  }
  if (value.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return failure(
      'unsupported-save-version',
      'schemaVersion',
      'Save schema version is unsupported.',
    );
  }
  const station = value.station;
  if (isRecord(station) && station.version !== SIMULATION_CHECKPOINT_VERSION) {
    return failure(
      'unsupported-checkpoint-version',
      'station.version',
      'Simulation checkpoint version is unsupported.',
    );
  }
  if (isRecord(station) && isRecord(station.rng)) {
    if (
      station.rng.algorithm !== SEEDED_RANDOM_ALGORITHM ||
      station.rng.version !== SEEDED_RANDOM_VERSION
    ) {
      return failure(
        'unsupported-rng-version',
        'station.rng',
        'Simulation RNG algorithm or version is unsupported.',
      );
    }
  }
  return undefined;
};

const contentFailure = (
  document: SaveDocumentV1,
  context: GameSaveContext,
): SaveLoadResult | undefined => {
  const scenario = context.simulation.scenario;
  if (
    document.content.scenarioId !== scenario.id ||
    document.content.gridDefinitionId !== scenario.stationGridDefinition.id ||
    document.campaign.activeRegionId !== scenario.id ||
    document.station.scenarioId !== scenario.id ||
    document.station.stationOccupancy.gridDefinitionId !==
      scenario.stationGridDefinition.id
  ) {
    return failure(
      'content-id-mismatch',
      'content',
      'Save content IDs do not match the selected scenario.',
    );
  }
  if (
    document.content.scenarioVersion !== scenario.version ||
    document.content.gridDefinitionVersion !== scenario.stationGridDefinition.version ||
    document.station.scenarioVersion !== scenario.version ||
    document.station.stationOccupancy.gridDefinitionVersion !==
      scenario.stationGridDefinition.version
  ) {
    return failure(
      'unsupported-content-version',
      'content',
      'Save content versions do not match the selected scenario.',
    );
  }
  return undefined;
};

export const decodeGameSave = (
  serialized: string,
  context: GameSaveContext,
): SaveLoadResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return failure('invalid-json', '$', 'Save data is not valid JSON.');
  }

  const invalidHeader = headerFailure(parsed);
  if (invalidHeader !== undefined) return invalidHeader;

  const structural = saveDocumentV1Schema.safeParse(parsed);
  if (!structural.success) {
    return {
      issues: structural.error.issues.map((issue) => ({
        code: 'invalid-save-structure',
        detail: issue.message,
        path: issue.path.map(String).join('.'),
      })),
      ok: false,
    };
  }
  const document = structural.data;
  const { checksum, ...payload } = document;
  if (checksum.value !== hashCanonicalJson(payload)) {
    return failure(
      'checksum-mismatch',
      'checksum.value',
      'Save checksum does not match its payload.',
    );
  }
  const invalidContent = contentFailure(document, context);
  if (invalidContent !== undefined) return invalidContent;

  try {
    assertCampaignState(document.campaign, context.knownRegionIds);
  } catch (error) {
    return failure(
      'invalid-campaign',
      'campaign',
      error instanceof Error ? error.message : 'Campaign state is invalid.',
    );
  }

  const simulation = restoreSimulationState(document.station);
  try {
    assertSimulationState(context.simulation, simulation);
  } catch (error) {
    return failure(
      'semantic-invariant-failed',
      'station',
      error instanceof Error ? error.message : 'Simulation state is invalid.',
    );
  }

  return {
    campaign: document.campaign,
    difficulty: document.difficulty,
    nextCommandSequence: document.session.nextCommandSequence,
    ok: true,
    saveSequence: document.metadata.saveSequence,
    settings: document.settings,
    simulation,
  };
};
