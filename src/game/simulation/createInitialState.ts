import type { SimulationState } from './types';

export const createInitialState = (seed = 1987): SimulationState => ({
  absoluteMinute: 8 * 60,
  completedNights: 0,
  employees: [
    {
      id: 'employee-ada',
      name: 'Ada',
      role: 'Checkout',
      fatigue: 14,
      relationship: 12,
    },
    { id: 'employee-bo', name: 'Bo', role: 'Pumps', fatigue: 21, relationship: 8 },
    {
      id: 'employee-cora',
      name: 'Cora',
      role: 'Garage',
      fatigue: 18,
      relationship: 17,
    },
    {
      id: 'employee-dale',
      name: 'Dale',
      role: 'Security',
      fatigue: 26,
      relationship: 4,
    },
  ],
  events: [
    {
      id: 0,
      minute: 8 * 60,
      message: 'Morning shift opened. The Beacon is stable.',
      tone: 'positive',
    },
  ],
  isSliceComplete: false,
  minuteRemainder: 0,
  phase: 'day',
  resources: {
    ammunition: 36,
    cash: 420,
    food: 48,
    fuel: 160,
    power: 100,
    scrap: 32,
  },
  seed,
  timeMode: 'paused',
});
