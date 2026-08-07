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

export interface SimulationEvent {
  id: number;
  minute: number;
  message: string;
  tone: 'neutral' | 'positive' | 'warning';
}

export interface SimulationState {
  absoluteMinute: number;
  completedNights: number;
  employees: readonly Employee[];
  events: readonly SimulationEvent[];
  isSliceComplete: boolean;
  minuteRemainder: number;
  phase: SimulationPhase;
  resources: Readonly<Resources>;
  seed: number;
  timeMode: TimeMode;
}
