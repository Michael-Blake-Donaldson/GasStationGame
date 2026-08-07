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
  id: string;
  name: string;
  role: string;
  fatigue: number;
  relationship: number;
}

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
  resources: Readonly<Resources>;
  seed: number;
  targetNightCount: number;
  tick: number;
  timeMode: TimeMode;
}
