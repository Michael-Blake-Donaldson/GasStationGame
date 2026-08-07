import { describe, expect, it } from 'vitest';
import {
  CLOCK_UNITS_PER_MINUTE,
  clockUnitsForFixedStep,
  effectiveTimeMode,
  formatClock,
  phaseForClockUnit,
  phaseForMinuteOfDay,
  timeScaleForMode,
  wholeMinuteForClockUnit,
} from './clock';

describe('simulation clock helpers', () => {
  it.each([
    [6 * 60, 'morning'],
    [6 * 60 + 30, 'day'],
    [18 * 60, 'dusk'],
    [19 * 60, 'night'],
    [2 * 60, 'night'],
  ] as const)('maps minute %s to %s', (minute, expectedPhase) => {
    expect(phaseForMinuteOfDay(minute)).toBe(expectedPhase);
  });

  it('normalizes negative minute values', () => {
    expect(phaseForMinuteOfDay(-60)).toBe('night');
  });

  it('enforces time-control scales by phase', () => {
    expect(timeScaleForMode('paused', 'day')).toBe(0);
    expect(timeScaleForMode('paused', 'night')).toBe(0.25);
    expect(timeScaleForMode('slow', 'day')).toBe(0.25);
    expect(timeScaleForMode('normal', 'day')).toBe(1);
    expect(timeScaleForMode('fast', 'day')).toBe(4);
    expect(timeScaleForMode('fast', 'night')).toBe(1);
  });

  it('derives exact integer fixed-step rates and effective night modes', () => {
    expect(clockUnitsForFixedStep('paused', 'day')).toBe(0);
    expect(clockUnitsForFixedStep('slow', 'day')).toBe(3);
    expect(clockUnitsForFixedStep('normal', 'day')).toBe(12);
    expect(clockUnitsForFixedStep('fast', 'day')).toBe(48);
    expect(clockUnitsForFixedStep('fast', 'night')).toBe(12);
    expect(effectiveTimeMode('paused', 'night')).toBe('slow');
    expect(effectiveTimeMode('fast', 'night')).toBe('normal');
  });

  it('derives whole minutes and phases from clock units', () => {
    const clockUnit = (18 * 60 + 15) * CLOCK_UNITS_PER_MINUTE + 39;
    expect(wholeMinuteForClockUnit(clockUnit)).toBe(18 * 60 + 15);
    expect(phaseForClockUnit(clockUnit)).toBe('dusk');
  });

  it('formats midnight, morning, noon, and rollover values', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(8 * 60 + 5)).toBe('8:05 AM');
    expect(formatClock(12 * 60)).toBe('12:00 PM');
    expect(formatClock(25 * 60)).toBe('1:00 AM');
  });
});
