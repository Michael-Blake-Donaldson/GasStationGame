import type { GridCoordinate, StationGridDefinition } from './grid';
import type { BusinessDefinition } from './business';
import type { ConstructionDefinition } from './construction';

export const GREAT_PLAINS_SCENARIO_ID = 'great-plains' as const;
export const GREAT_PLAINS_SCENARIO_VERSION = 7 as const;

export interface EmployeeSkillDefinition {
  readonly id: string;
  readonly level: number;
}

export interface InitialEmployeePosition {
  readonly fatigue: number;
  readonly employeeId: string;
  readonly name: string;
  readonly position: GridCoordinate;
  readonly relationship: number;
  readonly role: string;
  readonly skills: readonly EmployeeSkillDefinition[];
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

export interface ConstructionAccessDefinition {
  readonly anchorWorkTargetId: string;
  readonly requiredWorkTargetIds: readonly string[];
}

export interface ScenarioDefinition {
  readonly business: BusinessDefinition;
  readonly construction: readonly ConstructionDefinition[];
  readonly constructionAccess: ConstructionAccessDefinition;
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
