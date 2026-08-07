import { advanceSimulationStep } from './advanceSimulation';
import { FIXED_STEP_MICROSECONDS, clockUnitsForFixedStep } from './clock';
import type { SimulationState } from './types';

export const DEFAULT_MAX_STEPS_PER_PUMP = 100;

export interface FixedStepRunnerState {
  readonly accumulatedMicroseconds: number;
}

export interface PumpSimulationResult {
  readonly processedSteps: number;
  readonly runner: FixedStepRunnerState;
  readonly simulation: SimulationState;
}

export const createFixedStepRunner = (): FixedStepRunnerState => ({
  accumulatedMicroseconds: 0,
});

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

export const pumpSimulation = (
  simulation: SimulationState,
  runner: FixedStepRunnerState,
  elapsedMicroseconds: number,
  maxSteps = DEFAULT_MAX_STEPS_PER_PUMP,
): PumpSimulationResult => {
  assertNonNegativeSafeInteger(elapsedMicroseconds, 'elapsedMicroseconds');
  assertNonNegativeSafeInteger(maxSteps, 'maxSteps');
  assertNonNegativeSafeInteger(
    runner.accumulatedMicroseconds,
    'runner.accumulatedMicroseconds',
  );

  if (simulation.isSliceComplete) {
    return {
      processedSteps: 0,
      runner: createFixedStepRunner(),
      simulation,
    };
  }

  if (clockUnitsForFixedStep(simulation.timeMode, simulation.phase) === 0) {
    return { processedSteps: 0, runner, simulation };
  }

  const accumulatedMicroseconds = runner.accumulatedMicroseconds + elapsedMicroseconds;
  if (!Number.isSafeInteger(accumulatedMicroseconds)) {
    throw new RangeError('accumulatedMicroseconds exceeded the safe integer range.');
  }

  let next = simulation;
  let remainingMicroseconds = accumulatedMicroseconds;
  let processedSteps = 0;

  while (
    remainingMicroseconds >= FIXED_STEP_MICROSECONDS &&
    processedSteps < maxSteps
  ) {
    remainingMicroseconds -= FIXED_STEP_MICROSECONDS;
    next = advanceSimulationStep(next);
    processedSteps += 1;

    if (next.isSliceComplete) {
      remainingMicroseconds = 0;
      break;
    }
  }

  return {
    processedSteps,
    runner: { accumulatedMicroseconds: remainingMicroseconds },
    simulation: next,
  };
};
