import { advanceSimulationStep } from './advanceSimulation';
import {
  dispatchSimulationCommand,
  type CommandEnvelope,
  type CommandReceipt,
} from './commands';
import { hashSimulationState } from './checkpoint';
import { createInitialState } from './createInitialState';
import type { DomainEvent, SimulationState, TimeMode } from './types';

export type ClockCommandEnvelope = CommandEnvelope;

export interface ClockReplayV1 {
  readonly commands: readonly ClockCommandEnvelope[];
  readonly replayVersion: 1;
  readonly seed: number;
  readonly stopAfterTick: number;
  readonly targetNightCount: number;
}

export interface ClockReplayResult {
  readonly events: readonly DomainEvent[];
  readonly receipts: readonly CommandReceipt[];
  readonly state: SimulationState;
  readonly stateHash: string;
  readonly unconsumedCommandIds: readonly string[];
}

const TIME_MODES: readonly TimeMode[] = ['paused', 'slow', 'normal', 'fast'];

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

const validateReplay: (replay: unknown) => asserts replay is ClockReplayV1 = (
  replay,
) => {
  if (!isRecord(replay)) {
    throw new RangeError('Clock replay must be an object.');
  }

  const replayVersion = replay.replayVersion;
  if (replayVersion !== 1) {
    throw new RangeError('Unsupported clock replay version.');
  }

  if (typeof replay.seed !== 'number') throw new RangeError('seed must be a number.');
  if (typeof replay.stopAfterTick !== 'number') {
    throw new RangeError('stopAfterTick must be a number.');
  }
  if (typeof replay.targetNightCount !== 'number') {
    throw new RangeError('targetNightCount must be a number.');
  }
  if (!Array.isArray(replay.commands)) {
    throw new RangeError('commands must be an array.');
  }

  assertNonNegativeSafeInteger(replay.seed, 'seed');
  assertNonNegativeSafeInteger(replay.stopAfterTick, 'stopAfterTick');
  if (!Number.isSafeInteger(replay.targetNightCount) || replay.targetNightCount < 1) {
    throw new RangeError('targetNightCount must be a positive safe integer.');
  }

  const ids = new Set<string>();
  const sequences = new Set<number>();

  for (const envelope of replay.commands as readonly unknown[]) {
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
    const commandType = envelope.command.type;
    if (
      commandType !== 'time-mode.set' ||
      !TIME_MODES.includes(envelope.command.mode as TimeMode)
    ) {
      throw new RangeError('Unsupported clock replay command.');
    }
  }
};

export const runClockReplay = (replay: ClockReplayV1): ClockReplayResult => {
  validateReplay(replay);

  const commands = [...replay.commands].sort(
    (left, right) => left.atTick - right.atTick || left.sequence - right.sequence,
  );
  let commandIndex = 0;
  let state = createInitialState(replay.seed, replay.targetNightCount);
  const receipts: CommandReceipt[] = [];

  while (state.tick < replay.stopAfterTick && !state.isSliceComplete) {
    while (commands[commandIndex]?.atTick === state.tick) {
      const envelope = commands[commandIndex];
      if (envelope === undefined) break;
      const result = dispatchSimulationCommand(state, envelope);
      state = result.state;
      receipts.push(result.receipt);
      commandIndex += 1;
    }

    const advanced = advanceSimulationStep(state);
    if (advanced === state) break;
    state = advanced;
  }

  return {
    events: state.eventLedger,
    receipts,
    state,
    stateHash: hashSimulationState(state),
    unconsumedCommandIds: commands.slice(commandIndex).map((command) => command.id),
  };
};
