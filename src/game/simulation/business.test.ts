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

const initialResources: Resources = {
  ammunition: 0,
  cash: 100,
  food: 10,
  fuel: 20,
  power: 100,
  scrap: 0,
};

const definition: BusinessDefinition = {
  products: {
    food: {
      baseDemandUnits: 0,
      defaultUnitPrice: 6,
      demandStepUnits: 1,
      demandVariationCount: 3,
      maximumUnitPrice: 20,
      serviceClockUnits: CLOCK_UNITS_PER_MINUTE,
      wholesaleUnitCost: 3,
    },
    fuel: {
      baseDemandUnits: 6,
      defaultUnitPrice: 4,
      demandStepUnits: 2,
      demandVariationCount: 4,
      maximumUnitPrice: 12,
      serviceClockUnits: 2 * CLOCK_UNITS_PER_MINUTE,
      wholesaleUnitCost: 2,
    },
  },
  trafficWindows: [{ endMinute: 18 * 60, intervalMinutes: 30, startMinute: 9 * 60 }],
};

const advance = (
  clockUnits: number,
  staffing: BusinessStaffing,
  resources = initialResources,
  initialBusiness: BusinessState = createInitialBusinessState(definition),
) => {
  let business = initialBusiness;
  let nextResources = resources;
  const outcomes = [];
  const firstArrival = 9 * 60 * CLOCK_UNITS_PER_MINUTE;
  for (let offset = 0; offset < clockUnits; offset += 1) {
    const result = advanceBusinessByClockUnit(
      business,
      definition,
      nextResources,
      firstArrival + offset,
      staffing,
    );
    business = result.business;
    nextResources = result.resources;
    outcomes.push(...result.outcomes);
  }
  return { business, outcomes, resources: nextResources };
};

describe('routine customer business loop', () => {
  it('queues customers without silently earning passive income', () => {
    const result = advance(3 * CLOCK_UNITS_PER_MINUTE, {
      checkout: false,
      pumps: false,
    });

    expect(result.business.activeCustomers).toHaveLength(1);
    expect(result.business.activeCustomers[0]?.stage.type).toBe('pump-queue');
    expect(result.resources).toEqual(initialResources);
  });

  it('moves a staffed customer through pumps and checkout with exact sales', () => {
    const result = advance(4 * CLOCK_UNITS_PER_MINUTE, {
      checkout: true,
      pumps: true,
    });

    expect(result.business.completedCustomerCount).toBe(1);
    expect(result.business.activeCustomers).toHaveLength(0);
    expect(result.resources).toMatchObject({ cash: 124, food: 10, fuel: 14 });
    expect(result.outcomes).toEqual([
      expect.objectContaining({
        customerId: 'routine-customer-0',
        type: 'customer-arrived',
      }),
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
      { checkout: true, pumps: true },
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

  it('locks a customer price when service begins', () => {
    const firstArrival = 9 * 60 * CLOCK_UNITS_PER_MINUTE;
    const started = advanceBusinessByClockUnit(
      createInitialBusinessState(definition),
      definition,
      initialResources,
      firstArrival,
      { checkout: false, pumps: true },
    );
    let business = setBusinessPrice(started.business, definition, 'fuel', 9);
    let resources = started.resources;
    const outcomes = [...started.outcomes];
    for (let offset = 1; offset < 3 * CLOCK_UNITS_PER_MINUTE; offset += 1) {
      const result = advanceBusinessByClockUnit(
        business,
        definition,
        resources,
        firstArrival + offset,
        { checkout: false, pumps: true },
      );
      business = result.business;
      resources = result.resources;
      outcomes.push(...result.outcomes);
    }

    expect(outcomes).toContainEqual(
      expect.objectContaining({ product: 'fuel', revenue: 24, unitPrice: 4 }),
    );
  });
});
