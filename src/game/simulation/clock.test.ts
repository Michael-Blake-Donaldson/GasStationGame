import { describe, expect, it } from 'vitest';
import { formatClock, phaseForMinuteOfDay, timeScaleForMode } from './clock';

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

  it('formats midnight, morning, noon, and rollover values', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(8 * 60 + 5)).toBe('8:05 AM');
    expect(formatClock(12 * 60)).toBe('12:00 PM');
    expect(formatClock(25 * 60)).toBe('1:00 AM');
  });
});
