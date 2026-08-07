import { describe, expect, it } from 'vitest';
import { createInitialState } from '../simulation/createInitialState';
import { selectStationVisualState } from './stationVisualState';

describe('station visual state', () => {
  it.each([
    ['morning', 'day'],
    ['day', 'day'],
    ['dusk', 'dusk'],
    ['night', 'night'],
  ] as const)('maps %s simulation phase to %s atmosphere', (phase, atmosphere) => {
    const state = createInitialState(1987, 3);
    expect(
      selectStationVisualState({
        ...state,
        phase,
      }).atmosphere,
    ).toBe(atmosphere);
  });

  it.each([
    [100, 'stable'],
    [26, 'stable'],
    [25, 'critical'],
    [1, 'critical'],
    [0, 'dark'],
    [-10, 'dark'],
  ] as const)('maps %s power to %s Beacon status', (power, beaconStatus) => {
    const state = createInitialState(1987, 3);
    expect(
      selectStationVisualState({
        ...state,
        resources: { ...state.resources, power },
      }).beaconStatus,
    ).toBe(beaconStatus);
  });

  it('returns equal fixtures for equal authoritative inputs', () => {
    const state = createInitialState(1987, 3);
    expect(selectStationVisualState(state)).toEqual(selectStationVisualState(state));
  });
});
