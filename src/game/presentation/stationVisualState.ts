import type { SimulationPhase, SimulationState } from '../simulation/types';

export type StationAtmosphere = 'day' | 'dusk' | 'night';
export type BeaconVisualStatus = 'stable' | 'critical' | 'dark';

export interface StationVisualState {
  readonly atmosphere: StationAtmosphere;
  readonly beaconStatus: BeaconVisualStatus;
  readonly phase: SimulationPhase;
}

export const selectStationVisualState = (
  state: Pick<SimulationState, 'phase' | 'resources'>,
): StationVisualState => ({
  atmosphere:
    state.phase === 'night' ? 'night' : state.phase === 'dusk' ? 'dusk' : 'day',
  beaconStatus:
    state.resources.power <= 0
      ? 'dark'
      : state.resources.power <= 25
        ? 'critical'
        : 'stable',
  phase: state.phase,
});

export const beaconVisualStatusLabel: Record<BeaconVisualStatus, string> = {
  critical: 'Critical',
  dark: 'Dark',
  stable: 'Stable',
};
