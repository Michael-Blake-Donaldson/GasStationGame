import { applyHourlyFlow } from './advanceSimulation';
import {
  createInitialBusinessState,
  demandForCustomerSequence,
  isScheduledCustomerArrival,
} from './business';
import {
  calculateServicePerformance,
  type ServicePerformanceSnapshot,
} from './employeePerformance';
import {
  CLOCK_UNITS_PER_MINUTE,
  effectiveTimeMode,
  phaseForClockUnit,
  wholeMinuteForClockUnit,
} from './clock';
import { createInitialState } from './createInitialState';
import {
  checkAuthoredPlotOccupancy,
  checkFlexibleOccupancy,
  createStationOccupancyState,
  type GridCoordinate,
  type PlacedOccupant,
  type StationOccupancyState,
} from './grid';
import { findJobRoute, MOVEMENT_CLOCK_UNITS_PER_CELL } from './jobs';
import type { JobDefinition, SimulationContext } from './scenario';
import type {
  DomainEvent,
  ResourceChange,
  Resources,
  SimulationPhase,
  SimulationState,
  TimeMode,
} from './types';
import { stringifyCanonicalJson } from '../serialization/canonicalJson';

interface TrackedAssignment {
  readonly assignedAtClockUnit: number;
  readonly assignmentId: string;
  readonly destination: GridCoordinate;
  readonly employeeId: string;
  readonly job: JobDefinition;
  readonly path: readonly GridCoordinate[];
  readonly startPosition: GridCoordinate;
  startedAtClockUnit?: number;
  status: 'awaiting-start' | 'finished' | 'traveling' | 'working';
}

const coordinatesEqual = (left: GridCoordinate, right: GridCoordinate): boolean =>
  left.x === right.x && left.z === right.z;

const resourceChangesEqual = (
  left: readonly ResourceChange[],
  right: readonly ResourceChange[],
): boolean =>
  left.length === right.length &&
  left.every((change, index) => {
    const expected = right[index];
    if (expected === undefined) return false;
    return (
      change.after === expected.after &&
      change.appliedDelta === expected.appliedDelta &&
      change.before === expected.before &&
      change.requestedDelta === expected.requestedDelta &&
      change.resource === expected.resource
    );
  });

const assertClockEvents = (state: SimulationState): void => {
  const phaseEvents = state.eventLedger.filter(
    (event): event is Extract<DomainEvent, { type: 'phase.entered' }> =>
      event.type === 'phase.entered',
  );
  const expectedPhaseEvents: {
    readonly absoluteClockUnit: number;
    readonly currentPhase: SimulationPhase;
    readonly previousPhase: SimulationPhase;
  }[] = [];
  const startClockUnit = 8 * 60 * CLOCK_UNITS_PER_MINUTE;
  for (
    let clockUnit = startClockUnit + CLOCK_UNITS_PER_MINUTE;
    clockUnit <= state.absoluteClockUnit;
    clockUnit += CLOCK_UNITS_PER_MINUTE
  ) {
    const previousPhase = phaseForClockUnit(clockUnit - 1);
    const currentPhase = phaseForClockUnit(clockUnit);
    if (currentPhase !== previousPhase) {
      expectedPhaseEvents.push({
        absoluteClockUnit: clockUnit,
        currentPhase,
        previousPhase,
      });
    }
  }
  if (phaseEvents.length !== expectedPhaseEvents.length) {
    throw new RangeError('Phase events do not cover every crossed boundary.');
  }
  for (const [index, event] of phaseEvents.entries()) {
    const expected = expectedPhaseEvents[index];
    if (expected === undefined) {
      throw new RangeError('Phase event does not match its clock boundary.');
    }
    if (
      event.absoluteClockUnit !== expected.absoluteClockUnit ||
      event.currentPhase !== expected.currentPhase ||
      event.previousPhase !== expected.previousPhase
    ) {
      throw new RangeError('Phase event does not match its clock boundary.');
    }
  }

  const nightEvents = state.eventLedger.filter(
    (event): event is Extract<DomainEvent, { type: 'night.completed' }> =>
      event.type === 'night.completed',
  );
  const expectedNightBoundaries = expectedPhaseEvents.filter(
    ({ currentPhase }) => currentPhase === 'morning',
  );
  if (nightEvents.length !== expectedNightBoundaries.length) {
    throw new RangeError('Night completion events do not match morning boundaries.');
  }
  for (const [index, event] of nightEvents.entries()) {
    const expected = expectedNightBoundaries[index];
    if (expected === undefined) {
      throw new RangeError('Night completion event has invalid boundary facts.');
    }
    if (
      event.absoluteClockUnit !== expected.absoluteClockUnit ||
      event.completedNights !== index + 1
    ) {
      throw new RangeError('Night completion event has invalid boundary facts.');
    }
  }
};

const assertResourceHistory = (
  context: SimulationContext,
  state: SimulationState,
): void => {
  let resources: Readonly<Resources> = createInitialState(
    context.scenario,
    state.seed,
    state.targetNightCount,
  ).resources;
  const expectedFlows: {
    readonly absoluteClockUnit: number;
    readonly reason: 'day-hourly-flow' | 'night-hourly-flow';
  }[] = [];
  const startMinute = 8 * 60;
  const finalMinute = wholeMinuteForClockUnit(state.absoluteClockUnit);
  let scheduledResources = resources;
  for (let minute = startMinute + 1; minute <= finalMinute; minute += 1) {
    if (minute % 60 !== 0) continue;
    const absoluteClockUnit = minute * CLOCK_UNITS_PER_MINUTE;
    const phase = phaseForClockUnit(absoluteClockUnit);
    const flow = applyHourlyFlow(scheduledResources, phase);
    scheduledResources = flow.resources;
    if (flow.changes.length > 0) {
      expectedFlows.push({
        absoluteClockUnit,
        reason: phase === 'night' ? 'night-hourly-flow' : 'day-hourly-flow',
      });
    }
  }
  let nextExpectedFlowIndex = 0;
  for (const event of state.eventLedger) {
    if (event.type === 'resources.changed') {
      const expected = expectedFlows[nextExpectedFlowIndex];
      const phase = phaseForClockUnit(event.absoluteClockUnit);
      const flow = applyHourlyFlow(resources, phase);
      if (expected === undefined) {
        throw new RangeError('Resource event does not match scheduled flow.');
      }
      if (
        event.absoluteClockUnit !== expected.absoluteClockUnit ||
        event.reason !== expected.reason ||
        !resourceChangesEqual(event.changes, flow.changes)
      ) {
        throw new RangeError('Resource event does not match scheduled flow.');
      }
      resources = flow.resources;
      nextExpectedFlowIndex += 1;
      continue;
    }
    if (event.type === 'sale.completed') {
      const expectedRevenue = event.soldUnits * event.unitPrice;
      const expectedCashAfter = resources.cash + expectedRevenue;
      const expectedStockAfter = resources[event.product] - event.soldUnits;
      if (
        !Number.isSafeInteger(expectedRevenue) ||
        !Number.isSafeInteger(expectedCashAfter) ||
        event.soldUnits > event.requestedUnits ||
        event.cashBefore !== resources.cash ||
        event.cashAfter !== expectedCashAfter ||
        event.revenue !== expectedRevenue ||
        event.stockBefore !== resources[event.product] ||
        event.stockAfter !== expectedStockAfter ||
        expectedStockAfter < 0
      ) {
        throw new RangeError('Sale event does not reconcile with resource history.');
      }
      resources = {
        ...resources,
        cash: expectedCashAfter,
        [event.product]: expectedStockAfter,
      };
      continue;
    }
    if (event.type === 'inventory.ordered') {
      const expectedTotalCost = event.quantity * event.wholesaleUnitCost;
      const expectedCashAfter = resources.cash - expectedTotalCost;
      const expectedStockAfter = resources[event.product] + event.quantity;
      if (
        !Number.isSafeInteger(expectedTotalCost) ||
        !Number.isSafeInteger(expectedStockAfter) ||
        event.totalCost !== expectedTotalCost ||
        event.cashBefore !== resources.cash ||
        event.cashAfter !== expectedCashAfter ||
        event.stockBefore !== resources[event.product] ||
        event.stockAfter !== expectedStockAfter ||
        expectedCashAfter < 0
      ) {
        throw new RangeError(
          'Inventory event does not reconcile with resource history.',
        );
      }
      resources = {
        ...resources,
        cash: expectedCashAfter,
        [event.product]: expectedStockAfter,
      };
      continue;
    }
    if (event.type === 'construction.placed') {
      const blueprint = context.scenario.construction.find(
        ({ id }) => id === event.blueprintId,
      );
      if (blueprint === undefined) {
        throw new RangeError('Construction cost references an unknown blueprint.');
      }
      const expected = [
        {
          after: resources.cash - blueprint.cost.cash,
          before: resources.cash,
          cost: blueprint.cost.cash,
          resource: 'cash' as const,
        },
        {
          after: resources.scrap - blueprint.cost.scrap,
          before: resources.scrap,
          cost: blueprint.cost.scrap,
          resource: 'scrap' as const,
        },
      ] as const;
      if (
        expected.some(({ after }) => after < 0 || !Number.isSafeInteger(after)) ||
        JSON.stringify(event.costChanges) !== JSON.stringify(expected)
      ) {
        throw new RangeError(
          'Construction event does not reconcile with resource history.',
        );
      }
      resources = {
        ...resources,
        cash: expected[0].after,
        scrap: expected[1].after,
      };
    }
  }
  if (nextExpectedFlowIndex !== expectedFlows.length) {
    throw new RangeError('Resource events do not cover every scheduled flow.');
  }
  for (const key of Object.keys(resources) as (keyof Resources)[]) {
    if (state.resources[key] !== resources[key]) {
      throw new RangeError('Final resources do not reconcile with the event ledger.');
    }
  }
};

const appendOccupant = (
  occupancy: StationOccupancyState,
  occupant: PlacedOccupant,
): StationOccupancyState => ({
  ...occupancy,
  occupants: [...occupancy.occupants, occupant].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  ),
});

const assertConstructionHistory = (
  context: SimulationContext,
  state: SimulationState,
): void => {
  const grid = context.scenario.stationGridDefinition;
  let occupancy = createStationOccupancyState(grid);
  let nextConstructionSequence = 0;

  for (const event of state.eventLedger) {
    if (event.type !== 'construction.placed') continue;
    const blueprint = context.scenario.construction.find(
      ({ id }) => id === event.blueprintId,
    );
    const expectedOccupantId = `built-${event.blueprintId}-${String(nextConstructionSequence)}`;
    if (
      blueprint === undefined ||
      event.constructionSequence !== nextConstructionSequence ||
      event.occupant.id !== expectedOccupantId ||
      phaseForClockUnit(event.absoluteClockUnit) !== 'day'
    ) {
      throw new RangeError('Construction event identity is not causally available.');
    }

    const check =
      blueprint.placement === 'authored-plot' &&
      event.occupant.placement === 'authored-plot' &&
      event.occupant.facilityId === blueprint.facilityId
        ? checkAuthoredPlotOccupancy(grid, occupancy, event.occupant)
        : blueprint.placement === 'flexible' &&
            event.occupant.placement === 'flexible' &&
            event.occupant.structureId === blueprint.structureId &&
            event.occupant.footprint.width === blueprint.footprint.width &&
            event.occupant.footprint.height === blueprint.footprint.height &&
            blueprint.allowedRotations.includes(event.occupant.rotation)
          ? checkFlexibleOccupancy(grid, occupancy, event.occupant)
          : undefined;
    if (
      check === undefined ||
      !check.ok ||
      JSON.stringify(event.cells) !== JSON.stringify(check.cells)
    ) {
      throw new RangeError('Construction event placement facts are invalid.');
    }
    occupancy = appendOccupant(occupancy, event.occupant);
    nextConstructionSequence += 1;
  }

  if (
    state.nextConstructionSequence !== nextConstructionSequence ||
    stringifyCanonicalJson({
      ...state.stationOccupancy,
      occupants: [...state.stationOccupancy.occupants].sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      ),
    }) !== stringifyCanonicalJson(occupancy)
  ) {
    throw new RangeError(
      'Final construction state does not reconcile with its ledger.',
    );
  }
};

const assertTimeModeHistory = (state: SimulationState): void => {
  let mode: TimeMode = 'paused';
  for (const event of state.eventLedger) {
    if (event.type !== 'time-mode.changed') continue;
    const phase = phaseForClockUnit(event.absoluteClockUnit);
    const previousPhase = phaseForClockUnit(Math.max(0, event.absoluteClockUnit - 1));
    const effectivePreviousPhase =
      event.reason === 'night-pause-converted' &&
      event.previousMode === 'paused' &&
      previousPhase !== phase
        ? previousPhase
        : phase;
    const expectedCurrentMode =
      phase === 'night' && event.requestedMode === 'paused'
        ? 'slow'
        : event.requestedMode;
    const expectedReason =
      phase === 'night' && event.requestedMode === 'paused'
        ? 'night-pause-converted'
        : phase === 'night' && event.requestedMode === 'fast'
          ? 'night-fast-capped'
          : 'player-request';
    if (
      event.previousMode !== mode ||
      event.currentMode !== expectedCurrentMode ||
      event.currentMode === event.previousMode ||
      event.effectivePreviousMode !== effectiveTimeMode(mode, effectivePreviousPhase) ||
      event.effectiveCurrentMode !== effectiveTimeMode(expectedCurrentMode, phase) ||
      event.reason !== expectedReason
    ) {
      throw new RangeError('Time-mode event does not match command semantics.');
    }
    mode = event.currentMode;
  }
  if (mode !== state.timeMode) {
    throw new RangeError('Final time mode does not reconcile with the event ledger.');
  }
};

interface TrackedCustomer {
  activeService?: {
    readonly performance: ServicePerformanceSnapshot;
    readonly product: 'food' | 'fuel';
    readonly startedAtClockUnit: number;
    readonly unitPrice: number;
  };
  readonly expectedProducts: readonly ('food' | 'fuel')[];
  readonly sequence: number;
  nextProductIndex: number;
  revenue: number;
  status: 'active' | 'completed';
}

const assertBusinessHistory = (
  context: SimulationContext,
  state: SimulationState,
): void => {
  const definition = context.scenario.business;
  const initialBusiness = createInitialBusinessState(definition);
  const prices = { ...initialBusiness.prices };
  const customers = new Map<string, TrackedCustomer>();
  let nextCustomerSequence = 0;
  let completedCustomerCount = 0;
  const activeJobsByEmployee = new Map<string, string>();
  let previousServiceRngDrawCount = 0;

  for (const event of state.eventLedger) {
    if (event.type === 'job.started') {
      activeJobsByEmployee.set(event.employeeId, event.jobId);
      continue;
    }
    if (event.type === 'job.cancelled' || event.type === 'job.completed') {
      activeJobsByEmployee.delete(event.employeeId);
      continue;
    }
    if (event.type === 'customer.arrived') {
      const demand = demandForCustomerSequence(definition, nextCustomerSequence);
      const customerId = `routine-customer-${String(nextCustomerSequence)}`;
      if (
        event.customerId !== customerId ||
        event.foodUnitsRequested !== demand.foodUnitsRequested ||
        event.fuelUnitsRequested !== demand.fuelUnitsRequested ||
        !isScheduledCustomerArrival(definition, event.absoluteClockUnit) ||
        customers.has(customerId)
      ) {
        throw new RangeError('Customer arrival does not match authored traffic.');
      }
      customers.set(customerId, {
        expectedProducts: demand.foodUnitsRequested > 0 ? ['fuel', 'food'] : ['fuel'],
        nextProductIndex: 0,
        revenue: 0,
        sequence: nextCustomerSequence,
        status: 'active',
      });
      nextCustomerSequence += 1;
      continue;
    }
    if (event.type === 'service.started') {
      const customer = customers.get(event.customerId);
      const employee = state.employees.find(
        ({ id }) => id === event.performance.employeeId,
      );
      const expectedProduct = customer?.expectedProducts[customer.nextProductIndex];
      const expectedJobId = event.product === 'fuel' ? 'staff-pumps' : 'staff-checkout';
      if (
        customer?.status !== 'active' ||
        customer.activeService !== undefined ||
        expectedProduct !== event.product ||
        employee === undefined ||
        activeJobsByEmployee.get(employee.id) !== expectedJobId ||
        event.absoluteClockUnit < state.business.performanceStartsAtClockUnit ||
        event.unitPrice !== prices[event.product] ||
        event.performance.rngDrawCount <= previousServiceRngDrawCount ||
        event.performance.rngDrawCount > state.rng.drawCount
      ) {
        throw new RangeError('Service start is not causally available.');
      }
      const expectedPerformance = calculateServicePerformance(
        employee,
        definition.products[event.product],
        definition.performanceRules,
        event.performance.errorRoll,
        event.performance.rngDrawCount,
      );
      if (JSON.stringify(event.performance) !== JSON.stringify(expectedPerformance)) {
        throw new RangeError('Service performance event does not match its modifiers.');
      }
      customer.activeService = {
        performance: expectedPerformance,
        product: event.product,
        startedAtClockUnit: event.absoluteClockUnit,
        unitPrice: event.unitPrice,
      };
      previousServiceRngDrawCount = event.performance.rngDrawCount;
      continue;
    }
    if (event.type === 'service.interrupted') {
      const customer = customers.get(event.customerId);
      const activeService = customer?.activeService;
      const expectedJobId = event.product === 'fuel' ? 'staff-pumps' : 'staff-checkout';
      const expectedRemaining =
        activeService === undefined
          ? 0
          : activeService.performance.totalClockUnits -
            (event.absoluteClockUnit - activeService.startedAtClockUnit);
      if (
        customer?.status !== 'active' ||
        activeService?.product !== event.product ||
        activeService.performance.employeeId !== event.employeeId ||
        activeJobsByEmployee.get(event.employeeId) === expectedJobId ||
        event.remainingClockUnits !== expectedRemaining ||
        expectedRemaining < 1
      ) {
        throw new RangeError('Service interruption does not match staffing history.');
      }
      delete customer.activeService;
      continue;
    }
    if (event.type === 'sale.completed') {
      const customer = customers.get(event.customerId);
      const expectedProduct = customer?.expectedProducts[customer.nextProductIndex];
      const demand =
        customer === undefined
          ? undefined
          : demandForCustomerSequence(definition, customer.sequence);
      const expectedRequestedUnits =
        event.product === 'fuel'
          ? demand?.fuelUnitsRequested
          : demand?.foodUnitsRequested;
      if (customer === undefined) {
        throw new RangeError('Sale event does not match its customer lifecycle.');
      }
      if (
        customer.status !== 'active' ||
        expectedProduct !== event.product ||
        event.requestedUnits !== expectedRequestedUnits ||
        event.unitPrice < 1 ||
        event.unitPrice > definition.products[event.product].maximumUnitPrice
      ) {
        throw new RangeError('Sale event does not match its customer lifecycle.');
      }
      if (event.absoluteClockUnit >= state.business.performanceStartsAtClockUnit) {
        const activeService = customer.activeService;
        if (
          activeService?.product !== event.product ||
          activeService.unitPrice !== event.unitPrice ||
          event.absoluteClockUnit !==
            activeService.startedAtClockUnit +
              activeService.performance.totalClockUnits -
              1
        ) {
          throw new RangeError('Sale event does not follow its attributed service.');
        }
      }
      const revenue = customer.revenue + event.revenue;
      if (!Number.isSafeInteger(revenue)) {
        throw new RangeError('Customer revenue exceeds the safe integer range.');
      }
      customer.revenue = revenue;
      customer.nextProductIndex += 1;
      delete customer.activeService;
      continue;
    }
    if (event.type === 'customer.completed') {
      const customer = customers.get(event.customerId);
      if (customer === undefined) {
        throw new RangeError('Customer completion does not match its sales.');
      }
      if (
        customer.status !== 'active' ||
        customer.nextProductIndex !== customer.expectedProducts.length ||
        event.revenue !== customer.revenue
      ) {
        throw new RangeError('Customer completion does not match its sales.');
      }
      customer.status = 'completed';
      completedCustomerCount += 1;
      continue;
    }
    if (event.type === 'retail.price-changed') {
      if (
        event.previousUnitPrice !== prices[event.product] ||
        event.currentUnitPrice === event.previousUnitPrice ||
        event.currentUnitPrice < 1 ||
        event.currentUnitPrice > definition.products[event.product].maximumUnitPrice
      ) {
        throw new RangeError(
          'Retail price event does not reconcile with price history.',
        );
      }
      prices[event.product] = event.currentUnitPrice;
    }
  }

  const activeCustomers = [...customers.values()]
    .filter(({ status }) => status === 'active')
    .sort((left, right) => left.sequence - right.sequence);
  let expectedArrivalCount = 0;
  const firstTrafficMinute = Math.ceil(
    state.business.trafficStartsAtClockUnit / CLOCK_UNITS_PER_MINUTE,
  );
  const finalTrafficMinute = wholeMinuteForClockUnit(state.absoluteClockUnit);
  for (let minute = firstTrafficMinute; minute <= finalTrafficMinute; minute += 1) {
    if (isScheduledCustomerArrival(definition, minute * CLOCK_UNITS_PER_MINUTE)) {
      expectedArrivalCount += 1;
    }
  }
  if (
    nextCustomerSequence !== expectedArrivalCount ||
    nextCustomerSequence !== state.business.nextCustomerSequence ||
    completedCustomerCount !== state.business.completedCustomerCount ||
    prices.food !== state.business.prices.food ||
    prices.fuel !== state.business.prices.fuel ||
    activeCustomers.length !== state.business.activeCustomers.length
  ) {
    throw new RangeError('Final business state does not reconcile with its ledger.');
  }
  for (const [index, customer] of activeCustomers.entries()) {
    const finalCustomer = state.business.activeCustomers[index];
    if (finalCustomer === undefined) {
      throw new RangeError('Active customers do not reconcile with their ledger.');
    }
    if (
      finalCustomer.sequence !== customer.sequence ||
      finalCustomer.revenue !== customer.revenue
    ) {
      throw new RangeError('Active customers do not reconcile with their ledger.');
    }
    const isService =
      finalCustomer.stage.type === 'pump-service' ||
      finalCustomer.stage.type === 'checkout-service';
    if (isService) {
      const activeService = customer.activeService;
      const expectedRemaining =
        activeService === undefined
          ? 0
          : activeService.performance.totalClockUnits -
            (state.absoluteClockUnit - activeService.startedAtClockUnit + 1);
      if (
        finalCustomer.stage.performance.employeeId !==
          activeService?.performance.employeeId ||
        JSON.stringify(finalCustomer.stage.performance) !==
          JSON.stringify(activeService.performance) ||
        finalCustomer.stage.unitPrice !== activeService.unitPrice ||
        finalCustomer.stage.remainingClockUnits !== expectedRemaining ||
        expectedRemaining < 1
      ) {
        throw new RangeError('Active service does not reconcile with its start event.');
      }
    } else if (customer.activeService !== undefined) {
      throw new RangeError('Queued customer retains an active service attribution.');
    }
  }
};

const assertAssignmentIdentity = (
  assignment: TrackedAssignment,
  event: {
    readonly assignmentId: string;
    readonly employeeId: string;
    readonly jobId: string;
  },
): void => {
  if (
    event.assignmentId !== assignment.assignmentId ||
    event.employeeId !== assignment.employeeId ||
    event.jobId !== assignment.job.id
  ) {
    throw new RangeError('Job event does not match its assignment identity.');
  }
};

const expectedTravelPosition = (
  assignment: TrackedAssignment,
  remainingPathCells: number,
): GridCoordinate | undefined => {
  const reachedCellCount = assignment.path.length - remainingPathCells;
  return reachedCellCount === 0
    ? assignment.startPosition
    : assignment.path[reachedCellCount - 1];
};

const assertFinalWorkforceHistory = (
  state: SimulationState,
  positions: ReadonlyMap<string, GridCoordinate>,
  activeByEmployee: ReadonlyMap<string, TrackedAssignment>,
): void => {
  for (const employee of state.employees) {
    const assignment = activeByEmployee.get(employee.id);
    if (employee.activity.status === 'idle') {
      const position = positions.get(employee.id);
      if (
        assignment !== undefined ||
        position === undefined ||
        !coordinatesEqual(employee.position, position)
      ) {
        throw new RangeError('Idle employee does not match ledger history.');
      }
      continue;
    }
    if (assignment === undefined) {
      throw new RangeError('Active employee does not match ledger history.');
    }
    if (
      employee.activity.assignmentId !== assignment.assignmentId ||
      employee.activity.jobId !== assignment.job.id ||
      employee.activity.targetId !== assignment.job.targetId
    ) {
      throw new RangeError('Active employee does not match ledger history.');
    }
    if (employee.activity.status === 'working') {
      const startedAtClockUnit = assignment.startedAtClockUnit;
      const expectedRemainingWorkClockUnits =
        startedAtClockUnit === undefined
          ? 0
          : assignment.job.workDurationClockUnits -
            (state.absoluteClockUnit - startedAtClockUnit);
      if (
        assignment.status !== 'working' ||
        !coordinatesEqual(employee.position, assignment.destination) ||
        employee.activity.remainingWorkClockUnits !== expectedRemainingWorkClockUnits ||
        expectedRemainingWorkClockUnits < 1
      ) {
        throw new RangeError('Working employee does not match ledger history.');
      }
      continue;
    }
    const expectedPosition = expectedTravelPosition(
      assignment,
      assignment.path.length - employee.activity.nextPathIndex,
    );
    const elapsedClockUnits = state.absoluteClockUnit - assignment.assignedAtClockUnit;
    if (
      assignment.status !== 'traveling' ||
      elapsedClockUnits < 0 ||
      elapsedClockUnits >= assignment.path.length * MOVEMENT_CLOCK_UNITS_PER_CELL ||
      expectedPosition === undefined ||
      !coordinatesEqual(employee.position, expectedPosition) ||
      employee.activity.nextPathIndex !==
        Math.floor(elapsedClockUnits / MOVEMENT_CLOCK_UNITS_PER_CELL) ||
      employee.activity.movementProgressClockUnits !==
        elapsedClockUnits % MOVEMENT_CLOCK_UNITS_PER_CELL ||
      employee.activity.path.length !== assignment.path.length ||
      employee.activity.path.some(
        (cell, index) =>
          assignment.path[index] === undefined ||
          !coordinatesEqual(cell, assignment.path[index]),
      )
    ) {
      throw new RangeError('Traveling employee does not match ledger history.');
    }
  }
};

const assertJobHistory = (context: SimulationContext, state: SimulationState): void => {
  const positions = new Map(
    context.scenario.initialEmployeePositions.map(({ employeeId, position }) => [
      employeeId,
      { ...position },
    ]),
  );
  const assignments = new Map<string, TrackedAssignment>();
  const activeByEmployee = new Map<string, TrackedAssignment>();
  const activeByJob = new Map<string, TrackedAssignment>();
  let occupancy = createStationOccupancyState(context.scenario.stationGridDefinition);
  let previousEvent: DomainEvent | undefined;

  for (const event of state.eventLedger) {
    if (event.type === 'construction.placed') {
      const constructionCells = new Set(
        event.cells.map(({ x, z }) => `${String(x)},${String(z)}`),
      );
      for (const employee of state.employees) {
        const assignment = activeByEmployee.get(employee.id);
        const elapsed =
          assignment === undefined
            ? 0
            : event.absoluteClockUnit - assignment.assignedAtClockUnit;
        const reachedCellCount =
          assignment?.status === 'traveling'
            ? Math.floor(elapsed / MOVEMENT_CLOCK_UNITS_PER_CELL)
            : 0;
        const currentPosition =
          assignment?.status === 'traveling'
            ? reachedCellCount === 0
              ? assignment.startPosition
              : assignment.path[reachedCellCount - 1]
            : assignment?.status === 'working'
              ? assignment.destination
              : positions.get(employee.id);
        const remainingRoute =
          assignment?.status === 'traveling'
            ? assignment.path.slice(reachedCellCount)
            : [];
        if (
          currentPosition === undefined ||
          constructionCells.has(
            `${String(currentPosition.x)},${String(currentPosition.z)}`,
          ) ||
          remainingRoute.some(({ x, z }) =>
            constructionCells.has(`${String(x)},${String(z)}`),
          )
        ) {
          throw new RangeError('Construction event obstructs active workforce state.');
        }
      }
      occupancy = appendOccupant(occupancy, event.occupant);
    } else if (event.type === 'job.assigned') {
      const job = context.scenario.jobs.find(({ id }) => id === event.jobId);
      const startPosition = positions.get(event.employeeId);
      if (
        job === undefined ||
        startPosition === undefined ||
        assignments.has(event.assignmentId) ||
        activeByEmployee.has(event.employeeId) ||
        activeByJob.has(event.jobId) ||
        job.targetId !== event.targetId
      ) {
        throw new RangeError('Job assignment event is not causally available.');
      }
      const route = findJobRoute(context.scenario, occupancy, startPosition, job);
      if (
        !route.ok ||
        route.path.length !== event.pathLength ||
        !coordinatesEqual(route.destination, event.destination)
      ) {
        throw new RangeError('Job assignment event has a noncanonical route.');
      }
      const assignment: TrackedAssignment = {
        assignedAtClockUnit: event.absoluteClockUnit,
        assignmentId: event.assignmentId,
        destination: { ...event.destination },
        employeeId: event.employeeId,
        job,
        path: route.path.map((cell) => ({ ...cell })),
        startPosition: { ...startPosition },
        status: route.path.length === 0 ? 'awaiting-start' : 'traveling',
      };
      assignments.set(assignment.assignmentId, assignment);
      activeByEmployee.set(assignment.employeeId, assignment);
      activeByJob.set(assignment.job.id, assignment);
    } else if (event.type === 'employee.arrived') {
      const assignment = assignments.get(event.assignmentId);
      if (assignment === undefined) {
        throw new RangeError('Employee arrival event has no matching travel.');
      }
      if (
        assignment.status !== 'traveling' ||
        event.absoluteClockUnit !==
          assignment.assignedAtClockUnit +
            assignment.path.length * MOVEMENT_CLOCK_UNITS_PER_CELL ||
        event.targetId !== assignment.job.targetId ||
        event.traveledCellCount !== assignment.path.length ||
        !coordinatesEqual(event.destination, assignment.destination)
      ) {
        throw new RangeError('Employee arrival event has no matching travel.');
      }
      assertAssignmentIdentity(assignment, event);
      assignment.status = 'awaiting-start';
      positions.set(assignment.employeeId, { ...assignment.destination });
    } else if (event.type === 'job.started') {
      const assignment = assignments.get(event.assignmentId);
      if (assignment === undefined) {
        throw new RangeError('Job start event has no matching arrival or assignment.');
      }
      if (
        assignment.status !== 'awaiting-start' ||
        event.targetId !== assignment.job.targetId ||
        event.totalWorkClockUnits !== assignment.job.workDurationClockUnits ||
        previousEvent === undefined ||
        (previousEvent.type !== 'job.assigned' &&
          previousEvent.type !== 'employee.arrived') ||
        !('assignmentId' in previousEvent) ||
        previousEvent.assignmentId !== event.assignmentId
      ) {
        throw new RangeError('Job start event has no matching arrival or assignment.');
      }
      assertAssignmentIdentity(assignment, event);
      if (event.absoluteClockUnit !== previousEvent.absoluteClockUnit) {
        throw new RangeError('Job start event is separated from its arrival.');
      }
      assignment.startedAtClockUnit = event.absoluteClockUnit;
      assignment.status = 'working';
    } else if (event.type === 'job.cancelled') {
      const assignment = assignments.get(event.assignmentId);
      if (assignment === undefined || assignment.status === 'awaiting-start') {
        throw new RangeError('Job cancellation event has no active assignment.');
      }
      assertAssignmentIdentity(assignment, event);
      if (assignment.status !== event.previousActivity) {
        throw new RangeError('Job cancellation reports the wrong activity.');
      }
      const expectedPosition =
        assignment.status === 'traveling'
          ? expectedTravelPosition(assignment, event.remainingPathCells)
          : assignment.destination;
      const elapsedClockUnits =
        event.absoluteClockUnit - assignment.assignedAtClockUnit;
      const expectedRemainingPathCells =
        assignment.path.length -
        Math.floor(elapsedClockUnits / MOVEMENT_CLOCK_UNITS_PER_CELL);
      const startedAtClockUnit = assignment.startedAtClockUnit;
      const expectedRemainingWorkClockUnits =
        startedAtClockUnit === undefined
          ? 0
          : assignment.job.workDurationClockUnits -
            (event.absoluteClockUnit - startedAtClockUnit);
      if (
        elapsedClockUnits < 0 ||
        expectedPosition === undefined ||
        !coordinatesEqual(event.position, expectedPosition) ||
        (assignment.status === 'traveling' &&
          (elapsedClockUnits >=
            assignment.path.length * MOVEMENT_CLOCK_UNITS_PER_CELL ||
            event.remainingPathCells !== expectedRemainingPathCells ||
            event.remainingWorkClockUnits !== 0)) ||
        (assignment.status === 'working' &&
          (event.remainingPathCells !== 0 ||
            event.remainingWorkClockUnits !== expectedRemainingWorkClockUnits ||
            expectedRemainingWorkClockUnits < 1))
      ) {
        throw new RangeError(
          'Job cancellation progress does not match its assignment.',
        );
      }
      positions.set(assignment.employeeId, { ...event.position });
      assignment.status = 'finished';
      activeByEmployee.delete(assignment.employeeId);
      activeByJob.delete(assignment.job.id);
    } else if (event.type === 'job.completed') {
      const assignment = assignments.get(event.assignmentId);
      if (assignment === undefined) {
        throw new RangeError('Job completion event has no matching work lifecycle.');
      }
      if (
        assignment.status !== 'working' ||
        assignment.startedAtClockUnit === undefined ||
        event.absoluteClockUnit !==
          assignment.startedAtClockUnit + assignment.job.workDurationClockUnits ||
        event.targetId !== assignment.job.targetId ||
        !coordinatesEqual(event.position, assignment.destination)
      ) {
        throw new RangeError('Job completion event has no matching work lifecycle.');
      }
      assertAssignmentIdentity(assignment, event);
      positions.set(assignment.employeeId, { ...event.position });
      assignment.status = 'finished';
      activeByEmployee.delete(assignment.employeeId);
      activeByJob.delete(assignment.job.id);
    }
    previousEvent = event;
  }

  assertFinalWorkforceHistory(state, positions, activeByEmployee);
};

export const assertEventLedgerSemantics = (
  context: SimulationContext,
  state: SimulationState,
): void => {
  assertClockEvents(state);
  assertResourceHistory(context, state);
  assertConstructionHistory(context, state);
  assertBusinessHistory(context, state);
  assertTimeModeHistory(state);
  assertJobHistory(context, state);
};
