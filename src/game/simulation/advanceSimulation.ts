import { gameConfig } from '../../config/game';
import { MINUTES_PER_DAY, phaseForMinuteOfDay, timeScaleForMode } from './clock';
import type {
  Resources,
  SimulationEvent,
  SimulationPhase,
  SimulationState,
  TimeMode,
} from './types';

const MINUTES_PER_REAL_SECOND = 3;

const phaseMessage = (
  phase: SimulationPhase,
): Omit<SimulationEvent, 'id' | 'minute'> => {
  switch (phase) {
    case 'morning':
      return { message: 'Sunrise. The night report is ready.', tone: 'positive' };
    case 'day':
      return { message: 'Day operations resumed.', tone: 'neutral' };
    case 'dusk':
      return { message: 'Dusk readiness window opened.', tone: 'warning' };
    case 'night':
      return { message: 'Night attack conditions are active.', tone: 'warning' };
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
  const nextId = (events.at(-1)?.id ?? 0) + 1;
  return [...events, { ...event, id: nextId, minute }].slice(-8);
};

export const withTimeMode = (
  state: SimulationState,
  requestedMode: TimeMode,
): SimulationState => ({
  ...state,
  timeMode:
    state.phase === 'night' && requestedMode === 'paused' ? 'slow' : requestedMode,
});

export const advanceSimulationByMinutes = (
  state: SimulationState,
  wholeMinutes: number,
): SimulationState => {
  if (wholeMinutes <= 0 || state.isSliceComplete) return state;

  let next = state;

  for (let offset = 0; offset < wholeMinutes; offset += 1) {
    const previousPhase = next.phase;
    const absoluteMinute = next.absoluteMinute + 1;
    const phase = phaseForMinuteOfDay(absoluteMinute);
    const enteredMorning = previousPhase === 'night' && phase === 'morning';
    const completedNights = next.completedNights + (enteredMorning ? 1 : 0);
    const isSliceComplete = completedNights >= gameConfig.verticalSliceNightCount;
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
        message: 'Three-night vertical slice complete.',
        tone: 'positive',
      });
    }

    next = {
      ...next,
      absoluteMinute,
      completedNights,
      events,
      isSliceComplete,
      phase,
      resources,
      timeMode:
        phase === 'night' && next.timeMode === 'paused' ? 'slow' : next.timeMode,
    };
  }

  return next;
};

export const advanceSimulation = (
  state: SimulationState,
  realSeconds: number,
): SimulationState => {
  if (realSeconds <= 0 || state.isSliceComplete) return state;

  const timeScale = timeScaleForMode(state.timeMode, state.phase);
  if (timeScale === 0) return state;

  const scaledMinutes =
    state.minuteRemainder + realSeconds * MINUTES_PER_REAL_SECOND * timeScale;
  const wholeMinutes = Math.floor(scaledMinutes);
  const minuteRemainder = scaledMinutes - wholeMinutes;

  if (wholeMinutes === 0) return { ...state, minuteRemainder };

  return {
    ...advanceSimulationByMinutes(state, wholeMinutes),
    minuteRemainder,
  };
};

export const currentDayNumber = (state: SimulationState): number =>
  Math.floor(state.absoluteMinute / MINUTES_PER_DAY) + 1;
