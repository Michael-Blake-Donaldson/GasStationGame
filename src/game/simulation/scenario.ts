import type { GridCoordinate, StationGridDefinition } from './grid';

export const GREAT_PLAINS_SCENARIO_ID = 'great-plains' as const;
export const GREAT_PLAINS_SCENARIO_VERSION = 3 as const;

export interface InitialEmployeePosition {
  readonly employeeId: string;
  readonly position: GridCoordinate;
}

export type WorkSubject =
  | { readonly kind: 'authored-plot'; readonly plotId: string }
  | { readonly kind: 'occupant'; readonly occupantId: string };

export interface WorkTargetDefinition {
  readonly id: string;
  readonly interactionCells: readonly GridCoordinate[];
  readonly subject: WorkSubject;
}

export interface JobDefinition {
  readonly id: string;
  readonly targetId: string;
  readonly workDurationClockUnits: number;
}

export interface ScenarioDefinition {
  readonly id: string;
  readonly initialEmployeePositions: readonly InitialEmployeePosition[];
  readonly jobs: readonly JobDefinition[];
  readonly stationGridDefinition: StationGridDefinition;
  readonly version: number;
  readonly workTargets: readonly WorkTargetDefinition[];
}

export interface SimulationContext {
  readonly scenario: ScenarioDefinition;
}
