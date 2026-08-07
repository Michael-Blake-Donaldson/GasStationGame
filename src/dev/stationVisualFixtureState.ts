import type {
  BeaconVisualStatus,
  StationAtmosphere,
  StationVisualState,
} from '../game/presentation/stationVisualState';

const atmospheres: readonly StationAtmosphere[] = ['day', 'dusk', 'night'];
const beaconStatuses: readonly BeaconVisualStatus[] = ['stable', 'critical', 'dark'];

const isAtmosphere = (value: string | null): value is StationAtmosphere =>
  value !== null && atmospheres.some((candidate) => candidate === value);

const isBeaconStatus = (value: string | null): value is BeaconVisualStatus =>
  value !== null && beaconStatuses.some((candidate) => candidate === value);

export const readStationVisualFixture = (search: string): StationVisualState => {
  const parameters = new URLSearchParams(search);
  const atmosphereParameter = parameters.get('atmosphere');
  const beaconParameter = parameters.get('beacon');
  const atmosphere = isAtmosphere(atmosphereParameter) ? atmosphereParameter : 'day';
  const beaconStatus = isBeaconStatus(beaconParameter) ? beaconParameter : 'stable';
  return { atmosphere, beaconStatus, phase: atmosphere };
};
