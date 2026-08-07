import { effectiveTimeMode } from './clock';
import { appendDomainEvent } from './events';
import type { SimulationState, TimeMode } from './types';

export interface SetTimeModeCommand {
  readonly mode: TimeMode;
  readonly type: 'time-mode.set';
}

export type SimulationCommand = SetTimeModeCommand;

export interface CommandEnvelope {
  readonly atTick: number;
  readonly command: SimulationCommand;
  readonly id: string;
  readonly sequence: number;
}

export type CommandReceiptReason =
  | 'command-scheduled-in-future'
  | 'command-scheduled-in-past'
  | 'invalid-command-envelope'
  | 'invalid-command-payload'
  | 'night-fast-capped'
  | 'night-pause-converted'
  | 'simulation-complete'
  | 'time-mode-unchanged'
  | 'time-mode-updated'
  | 'unsupported-command-type';

export interface CommandReceipt {
  readonly atTick: number;
  readonly changed: boolean;
  readonly commandId: string;
  readonly commandSequence: number;
  readonly emittedEventSequences: readonly number[];
  readonly reason: CommandReceiptReason;
  readonly status: 'accepted' | 'rejected';
}

export interface DispatchCommandResult {
  readonly receipt: CommandReceipt;
  readonly state: SimulationState;
}

const TIME_MODES: readonly TimeMode[] = ['paused', 'slow', 'normal', 'fast'];

interface RuntimeCommandEnvelope {
  readonly atTick: number;
  readonly command: unknown;
  readonly id: string;
  readonly sequence: number;
}

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

const isValidEnvelopeMetadata = (
  envelope: unknown,
): envelope is RuntimeCommandEnvelope =>
  isRecord(envelope) &&
  typeof envelope.id === 'string' &&
  envelope.id.trim().length > 0 &&
  typeof envelope.atTick === 'number' &&
  Number.isSafeInteger(envelope.atTick) &&
  envelope.atTick >= 0 &&
  typeof envelope.sequence === 'number' &&
  Number.isSafeInteger(envelope.sequence) &&
  envelope.sequence >= 0;

const isTimeMode = (value: unknown): value is TimeMode =>
  TIME_MODES.includes(value as TimeMode);

const receiptFor = (
  envelope: RuntimeCommandEnvelope,
  fields: Pick<
    CommandReceipt,
    'changed' | 'emittedEventSequences' | 'reason' | 'status'
  >,
): CommandReceipt => ({
  ...fields,
  atTick: envelope.atTick,
  commandId: envelope.id,
  commandSequence: envelope.sequence,
});

const invalidEnvelopeReceipt = (state: SimulationState): CommandReceipt => ({
  atTick: state.tick,
  changed: false,
  commandId: '<invalid-command>',
  commandSequence: 0,
  emittedEventSequences: [],
  reason: 'invalid-command-envelope',
  status: 'rejected',
});

const dispatchTimeMode = (
  state: SimulationState,
  envelope: RuntimeCommandEnvelope,
  command: SetTimeModeCommand,
): DispatchCommandResult => {
  const previousMode = state.timeMode;
  const currentMode =
    state.phase === 'night' && command.mode === 'paused' ? 'slow' : command.mode;
  const reason: CommandReceiptReason =
    state.phase === 'night' && command.mode === 'paused'
      ? 'night-pause-converted'
      : state.phase === 'night' && command.mode === 'fast'
        ? 'night-fast-capped'
        : currentMode === previousMode
          ? 'time-mode-unchanged'
          : 'time-mode-updated';

  if (currentMode === previousMode) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason,
        status: 'accepted',
      }),
      state,
    };
  }

  const eventSequence = state.nextEventSequence;
  const next = appendDomainEvent(
    { ...state, timeMode: currentMode },
    {
      currentMode,
      effectiveCurrentMode: effectiveTimeMode(currentMode, state.phase),
      effectivePreviousMode: effectiveTimeMode(previousMode, state.phase),
      previousMode,
      reason:
        reason === 'night-pause-converted' || reason === 'night-fast-capped'
          ? reason
          : 'player-request',
      requestedMode: command.mode,
      type: 'time-mode.changed',
    },
  );

  return {
    receipt: receiptFor(envelope, {
      changed: true,
      emittedEventSequences: [eventSequence],
      reason,
      status: 'accepted',
    }),
    state: next,
  };
};

export const dispatchSimulationCommand = (
  state: SimulationState,
  envelope: unknown,
): DispatchCommandResult => {
  if (!isValidEnvelopeMetadata(envelope)) {
    return {
      receipt: invalidEnvelopeReceipt(state),
      state,
    };
  }

  if (envelope.atTick < state.tick) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: 'command-scheduled-in-past',
        status: 'rejected',
      }),
      state,
    };
  }
  if (envelope.atTick > state.tick) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: 'command-scheduled-in-future',
        status: 'rejected',
      }),
      state,
    };
  }
  if (state.isSliceComplete) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: 'simulation-complete',
        status: 'rejected',
      }),
      state,
    };
  }

  const runtimeCommand = envelope.command;
  if (
    typeof runtimeCommand !== 'object' ||
    runtimeCommand === null ||
    !('type' in runtimeCommand) ||
    typeof runtimeCommand.type !== 'string'
  ) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: 'invalid-command-payload',
        status: 'rejected',
      }),
      state,
    };
  }

  const commandType = runtimeCommand.type;
  switch (commandType) {
    case 'time-mode.set': {
      const mode = 'mode' in runtimeCommand ? runtimeCommand.mode : undefined;
      if (!isTimeMode(mode)) {
        return {
          receipt: receiptFor(envelope, {
            changed: false,
            emittedEventSequences: [],
            reason: 'invalid-command-payload',
            status: 'rejected',
          }),
          state,
        };
      }
      return dispatchTimeMode(state, envelope, { mode, type: 'time-mode.set' });
    }
    default:
      return {
        receipt: receiptFor(envelope, {
          changed: false,
          emittedEventSequences: [],
          reason: 'unsupported-command-type',
          status: 'rejected',
        }),
        state,
      };
  }
};
