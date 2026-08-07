import { describe, expect, it } from 'vitest';
import {
  advanceSimulationByClockUnits,
  advanceSimulationStep,
  advanceSimulationSteps,
  currentDayNumber,
  withTimeMode,
} from './advanceSimulation';
import {
  CLOCK_UNITS_PER_MINUTE,
  phaseForClockUnit,
  phaseForMinuteOfDay,
  wholeMinuteForClockUnit,
} from './clock';
import { createInitialState } from './createInitialState';
import type { SimulationState, TimeMode } from './types';

const stateAtMinute = (
  absoluteMinute: number,
  timeMode: TimeMode = 'normal',
): SimulationState => ({
  ...createInitialState(),
  absoluteClockUnit: absoluteMinute * CLOCK_UNITS_PER_MINUTE,
  events: [],
  phase: phaseForMinuteOfDay(absoluteMinute),
  timeMode,
});

describe('station simulation clock', () => {
  it('does not advance or create ticks while daytime is paused', () => {
    const initial = createInitialState();
    expect(advanceSimulationStep(initial)).toBe(initial);
    expect(advanceSimulationSteps(initial, 100)).toBe(initial);
  });

  it.each([
    ['normal', 10, 3],
    ['slow', 40, 3],
    ['fast', 10, 12],
  ] as const)(
    'advances %s mode with exact integer clock units',
    (mode, steps, minutes) => {
      const initial = withTimeMode(createInitialState(), mode);
      const next = advanceSimulationSteps(initial, steps);

      expect(wholeMinuteForClockUnit(next.absoluteClockUnit)).toBe(8 * 60 + minutes);
      expect(next.tick).toBe(steps);
    },
  );

  it.each([
    [5 * 60 + 59, 'night', 'morning'],
    [6 * 60 + 29, 'morning', 'day'],
    [17 * 60 + 59, 'day', 'dusk'],
    [18 * 60 + 59, 'dusk', 'night'],
    [23 * 60 + 59, 'night', 'night'],
  ] as const)(
    'crosses the exact phase boundary after minute %s',
    (minute, expectedBefore, expectedAfter) => {
      const initial = stateAtMinute(minute);
      const next = advanceSimulationByClockUnits(initial, CLOCK_UNITS_PER_MINUTE);

      expect(initial.phase).toBe(expectedBefore);
      expect(next.phase).toBe(expectedAfter);
      if (expectedAfter !== expectedBefore) {
        expect(next.events.at(-1)?.code).toBe(`phase-entered-${expectedAfter}`);
      }
    },
  );

  it('recomputes night speed at the boundary instead of using the old phase rate', () => {
    const dusk = stateAtMinute(18 * 60 + 59, 'fast');
    const crossed = advanceSimulationSteps(dusk, 1);
    const next = advanceSimulationSteps(crossed, 10);

    expect(crossed.phase).toBe('night');
    expect(crossed.absoluteClockUnit - dusk.absoluteClockUnit).toBe(42);
    expect(next.absoluteClockUnit - crossed.absoluteClockUnit).toBe(120);
  });

  it('carries exact integer time debt when a step crosses night off-boundary', () => {
    const boundary = 19 * 60 * CLOCK_UNITS_PER_MINUTE;
    const dusk = {
      ...stateAtMinute(18 * 60 + 59, 'fast'),
      absoluteClockUnit: boundary - 1,
    };
    const next = advanceSimulationStep(dusk);

    expect(next.phase).toBe('night');
    expect(next.absoluteClockUnit).toBe(boundary + 11);
    expect(next.clockStepRemainderTimeUnits).toBe(18_750);
  });

  it('uses daytime fast speed for the remainder of a step after sunrise', () => {
    const boundary = 6 * 60 * CLOCK_UNITS_PER_MINUTE;
    const night = {
      ...stateAtMinute(5 * 60 + 59, 'fast'),
      absoluteClockUnit: boundary - 1,
    };
    const next = advanceSimulationStep(night);

    expect(next.phase).toBe('morning');
    expect(next.absoluteClockUnit).toBe(boundary + 44);
    expect(next.clockStepRemainderTimeUnits).toBe(0);
  });

  it('prevents a full pause at night', () => {
    const night = stateAtMinute(19 * 60);
    const next = withTimeMode(night, 'paused');

    expect(next.phase).toBe('night');
    expect(next.timeMode).toBe('slow');
  });

  it('applies explainable hourly day resource flow once', () => {
    const initial = stateAtMinute(8 * 60);
    const next = advanceSimulationByClockUnits(initial, 60 * CLOCK_UNITS_PER_MINUTE);

    expect(next.resources).toMatchObject({ cash: 432, food: 47, fuel: 158 });
  });

  it('stops exactly at the third sunrise even with excess requested time', () => {
    const initial = createInitialState();
    const thirdSunriseMinute = 3 * 24 * 60 + 6 * 60;
    const requestedUnits =
      (thirdSunriseMinute - 8 * 60 + 24 * 60) * CLOCK_UNITS_PER_MINUTE;
    const next = advanceSimulationByClockUnits(initial, requestedUnits);

    expect(next.completedNights).toBe(3);
    expect(next.isSliceComplete).toBe(true);
    expect(wholeMinuteForClockUnit(next.absoluteClockUnit)).toBe(thirdSunriseMinute);
    expect(next.events.at(-2)?.code).toBe('phase-entered-morning');
    expect(next.events.at(-1)?.code).toBe('slice-completed');
    expect(advanceSimulationStep(next)).toBe(next);
  });

  it('reports the current day from absolute simulation time', () => {
    const nextDay = advanceSimulationByClockUnits(
      createInitialState(),
      24 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    expect(currentDayNumber(nextDay)).toBe(2);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5])(
    'rejects invalid clock-unit input %s without mutation',
    (clockUnits) => {
      const initial = createInitialState();
      expect(() => advanceSimulationByClockUnits(initial, clockUnits)).toThrow(
        RangeError,
      );
      expect(initial).toEqual(createInitialState());
    },
  );

  it('validates initial scenario boundaries', () => {
    expect(() => createInitialState(-1)).toThrow(RangeError);
    expect(() => createInitialState(1987, 0)).toThrow(RangeError);
  });

  it('rejects an invalid persisted clock-step remainder', () => {
    const invalid = {
      ...withTimeMode(createInitialState(), 'normal'),
      clockStepRemainderTimeUnits: -1,
    };
    expect(() => advanceSimulationStep(invalid)).toThrow(RangeError);
  });

  it.each(['slow', 'normal', 'fast'] as const)(
    'preserves clock and resource invariants during long %s runs',
    (mode) => {
      let state = withTimeMode(createInitialState(), mode);
      let previousCompletedNights = state.completedNights;

      for (let step = 0; step < 3_000; step += 1) {
        state = advanceSimulationStep(state);
        expect(state.phase).toBe(phaseForClockUnit(state.absoluteClockUnit));
        expect(Number.isSafeInteger(state.absoluteClockUnit)).toBe(true);
        expect(Number.isSafeInteger(state.tick)).toBe(true);
        expect(state.completedNights).toBeGreaterThanOrEqual(previousCompletedNights);
        for (const resource of Object.values(state.resources)) {
          expect(resource).toBeGreaterThanOrEqual(0);
        }
        previousCompletedNights = state.completedNights;

        if (state.isSliceComplete) break;
      }
    },
  );
});
