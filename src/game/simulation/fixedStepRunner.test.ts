import { describe, expect, it } from 'vitest';
import type { SimulationState, TimeMode } from './types';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import {
  createInitialState,
  greatPlainsSimulationContext,
} from '../scenarios/greatPlains';
import {
  createFixedStepRunner,
  DEFAULT_MAX_STEPS_PER_PUMP,
  pumpSimulation as pumpWithContext,
  type FixedStepRunnerState,
} from './fixedStepRunner';

const pumpSimulation = (
  simulation: SimulationState,
  runner: FixedStepRunnerState,
  elapsedMicroseconds: number,
  maxSteps = DEFAULT_MAX_STEPS_PER_PUMP,
) =>
  pumpWithContext(
    simulation,
    runner,
    elapsedMicroseconds,
    greatPlainsSimulationContext,
    maxSteps,
  );

const stateWithTimeMode = (
  state: SimulationState,
  timeMode: TimeMode,
): SimulationState => ({ ...state, timeMode });

const pumpChunks = (
  simulation: SimulationState,
  chunks: readonly number[],
): { runner: FixedStepRunnerState; simulation: SimulationState } => {
  let runner = createFixedStepRunner();
  let next = simulation;

  for (const chunk of chunks) {
    const result = pumpSimulation(next, runner, chunk, 1_000);
    runner = result.runner;
    next = result.simulation;
  }

  return { runner, simulation: next };
};

describe('fixed-step runner', () => {
  it('produces identical state for irregular timer callback partitions', () => {
    const initial = stateWithTimeMode(createInitialState(), 'normal');
    const single = pumpChunks(initial, [10_000_000]);
    const chunked = pumpChunks(initial, [1_234_567, 2_345_678, 3_456_789, 2_962_966]);

    expect(chunked).toEqual(single);
    expect(single.simulation.tick).toBe(100);
  });

  it('preserves cadence independence across deterministic partition families', () => {
    const initial = stateWithTimeMode(createInitialState(), 'normal');
    const expected = pumpChunks(initial, [5_000_000]);

    for (let partition = 1; partition <= 20; partition += 1) {
      const chunkSize = partition * 7_919;
      const chunks: number[] = [];
      let remaining = 5_000_000;

      while (remaining > chunkSize) {
        chunks.push(chunkSize);
        remaining -= chunkSize;
      }
      chunks.push(remaining);

      expect(pumpChunks(initial, chunks)).toEqual(expected);
    }
  });

  it('retains capped catch-up debt until later pumps drain it', () => {
    const initial = stateWithTimeMode(createInitialState(), 'normal');
    const uncapped = pumpSimulation(
      initial,
      createFixedStepRunner(),
      20_000_000,
      1_000,
    );
    let capped = pumpSimulation(initial, createFixedStepRunner(), 20_000_000, 10);

    while (capped.runner.accumulatedMicroseconds > 0) {
      capped = pumpSimulation(capped.simulation, capped.runner, 0, 10);
    }

    expect(capped.simulation).toEqual(uncapped.simulation);
    expect(capped.processedSteps).toBe(10);
  });

  it('does not let paused callback time leak into an unpaused step', () => {
    const initial = createInitialState();
    const paused = pumpSimulation(initial, createFixedStepRunner(), 1_050_000);
    const unpaused = pumpSimulation(
      stateWithTimeMode(paused.simulation, 'normal'),
      paused.runner,
      50_000,
    );

    expect(paused.simulation).toBe(initial);
    expect(paused.runner.accumulatedMicroseconds).toBe(0);
    expect(unpaused.processedSteps).toBe(0);
    expect(unpaused.runner.accumulatedMicroseconds).toBe(50_000);
  });

  it('preserves only debt earned before the simulation was paused', () => {
    const result = pumpSimulation(
      createInitialState(),
      { accumulatedMicroseconds: 50_000 },
      1_000_000,
    );

    expect(result.runner.accumulatedMicroseconds).toBe(50_000);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5])(
    'rejects invalid elapsed input %s',
    (elapsedMicroseconds) => {
      expect(() =>
        pumpSimulation(
          createInitialState(),
          createFixedStepRunner(),
          elapsedMicroseconds,
        ),
      ).toThrow(RangeError);
    },
  );

  it('rejects invalid persisted runner state', () => {
    expect(() =>
      pumpSimulation(createInitialState(), { accumulatedMicroseconds: -1 }, 1),
    ).toThrow(RangeError);
  });

  it('rejects accumulator overflow before advancing simulation', () => {
    expect(() =>
      pumpSimulation(
        stateWithTimeMode(createInitialState(), 'normal'),
        { accumulatedMicroseconds: Number.MAX_SAFE_INTEGER },
        1,
      ),
    ).toThrow('safe integer range');
  });

  it('drops remaining wall debt when the slice completes inside a pump', () => {
    const initial = {
      ...createInitialState(1987, 1),
      absoluteClockUnit: 6 * 60 * CLOCK_UNITS_PER_MINUTE - 1,
      phase: 'night' as const,
      timeMode: 'slow' as const,
    };
    const result = pumpSimulation(initial, createFixedStepRunner(), 1_000_000);

    expect(result.simulation.isSliceComplete).toBe(true);
    const event = result.simulation.eventLedger.at(-1);
    expect(event?.type).toBe('slice.completed');
    if (event?.type === 'slice.completed') {
      expect(event.targetNightCount).toBe(1);
    }
    expect(result.runner.accumulatedMicroseconds).toBe(0);
    expect(result.processedSteps).toBe(1);
  });
});
