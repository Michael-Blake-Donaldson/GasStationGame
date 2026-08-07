import type { CampaignStateV1 } from '../campaign/campaignState';
import type { SaveLoadResult } from '../persistence/saveCodec';
import type { CommandReceipt } from '../simulation/commands';
import {
  createFixedStepRunner,
  type FixedStepRunnerState,
} from '../simulation/fixedStepRunner';
import type { SimulationState } from '../simulation/types';

export interface RecoveredRuntimeState {
  readonly campaign: CampaignStateV1;
  readonly lastCommandReceipt: CommandReceipt | null;
  readonly nextAutosaveEventSequence: number;
  readonly nextCommandSequence: number;
  readonly runner: FixedStepRunnerState;
  readonly simulation: SimulationState;
}

export const adoptLoadedRuntime = (
  loaded: Extract<SaveLoadResult, { readonly ok: true }>,
): RecoveredRuntimeState => ({
  campaign: loaded.campaign,
  lastCommandReceipt: null,
  nextAutosaveEventSequence: loaded.simulation.nextEventSequence,
  nextCommandSequence: loaded.nextCommandSequence,
  runner: createFixedStepRunner(),
  simulation: loaded.simulation,
});
