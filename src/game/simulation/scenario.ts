import type { StationGridDefinition } from './grid';

export const GREAT_PLAINS_SCENARIO_ID = 'great-plains' as const;
export const GREAT_PLAINS_SCENARIO_VERSION = 2 as const;

export interface ScenarioDefinition {
  readonly id: string;
  readonly stationGridDefinition: StationGridDefinition;
  readonly version: number;
}
