import {
  assertCampaignState,
  canonicalizeCampaignState,
  type CampaignStateV1,
} from '../campaign/campaignState';
import { createSimulationCheckpoint } from '../simulation/checkpoint';
import { SEEDED_RANDOM_ALGORITHM, SEEDED_RANDOM_VERSION } from '../simulation/random';
import type { SimulationContext } from '../simulation/scenario';
import type { DomainEvent, SimulationState } from '../simulation/types';
import { assertSimulationState } from '../simulation/validation';
import { createInitialBusinessState } from '../simulation/business';
import { createInitialState } from '../simulation/createInitialState';
import { CLOCK_UNITS_PER_MINUTE } from '../simulation/clock';
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
  saveDocumentV2Schema,
  saveDocumentV3Schema,
  saveDocumentV4Schema,
  savePayloadV4Schema,
  type SaveDocumentV1,
  type SaveDocumentV2,
  type SaveDocumentV3,
  type SaveDocumentV4,
  type SavePayloadV4,
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
): SavePayloadV4 => {
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
  return savePayloadV4Schema.parse(payload);
};

export const encodeGameSave = (
  snapshot: GameSaveSnapshot,
  context: GameSaveContext,
): string => {
  const payload = createPayload(snapshot, context);
  const document: SaveDocumentV4 = {
    ...payload,
    checksum: {
      algorithm: SAVE_CHECKSUM_ALGORITHM,
      value: hashCanonicalJson(payload),
    },
  };
  return stringifyCanonicalJson(saveDocumentV4Schema.parse(document));
};

const restoreSimulationState = (
  station:
    | SaveDocumentV1['station']
    | SaveDocumentV2['station']
    | SaveDocumentV3['station']
    | SaveDocumentV4['station'],
  context: GameSaveContext,
): SimulationState => {
  const isLegacyV1 = !('business' in station);
  const isLegacyConstruction = station.version < 8;
  const eventLedger: readonly DomainEvent[] = isLegacyConstruction
    ? station.eventLedger
        .filter(
          (event) =>
            !isLegacyV1 ||
            event.type !== 'resources.changed' ||
            event.reason !== 'day-hourly-flow',
        )
        .map((event, sequence): DomainEvent =>
          event.type === 'simulation.started'
            ? {
                ...event,
                scenarioVersion: context.simulation.scenario.version,
                sequence,
              }
            : { ...event, sequence },
        )
    : station.eventLedger;
  const initialResources = createInitialState(
    context.simulation.scenario,
    station.seed,
    station.targetNightCount,
  ).resources;
  return {
    absoluteClockUnit: station.absoluteClockUnit,
    business: isLegacyV1
      ? createInitialBusinessState(
          context.simulation.scenario.business,
          station.absoluteClockUnit === 8 * 60 * CLOCK_UNITS_PER_MINUTE
            ? station.absoluteClockUnit
            : station.absoluteClockUnit + 1,
          station.absoluteClockUnit === 8 * 60 * CLOCK_UNITS_PER_MINUTE
            ? 'scenario-start'
            : 'legacy-save-migration',
        )
      : !('performanceStartsAtClockUnit' in station.business)
        ? {
            ...station.business,
            activeCustomers: station.business.activeCustomers.map((customer) => ({
              ...customer,
              stage:
                customer.stage.type === 'pump-service'
                  ? { type: 'pump-queue' as const }
                  : customer.stage.type === 'checkout-service'
                    ? { type: 'checkout-queue' as const }
                    : customer.stage,
            })),
            performanceBaselineReason:
              station.absoluteClockUnit === 8 * 60 * CLOCK_UNITS_PER_MINUTE
                ? ('scenario-start' as const)
                : ('legacy-save-migration' as const),
            performanceStartsAtClockUnit:
              station.absoluteClockUnit === 8 * 60 * CLOCK_UNITS_PER_MINUTE
                ? station.absoluteClockUnit
                : station.absoluteClockUnit + 1,
          }
        : station.business,
    clockStepRemainderTimeUnits: station.clockStepRemainderTimeUnits,
    completedNights: station.completedNights,
    employees: station.employees.map((employee) => {
      const authored = context.simulation.scenario.initialEmployeePositions.find(
        ({ employeeId }) => employeeId === employee.id,
      );
      if (authored === undefined) return { ...employee, skills: [] };
      return {
        ...employee,
        skills:
          'skills' in employee
            ? employee.skills.map((skill) => ({ ...skill }))
            : authored.skills.map((skill) => ({ ...skill })),
      };
    }),
    eventLedger,
    isSliceComplete: station.isSliceComplete,
    nextConstructionSequence:
      'nextConstructionSequence' in station ? station.nextConstructionSequence : 0,
    nextEventSequence: isLegacyV1 ? eventLedger.length : station.nextEventSequence,
    phase: station.phase,
    resources: isLegacyV1
      ? {
          ...station.resources,
          cash: initialResources.cash,
          food: initialResources.food,
          fuel: initialResources.fuel,
        }
      : station.resources,
    rng: station.rng,
    scenarioId: station.scenarioId,
    scenarioVersion: isLegacyConstruction
      ? context.simulation.scenario.version
      : station.scenarioVersion,
    seed: station.seed,
    stationOccupancy: station.stationOccupancy,
    targetNightCount: station.targetNightCount,
    tick: station.tick,
    timeMode: station.timeMode,
  };
};

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
  if (
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2 &&
    value.schemaVersion !== 3 &&
    value.schemaVersion !== SAVE_SCHEMA_VERSION
  ) {
    return failure(
      'unsupported-save-version',
      'schemaVersion',
      'Save schema version is unsupported.',
    );
  }
  const station = value.station;
  const expectedCheckpointVersion =
    value.schemaVersion === 1
      ? 5
      : value.schemaVersion === 2
        ? 6
        : value.schemaVersion === 3
          ? 7
          : 8;
  if (isRecord(station) && station.version !== expectedCheckpointVersion) {
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
  document: SaveDocumentV1 | SaveDocumentV2 | SaveDocumentV3 | SaveDocumentV4,
  context: GameSaveContext,
): SaveLoadResult | undefined => {
  const scenario = context.simulation.scenario;
  const expectedScenarioVersion =
    document.schemaVersion === 1
      ? 3
      : document.schemaVersion === 2
        ? 4
        : document.schemaVersion === 3
          ? 5
          : scenario.version;
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
    document.content.scenarioVersion !== expectedScenarioVersion ||
    document.content.gridDefinitionVersion !== scenario.stationGridDefinition.version ||
    document.station.scenarioVersion !== expectedScenarioVersion ||
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

  const structural =
    isRecord(parsed) && parsed.schemaVersion === 1
      ? saveDocumentV1Schema.safeParse(parsed)
      : isRecord(parsed) && parsed.schemaVersion === 2
        ? saveDocumentV2Schema.safeParse(parsed)
        : isRecord(parsed) && parsed.schemaVersion === 3
          ? saveDocumentV3Schema.safeParse(parsed)
          : saveDocumentV4Schema.safeParse(parsed);
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

  const simulation = restoreSimulationState(document.station, context);
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
