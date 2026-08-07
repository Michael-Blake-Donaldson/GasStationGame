import { describe, expect, it } from 'vitest';
import type {
  BeaconVisualStatus,
  StationAtmosphere,
} from '../presentation/stationVisualState';
import { selectStationSceneStyle } from './stationSceneStyle';

const atmospheres: readonly StationAtmosphere[] = ['day', 'dusk', 'night'];
const beaconStatuses: readonly BeaconVisualStatus[] = ['stable', 'critical', 'dark'];

describe('station scene style', () => {
  it('pins deterministic day, dusk, and night fixtures', () => {
    expect(
      atmospheres.map((atmosphere) =>
        selectStationSceneStyle({
          atmosphere,
          beaconStatus: 'stable',
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "background": "#9ebfbe",
          "beaconColor": "#ff6e4a",
          "beaconLightIntensity": 28,
          "beaconSignEmissiveIntensity": 1.8,
          "fogDensity": 0.009,
          "hemisphereGround": "#354128",
          "hemisphereIntensity": 2.1,
          "hemisphereSky": "#d9ebed",
          "storeLightIntensity": 28,
          "sunColor": "#fff0c5",
          "sunIntensity": 3.2,
        },
        {
          "background": "#756f70",
          "beaconColor": "#ff6e4a",
          "beaconLightIntensity": 90,
          "beaconSignEmissiveIntensity": 1.8,
          "fogDensity": 0.014,
          "hemisphereGround": "#292c24",
          "hemisphereIntensity": 1.15,
          "hemisphereSky": "#d8a27f",
          "storeLightIntensity": 52,
          "sunColor": "#ffb06e",
          "sunIntensity": 1.7,
        },
        {
          "background": "#061217",
          "beaconColor": "#ff6e4a",
          "beaconLightIntensity": 160,
          "beaconSignEmissiveIntensity": 1.8,
          "fogDensity": 0.025,
          "hemisphereGround": "#1b261f",
          "hemisphereIntensity": 0.65,
          "hemisphereSky": "#6881a1",
          "storeLightIntensity": 65,
          "sunColor": "#7185ac",
          "sunIntensity": 0.6,
        },
      ]
    `);
  });

  it('keeps a dark Beacon unlit in every atmosphere', () => {
    for (const atmosphere of atmospheres) {
      const style = selectStationSceneStyle({
        atmosphere,
        beaconStatus: 'dark',
      });
      expect(style.beaconLightIntensity).toBe(0);
      expect(style.beaconSignEmissiveIntensity).toBe(0);
    }
  });

  it('makes critical Beacon output weaker than stable output', () => {
    for (const atmosphere of atmospheres) {
      const stable = selectStationSceneStyle({
        atmosphere,
        beaconStatus: 'stable',
      });
      const critical = selectStationSceneStyle({
        atmosphere,
        beaconStatus: 'critical',
      });
      expect(critical.beaconLightIntensity).toBeLessThan(stable.beaconLightIntensity);
    }
  });

  it('defines every atmosphere and Beacon combination', () => {
    for (const atmosphere of atmospheres) {
      for (const beaconStatus of beaconStatuses) {
        expect(selectStationSceneStyle({ atmosphere, beaconStatus })).toBeDefined();
      }
    }
  });
});
