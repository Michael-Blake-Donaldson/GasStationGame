import type { SimulationPhase, TimeMode } from './types';

export const MINUTES_PER_DAY = 24 * 60;
export const CLOCK_UNITS_PER_MINUTE = 40;
export const FIXED_STEP_MICROSECONDS = 100_000;
export const FIXED_STEP_TIME_UNITS = FIXED_STEP_MICROSECONDS * 3;

const CLOCK_UNITS_PER_STEP: Record<Exclude<TimeMode, 'paused'>, number> = {
  slow: 3,
  normal: 12,
  fast: 48,
};

const TIME_UNITS_PER_CLOCK_UNIT: Record<Exclude<TimeMode, 'paused'>, number> = {
  slow: 100_000,
  normal: 25_000,
  fast: 6_250,
};

export const phaseForMinuteOfDay = (minuteOfDay: number): SimulationPhase => {
  const normalized =
    ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  if (normalized >= 6 * 60 && normalized < 6 * 60 + 30) return 'morning';
  if (normalized >= 6 * 60 + 30 && normalized < 18 * 60) return 'day';
  if (normalized >= 18 * 60 && normalized < 19 * 60) return 'dusk';
  return 'night';
};

export const wholeMinuteForClockUnit = (absoluteClockUnit: number): number =>
  Math.floor(absoluteClockUnit / CLOCK_UNITS_PER_MINUTE);

export const phaseForClockUnit = (absoluteClockUnit: number): SimulationPhase =>
  phaseForMinuteOfDay(wholeMinuteForClockUnit(absoluteClockUnit));

export const effectiveTimeMode = (mode: TimeMode, phase: SimulationPhase): TimeMode => {
  if (phase === 'night' && mode === 'paused') return 'slow';
  if (phase === 'night' && mode === 'fast') return 'normal';
  return mode;
};

export const timeScaleForMode = (mode: TimeMode, phase: SimulationPhase): number => {
  const effectiveMode = effectiveTimeMode(mode, phase);
  if (effectiveMode === 'paused') return 0;
  if (effectiveMode === 'slow') return 0.25;
  if (effectiveMode === 'fast') return 4;
  return 1;
};

export const clockUnitsForFixedStep = (
  mode: TimeMode,
  phase: SimulationPhase,
): number => {
  const effectiveMode = effectiveTimeMode(mode, phase);
  return effectiveMode === 'paused' ? 0 : CLOCK_UNITS_PER_STEP[effectiveMode];
};

export const timeUnitsPerClockUnit = (
  mode: TimeMode,
  phase: SimulationPhase,
): number | null => {
  const effectiveMode = effectiveTimeMode(mode, phase);
  return effectiveMode === 'paused' ? null : TIME_UNITS_PER_CLOCK_UNIT[effectiveMode];
};

export const formatClock = (absoluteMinute: number): string => {
  const minuteOfDay =
    ((absoluteMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = Math.floor(minuteOfDay % 60);
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12)}:${minute.toString().padStart(2, '0')} ${suffix}`;
};
