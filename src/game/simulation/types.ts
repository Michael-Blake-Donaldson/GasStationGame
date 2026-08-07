export type SimulationPhase = 'morning' | 'day' | 'dusk' | 'night';
export type TimeMode = 'paused' | 'slow' | 'normal' | 'fast';
export type SimulationEventCode =
  | 'phase-entered-day'
  | 'phase-entered-dusk'
  | 'phase-entered-morning'
  | 'phase-entered-night'
  | 'scenario-started'
  | 'slice-completed';

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

export interface SimulationEvent {
  code: SimulationEventCode;
  id: number;
  minute: number;
  message: string;
  tone: 'neutral' | 'positive' | 'warning';
}

export interface SimulationState {
  absoluteClockUnit: number;
  clockStepRemainderTimeUnits: number;
  completedNights: number;
  employees: readonly Employee[];
  events: readonly SimulationEvent[];
  isSliceComplete: boolean;
  phase: SimulationPhase;
  resources: Readonly<Resources>;
  seed: number;
  targetNightCount: number;
  tick: number;
  timeMode: TimeMode;
}
