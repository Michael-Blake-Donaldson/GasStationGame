import { describe, expect, it } from 'vitest';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import {
  advanceBusinessByClockUnit,
  createInitialBusinessState,
  setBusinessPrice,
  type BusinessDefinition,
  type BusinessState,
  type BusinessStaffing,
} from './business';
import type { Resources } from './types';
import { createSeededRandomState } from './random';

const initialResources: Resources = {
  ammunition: 0,
  cash: 100,
  food: 10,
  fuel: 20,
  power: 100,
  scrap: 0,
};

const definition: BusinessDefinition = {
  performanceRules: {
    fatigueErrorPenaltyPermillePerTen: 15,
    fatigueSpeedPenaltyPermillePerTen: 40,
    maximumErrorChancePermille: 500,
    skillErrorReductionPermillePerLevel: 20,
    skillSpeedReductionPermillePerLevel: 50,
  },
  products: {
    food: {
      baseErrorChancePermille: 0,
      baseDemandUnits: 0,
      defaultUnitPrice: 6,
      demandStepUnits: 1,
      demandVariationCount: 3,
      errorReworkClockUnits: 40,
      maximumUnitPrice: 20,
      serviceClockUnits: CLOCK_UNITS_PER_MINUTE,
      serviceSkillId: 'checkout',
      wholesaleUnitCost: 3,
    },
    fuel: {
      baseErrorChancePermille: 0,
      baseDemandUnits: 6,
      defaultUnitPrice: 4,
      demandStepUnits: 2,
      demandVariationCount: 4,
      errorReworkClockUnits: 40,
      maximumUnitPrice: 12,
      serviceClockUnits: 2 * CLOCK_UNITS_PER_MINUTE,
      serviceSkillId: 'pumps',
      wholesaleUnitCost: 2,
    },
  },
  trafficWindows: [{ endMinute: 18 * 60, intervalMinutes: 30, startMinute: 9 * 60 }],
};

const checkoutWorker = {
  fatigue: 0,
  id: 'employee-checkout',
  skills: [{ id: 'checkout', level: 0 }],
};
const pumpWorker = {
  fatigue: 0,
  id: 'employee-pumps',
  skills: [{ id: 'pumps', level: 0 }],
};

const advance = (
  clockUnits: number,
  staffing: BusinessStaffing,
  resources = initialResources,
  initialBusiness: BusinessState = createInitialBusinessState(definition),
) => {
  let business = initialBusiness;
  let nextResources = resources;
  let rng = createSeededRandomState(1987);
  const outcomes = [];
  const firstArrival = 9 * 60 * CLOCK_UNITS_PER_MINUTE;
  for (let offset = 0; offset < clockUnits; offset += 1) {
    const result = advanceBusinessByClockUnit(
      business,
      definition,
      nextResources,
      firstArrival + offset,
      staffing,
      rng,
    );
    business = result.business;
    nextResources = result.resources;
    rng = result.rng;
    outcomes.push(...result.outcomes);
  }
  return { business, outcomes, resources: nextResources, rng };
};

describe('routine customer business loop', () => {
  it('queues customers without silently earning passive income', () => {
    const result = advance(3 * CLOCK_UNITS_PER_MINUTE, {
      checkout: undefined,
      pumps: undefined,
    });

    expect(result.business.activeCustomers).toHaveLength(1);
    expect(result.business.activeCustomers[0]?.stage.type).toBe('pump-queue');
    expect(result.resources).toEqual(initialResources);
  });

  it('preserves idle queued state between scheduled arrivals', () => {
    const rng = createSeededRandomState(1987);
    const arrivalClockUnit = 9 * 60 * CLOCK_UNITS_PER_MINUTE;
    const arrived = advanceBusinessByClockUnit(
      createInitialBusinessState(definition),
      definition,
      initialResources,
      arrivalClockUnit,
      { checkout: undefined, pumps: undefined },
      rng,
    );

    const idle = advanceBusinessByClockUnit(
      arrived.business,
      definition,
      arrived.resources,
      arrivalClockUnit + 1,
      { checkout: undefined, pumps: undefined },
      arrived.rng,
    );

    expect(idle.business).toBe(arrived.business);
    expect(idle.resources).toBe(arrived.resources);
    expect(idle.rng).toBe(arrived.rng);
    expect(idle.outcomes).toEqual([]);
  });

  it('moves a staffed customer through pumps and checkout with exact sales', () => {
    const result = advance(4 * CLOCK_UNITS_PER_MINUTE, {
      checkout: checkoutWorker,
      pumps: pumpWorker,
    });

    expect(result.business.completedCustomerCount).toBe(1);
    expect(result.business.activeCustomers).toHaveLength(0);
    expect(result.resources).toMatchObject({ cash: 124, food: 10, fuel: 14 });
    expect(result.outcomes).toEqual([
      expect.objectContaining({
        customerId: 'routine-customer-0',
        type: 'customer-arrived',
      }),
      expect.objectContaining({ product: 'fuel', type: 'service-started' }),
      expect.objectContaining({ product: 'fuel', revenue: 24, soldUnits: 6 }),
      expect.objectContaining({ revenue: 24, type: 'customer-completed' }),
    ]);
  });

  it('routes food demand through checkout and explains stock-limited sales', () => {
    const secondCustomerFirst = {
      ...createInitialBusinessState(definition),
      nextCustomerSequence: 1,
    };
    const result = advance(
      5 * CLOCK_UNITS_PER_MINUTE,
      { checkout: checkoutWorker, pumps: pumpWorker },
      { ...initialResources, food: 0, fuel: 1 },
      secondCustomerFirst,
    );

    const fuelSale = result.outcomes.find(
      (outcome) => outcome.type === 'sale-completed' && outcome.product === 'fuel',
    );
    expect(fuelSale).toMatchObject({ requestedUnits: 8, revenue: 4, soldUnits: 1 });
    expect(result.outcomes).toContainEqual(
      expect.objectContaining({
        product: 'food',
        requestedUnits: 1,
        revenue: 0,
        soldUnits: 0,
      }),
    );
    expect(result.resources).toMatchObject({ cash: 104, food: 0, fuel: 0 });
  });

  it('adds deterministic rework time without changing stock or cash early', () => {
    const errorDefinition: BusinessDefinition = {
      ...definition,
      products: {
        ...definition.products,
        fuel: { ...definition.products.fuel, baseErrorChancePermille: 120 },
      },
    };
    const worker = {
      fatigue: 21,
      id: 'employee-bo',
      skills: [{ id: 'pumps', level: 4 }],
    };
    const arrivalClockUnit = 9 * 60 * CLOCK_UNITS_PER_MINUTE;
    const started = advanceBusinessByClockUnit(
      createInitialBusinessState(errorDefinition),
      errorDefinition,
      initialResources,
      arrivalClockUnit,
      { checkout: undefined, pumps: worker },
      createSeededRandomState(1),
    );

    expect(started.resources).toEqual(initialResources);
    const serviceStarted = started.outcomes.find(
      (outcome) => outcome.type === 'service-started',
    );
    expect(serviceStarted?.performance).toMatchObject({
      adjustedServiceClockUnits: 71,
      errorChancePermille: 70,
      errorOccurred: true,
      errorReworkClockUnits: 40,
      errorRoll: 61,
      rngDrawCount: 1,
      totalClockUnits: 111,
    });

    let business = started.business;
    let resources = started.resources;
    let rng = started.rng;
    const outcomes = [];
    for (let elapsed = 1; elapsed <= 110; elapsed += 1) {
      const result = advanceBusinessByClockUnit(
        business,
        errorDefinition,
        resources,
        arrivalClockUnit + elapsed,
        { checkout: undefined, pumps: worker },
        rng,
      );
      business = result.business;
      resources = result.resources;
      rng = result.rng;
      outcomes.push(...result.outcomes);
    }
    expect(outcomes).toContainEqual(
      expect.objectContaining({ product: 'fuel', type: 'sale-completed' }),
    );
    expect(resources).toMatchObject({ cash: 124, fuel: 14 });
  });

  it('locks a customer price when service begins', () => {
    const firstArrival = 9 * 60 * CLOCK_UNITS_PER_MINUTE;
    const started = advanceBusinessByClockUnit(
      createInitialBusinessState(definition),
      definition,
      initialResources,
      firstArrival,
      { checkout: undefined, pumps: pumpWorker },
      createSeededRandomState(1987),
    );
    let business = setBusinessPrice(started.business, definition, 'fuel', 9);
    let resources = started.resources;
    let rng = started.rng;
    const outcomes = [...started.outcomes];
    for (let offset = 1; offset < 3 * CLOCK_UNITS_PER_MINUTE; offset += 1) {
      const result = advanceBusinessByClockUnit(
        business,
        definition,
        resources,
        firstArrival + offset,
        { checkout: undefined, pumps: pumpWorker },
        rng,
      );
      business = result.business;
      resources = result.resources;
      rng = result.rng;
      outcomes.push(...result.outcomes);
    }

    expect(outcomes).toContainEqual(
      expect.objectContaining({ product: 'fuel', revenue: 24, unitPrice: 4 }),
    );
  });

  it('interrupts service when its worker leaves and reattributes restarted work', () => {
    const firstArrival = 9 * 60 * CLOCK_UNITS_PER_MINUTE;
    const started = advanceBusinessByClockUnit(
      createInitialBusinessState(definition),
      definition,
      initialResources,
      firstArrival,
      { checkout: undefined, pumps: pumpWorker },
      createSeededRandomState(1987),
    );
    const interrupted = advanceBusinessByClockUnit(
      started.business,
      definition,
      started.resources,
      firstArrival + 1,
      { checkout: undefined, pumps: undefined },
      started.rng,
    );

    expect(interrupted.resources).toEqual(initialResources);
    expect(interrupted.rng).toEqual(started.rng);
    expect(interrupted.business.activeCustomers[0]?.stage.type).toBe('pump-queue');
    expect(interrupted.outcomes).toContainEqual(
      expect.objectContaining({
        employeeId: pumpWorker.id,
        remainingClockUnits: 79,
        type: 'service-interrupted',
      }),
    );

    const replacement = { ...pumpWorker, id: 'employee-replacement' };
    const restarted = advanceBusinessByClockUnit(
      interrupted.business,
      definition,
      interrupted.resources,
      firstArrival + 2,
      { checkout: undefined, pumps: replacement },
      interrupted.rng,
    );
    expect(restarted.rng.drawCount).toBeGreaterThan(interrupted.rng.drawCount);
    const restartedService = restarted.outcomes.find(
      (outcome) => outcome.type === 'service-started',
    );
    expect(restartedService?.performance.employeeId).toBe(replacement.id);
  });
});
