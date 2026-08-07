import { describe, expect, it } from 'vitest';
import {
  advanceSimulationByClockUnits,
  advanceSimulationStep,
  advanceSimulationSteps,
  currentDayNumber,
} from './advanceSimulation';
import {
  CLOCK_UNITS_PER_MINUTE,
  phaseForClockUnit,
  phaseForMinuteOfDay,
  wholeMinuteForClockUnit,
} from './clock';
import { createInitialState } from './createInitialState';
import { appendDomainEvent } from './events';
import type { SimulationState, TimeMode } from './types';

const stateAtMinute = (
  absoluteMinute: number,
  timeMode: TimeMode = 'normal',
): SimulationState => ({
  ...createInitialState(),
  absoluteClockUnit: absoluteMinute * CLOCK_UNITS_PER_MINUTE,
  eventLedger: [],
  nextEventSequence: 0,
  phase: phaseForMinuteOfDay(absoluteMinute),
  timeMode,
});

const stateWithTimeMode = (
  state: SimulationState,
  timeMode: TimeMode,
): SimulationState => ({ ...state, timeMode });

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
      const initial = stateWithTimeMode(createInitialState(), mode);
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
        const event = next.eventLedger.find(
          (candidate) => candidate.type === 'phase.entered',
        );
        expect(event?.type).toBe('phase.entered');
        if (event?.type === 'phase.entered') {
          expect(event.currentPhase).toBe(expectedAfter);
        }
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

  it('applies explainable hourly day resource flow once', () => {
    const initial = stateAtMinute(8 * 60);
    const next = advanceSimulationByClockUnits(initial, 60 * CLOCK_UNITS_PER_MINUTE);

    expect(next.resources).toMatchObject({ cash: 432, food: 47, fuel: 158 });
    expect(next.eventLedger.at(-1)).toMatchObject({
      changes: [
        {
          after: 432,
          appliedDelta: 12,
          before: 420,
          requestedDelta: 12,
          resource: 'cash',
        },
        {
          after: 47,
          appliedDelta: -1,
          before: 48,
          requestedDelta: -1,
          resource: 'food',
        },
        {
          after: 158,
          appliedDelta: -2,
          before: 160,
          requestedDelta: -2,
          resource: 'fuel',
        },
      ],
      reason: 'day-hourly-flow',
      type: 'resources.changed',
    });
  });

  it('orders phase entry before resource causality at a shared boundary', () => {
    const initial = stateAtMinute(18 * 60 + 59);
    const next = advanceSimulationByClockUnits(initial, CLOCK_UNITS_PER_MINUTE);

    expect(next.eventLedger).toEqual([
      expect.objectContaining({
        currentPhase: 'night',
        minute: 19 * 60,
        sequence: 0,
        type: 'phase.entered',
      }),
      expect.objectContaining({
        changes: [
          {
            after: 35,
            appliedDelta: -1,
            before: 36,
            requestedDelta: -1,
            resource: 'ammunition',
          },
          {
            after: 96,
            appliedDelta: -4,
            before: 100,
            requestedDelta: -4,
            resource: 'power',
          },
        ],
        minute: 19 * 60,
        sequence: 1,
        type: 'resources.changed',
      }),
    ]);
  });

  it('records applied resource deltas when depletion clamps at zero', () => {
    const initial = {
      ...stateAtMinute(19 * 60 + 59),
      resources: {
        ...createInitialState().resources,
        ammunition: 0,
        power: 2,
      },
    };
    const next = advanceSimulationByClockUnits(initial, CLOCK_UNITS_PER_MINUTE);

    expect(next.resources).toMatchObject({ ammunition: 0, power: 0 });
    expect(next.eventLedger.at(-1)).toMatchObject({
      changes: [
        {
          after: 0,
          appliedDelta: -2,
          before: 2,
          requestedDelta: -4,
          resource: 'power',
        },
      ],
      reason: 'night-hourly-flow',
      type: 'resources.changed',
    });
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
    expect(next.eventLedger.at(-3)?.type).toBe('phase.entered');
    expect(next.eventLedger.at(-2)?.type).toBe('night.completed');
    expect(next.eventLedger.at(-1)?.type).toBe('slice.completed');
    expect(advanceSimulationStep(next)).toBe(next);
  });

  it('reports the current day from absolute simulation time', () => {
    const nextDay = advanceSimulationByClockUnits(
      createInitialState(),
      24 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    expect(currentDayNumber(nextDay)).toBe(2);
  });

  it('keeps ledger sequences unique and contiguous across a long run', () => {
    const next = advanceSimulationByClockUnits(
      createInitialState(),
      24 * 60 * CLOCK_UNITS_PER_MINUTE,
    );

    expect(next.eventLedger.map((event) => event.sequence)).toEqual(
      next.eventLedger.map((_, index) => index),
    );
    expect(next.nextEventSequence).toBe(next.eventLedger.length);
  });

  it('rejects an exhausted event sequence before mutating the ledger', () => {
    const initial = {
      ...createInitialState(),
      nextEventSequence: Number.MAX_SAFE_INTEGER,
    };

    expect(() =>
      appendDomainEvent(initial, {
        completedNights: 1,
        reason: 'sunrise-reached',
        type: 'night.completed',
      }),
    ).toThrow('safe integer');
    expect(initial.eventLedger).toHaveLength(1);
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
      ...stateWithTimeMode(createInitialState(), 'normal'),
      clockStepRemainderTimeUnits: -1,
    };
    expect(() => advanceSimulationStep(invalid)).toThrow(RangeError);
  });

  it.each(['slow', 'normal', 'fast'] as const)(
    'preserves clock and resource invariants during long %s runs',
    (mode) => {
      let state = stateWithTimeMode(createInitialState(), mode);
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
