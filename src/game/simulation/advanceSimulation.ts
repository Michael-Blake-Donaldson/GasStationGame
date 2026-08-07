import {
  CLOCK_UNITS_PER_MINUTE,
  FIXED_STEP_TIME_UNITS,
  MINUTES_PER_DAY,
  phaseForClockUnit,
  timeUnitsPerClockUnit,
  wholeMinuteForClockUnit,
} from './clock';
import type {
  Resources,
  SimulationEvent,
  SimulationPhase,
  SimulationState,
  TimeMode,
} from './types';

const MAX_VISIBLE_EVENTS = 8;

const phaseMessage = (
  phase: SimulationPhase,
): Omit<SimulationEvent, 'id' | 'minute'> => {
  switch (phase) {
    case 'morning':
      return {
        code: 'phase-entered-morning',
        message: 'Sunrise. The night report is ready.',
        tone: 'positive',
      };
    case 'day':
      return {
        code: 'phase-entered-day',
        message: 'Day operations resumed.',
        tone: 'neutral',
      };
    case 'dusk':
      return {
        code: 'phase-entered-dusk',
        message: 'Dusk readiness window opened.',
        tone: 'warning',
      };
    case 'night':
      return {
        code: 'phase-entered-night',
        message: 'Night attack conditions are active.',
        tone: 'warning',
      };
  }
};

const applyHourlyFlow = (
  resources: Readonly<Resources>,
  phase: SimulationPhase,
): Resources => {
  if (phase === 'day') {
    return {
      ...resources,
      cash: resources.cash + 12,
      food: Math.max(0, resources.food - 1),
      fuel: Math.max(0, resources.fuel - 2),
    };
  }

  if (phase === 'night') {
    return {
      ...resources,
      ammunition: Math.max(0, resources.ammunition - 1),
      power: Math.max(0, resources.power - 4),
    };
  }

  return { ...resources };
};

const appendEvent = (
  events: readonly SimulationEvent[],
  minute: number,
  event: Omit<SimulationEvent, 'id' | 'minute'>,
): readonly SimulationEvent[] => {
  const nextId = (events.at(-1)?.id ?? -1) + 1;
  return [...events, { ...event, id: nextId, minute }].slice(-MAX_VISIBLE_EVENTS);
};

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

export const withTimeMode = (
  state: SimulationState,
  requestedMode: TimeMode,
): SimulationState => ({
  ...state,
  timeMode:
    state.phase === 'night' && requestedMode === 'paused' ? 'slow' : requestedMode,
});

export const advanceSimulationByClockUnits = (
  state: SimulationState,
  clockUnits: number,
): SimulationState => {
  assertNonNegativeSafeInteger(clockUnits, 'clockUnits');
  if (clockUnits === 0 || state.isSliceComplete) return state;

  let next = state;

  for (let offset = 0; offset < clockUnits; offset += 1) {
    const absoluteClockUnit = next.absoluteClockUnit + 1;
    if (!Number.isSafeInteger(absoluteClockUnit)) {
      throw new RangeError('absoluteClockUnit exceeded the safe integer range.');
    }

    if (absoluteClockUnit % CLOCK_UNITS_PER_MINUTE !== 0) {
      next = { ...next, absoluteClockUnit };
      continue;
    }

    const absoluteMinute = wholeMinuteForClockUnit(absoluteClockUnit);
    const previousPhase = next.phase;
    const phase = phaseForClockUnit(absoluteClockUnit);
    const enteredMorning = previousPhase === 'night' && phase === 'morning';
    const completedNights = next.completedNights + (enteredMorning ? 1 : 0);
    const isSliceComplete = completedNights >= next.targetNightCount;
    let events = next.events;
    let resources = next.resources;

    if (phase !== previousPhase) {
      events = appendEvent(events, absoluteMinute, phaseMessage(phase));
    }

    if (absoluteMinute % 60 === 0) {
      resources = applyHourlyFlow(resources, phase);
    }

    if (isSliceComplete && !next.isSliceComplete) {
      events = appendEvent(events, absoluteMinute, {
        code: 'slice-completed',
        message: `${String(next.targetNightCount)}-night vertical slice complete.`,
        tone: 'positive',
      });
    }

    next = {
      ...next,
      absoluteClockUnit,
      completedNights,
      events,
      isSliceComplete,
      phase,
      resources,
      timeMode:
        phase === 'night' && next.timeMode === 'paused' ? 'slow' : next.timeMode,
    };

    if (isSliceComplete) break;
  }

  return next;
};

export const advanceSimulationStep = (state: SimulationState): SimulationState => {
  if (state.isSliceComplete) return state;

  const initialUnitCost = timeUnitsPerClockUnit(state.timeMode, state.phase);
  if (initialUnitCost === null) return state;
  if (
    !Number.isSafeInteger(state.clockStepRemainderTimeUnits) ||
    state.clockStepRemainderTimeUnits < 0
  ) {
    throw new RangeError(
      'clockStepRemainderTimeUnits must be a non-negative safe integer.',
    );
  }
  if (!Number.isSafeInteger(state.tick + 1)) {
    throw new RangeError('tick exceeded the safe integer range.');
  }

  let remainingTimeUnits = FIXED_STEP_TIME_UNITS + state.clockStepRemainderTimeUnits;
  if (!Number.isSafeInteger(remainingTimeUnits)) {
    throw new RangeError('clock step remainder exceeded the safe integer range.');
  }

  let next: SimulationState = { ...state, clockStepRemainderTimeUnits: 0 };

  while (!next.isSliceComplete) {
    const unitCost = timeUnitsPerClockUnit(next.timeMode, next.phase);
    if (unitCost === null || remainingTimeUnits < unitCost) break;

    next = advanceSimulationByClockUnits(next, 1);
    remainingTimeUnits -= unitCost;
  }

  return {
    ...next,
    clockStepRemainderTimeUnits: next.isSliceComplete ? 0 : remainingTimeUnits,
    tick: state.tick + 1,
  };
};

export const advanceSimulationSteps = (
  state: SimulationState,
  stepCount: number,
): SimulationState => {
  assertNonNegativeSafeInteger(stepCount, 'stepCount');
  let next = state;

  for (let step = 0; step < stepCount; step += 1) {
    const advanced = advanceSimulationStep(next);
    if (advanced === next) break;
    next = advanced;
  }

  return next;
};

export const currentDayNumber = (state: SimulationState): number =>
  Math.floor(wholeMinuteForClockUnit(state.absoluteClockUnit) / MINUTES_PER_DAY) + 1;
