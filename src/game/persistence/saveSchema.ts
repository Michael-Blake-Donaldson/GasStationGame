import { z } from 'zod';
import { CAMPAIGN_STATE_VERSION } from '../campaign/campaignState';
import { SIMULATION_CHECKPOINT_VERSION } from '../simulation/checkpoint';
import { SEEDED_RANDOM_ALGORITHM, SEEDED_RANDOM_VERSION } from '../simulation/random';

export const SAVE_FORMAT_ID = 'station-campaign-save' as const;
export const SAVE_SCHEMA_VERSION = 1 as const;
export const SAVE_CHECKSUM_ALGORITHM = 'fnv1a32' as const;
export const SAVE_SETTINGS_VERSION = 1 as const;
export const SAVE_DIFFICULTY_VERSION = 1 as const;

const safeInteger = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const nonNegativeSafeInteger = safeInteger.nonnegative();
const positiveSafeInteger = safeInteger.positive();
const technicalId = z.string().regex(/^[a-z0-9-]+$/u);
const nonEmptyString = z.string().refine((value) => value.trim().length > 0, {
  message: 'String must contain a non-whitespace character.',
});
const coordinate = z
  .object({ x: nonNegativeSafeInteger, z: nonNegativeSafeInteger })
  .strict();
const footprint = z
  .object({ height: positiveSafeInteger, width: positiveSafeInteger })
  .strict();
const quarterTurn = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const fixedOrFlexibleOccupant = z
  .object({
    footprint,
    id: technicalId,
    origin: coordinate,
    placement: z.enum(['fixed', 'flexible']),
    rotation: quarterTurn,
    structureId: technicalId,
  })
  .strict();
const authoredPlotOccupant = z
  .object({
    facilityId: technicalId,
    id: technicalId,
    placement: z.literal('authored-plot'),
    plotId: technicalId,
  })
  .strict();
const occupant = z.discriminatedUnion('placement', [
  authoredPlotOccupant,
  fixedOrFlexibleOccupant,
]);

const idleActivity = z.object({ status: z.literal('idle') }).strict();
const travelingActivity = z
  .object({
    assignmentId: technicalId,
    destination: coordinate,
    jobId: technicalId,
    movementProgressClockUnits: nonNegativeSafeInteger,
    nextPathIndex: nonNegativeSafeInteger,
    path: z.array(coordinate).min(1),
    status: z.literal('traveling'),
    targetId: technicalId,
    totalWorkClockUnits: positiveSafeInteger,
  })
  .strict();
const workingActivity = z
  .object({
    assignmentId: technicalId,
    destination: coordinate,
    jobId: technicalId,
    remainingWorkClockUnits: positiveSafeInteger,
    status: z.literal('working'),
    targetId: technicalId,
    totalWorkClockUnits: positiveSafeInteger,
  })
  .strict();
const employee = z
  .object({
    activity: z.discriminatedUnion('status', [
      idleActivity,
      travelingActivity,
      workingActivity,
    ]),
    fatigue: z.number(),
    id: technicalId,
    name: nonEmptyString,
    position: coordinate,
    relationship: z.number(),
    role: nonEmptyString,
  })
  .strict();

const eventBase = z.object({
  absoluteClockUnit: nonNegativeSafeInteger,
  minute: nonNegativeSafeInteger,
  sequence: nonNegativeSafeInteger,
  tick: nonNegativeSafeInteger,
});
const simulationStartedEvent = eventBase
  .extend({
    gridDefinitionId: technicalId,
    gridDefinitionVersion: positiveSafeInteger,
    reason: z.literal('scenario-initialized'),
    rngAlgorithm: z.literal(SEEDED_RANDOM_ALGORITHM),
    rngVersion: z.literal(SEEDED_RANDOM_VERSION),
    scenarioId: technicalId,
    scenarioVersion: positiveSafeInteger,
    seed: nonNegativeSafeInteger,
    targetNightCount: positiveSafeInteger,
    type: z.literal('simulation.started'),
  })
  .strict();
const phaseEnteredEvent = eventBase
  .extend({
    currentPhase: z.enum(['morning', 'day', 'dusk', 'night']),
    previousPhase: z.enum(['morning', 'day', 'dusk', 'night']),
    reason: z.literal('clock-boundary'),
    type: z.literal('phase.entered'),
  })
  .strict();
const nightCompletedEvent = eventBase
  .extend({
    completedNights: nonNegativeSafeInteger,
    reason: z.literal('sunrise-reached'),
    type: z.literal('night.completed'),
  })
  .strict();
const resourceChange = z
  .object({
    after: nonNegativeSafeInteger,
    appliedDelta: safeInteger,
    before: nonNegativeSafeInteger,
    requestedDelta: safeInteger,
    resource: z.enum(['ammunition', 'cash', 'food', 'fuel', 'power', 'scrap']),
  })
  .strict();
const resourcesChangedEvent = eventBase
  .extend({
    changes: z.array(resourceChange).min(1),
    reason: z.enum(['day-hourly-flow', 'night-hourly-flow']),
    type: z.literal('resources.changed'),
  })
  .strict();
const timeMode = z.enum(['paused', 'slow', 'normal', 'fast']);
const timeModeChangedEvent = eventBase
  .extend({
    currentMode: timeMode,
    effectiveCurrentMode: timeMode,
    effectivePreviousMode: timeMode,
    previousMode: timeMode,
    reason: z.enum(['night-fast-capped', 'night-pause-converted', 'player-request']),
    requestedMode: timeMode,
    type: z.literal('time-mode.changed'),
  })
  .strict();
const sliceCompletedEvent = eventBase
  .extend({
    completedNights: nonNegativeSafeInteger,
    reason: z.literal('target-night-count-reached'),
    targetNightCount: positiveSafeInteger,
    type: z.literal('slice.completed'),
  })
  .strict();
const jobAssignedEvent = eventBase
  .extend({
    assignmentId: technicalId,
    destination: coordinate,
    employeeId: technicalId,
    jobId: technicalId,
    pathLength: nonNegativeSafeInteger,
    reason: z.literal('player-request'),
    targetId: technicalId,
    type: z.literal('job.assigned'),
  })
  .strict();
const employeeArrivedEvent = eventBase
  .extend({
    assignmentId: technicalId,
    destination: coordinate,
    employeeId: technicalId,
    jobId: technicalId,
    reason: z.literal('job-travel-completed'),
    targetId: technicalId,
    traveledCellCount: positiveSafeInteger,
    type: z.literal('employee.arrived'),
  })
  .strict();
const jobStartedEvent = eventBase
  .extend({
    assignmentId: technicalId,
    employeeId: technicalId,
    jobId: technicalId,
    reason: z.literal('employee-at-interaction-cell'),
    targetId: technicalId,
    totalWorkClockUnits: positiveSafeInteger,
    type: z.literal('job.started'),
  })
  .strict();
const jobCancelledEvent = eventBase
  .extend({
    assignmentId: technicalId,
    employeeId: technicalId,
    jobId: technicalId,
    position: coordinate,
    previousActivity: z.enum(['traveling', 'working']),
    reason: z.literal('player-request'),
    remainingPathCells: nonNegativeSafeInteger,
    remainingWorkClockUnits: nonNegativeSafeInteger,
    type: z.literal('job.cancelled'),
  })
  .strict();
const jobCompletedEvent = eventBase
  .extend({
    assignmentId: technicalId,
    employeeId: technicalId,
    jobId: technicalId,
    position: coordinate,
    reason: z.literal('work-duration-reached'),
    targetId: technicalId,
    type: z.literal('job.completed'),
  })
  .strict();
const domainEvent = z.discriminatedUnion('type', [
  simulationStartedEvent,
  phaseEnteredEvent,
  nightCompletedEvent,
  resourcesChangedEvent,
  timeModeChangedEvent,
  sliceCompletedEvent,
  jobAssignedEvent,
  employeeArrivedEvent,
  jobStartedEvent,
  jobCancelledEvent,
  jobCompletedEvent,
]);

export const simulationCheckpointV5Schema = z
  .object({
    absoluteClockUnit: nonNegativeSafeInteger,
    clockStepRemainderTimeUnits: nonNegativeSafeInteger,
    completedNights: nonNegativeSafeInteger,
    employees: z.array(employee),
    eventLedger: z.array(domainEvent).min(1),
    isSliceComplete: z.boolean(),
    nextEventSequence: nonNegativeSafeInteger,
    phase: z.enum(['morning', 'day', 'dusk', 'night']),
    resources: z
      .object({
        ammunition: nonNegativeSafeInteger,
        cash: nonNegativeSafeInteger,
        food: nonNegativeSafeInteger,
        fuel: nonNegativeSafeInteger,
        power: nonNegativeSafeInteger,
        scrap: nonNegativeSafeInteger,
      })
      .strict(),
    rng: z
      .object({
        algorithm: z.literal(SEEDED_RANDOM_ALGORITHM),
        drawCount: nonNegativeSafeInteger,
        version: z.literal(SEEDED_RANDOM_VERSION),
        words: z.tuple([
          z.number().int().min(0).max(0xffff_ffff),
          z.number().int().min(0).max(0xffff_ffff),
          z.number().int().min(0).max(0xffff_ffff),
          z.number().int().min(0).max(0xffff_ffff),
        ]),
      })
      .strict(),
    scenarioId: technicalId,
    scenarioVersion: positiveSafeInteger,
    seed: nonNegativeSafeInteger,
    stationOccupancy: z
      .object({
        gridDefinitionId: technicalId,
        gridDefinitionVersion: positiveSafeInteger,
        occupants: z.array(occupant),
      })
      .strict(),
    targetNightCount: positiveSafeInteger,
    tick: nonNegativeSafeInteger,
    timeMode,
    version: z.literal(SIMULATION_CHECKPOINT_VERSION),
  })
  .strict();

export const campaignStateV1Schema = z
  .object({
    activeRegionId: technicalId,
    campaignId: technicalId,
    completedRegionIds: z.array(technicalId),
    schemaVersion: z.literal(CAMPAIGN_STATE_VERSION),
  })
  .strict();

export const savePayloadV1Schema = z
  .object({
    campaign: campaignStateV1Schema,
    content: z
      .object({
        gridDefinitionId: technicalId,
        gridDefinitionVersion: positiveSafeInteger,
        rngAlgorithm: z.literal(SEEDED_RANDOM_ALGORITHM),
        rngVersion: z.literal(SEEDED_RANDOM_VERSION),
        scenarioId: technicalId,
        scenarioVersion: positiveSafeInteger,
      })
      .strict(),
    difficulty: z
      .object({ schemaVersion: z.literal(SAVE_DIFFICULTY_VERSION) })
      .strict(),
    format: z.literal(SAVE_FORMAT_ID),
    metadata: z.object({ saveSequence: nonNegativeSafeInteger }).strict(),
    schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
    session: z.object({ nextCommandSequence: nonNegativeSafeInteger }).strict(),
    settings: z.object({ schemaVersion: z.literal(SAVE_SETTINGS_VERSION) }).strict(),
    station: simulationCheckpointV5Schema,
  })
  .strict();

export const saveDocumentV1Schema = savePayloadV1Schema
  .extend({
    checksum: z
      .object({
        algorithm: z.literal(SAVE_CHECKSUM_ALGORITHM),
        value: z.string().regex(/^[0-9a-f]{8}$/u),
      })
      .strict(),
  })
  .strict();

export type SaveDocumentV1 = z.infer<typeof saveDocumentV1Schema>;
export type SavePayloadV1 = z.infer<typeof savePayloadV1Schema>;
