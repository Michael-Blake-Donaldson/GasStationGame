import type { SimulationPhase, TimeMode } from './types';

export const MINUTES_PER_DAY = 24 * 60;

export const phaseForMinuteOfDay = (minuteOfDay: number): SimulationPhase => {
  const normalized =
    ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  if (normalized >= 6 * 60 && normalized < 6 * 60 + 30) return 'morning';
  if (normalized >= 6 * 60 + 30 && normalized < 18 * 60) return 'day';
  if (normalized >= 18 * 60 && normalized < 19 * 60) return 'dusk';
  return 'night';
};

export const timeScaleForMode = (mode: TimeMode, phase: SimulationPhase): number => {
  if (mode === 'paused') return phase === 'night' ? 0.25 : 0;
  if (mode === 'slow') return 0.25;
  if (mode === 'fast') return phase === 'night' ? 1 : 4;
  return 1;
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
