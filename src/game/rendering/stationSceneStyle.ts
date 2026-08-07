import type {
  BeaconVisualStatus,
  StationAtmosphere,
  StationVisualState,
} from '../presentation/stationVisualState';

interface AtmosphereStyle {
  readonly background: string;
  readonly fogDensity: number;
  readonly hemisphereGround: string;
  readonly hemisphereIntensity: number;
  readonly hemisphereSky: string;
  readonly storeLightIntensity: number;
  readonly sunColor: string;
  readonly sunIntensity: number;
}

interface BeaconStyle {
  readonly color: string;
  readonly intensity: Record<StationAtmosphere, number>;
  readonly signEmissiveIntensity: number;
}

export interface StationSceneStyle extends AtmosphereStyle {
  readonly beaconColor: string;
  readonly beaconLightIntensity: number;
  readonly beaconSignEmissiveIntensity: number;
}

const atmosphereStyles: Record<StationAtmosphere, AtmosphereStyle> = {
  day: {
    background: '#9ebfbe',
    fogDensity: 0.009,
    hemisphereGround: '#354128',
    hemisphereIntensity: 2.1,
    hemisphereSky: '#d9ebed',
    storeLightIntensity: 28,
    sunColor: '#fff0c5',
    sunIntensity: 3.2,
  },
  dusk: {
    background: '#756f70',
    fogDensity: 0.014,
    hemisphereGround: '#292c24',
    hemisphereIntensity: 1.15,
    hemisphereSky: '#d8a27f',
    storeLightIntensity: 52,
    sunColor: '#ffb06e',
    sunIntensity: 1.7,
  },
  night: {
    background: '#061217',
    fogDensity: 0.025,
    hemisphereGround: '#1b261f',
    hemisphereIntensity: 0.65,
    hemisphereSky: '#6881a1',
    storeLightIntensity: 65,
    sunColor: '#7185ac',
    sunIntensity: 0.6,
  },
};

const beaconStyles: Record<BeaconVisualStatus, BeaconStyle> = {
  stable: {
    color: '#ff6e4a',
    intensity: { day: 28, dusk: 90, night: 160 },
    signEmissiveIntensity: 1.8,
  },
  critical: {
    color: '#ffb14a',
    intensity: { day: 14, dusk: 45, night: 80 },
    signEmissiveIntensity: 0.7,
  },
  dark: {
    color: '#351915',
    intensity: { day: 0, dusk: 0, night: 0 },
    signEmissiveIntensity: 0,
  },
};

export const selectStationSceneStyle = (
  state: Pick<StationVisualState, 'atmosphere' | 'beaconStatus'>,
): StationSceneStyle => {
  const atmosphere = atmosphereStyles[state.atmosphere];
  const beacon = beaconStyles[state.beaconStatus];
  return {
    ...atmosphere,
    beaconColor: beacon.color,
    beaconLightIntensity: beacon.intensity[state.atmosphere],
    beaconSignEmissiveIntensity: beacon.signEmissiveIntensity,
  };
};
