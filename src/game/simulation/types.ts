import type { SeededRandomState } from './random';
import type { GridCoordinate, StationOccupancyState } from './grid';

export type SimulationPhase = 'morning' | 'day' | 'dusk' | 'night';
export type TimeMode = 'paused' | 'slow' | 'normal' | 'fast';

export interface Resources {
  ammunition: number;
  cash: number;
  food: number;
  fuel: number;
  power: number;
  scrap: number;
}

export interface Employee {
  readonly activity: EmployeeActivity;
  readonly fatigue: number;
  readonly id: string;
  readonly name: string;
  readonly position: GridCoordinate;
  readonly relationship: number;
  readonly role: string;
}

export type EmployeeActivity =
  | { readonly status: 'idle' }
  | {
      readonly assignmentId: string;
      readonly destination: GridCoordinate;
      readonly jobId: string;
      readonly movementProgressClockUnits: number;
      readonly nextPathIndex: number;
      readonly path: readonly GridCoordinate[];
      readonly status: 'traveling';
      readonly targetId: string;
      readonly totalWorkClockUnits: number;
    }
  | {
      readonly assignmentId: string;
      readonly destination: GridCoordinate;
      readonly jobId: string;
      readonly remainingWorkClockUnits: number;
      readonly status: 'working';
      readonly targetId: string;
      readonly totalWorkClockUnits: number;
    };

export type ResourceKey = keyof Resources;

export interface ResourceChange {
  after: number;
  appliedDelta: number;
  before: number;
  requestedDelta: number;
  resource: ResourceKey;
}

export interface DomainEventBase {
  absoluteClockUnit: number;
  minute: number;
  sequence: number;
  tick: number;
}

export type DomainEvent =
  | (DomainEventBase & {
      reason: 'scenario-initialized';
      gridDefinitionId: string;
      gridDefinitionVersion: number;
      rngAlgorithm: SeededRandomState['algorithm'];
      rngVersion: SeededRandomState['version'];
      scenarioId: string;
      scenarioVersion: number;
      seed: number;
      targetNightCount: number;
      type: 'simulation.started';
    })
  | (DomainEventBase & {
      currentPhase: SimulationPhase;
      previousPhase: SimulationPhase;
      reason: 'clock-boundary';
      type: 'phase.entered';
    })
  | (DomainEventBase & {
      completedNights: number;
      reason: 'sunrise-reached';
      type: 'night.completed';
    })
  | (DomainEventBase & {
      changes: readonly ResourceChange[];
      reason: 'day-hourly-flow' | 'night-hourly-flow';
      type: 'resources.changed';
    })
  | (DomainEventBase & {
      currentMode: TimeMode;
      effectiveCurrentMode: TimeMode;
      effectivePreviousMode: TimeMode;
      previousMode: TimeMode;
      reason: 'night-fast-capped' | 'night-pause-converted' | 'player-request';
      requestedMode: TimeMode;
      type: 'time-mode.changed';
    })
  | (DomainEventBase & {
      completedNights: number;
      reason: 'target-night-count-reached';
      targetNightCount: number;
      type: 'slice.completed';
    })
  | (DomainEventBase & {
      assignmentId: string;
      destination: GridCoordinate;
      employeeId: string;
      jobId: string;
      pathLength: number;
      reason: 'player-request';
      targetId: string;
      type: 'job.assigned';
    })
  | (DomainEventBase & {
      assignmentId: string;
      destination: GridCoordinate;
      employeeId: string;
      jobId: string;
      reason: 'job-travel-completed';
      targetId: string;
      traveledCellCount: number;
      type: 'employee.arrived';
    })
  | (DomainEventBase & {
      assignmentId: string;
      employeeId: string;
      jobId: string;
      reason: 'employee-at-interaction-cell';
      targetId: string;
      totalWorkClockUnits: number;
      type: 'job.started';
    })
  | (DomainEventBase & {
      assignmentId: string;
      employeeId: string;
      jobId: string;
      position: GridCoordinate;
      previousActivity: 'traveling' | 'working';
      reason: 'player-request';
      remainingPathCells: number;
      remainingWorkClockUnits: number;
      type: 'job.cancelled';
    })
  | (DomainEventBase & {
      assignmentId: string;
      employeeId: string;
      jobId: string;
      position: GridCoordinate;
      reason: 'work-duration-reached';
      targetId: string;
      type: 'job.completed';
    });

export interface SimulationState {
  absoluteClockUnit: number;
  clockStepRemainderTimeUnits: number;
  completedNights: number;
  employees: readonly Employee[];
  eventLedger: readonly DomainEvent[];
  isSliceComplete: boolean;
  nextEventSequence: number;
  phase: SimulationPhase;
  rng: SeededRandomState;
  scenarioId: string;
  scenarioVersion: number;
  stationOccupancy: StationOccupancyState;
  resources: Readonly<Resources>;
  seed: number;
  targetNightCount: number;
  tick: number;
  timeMode: TimeMode;
}
