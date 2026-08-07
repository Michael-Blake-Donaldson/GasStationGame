import { advanceSimulationStep } from './advanceSimulation';
import {
  executeSimulationCommand,
  type CommandReceipt,
  type SimulationCommand,
} from './commands';
import { hashSimulationState } from './checkpoint';
import { createInitialState } from './createInitialState';
import type { SimulationEvent, SimulationState, TimeMode } from './types';

export interface ClockCommandEnvelope {
  readonly atTick: number;
  readonly command: SimulationCommand;
  readonly id: string;
  readonly sequence: number;
}

export interface ClockReplayV1 {
  readonly commands: readonly ClockCommandEnvelope[];
  readonly replayVersion: 1;
  readonly seed: number;
  readonly stopAfterTick: number;
  readonly targetNightCount: number;
}

export interface ReplayCommandReceipt extends CommandReceipt {
  readonly atTick: number;
  readonly id: string;
  readonly sequence: number;
}

export interface ClockReplayResult {
  readonly events: readonly SimulationEvent[];
  readonly receipts: readonly ReplayCommandReceipt[];
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

const validateReplay = (replay: ClockReplayV1): void => {
  const replayVersion: number = replay.replayVersion;
  if (replayVersion !== 1) {
    throw new RangeError('Unsupported clock replay version.');
  }

  assertNonNegativeSafeInteger(replay.seed, 'seed');
  assertNonNegativeSafeInteger(replay.stopAfterTick, 'stopAfterTick');
  if (!Number.isSafeInteger(replay.targetNightCount) || replay.targetNightCount < 1) {
    throw new RangeError('targetNightCount must be a positive safe integer.');
  }

  const ids = new Set<string>();
  const sequences = new Set<number>();

  for (const envelope of replay.commands) {
    if (typeof envelope.id !== 'string' || envelope.id.trim().length === 0) {
      throw new RangeError('Command ids must be non-empty strings.');
    }
    if (ids.has(envelope.id)) throw new RangeError('Command ids must be unique.');
    ids.add(envelope.id);

    assertNonNegativeSafeInteger(envelope.atTick, 'command.atTick');
    assertNonNegativeSafeInteger(envelope.sequence, 'command.sequence');
    if (sequences.has(envelope.sequence)) {
      throw new RangeError('Command sequences must be unique.');
    }
    sequences.add(envelope.sequence);

    const commandType: string = envelope.command.type;
    if (
      commandType !== 'time-mode.set' ||
      !TIME_MODES.includes(envelope.command.mode)
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
  const events: SimulationEvent[] = [...state.events];
  const receipts: ReplayCommandReceipt[] = [];

  while (state.tick < replay.stopAfterTick && !state.isSliceComplete) {
    while (commands[commandIndex]?.atTick === state.tick) {
      const envelope = commands[commandIndex];
      if (envelope === undefined) break;
      const result = executeSimulationCommand(state, envelope.command);
      state = result.state;
      receipts.push({
        ...result.receipt,
        atTick: envelope.atTick,
        id: envelope.id,
        sequence: envelope.sequence,
      });
      commandIndex += 1;
    }

    const previousEventId = state.events.at(-1)?.id ?? -1;
    const advanced = advanceSimulationStep(state);
    if (advanced === state) break;

    events.push(...advanced.events.filter((event) => event.id > previousEventId));
    state = advanced;
  }

  return {
    events,
    receipts,
    state,
    stateHash: hashSimulationState(state),
    unconsumedCommandIds: commands.slice(commandIndex).map((command) => command.id),
  };
};
