import { CLOCK_UNITS_PER_MINUTE, MINUTES_PER_DAY } from './clock';
import {
  calculateServicePerformance,
  type ServicePerformanceSnapshot,
} from './employeePerformance';
import { drawRandomInteger, type SeededRandomState } from './random';
import type { Employee, Resources } from './types';

export interface RetailProductDefinition {
  readonly baseErrorChancePermille: number;
  readonly baseDemandUnits: number;
  readonly defaultUnitPrice: number;
  readonly demandStepUnits: number;
  readonly demandVariationCount: number;
  readonly errorReworkClockUnits: number;
  readonly maximumUnitPrice: number;
  readonly serviceClockUnits: number;
  readonly serviceSkillId: string;
  readonly wholesaleUnitCost: number;
}

export interface TrafficWindowDefinition {
  readonly endMinute: number;
  readonly intervalMinutes: number;
  readonly startMinute: number;
}

export interface BusinessDefinition {
  readonly performanceRules: {
    readonly fatigueErrorPenaltyPermillePerTen: number;
    readonly fatigueSpeedPenaltyPermillePerTen: number;
    readonly maximumErrorChancePermille: number;
    readonly skillErrorReductionPermillePerLevel: number;
    readonly skillSpeedReductionPermillePerLevel: number;
  };
  readonly products: {
    readonly food: RetailProductDefinition;
    readonly fuel: RetailProductDefinition;
  };
  readonly trafficWindows: readonly TrafficWindowDefinition[];
}

export interface BusinessPrices {
  readonly food: number;
  readonly fuel: number;
}

export type CustomerStage =
  | { readonly type: 'checkout-queue' }
  | {
      readonly remainingClockUnits: number;
      readonly performance: ServicePerformanceSnapshot;
      readonly type: 'checkout-service';
      readonly unitPrice: number;
    }
  | { readonly type: 'pump-queue' }
  | {
      readonly remainingClockUnits: number;
      readonly performance: ServicePerformanceSnapshot;
      readonly type: 'pump-service';
      readonly unitPrice: number;
    };

export interface RoutineCustomer {
  readonly arrivedAtClockUnit: number;
  readonly foodUnitsRequested: number;
  readonly fuelUnitsRequested: number;
  readonly id: string;
  readonly revenue: number;
  readonly sequence: number;
  readonly stage: CustomerStage;
}

export interface BusinessState {
  readonly activeCustomers: readonly RoutineCustomer[];
  readonly completedCustomerCount: number;
  readonly nextCustomerSequence: number;
  readonly prices: BusinessPrices;
  readonly performanceBaselineReason: 'legacy-save-migration' | 'scenario-start';
  readonly performanceStartsAtClockUnit: number;
  readonly trafficBaselineReason: 'legacy-save-migration' | 'scenario-start';
  readonly trafficStartsAtClockUnit: number;
}

export type BusinessOutcome =
  | {
      readonly customerId: string;
      readonly performance: ServicePerformanceSnapshot;
      readonly product: 'food' | 'fuel';
      readonly type: 'service-started';
      readonly unitPrice: number;
    }
  | {
      readonly customerId: string;
      readonly employeeId: string;
      readonly product: 'food' | 'fuel';
      readonly remainingClockUnits: number;
      readonly type: 'service-interrupted';
    }
  | {
      readonly customerId: string;
      readonly foodUnitsRequested: number;
      readonly fuelUnitsRequested: number;
      readonly type: 'customer-arrived';
    }
  | {
      readonly cashAfter: number;
      readonly cashBefore: number;
      readonly customerId: string;
      readonly product: 'food' | 'fuel';
      readonly requestedUnits: number;
      readonly revenue: number;
      readonly soldUnits: number;
      readonly stockAfter: number;
      readonly stockBefore: number;
      readonly type: 'sale-completed';
      readonly unitPrice: number;
    }
  | {
      readonly customerId: string;
      readonly revenue: number;
      readonly type: 'customer-completed';
    };

export interface BusinessStaffing {
  readonly checkout: Pick<Employee, 'fatigue' | 'id' | 'skills'> | undefined;
  readonly pumps: Pick<Employee, 'fatigue' | 'id' | 'skills'> | undefined;
}

export interface AdvanceBusinessResult {
  readonly business: BusinessState;
  readonly outcomes: readonly BusinessOutcome[];
  readonly resources: Resources;
  readonly rng: SeededRandomState;
}

const assertProductDefinition = (
  product: RetailProductDefinition,
  name: string,
): void => {
  if (!/^[a-z0-9-]+$/u.test(product.serviceSkillId)) {
    throw new RangeError(`${name} service skill must be a technical ID.`);
  }
  const integers = [
    product.baseDemandUnits,
    product.defaultUnitPrice,
    product.demandStepUnits,
    product.demandVariationCount,
    product.errorReworkClockUnits,
    product.maximumUnitPrice,
    product.serviceClockUnits,
    product.wholesaleUnitCost,
    product.baseErrorChancePermille,
  ];
  if (integers.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError(`${name} retail values must be non-negative safe integers.`);
  }
  if (
    product.defaultUnitPrice < 1 ||
    product.demandVariationCount < 1 ||
    product.maximumUnitPrice < product.defaultUnitPrice ||
    product.serviceClockUnits < 1 ||
    product.wholesaleUnitCost < 1
  ) {
    throw new RangeError(`${name} retail values are outside supported bounds.`);
  }
  const maximumDemand =
    product.baseDemandUnits +
    (product.demandVariationCount - 1) * product.demandStepUnits;
  if (!Number.isSafeInteger(maximumDemand)) {
    throw new RangeError(`${name} maximum customer demand exceeds safe integers.`);
  }
};

export const assertBusinessDefinition = (definition: BusinessDefinition): void => {
  assertProductDefinition(definition.products.food, 'food');
  assertProductDefinition(definition.products.fuel, 'fuel');
  let previousEnd = -1;
  for (const window of definition.trafficWindows) {
    if (
      !Number.isSafeInteger(window.startMinute) ||
      !Number.isSafeInteger(window.endMinute) ||
      !Number.isSafeInteger(window.intervalMinutes) ||
      window.startMinute < 0 ||
      window.endMinute > MINUTES_PER_DAY ||
      window.startMinute >= window.endMinute ||
      window.intervalMinutes < 1 ||
      window.startMinute < previousEnd
    ) {
      throw new RangeError('Traffic windows must be canonical, disjoint day ranges.');
    }
    previousEnd = window.endMinute;
  }
  if (definition.trafficWindows.length === 0) {
    throw new RangeError('At least one traffic window is required.');
  }
  const rules = definition.performanceRules;
  const ruleValues = Object.values(rules);
  if (
    ruleValues.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    rules.maximumErrorChancePermille > 1000
  ) {
    throw new RangeError('Business performance rules are outside supported bounds.');
  }
};

export const createInitialBusinessState = (
  definition: BusinessDefinition,
  trafficStartsAtClockUnit = 8 * 60 * CLOCK_UNITS_PER_MINUTE,
  trafficBaselineReason: BusinessState['trafficBaselineReason'] = 'scenario-start',
): BusinessState => {
  assertBusinessDefinition(definition);
  if (!Number.isSafeInteger(trafficStartsAtClockUnit) || trafficStartsAtClockUnit < 0) {
    throw new RangeError(
      'trafficStartsAtClockUnit must be a non-negative safe integer.',
    );
  }
  return {
    activeCustomers: [],
    completedCustomerCount: 0,
    nextCustomerSequence: 0,
    performanceBaselineReason: trafficBaselineReason,
    performanceStartsAtClockUnit: trafficStartsAtClockUnit,
    prices: {
      food: definition.products.food.defaultUnitPrice,
      fuel: definition.products.fuel.defaultUnitPrice,
    },
    trafficBaselineReason,
    trafficStartsAtClockUnit,
  };
};

export const setBusinessPrice = (
  business: BusinessState,
  definition: BusinessDefinition,
  product: 'food' | 'fuel',
  unitPrice: number,
): BusinessState => {
  if (
    !Number.isSafeInteger(unitPrice) ||
    unitPrice < 1 ||
    unitPrice > definition.products[product].maximumUnitPrice
  ) {
    throw new RangeError('unitPrice is outside the authored product bounds.');
  }
  return {
    ...business,
    prices: { ...business.prices, [product]: unitPrice },
  };
};

export const demandForCustomerSequence = (
  definition: BusinessDefinition,
  sequence: number,
): Pick<RoutineCustomer, 'foodUnitsRequested' | 'fuelUnitsRequested'> => {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError('Customer sequence must be a non-negative safe integer.');
  }
  return {
    foodUnitsRequested:
      definition.products.food.baseDemandUnits +
      (sequence % definition.products.food.demandVariationCount) *
        definition.products.food.demandStepUnits,
    fuelUnitsRequested:
      definition.products.fuel.baseDemandUnits +
      (sequence % definition.products.fuel.demandVariationCount) *
        definition.products.fuel.demandStepUnits,
  };
};

export const isScheduledCustomerArrival = (
  definition: BusinessDefinition,
  absoluteClockUnit: number,
): boolean => {
  if (absoluteClockUnit % CLOCK_UNITS_PER_MINUTE !== 0) return false;
  const minuteOfDay =
    Math.floor(absoluteClockUnit / CLOCK_UNITS_PER_MINUTE) % MINUTES_PER_DAY;
  return definition.trafficWindows.some(
    ({ endMinute, intervalMinutes, startMinute }) =>
      minuteOfDay >= startMinute &&
      minuteOfDay < endMinute &&
      (minuteOfDay - startMinute) % intervalMinutes === 0,
  );
};

export const assertBusinessState = (
  definition: BusinessDefinition,
  business: BusinessState,
  absoluteClockUnit: number,
): void => {
  assertBusinessDefinition(definition);
  if (!Number.isSafeInteger(absoluteClockUnit) || absoluteClockUnit < 0) {
    throw new RangeError('Business clock must be a non-negative safe integer.');
  }
  for (const product of ['food', 'fuel'] as const) {
    const price = business.prices[product];
    if (
      !Number.isSafeInteger(price) ||
      price < 1 ||
      price > definition.products[product].maximumUnitPrice
    ) {
      throw new RangeError(`${product} price is outside its authored bounds.`);
    }
  }
  if (
    !Number.isSafeInteger(business.completedCustomerCount) ||
    business.completedCustomerCount < 0 ||
    !Number.isSafeInteger(business.nextCustomerSequence) ||
    business.nextCustomerSequence < 0 ||
    business.completedCustomerCount + business.activeCustomers.length !==
      business.nextCustomerSequence
  ) {
    throw new RangeError('Business customer counters do not reconcile.');
  }
  if (
    !Number.isSafeInteger(business.trafficStartsAtClockUnit) ||
    business.trafficStartsAtClockUnit < 0 ||
    business.trafficStartsAtClockUnit > absoluteClockUnit + 1
  ) {
    throw new RangeError('Business traffic baseline is invalid.');
  }
  const scenarioStartClockUnit = 8 * 60 * CLOCK_UNITS_PER_MINUTE;
  if (
    (business.trafficBaselineReason === 'scenario-start' &&
      business.trafficStartsAtClockUnit !== scenarioStartClockUnit) ||
    (business.trafficBaselineReason === 'legacy-save-migration' &&
      business.trafficStartsAtClockUnit <= scenarioStartClockUnit)
  ) {
    throw new RangeError('Business traffic baseline reason is inconsistent.');
  }
  if (
    !Number.isSafeInteger(business.performanceStartsAtClockUnit) ||
    business.performanceStartsAtClockUnit < 0 ||
    business.performanceStartsAtClockUnit > absoluteClockUnit + 1
  ) {
    throw new RangeError('Business performance baseline is invalid.');
  }
  const scenarioStartClockUnitForPerformance = 8 * 60 * CLOCK_UNITS_PER_MINUTE;
  if (
    (business.performanceBaselineReason === 'scenario-start' &&
      business.performanceStartsAtClockUnit !== scenarioStartClockUnitForPerformance) ||
    (business.performanceBaselineReason === 'legacy-save-migration' &&
      business.performanceStartsAtClockUnit <= scenarioStartClockUnitForPerformance)
  ) {
    throw new RangeError('Business performance baseline reason is inconsistent.');
  }

  const customerIds = new Set<string>();
  const customerSequences = new Set<number>();
  for (const customer of business.activeCustomers) {
    const expectedDemand = demandForCustomerSequence(definition, customer.sequence);
    if (
      customer.sequence >= business.nextCustomerSequence ||
      customer.id !== `routine-customer-${String(customer.sequence)}` ||
      customerIds.has(customer.id) ||
      customerSequences.has(customer.sequence) ||
      !Number.isSafeInteger(customer.arrivedAtClockUnit) ||
      customer.arrivedAtClockUnit < 0 ||
      customer.arrivedAtClockUnit > absoluteClockUnit ||
      !isScheduledCustomerArrival(definition, customer.arrivedAtClockUnit) ||
      customer.foodUnitsRequested !== expectedDemand.foodUnitsRequested ||
      customer.fuelUnitsRequested !== expectedDemand.fuelUnitsRequested ||
      !Number.isSafeInteger(customer.revenue) ||
      customer.revenue < 0
    ) {
      throw new RangeError('Active customer state does not match authored demand.');
    }
    customerIds.add(customer.id);
    customerSequences.add(customer.sequence);

    if (
      customer.stage.type === 'pump-service' ||
      customer.stage.type === 'checkout-service'
    ) {
      const product = customer.stage.type === 'pump-service' ? 'fuel' : 'food';
      if (
        !Number.isSafeInteger(customer.stage.remainingClockUnits) ||
        customer.stage.remainingClockUnits < 1 ||
        customer.stage.remainingClockUnits >
          customer.stage.performance.totalClockUnits ||
        !Number.isSafeInteger(customer.stage.unitPrice) ||
        customer.stage.unitPrice < 1 ||
        customer.stage.unitPrice > definition.products[product].maximumUnitPrice
      ) {
        throw new RangeError('Active customer service state is invalid.');
      }
      const performance = customer.stage.performance;
      const recalculated = calculateServicePerformance(
        {
          fatigue: performance.fatigue,
          id: performance.employeeId,
          skills: [{ id: performance.skillId, level: performance.skillLevel }],
        },
        definition.products[product],
        definition.performanceRules,
        performance.errorRoll,
        performance.rngDrawCount,
      );
      if (
        !Number.isSafeInteger(performance.rngDrawCount) ||
        performance.rngDrawCount < 1 ||
        JSON.stringify(performance) !== JSON.stringify(recalculated)
      ) {
        throw new RangeError('Active customer performance snapshot is invalid.');
      }
    }
  }
};

const startFirstQueuedCustomer = (
  customers: readonly RoutineCustomer[],
  queue: 'checkout-queue' | 'pump-queue',
  service: 'checkout-service' | 'pump-service',
  definition: BusinessDefinition,
  employee: Pick<Employee, 'fatigue' | 'id' | 'skills'>,
  product: 'food' | 'fuel',
  rng: SeededRandomState,
  unitPrice: number,
): {
  readonly customers: RoutineCustomer[];
  readonly outcome?: BusinessOutcome;
  readonly rng: SeededRandomState;
} => {
  const first = customers.find((customer) => customer.stage.type === queue);
  if (first === undefined) return { customers: [...customers], rng };
  const random = drawRandomInteger(rng, 0, 1000);
  const performance = calculateServicePerformance(
    employee,
    definition.products[product],
    definition.performanceRules,
    random.value,
    random.rng.drawCount,
  );
  return {
    customers: customers.map((customer) =>
      customer.id === first.id
        ? {
            ...customer,
            stage: {
              performance,
              remainingClockUnits: performance.totalClockUnits,
              type: service,
              unitPrice,
            },
          }
        : customer,
    ),
    outcome: {
      customerId: first.id,
      performance,
      product,
      type: 'service-started',
      unitPrice,
    },
    rng: random.rng,
  };
};

const safeAdd = (left: number, right: number, name: string): number => {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`${name} exceeded the non-negative safe integer range.`);
  }
  return total;
};

export const advanceBusinessByClockUnit = (
  business: BusinessState,
  definition: BusinessDefinition,
  resources: Readonly<Resources>,
  absoluteClockUnit: number,
  staffing: BusinessStaffing,
  rng: SeededRandomState,
): AdvanceBusinessResult => {
  const pumpsEmployee = staffing.pumps;
  const checkoutEmployee = staffing.checkout;
  const hasScheduledArrival =
    absoluteClockUnit >= business.trafficStartsAtClockUnit &&
    isScheduledCustomerArrival(definition, absoluteClockUnit);
  const hasActiveService = business.activeCustomers.some(
    (customer) =>
      customer.stage.type === 'pump-service' ||
      customer.stage.type === 'checkout-service',
  );

  if (
    !hasScheduledArrival &&
    !hasActiveService &&
    pumpsEmployee === undefined &&
    checkoutEmployee === undefined
  ) {
    return { business, outcomes: [], resources, rng };
  }

  let nextRng = rng;
  let customers = business.activeCustomers.map((customer) => ({
    ...customer,
    stage: { ...customer.stage },
  }));
  let nextResources: Resources = { ...resources };
  const outcomes: BusinessOutcome[] = [];
  let nextCustomerSequence = business.nextCustomerSequence;
  let completedCustomerCount = business.completedCustomerCount;

  if (hasScheduledArrival) {
    const demand = demandForCustomerSequence(definition, nextCustomerSequence);
    const customer: RoutineCustomer = {
      arrivedAtClockUnit: absoluteClockUnit,
      ...demand,
      id: `routine-customer-${String(nextCustomerSequence)}`,
      revenue: 0,
      sequence: nextCustomerSequence,
      stage: { type: 'pump-queue' },
    };
    customers.push(customer);
    nextCustomerSequence += 1;
    outcomes.push({ customerId: customer.id, ...demand, type: 'customer-arrived' });
  }

  customers = customers.map((customer): RoutineCustomer => {
    if (
      customer.stage.type !== 'pump-service' &&
      customer.stage.type !== 'checkout-service'
    ) {
      return customer;
    }
    const product = customer.stage.type === 'pump-service' ? 'fuel' : 'food';
    const employee = product === 'fuel' ? pumpsEmployee : checkoutEmployee;
    if (employee?.id === customer.stage.performance.employeeId) return customer;
    outcomes.push({
      customerId: customer.id,
      employeeId: customer.stage.performance.employeeId,
      product,
      remainingClockUnits: customer.stage.remainingClockUnits,
      type: 'service-interrupted',
    });
    return {
      ...customer,
      stage: { type: product === 'fuel' ? 'pump-queue' : 'checkout-queue' },
    };
  });

  if (
    pumpsEmployee !== undefined &&
    !customers.some((customer) => customer.stage.type === 'pump-service')
  ) {
    const started = startFirstQueuedCustomer(
      customers,
      'pump-queue',
      'pump-service',
      definition,
      pumpsEmployee,
      'fuel',
      nextRng,
      business.prices.fuel,
    );
    customers = started.customers;
    nextRng = started.rng;
    if (started.outcome !== undefined) outcomes.push(started.outcome);
  }
  if (
    checkoutEmployee !== undefined &&
    !customers.some((customer) => customer.stage.type === 'checkout-service')
  ) {
    const started = startFirstQueuedCustomer(
      customers,
      'checkout-queue',
      'checkout-service',
      definition,
      checkoutEmployee,
      'food',
      nextRng,
      business.prices.food,
    );
    customers = started.customers;
    nextRng = started.rng;
    if (started.outcome !== undefined) outcomes.push(started.outcome);
  }

  const completedIds = new Set<string>();
  customers = customers.map((customer): RoutineCustomer => {
    if (
      customer.stage.type !== 'pump-service' &&
      customer.stage.type !== 'checkout-service'
    ) {
      return customer;
    }
    if (customer.stage.remainingClockUnits > 1) {
      return {
        ...customer,
        stage: {
          ...customer.stage,
          remainingClockUnits: customer.stage.remainingClockUnits - 1,
        },
      };
    }

    const product = customer.stage.type === 'pump-service' ? 'fuel' : 'food';
    const requestedUnits =
      product === 'fuel' ? customer.fuelUnitsRequested : customer.foodUnitsRequested;
    const soldUnits = Math.min(requestedUnits, nextResources[product]);
    const unitPrice = customer.stage.unitPrice;
    const revenue = soldUnits * unitPrice;
    const cashBefore = nextResources.cash;
    const stockBefore = nextResources[product];
    nextResources = {
      ...nextResources,
      cash: safeAdd(nextResources.cash, revenue, 'cash'),
      [product]: nextResources[product] - soldUnits,
    };
    outcomes.push({
      cashAfter: nextResources.cash,
      cashBefore,
      customerId: customer.id,
      product,
      requestedUnits,
      revenue,
      soldUnits,
      stockAfter: nextResources[product],
      stockBefore,
      type: 'sale-completed',
      unitPrice,
    });
    const nextRevenue = safeAdd(customer.revenue, revenue, 'customer revenue');
    if (product === 'fuel' && customer.foodUnitsRequested > 0) {
      return {
        ...customer,
        revenue: nextRevenue,
        stage: { type: 'checkout-queue' },
      };
    }
    completedIds.add(customer.id);
    completedCustomerCount += 1;
    outcomes.push({
      customerId: customer.id,
      revenue: nextRevenue,
      type: 'customer-completed',
    });
    return { ...customer, revenue: nextRevenue };
  });

  return {
    business: {
      activeCustomers: customers.filter((customer) => !completedIds.has(customer.id)),
      completedCustomerCount,
      nextCustomerSequence,
      performanceBaselineReason: business.performanceBaselineReason,
      performanceStartsAtClockUnit: business.performanceStartsAtClockUnit,
      prices: { ...business.prices },
      trafficBaselineReason: business.trafficBaselineReason,
      trafficStartsAtClockUnit: business.trafficStartsAtClockUnit,
    },
    outcomes,
    resources: nextResources,
    rng: nextRng,
  };
};
