import { advanceSimulationStep } from './advanceSimulation';
import {
  dispatchSimulationCommand,
  parseSimulationCommand,
  type CommandEnvelope,
  type CommandReceipt,
} from './commands';
import { hashDomainEventLedger, hashSimulationState } from './checkpoint';
import { createInitialState } from './createInitialState';
import {
  SEEDED_RANDOM_ALGORITHM,
  SEEDED_RANDOM_VERSION,
  type SeededRandomState,
} from './random';
import type { SimulationContext } from './scenario';
import type { DomainEvent, SimulationState } from './types';

export interface ScenarioReplayV3 {
  readonly commands: readonly CommandEnvelope[];
  readonly gridDefinitionId: string;
  readonly gridDefinitionVersion: number;
  readonly replayKind: 'scenario';
  readonly replayVersion: 3;
  readonly rng: {
    readonly algorithm: typeof SEEDED_RANDOM_ALGORITHM;
    readonly seed: number;
    readonly version: typeof SEEDED_RANDOM_VERSION;
  };
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly stopAfterTick: number;
  readonly targetNightCount: number;
}

export type ScenarioReplayStopReason =
  'paused-with-no-reachable-command' | 'slice-completed' | 'tick-limit-reached';

export interface ScenarioReplayResult {
  readonly consumedCommandIds: readonly string[];
  readonly eventLedger: readonly DomainEvent[];
  readonly eventLedgerHash: string;
  readonly finalRng: SeededRandomState;
  readonly receipts: readonly CommandReceipt[];
  readonly state: SimulationState;
  readonly stateHash: string;
  readonly stopReason: ScenarioReplayStopReason;
  readonly unconsumedCommandIds: readonly string[];
}

/** Legacy GS-010 replay input retained as an explicit adapter. */
export interface ClockReplayV1 {
  readonly commands: readonly CommandEnvelope[];
  readonly replayVersion: 1;
  readonly seed: number;
  readonly stopAfterTick: number;
  readonly targetNightCount: number;
}

/** Legacy GS-010 result retains the old `events` projection. */
export interface ClockReplayResult extends ScenarioReplayResult {
  readonly events: readonly DomainEvent[];
}

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

const validateCommands: (
  value: unknown,
  allowJobCommands: boolean,
) => asserts value is readonly CommandEnvelope[] = (value, allowJobCommands) => {
  if (!Array.isArray(value)) throw new RangeError('commands must be an array.');

  const ids = new Set<string>();
  const sequences = new Set<number>();

  for (const envelope of value as readonly unknown[]) {
    if (!isRecord(envelope)) {
      throw new RangeError('Command envelopes must be objects.');
    }
    if (typeof envelope.id !== 'string' || envelope.id.trim().length === 0) {
      throw new RangeError('Command ids must be non-empty strings.');
    }
    if (ids.has(envelope.id)) throw new RangeError('Command ids must be unique.');
    ids.add(envelope.id);

    if (typeof envelope.atTick !== 'number') {
      throw new RangeError('command.atTick must be a number.');
    }
    if (typeof envelope.sequence !== 'number') {
      throw new RangeError('command.sequence must be a number.');
    }
    assertNonNegativeSafeInteger(envelope.atTick, 'command.atTick');
    assertNonNegativeSafeInteger(envelope.sequence, 'command.sequence');
    if (sequences.has(envelope.sequence)) {
      throw new RangeError('Command sequences must be unique.');
    }
    sequences.add(envelope.sequence);

    if (!isRecord(envelope.command)) {
      throw new RangeError('Replay command payloads must be objects.');
    }
    const command = parseSimulationCommand(envelope.command);
    if (command === undefined) {
      throw new RangeError('Unsupported scenario replay command.');
    }
    if (!allowJobCommands && command.type !== 'time-mode.set') {
      throw new RangeError('Legacy clock replay only supports time commands.');
    }
  }
};

const validateCommonFields = (
  replay: Record<PropertyKey, unknown>,
  allowJobCommands: boolean,
): void => {
  if (typeof replay.stopAfterTick !== 'number') {
    throw new RangeError('stopAfterTick must be a number.');
  }
  if (typeof replay.targetNightCount !== 'number') {
    throw new RangeError('targetNightCount must be a number.');
  }
  assertNonNegativeSafeInteger(replay.stopAfterTick, 'stopAfterTick');
  if (!Number.isSafeInteger(replay.targetNightCount) || replay.targetNightCount < 1) {
    throw new RangeError('targetNightCount must be a positive safe integer.');
  }
  validateCommands(replay.commands, allowJobCommands);
};

const validateScenarioReplay: (
  replay: unknown,
  context: SimulationContext,
) => asserts replay is ScenarioReplayV3 = (replay, context) => {
  const scenarioDefinition = context.scenario;
  if (!isRecord(replay)) throw new RangeError('Scenario replay must be an object.');
  if (replay.replayKind !== 'scenario' || replay.replayVersion !== 3) {
    throw new RangeError('Unsupported scenario replay format.');
  }
  if (
    replay.scenarioId !== scenarioDefinition.id ||
    replay.scenarioVersion !== scenarioDefinition.version
  ) {
    throw new RangeError('Unsupported scenario replay version.');
  }
  if (
    replay.gridDefinitionId !== scenarioDefinition.stationGridDefinition.id ||
    replay.gridDefinitionVersion !== scenarioDefinition.stationGridDefinition.version
  ) {
    throw new RangeError('Unsupported scenario replay grid definition.');
  }
  if (
    !isRecord(replay.rng) ||
    replay.rng.algorithm !== SEEDED_RANDOM_ALGORITHM ||
    replay.rng.version !== SEEDED_RANDOM_VERSION
  ) {
    throw new RangeError('Unsupported scenario replay RNG.');
  }
  if (typeof replay.rng.seed !== 'number') {
    throw new RangeError('rng.seed must be a number.');
  }
  assertNonNegativeSafeInteger(replay.rng.seed, 'rng.seed');
  validateCommonFields(replay, true);
};

const validateClockReplay: (replay: unknown) => asserts replay is ClockReplayV1 = (
  replay,
) => {
  if (!isRecord(replay)) throw new RangeError('Clock replay must be an object.');
  if (replay.replayVersion !== 1) {
    throw new RangeError('Unsupported clock replay version.');
  }
  if (typeof replay.seed !== 'number') throw new RangeError('seed must be a number.');
  assertNonNegativeSafeInteger(replay.seed, 'seed');
  validateCommonFields(replay, false);
};

const orderedCommands = (
  commands: readonly CommandEnvelope[],
): readonly CommandEnvelope[] =>
  [...commands].sort(
    (left, right) => left.atTick - right.atTick || left.sequence - right.sequence,
  );

export const runScenarioReplay = (
  replay: ScenarioReplayV3,
  context: SimulationContext,
): ScenarioReplayResult => {
  validateScenarioReplay(replay, context);

  const commands = orderedCommands(replay.commands);
  let commandIndex = 0;
  let state = createInitialState(
    context.scenario,
    replay.rng.seed,
    replay.targetNightCount,
  );
  const receipts: CommandReceipt[] = [];

  while (state.tick < replay.stopAfterTick && !state.isSliceComplete) {
    while (commands[commandIndex]?.atTick === state.tick) {
      const envelope = commands[commandIndex];
      if (envelope === undefined) break;
      const result = dispatchSimulationCommand(state, envelope, context);
      state = result.state;
      receipts.push(result.receipt);
      commandIndex += 1;
    }

    const advanced = advanceSimulationStep(state);
    if (advanced === state) break;
    state = advanced;
  }

  const eventLedger = state.eventLedger;
  const consumedCommandIds = commands
    .slice(0, commandIndex)
    .map((command) => command.id);
  const unconsumedCommandIds = commands
    .slice(commandIndex)
    .map((command) => command.id);
  const stopReason: ScenarioReplayStopReason = state.isSliceComplete
    ? 'slice-completed'
    : state.tick >= replay.stopAfterTick
      ? 'tick-limit-reached'
      : 'paused-with-no-reachable-command';

  return {
    consumedCommandIds,
    eventLedger,
    eventLedgerHash: hashDomainEventLedger(eventLedger),
    finalRng: state.rng,
    receipts,
    state,
    stateHash: hashSimulationState(state, context),
    stopReason,
    unconsumedCommandIds,
  };
};

export const runClockReplay = (
  replay: ClockReplayV1,
  context: SimulationContext,
): ClockReplayResult => {
  validateClockReplay(replay);
  const scenarioDefinition = context.scenario;
  const result = runScenarioReplay(
    {
      commands: replay.commands,
      gridDefinitionId: scenarioDefinition.stationGridDefinition.id,
      gridDefinitionVersion: scenarioDefinition.stationGridDefinition.version,
      replayKind: 'scenario',
      replayVersion: 3,
      rng: {
        algorithm: SEEDED_RANDOM_ALGORITHM,
        seed: replay.seed,
        version: SEEDED_RANDOM_VERSION,
      },
      scenarioId: scenarioDefinition.id,
      scenarioVersion: scenarioDefinition.version,
      stopAfterTick: replay.stopAfterTick,
      targetNightCount: replay.targetNightCount,
    },
    context,
  );
  return { ...result, events: result.eventLedger };
};
