import { describe, expect, it } from 'vitest';
import { readStationVisualFixture } from './stationVisualFixtureState';

describe('station visual fixture query', () => {
  it('reads every supported fixture axis', () => {
    expect(readStationVisualFixture('?atmosphere=dusk&beacon=critical')).toEqual({
      atmosphere: 'dusk',
      beaconStatus: 'critical',
      phase: 'dusk',
    });
    expect(readStationVisualFixture('?atmosphere=night&beacon=dark')).toEqual({
      atmosphere: 'night',
      beaconStatus: 'dark',
      phase: 'night',
    });
  });

  it('falls back to the day and stable fixture for unknown values', () => {
    expect(readStationVisualFixture('?atmosphere=storm&beacon=broken')).toEqual({
      atmosphere: 'day',
      beaconStatus: 'stable',
      phase: 'day',
    });
  });
});
