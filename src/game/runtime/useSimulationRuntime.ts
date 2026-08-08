import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createInitialCampaignState,
  type CampaignStateV1,
} from '../campaign/campaignState';
import { planPhaseAutosave } from '../persistence/autosavePolicy';
import {
  createRecoveryService,
  writeRecoveryWithRetry,
} from '../persistence/recoveryRotation';
import { tauriRecoveryStorage } from '../persistence/tauriRecoveryStorage';
import type { CommandReceipt, SimulationCommand } from '../simulation/commands';
import type { ConstructionPlacementRequest } from '../simulation/construction';
import {
  createInitialState,
  dispatchSimulationCommand,
  greatPlainsSaveContext,
  greatPlainsSimulationContext,
} from '../scenarios/greatPlains';
import {
  createFixedStepRunner,
  DEFAULT_MAX_STEPS_PER_PUMP,
  pumpSimulation,
  type FixedStepRunnerState,
} from '../simulation/fixedStepRunner';
import type { SimulationState, TimeMode } from '../simulation/types';
import { adoptLoadedRuntime } from './recoveredRuntime';

const recoveryService = isTauri()
  ? createRecoveryService(tauriRecoveryStorage, greatPlainsSaveContext)
  : null;

interface SimulationRuntimeOptions {
  readonly seed: number;
  readonly targetNightCount: number;
}

interface RuntimeState {
  readonly campaign: CampaignStateV1;
  readonly lastCommandReceipt: CommandReceipt | null;
  readonly nextCommandSequence: number;
  readonly runner: FixedStepRunnerState;
  readonly simulation: SimulationState;
}

interface SimulationRuntime {
  readonly assignJob: (employeeId: string, jobId: string) => void;
  readonly cancelJob: (employeeId: string) => void;
  readonly chooseTimeMode: (mode: TimeMode) => void;
  readonly isRecoveryReady: boolean;
  readonly lastCommandReceipt: CommandReceipt | null;
  readonly orderInventory: (product: 'food' | 'fuel', quantity: number) => void;
  readonly placeConstruction: (request: ConstructionPlacementRequest) => void;
  readonly setRetailPrice: (product: 'food' | 'fuel', unitPrice: number) => void;
  readonly simulation: SimulationState;
}

export const useSimulationRuntime = ({
  seed,
  targetNightCount,
}: SimulationRuntimeOptions): SimulationRuntime => {
  const [runtime, setRuntime] = useState<RuntimeState>(() => ({
    campaign: createInitialCampaignState('great-plains'),
    lastCommandReceipt: null,
    nextCommandSequence: 0,
    runner: createFixedStepRunner(),
    simulation: createInitialState(seed, targetNightCount),
  }));
  const [isRecoveryReady, setRecoveryReady] = useState(recoveryService === null);
  const autosaveEventCursor = useRef(runtime.simulation.nextEventSequence);
  const autosaveInFlight = useRef(false);

  useEffect(() => {
    if (recoveryService === null) return;
    let cancelled = false;
    void recoveryService.loadNewest().then((loaded) => {
      if (cancelled) return;
      if (loaded.ok) {
        const adopted = adoptLoadedRuntime(loaded);
        autosaveEventCursor.current = adopted.nextAutosaveEventSequence;
        setRuntime(adopted);
      }
      setRecoveryReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isRecoveryReady) return;
    let previousTimestamp = performance.now();

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        previousTimestamp = performance.now();
        setRuntime((current) => ({
          ...current,
          runner: createFixedStepRunner(),
        }));
        return;
      }

      const timestamp = performance.now();
      const elapsedMicroseconds = Math.max(
        0,
        Math.round((timestamp - previousTimestamp) * 1000),
      );
      previousTimestamp = timestamp;

      setRuntime((current) => {
        const result = pumpSimulation(
          current.simulation,
          current.runner,
          elapsedMicroseconds,
          greatPlainsSimulationContext,
          DEFAULT_MAX_STEPS_PER_PUMP,
        );
        return {
          ...current,
          lastCommandReceipt:
            result.processedSteps > 0 ? null : current.lastCommandReceipt,
          runner: result.runner,
          simulation: result.simulation,
        };
      });
    }, 50);

    const resetAfterVisibilityChange = () => {
      previousTimestamp = performance.now();
      setRuntime((current) => ({
        ...current,
        runner: createFixedStepRunner(),
      }));
    };
    document.addEventListener('visibilitychange', resetAfterVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resetAfterVisibilityChange);
    };
  }, [isRecoveryReady]);

  useEffect(() => {
    if (recoveryService === null || !isRecoveryReady || autosaveInFlight.current)
      return;
    const plan = planPhaseAutosave(runtime.simulation, autosaveEventCursor.current);
    if (plan.trigger === null) {
      autosaveEventCursor.current = plan.nextEventSequenceToInspect;
      return;
    }

    autosaveInFlight.current = true;
    void writeRecoveryWithRetry(recoveryService, {
      campaign: runtime.campaign,
      nextCommandSequence: runtime.nextCommandSequence,
      simulation: runtime.simulation,
    })
      .then((result) => {
        if (!result.ok) return;
        autosaveEventCursor.current = Math.max(
          autosaveEventCursor.current,
          plan.nextEventSequenceToInspect,
        );
        setRuntime((current) => ({
          ...current,
        }));
      })
      .finally(() => {
        autosaveInFlight.current = false;
      });
  }, [isRecoveryReady, runtime]);

  const issueCommand = useCallback(
    (command: SimulationCommand) => {
      if (!isRecoveryReady) return;
      setRuntime((current) => {
        const sequence = current.nextCommandSequence;
        const result = dispatchSimulationCommand(current.simulation, {
          atTick: current.simulation.tick,
          command,
          id: `ui-command-${String(sequence)}`,
          sequence,
        });
        return {
          ...current,
          lastCommandReceipt: result.receipt,
          nextCommandSequence: sequence + 1,
          simulation: result.state,
        };
      });
    },
    [isRecoveryReady],
  );

  const assignJob = useCallback(
    (employeeId: string, jobId: string) => {
      issueCommand({ employeeId, jobId, type: 'job.assign' });
    },
    [issueCommand],
  );
  const cancelJob = useCallback(
    (employeeId: string) => {
      issueCommand({ employeeId, type: 'job.cancel' });
    },
    [issueCommand],
  );
  const chooseTimeMode = useCallback(
    (mode: TimeMode) => {
      issueCommand({ mode, type: 'time-mode.set' });
    },
    [issueCommand],
  );
  const orderInventory = useCallback(
    (product: 'food' | 'fuel', quantity: number) => {
      issueCommand({ product, quantity, type: 'inventory.order' });
    },
    [issueCommand],
  );
  const setRetailPrice = useCallback(
    (product: 'food' | 'fuel', unitPrice: number) => {
      issueCommand({ product, type: 'retail.price.set', unitPrice });
    },
    [issueCommand],
  );
  const placeConstruction = useCallback(
    (request: ConstructionPlacementRequest) => {
      issueCommand({ ...request, type: 'construction.place' });
    },
    [issueCommand],
  );

  return {
    assignJob,
    cancelJob,
    chooseTimeMode,
    isRecoveryReady,
    lastCommandReceipt: runtime.lastCommandReceipt,
    orderInventory,
    placeConstruction,
    setRetailPrice,
    simulation: runtime.simulation,
  };
};
