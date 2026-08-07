import { useCallback, useEffect, useState } from 'react';
import { dispatchSimulationCommand, type CommandReceipt } from '../simulation/commands';
import { createInitialState } from '../scenarios/greatPlains';
import {
  createFixedStepRunner,
  pumpSimulation,
  type FixedStepRunnerState,
} from '../simulation/fixedStepRunner';
import type { SimulationState, TimeMode } from '../simulation/types';

interface SimulationRuntimeOptions {
  readonly seed: number;
  readonly targetNightCount: number;
}

interface RuntimeState {
  readonly lastCommandReceipt: CommandReceipt | null;
  readonly nextCommandSequence: number;
  readonly runner: FixedStepRunnerState;
  readonly simulation: SimulationState;
}

interface SimulationRuntime {
  readonly chooseTimeMode: (mode: TimeMode) => void;
  readonly lastCommandReceipt: CommandReceipt | null;
  readonly simulation: SimulationState;
}

export const useSimulationRuntime = ({
  seed,
  targetNightCount,
}: SimulationRuntimeOptions): SimulationRuntime => {
  const [runtime, setRuntime] = useState<RuntimeState>(() => ({
    lastCommandReceipt: null,
    nextCommandSequence: 0,
    runner: createFixedStepRunner(),
    simulation: createInitialState(seed, targetNightCount),
  }));

  useEffect(() => {
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
  }, []);

  const chooseTimeMode = useCallback((mode: TimeMode) => {
    setRuntime((current) => {
      const sequence = current.nextCommandSequence;
      const result = dispatchSimulationCommand(current.simulation, {
        atTick: current.simulation.tick,
        command: { type: 'time-mode.set', mode },
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
  }, []);

  return {
    chooseTimeMode,
    lastCommandReceipt: runtime.lastCommandReceipt,
    simulation: runtime.simulation,
  };
};
