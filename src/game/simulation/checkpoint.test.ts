import { describe, expect, it } from 'vitest';
import { hashSimulationState } from './checkpoint';
import { createInitialState } from './createInitialState';

describe('simulation checkpoint hash', () => {
  it('is stable when ID-keyed employees arrive in a different storage order', () => {
    const initial = createInitialState();
    const reordered = { ...initial, employees: [...initial.employees].reverse() };

    expect(hashSimulationState(reordered)).toBe(hashSimulationState(initial));
  });

  it('changes when authoritative resources change', () => {
    const initial = createInitialState();
    const changed = {
      ...initial,
      resources: { ...initial.resources, fuel: initial.resources.fuel - 1 },
    };

    expect(hashSimulationState(changed)).not.toBe(hashSimulationState(initial));
  });

  it('includes employee names, event copy, and clock-step remainder', () => {
    const initial = createInitialState();
    const renamed = {
      ...initial,
      employees: initial.employees.map((employee) =>
        employee.id === 'employee-ada' ? { ...employee, name: 'Ada Two' } : employee,
      ),
    };
    const reworded = {
      ...initial,
      events: initial.events.map((event) => ({ ...event, message: 'Changed copy.' })),
    };
    const partialStep = { ...initial, clockStepRemainderTimeUnits: 1 };

    expect(hashSimulationState(renamed)).not.toBe(hashSimulationState(initial));
    expect(hashSimulationState(reworded)).not.toBe(hashSimulationState(initial));
    expect(hashSimulationState(partialStep)).not.toBe(hashSimulationState(initial));
  });
});
