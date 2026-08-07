import {
  CLOCK_UNITS_PER_MINUTE,
  FIXED_STEP_TIME_UNITS,
  MINUTES_PER_DAY,
  effectiveTimeMode,
  phaseForClockUnit,
  timeUnitsPerClockUnit,
  wholeMinuteForClockUnit,
} from './clock';
import { appendDomainEvent } from './events';
import { advanceEmployeeActivitiesByClockUnit } from './jobs';
import type {
  ResourceChange,
  ResourceKey,
  Resources,
  SimulationPhase,
  SimulationState,
} from './types';

const RESOURCE_ORDER: readonly ResourceKey[] = [
  'ammunition',
  'cash',
  'food',
  'fuel',
  'power',
  'scrap',
];

export const resourceRequestsForPhase = (
  phase: SimulationPhase,
): Partial<Record<ResourceKey, number>> => {
  if (phase === 'day') return { cash: 12, food: -1, fuel: -2 };
  if (phase === 'night') return { ammunition: -1, power: -4 };
  return {};
};

export const applyHourlyFlow = (
  resources: Readonly<Resources>,
  phase: SimulationPhase,
): { changes: readonly ResourceChange[]; resources: Resources } => {
  const requests = resourceRequestsForPhase(phase);
  const next: Resources = { ...resources };
  const changes: ResourceChange[] = [];

  for (const resource of RESOURCE_ORDER) {
    const requestedDelta = requests[resource] ?? 0;
    if (requestedDelta === 0) continue;

    const before = resources[resource];
    const after = Math.max(0, before + requestedDelta);
    const appliedDelta = after - before;
    if (appliedDelta === 0) continue;

    next[resource] = after;
    changes.push({ after, appliedDelta, before, requestedDelta, resource });
  }

  return { changes, resources: next };
};

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

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
      next = advanceEmployeeActivitiesByClockUnit({ ...next, absoluteClockUnit });
      continue;
    }

    const absoluteMinute = wholeMinuteForClockUnit(absoluteClockUnit);
    const previousPhase = next.phase;
    const phase = phaseForClockUnit(absoluteClockUnit);
    const enteredMorning = previousPhase === 'night' && phase === 'morning';
    const completedNights = next.completedNights + (enteredMorning ? 1 : 0);
    const isSliceComplete = completedNights >= next.targetNightCount;

    next = {
      ...next,
      absoluteClockUnit,
      completedNights,
      isSliceComplete,
      phase,
    };

    if (phase !== previousPhase) {
      next = appendDomainEvent(next, {
        currentPhase: phase,
        previousPhase,
        reason: 'clock-boundary',
        type: 'phase.entered',
      });
    }

    if (enteredMorning) {
      next = appendDomainEvent(next, {
        completedNights,
        reason: 'sunrise-reached',
        type: 'night.completed',
      });
    }

    if (isSliceComplete) {
      next = advanceEmployeeActivitiesByClockUnit(next);
      next = appendDomainEvent(next, {
        completedNights,
        reason: 'target-night-count-reached',
        targetNightCount: next.targetNightCount,
        type: 'slice.completed',
      });
    }

    if (phase === 'night' && next.timeMode === 'paused') {
      const previousMode = next.timeMode;
      next = { ...next, timeMode: 'slow' };
      next = appendDomainEvent(next, {
        currentMode: next.timeMode,
        effectiveCurrentMode: effectiveTimeMode(next.timeMode, phase),
        effectivePreviousMode: effectiveTimeMode(previousMode, previousPhase),
        previousMode,
        reason: 'night-pause-converted',
        requestedMode: 'paused',
        type: 'time-mode.changed',
      });
    }

    if (absoluteMinute % 60 === 0) {
      const flow = applyHourlyFlow(next.resources, phase);
      if (flow.changes.length > 0) {
        next = { ...next, resources: flow.resources };
        next = appendDomainEvent(next, {
          changes: flow.changes,
          reason: phase === 'day' ? 'day-hourly-flow' : 'night-hourly-flow',
          type: 'resources.changed',
        });
      }
    }

    if (!isSliceComplete) next = advanceEmployeeActivitiesByClockUnit(next);
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

  let next: SimulationState = {
    ...state,
    clockStepRemainderTimeUnits: 0,
    tick: state.tick + 1,
  };

  while (!next.isSliceComplete) {
    const unitCost = timeUnitsPerClockUnit(next.timeMode, next.phase);
    if (unitCost === null || remainingTimeUnits < unitCost) break;

    next = advanceSimulationByClockUnits(next, 1);
    remainingTimeUnits -= unitCost;
  }

  return {
    ...next,
    clockStepRemainderTimeUnits: next.isSliceComplete ? 0 : remainingTimeUnits,
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
