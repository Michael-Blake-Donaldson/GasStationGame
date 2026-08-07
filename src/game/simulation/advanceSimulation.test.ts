import { describe, expect, it } from 'vitest';
import {
  advanceSimulation,
  advanceSimulationByMinutes,
  currentDayNumber,
  withTimeMode,
} from './advanceSimulation';
import { createInitialState } from './createInitialState';

describe('station simulation clock', () => {
  it('does not advance while daytime is paused', () => {
    const initial = createInitialState();
    expect(advanceSimulation(initial, 60)).toBe(initial);
  });

  it.each([
    ['normal', 1, 4],
    ['slow', 4, 16],
  ] as const)(
    'produces the same %s-speed result across timer callback chunking',
    (mode, elapsedSeconds, chunks) => {
      const initial = withTimeMode(createInitialState(), mode);
      const single = advanceSimulation(initial, elapsedSeconds);
      let chunked = initial;

      for (let index = 0; index < chunks; index += 1) {
        chunked = advanceSimulation(chunked, elapsedSeconds / chunks);
      }

      expect(chunked).toEqual(single);
    },
  );

  it('keeps slow-time night progression independent of callback cadence', () => {
    const night = withTimeMode(
      advanceSimulationByMinutes(createInitialState(), 11 * 60),
      'slow',
    );
    const single = advanceSimulation(night, 4);
    let chunked = night;

    for (let index = 0; index < 16; index += 1) {
      chunked = advanceSimulation(chunked, 0.25);
    }

    expect(chunked).toEqual(single);
    expect(chunked.phase).toBe('night');
  });

  it('moves from day to dusk at 18:00 and records the transition', () => {
    const initial = withTimeMode(createInitialState(), 'normal');
    const next = advanceSimulationByMinutes(initial, 10 * 60);

    expect(next.phase).toBe('dusk');
    expect(next.events.at(-1)?.message).toContain('Dusk');
  });

  it('prevents a full pause at night', () => {
    const night = advanceSimulationByMinutes(createInitialState(), 11 * 60);
    const next = withTimeMode(night, 'paused');

    expect(next.phase).toBe('night');
    expect(next.timeMode).toBe('slow');
  });

  it('applies explainable hourly day resource flow', () => {
    const initial = createInitialState();
    const next = advanceSimulationByMinutes(initial, 60);

    expect(next.resources).toMatchObject({ cash: 432, food: 47, fuel: 158 });
  });

  it('completes after three sunrise resolutions', () => {
    const initial = createInitialState();
    const threeCycles = advanceSimulationByMinutes(initial, 3 * 24 * 60 - 2 * 60);

    expect(threeCycles.completedNights).toBe(3);
    expect(threeCycles.isSliceComplete).toBe(true);
    expect(threeCycles.events.at(-1)?.message).toContain('complete');
  });

  it('reports the current day from absolute simulation time', () => {
    const nextDay = advanceSimulationByMinutes(createInitialState(), 24 * 60);
    expect(currentDayNumber(nextDay)).toBe(2);
  });
});
