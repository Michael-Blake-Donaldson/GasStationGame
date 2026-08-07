import { withTimeMode } from './advanceSimulation';
import type { SimulationState, TimeMode } from './types';

export interface SetTimeModeCommand {
  readonly mode: TimeMode;
  readonly type: 'time-mode.set';
}

export type SimulationCommand = SetTimeModeCommand;

export type CommandReceiptCode =
  'night-cannot-pause' | 'time-mode-unchanged' | 'time-mode-updated';

export interface CommandReceipt {
  readonly accepted: true;
  readonly changed: boolean;
  readonly code: CommandReceiptCode;
}

export interface ExecuteCommandResult {
  readonly receipt: CommandReceipt;
  readonly state: SimulationState;
}

export const executeSimulationCommand = (
  state: SimulationState,
  command: SimulationCommand,
): ExecuteCommandResult => {
  const next = withTimeMode(state, command.mode);

  if (state.phase === 'night' && command.mode === 'paused') {
    return {
      receipt: {
        accepted: true,
        changed: next.timeMode !== state.timeMode,
        code: 'night-cannot-pause',
      },
      state: next.timeMode === state.timeMode ? state : next,
    };
  }

  if (next.timeMode === state.timeMode) {
    return {
      receipt: { accepted: true, changed: false, code: 'time-mode-unchanged' },
      state,
    };
  }

  return {
    receipt: {
      accepted: true,
      changed: true,
      code: 'time-mode-updated',
    },
    state: next,
  };
};
