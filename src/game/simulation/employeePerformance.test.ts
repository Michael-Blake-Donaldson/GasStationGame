import { describe, expect, it } from 'vitest';
import { greatPlainsScenario } from '../scenarios/greatPlains';
import { createInitialState } from './createInitialState';
import { calculateServicePerformance } from './employeePerformance';

const state = createInitialState(greatPlainsScenario);
const rules = greatPlainsScenario.business.performanceRules;
const fuel = greatPlainsScenario.business.products.fuel;
const food = greatPlainsScenario.business.products.food;

describe('employee service performance', () => {
  it('applies exact authored skill and fatigue modifiers with integer rounding', () => {
    const ada = state.employees.find(({ id }) => id === 'employee-ada');
    const bo = state.employees.find(({ id }) => id === 'employee-bo');
    expect(ada).toBeDefined();
    expect(bo).toBeDefined();
    if (ada === undefined || bo === undefined) return;

    expect(calculateServicePerformance(ada, food, rules, 999, 1)).toMatchObject({
      adjustedServiceClockUnits: 34,
      errorChancePermille: 55,
      errorOccurred: false,
      fatigueErrorPenaltyPermille: 15,
      fatigueSpeedPenaltyPermille: 40,
      fatigueTier: 1,
      skillErrorReductionPermille: 80,
      skillLevel: 4,
      skillSpeedReductionPermille: 200,
      speedPermille: 840,
      totalClockUnits: 34,
    });
    expect(calculateServicePerformance(bo, fuel, rules, 0, 2)).toMatchObject({
      adjustedServiceClockUnits: 71,
      errorChancePermille: 70,
      errorOccurred: true,
      errorReworkClockUnits: 40,
      speedPermille: 880,
      totalClockUnits: 111,
    });
  });

  it('never lets higher matching skill worsen speed or error chance', () => {
    for (let level = 0; level < 5; level += 1) {
      const lower = calculateServicePerformance(
        { fatigue: 30, id: 'worker', skills: [{ id: 'pumps', level }] },
        fuel,
        rules,
        999,
        1,
      );
      const higher = calculateServicePerformance(
        { fatigue: 30, id: 'worker', skills: [{ id: 'pumps', level: level + 1 }] },
        fuel,
        rules,
        999,
        1,
      );
      expect(higher.adjustedServiceClockUnits).toBeLessThanOrEqual(
        lower.adjustedServiceClockUnits,
      );
      expect(higher.errorChancePermille).toBeLessThanOrEqual(lower.errorChancePermille);
    }
  });

  it('never lets higher fatigue improve speed or error chance', () => {
    let previous = calculateServicePerformance(
      { fatigue: 0, id: 'worker', skills: [{ id: 'checkout', level: 3 }] },
      food,
      rules,
      999,
      1,
    );
    for (let fatigue = 1; fatigue <= 100; fatigue += 1) {
      const current = calculateServicePerformance(
        { fatigue, id: 'worker', skills: [{ id: 'checkout', level: 3 }] },
        food,
        rules,
        999,
        1,
      );
      expect(current.adjustedServiceClockUnits).toBeGreaterThanOrEqual(
        previous.adjustedServiceClockUnits,
      );
      expect(current.errorChancePermille).toBeGreaterThanOrEqual(
        previous.errorChancePermille,
      );
      previous = current;
    }
  });
});
