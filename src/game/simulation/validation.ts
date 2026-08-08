import {
  CLOCK_UNITS_PER_MINUTE,
  phaseForClockUnit,
  wholeMinuteForClockUnit,
} from './clock';
import { assertBusinessState } from './business';
import { assertWorkforceState } from './jobs';
import { assertSeededRandomState } from './random';
import type { SimulationContext } from './scenario';
import type { DomainEvent, ResourceKey, SimulationState } from './types';
import { assertEventLedgerSemantics } from './eventLedgerValidation';

const RESOURCE_KEYS: readonly ResourceKey[] = [
  'ammunition',
  'cash',
  'food',
  'fuel',
  'power',
  'scrap',
];

export const MAX_PERSISTED_NIGHT_COUNT = 32;

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

const assertEventContentReferences = (
  event: DomainEvent,
  context: SimulationContext,
  employeeIds: ReadonlySet<string>,
): void => {
  if (event.type === 'construction.placed') {
    if (!context.scenario.construction.some(({ id }) => id === event.blueprintId)) {
      throw new RangeError(
        `Event ${String(event.sequence)} references an unknown construction blueprint.`,
      );
    }
    return;
  }
  if (event.type === 'service.started' || event.type === 'service.interrupted') {
    const serviceEmployeeId =
      event.type === 'service.started'
        ? event.performance.employeeId
        : event.employeeId;
    if (!employeeIds.has(serviceEmployeeId)) {
      throw new RangeError(
        `Event ${String(event.sequence)} references an unknown service employee.`,
      );
    }
    return;
  }
  if (
    event.type !== 'job.assigned' &&
    event.type !== 'employee.arrived' &&
    event.type !== 'job.started' &&
    event.type !== 'job.cancelled' &&
    event.type !== 'job.completed'
  ) {
    return;
  }
  if (!employeeIds.has(event.employeeId)) {
    throw new RangeError(
      `Event ${String(event.sequence)} references an unknown employee.`,
    );
  }
  const job = context.scenario.jobs.find(({ id }) => id === event.jobId);
  if (job === undefined) {
    throw new RangeError(`Event ${String(event.sequence)} references an unknown job.`);
  }
  if (event.type !== 'job.cancelled' && job.targetId !== event.targetId) {
    throw new RangeError(
      `Event ${String(event.sequence)} has a mismatched job target.`,
    );
  }
};

export const assertSimulationState = (
  context: SimulationContext,
  state: SimulationState,
): void => {
  assertNonNegativeSafeInteger(state.absoluteClockUnit, 'absoluteClockUnit');
  assertNonNegativeSafeInteger(
    state.clockStepRemainderTimeUnits,
    'clockStepRemainderTimeUnits',
  );
  if (state.clockStepRemainderTimeUnits >= 100_000) {
    throw new RangeError('clockStepRemainderTimeUnits exceeds one slow clock unit.');
  }
  assertNonNegativeSafeInteger(state.completedNights, 'completedNights');
  assertNonNegativeSafeInteger(
    state.nextConstructionSequence,
    'nextConstructionSequence',
  );
  assertNonNegativeSafeInteger(state.nextEventSequence, 'nextEventSequence');
  assertNonNegativeSafeInteger(state.seed, 'seed');
  assertNonNegativeSafeInteger(state.tick, 'tick');
  if (!Number.isSafeInteger(state.targetNightCount) || state.targetNightCount < 1) {
    throw new RangeError('targetNightCount must be a positive safe integer.');
  }
  if (state.targetNightCount > MAX_PERSISTED_NIGHT_COUNT) {
    throw new RangeError('targetNightCount exceeds the supported save horizon.');
  }
  const initialClockUnit = 8 * 60 * CLOCK_UNITS_PER_MINUTE;
  const finalSunriseClockUnit =
    initialClockUnit +
    (22 + (state.targetNightCount - 1) * 24) * 60 * CLOCK_UNITS_PER_MINUTE;
  if (
    state.absoluteClockUnit < initialClockUnit ||
    state.absoluteClockUnit > finalSunriseClockUnit
  ) {
    throw new RangeError('absoluteClockUnit is outside the supported save horizon.');
  }
  if (state.phase !== phaseForClockUnit(state.absoluteClockUnit)) {
    throw new RangeError('Simulation phase does not match its clock position.');
  }
  if (state.completedNights > state.targetNightCount) {
    throw new RangeError('Completed nights exceed the scenario target.');
  }
  if (state.isSliceComplete !== state.completedNights >= state.targetNightCount) {
    throw new RangeError('Slice completion does not match completed nights.');
  }
  if (state.isSliceComplete && state.clockStepRemainderTimeUnits !== 0) {
    throw new RangeError('Completed simulation cannot retain clock-step remainder.');
  }
  if (state.phase === 'night' && state.timeMode === 'paused') {
    throw new RangeError('Night simulation cannot remain paused.');
  }

  for (const key of RESOURCE_KEYS) {
    assertNonNegativeSafeInteger(state.resources[key], `resources.${key}`);
  }
  assertBusinessState(
    context.scenario.business,
    state.business,
    state.absoluteClockUnit,
  );
  for (const employee of state.employees) {
    if (employee.name.trim().length === 0 || employee.role.trim().length === 0) {
      throw new RangeError(`Employee ${employee.id} needs a name and role.`);
    }
    if (
      !Number.isSafeInteger(employee.fatigue) ||
      employee.fatigue < 0 ||
      employee.fatigue > 100
    ) {
      throw new RangeError(
        `Employee ${employee.id} fatigue must be an integer from 0 to 100.`,
      );
    }
    if (!Number.isSafeInteger(employee.relationship)) {
      throw new RangeError(
        `Employee ${employee.id} relationship must be a safe integer.`,
      );
    }
    const expectedSkillIds = context.scenario.business.products;
    const requiredSkills = new Set([
      expectedSkillIds.food.serviceSkillId,
      expectedSkillIds.fuel.serviceSkillId,
    ]);
    const actualSkillIds = employee.skills.map(({ id }) => id);
    if (
      employee.skills.some(
        ({ id, level }) =>
          !requiredSkills.has(id) ||
          !Number.isSafeInteger(level) ||
          level < 0 ||
          level > 5,
      ) ||
      new Set(actualSkillIds).size !== actualSkillIds.length ||
      actualSkillIds.some(
        (id, index) => index > 0 && id <= (actualSkillIds[index - 1] ?? ''),
      ) ||
      [...requiredSkills].some((id) => !actualSkillIds.includes(id))
    ) {
      throw new RangeError(
        `Employee ${employee.id} skills are invalid or noncanonical.`,
      );
    }
  }
  const expectedEmployeeIds = [...context.scenario.initialEmployeePositions]
    .map(({ employeeId }) => employeeId)
    .sort();
  const employeeIds = state.employees.map(({ id }) => id).sort();
  if (
    expectedEmployeeIds.length !== employeeIds.length ||
    expectedEmployeeIds.some((id, index) => id !== employeeIds[index])
  ) {
    throw new RangeError('Simulation workforce does not match scenario employees.');
  }

  assertSeededRandomState(state.rng);
  assertWorkforceState(context, state);

  if (state.eventLedger.length === 0) {
    throw new RangeError('Simulation event ledger cannot be empty.');
  }
  let previousTick = -1;
  let previousClockUnit = -1;
  let startedEventCount = 0;
  let completedNightEventCount = 0;
  let sliceCompletedEventCount = 0;
  const knownEmployeeIds = new Set(employeeIds);

  for (const [index, event] of state.eventLedger.entries()) {
    assertNonNegativeSafeInteger(
      event.sequence,
      `eventLedger[${String(index)}].sequence`,
    );
    assertNonNegativeSafeInteger(event.tick, `eventLedger[${String(index)}].tick`);
    assertNonNegativeSafeInteger(
      event.absoluteClockUnit,
      `eventLedger[${String(index)}].absoluteClockUnit`,
    );
    assertNonNegativeSafeInteger(event.minute, `eventLedger[${String(index)}].minute`);
    if (event.sequence !== index) {
      throw new RangeError('Event ledger sequences must be contiguous from zero.');
    }
    if (event.tick < previousTick || event.absoluteClockUnit < previousClockUnit) {
      throw new RangeError('Event ledger clock positions must be nondecreasing.');
    }
    if (event.tick > state.tick || event.absoluteClockUnit > state.absoluteClockUnit) {
      throw new RangeError('Event ledger contains an event beyond current state.');
    }
    if (event.minute !== wholeMinuteForClockUnit(event.absoluteClockUnit)) {
      throw new RangeError('Event minute does not match its clock unit.');
    }
    previousTick = event.tick;
    previousClockUnit = event.absoluteClockUnit;

    if (event.type === 'simulation.started') {
      startedEventCount += 1;
      if (
        index !== 0 ||
        event.sequence !== 0 ||
        event.tick !== 0 ||
        event.absoluteClockUnit !== 8 * 60 * CLOCK_UNITS_PER_MINUTE ||
        event.scenarioId !== state.scenarioId ||
        event.scenarioVersion !== state.scenarioVersion ||
        event.gridDefinitionId !== state.stationOccupancy.gridDefinitionId ||
        event.gridDefinitionVersion !== state.stationOccupancy.gridDefinitionVersion ||
        event.seed !== state.seed ||
        event.targetNightCount !== state.targetNightCount
      ) {
        throw new RangeError('Simulation start event does not match loaded state.');
      }
    } else if (event.type === 'resources.changed') {
      const resourceIds = new Set<ResourceKey>();
      for (const change of event.changes) {
        if (resourceIds.has(change.resource)) {
          throw new RangeError('Resource event repeats a resource.');
        }
        resourceIds.add(change.resource);
        if (change.before + change.appliedDelta !== change.after) {
          throw new RangeError('Resource event arithmetic does not reconcile.');
        }
      }
    } else if (event.type === 'night.completed') {
      completedNightEventCount += 1;
      if (event.completedNights > state.completedNights) {
        throw new RangeError('Night completion event exceeds loaded state.');
      }
    } else if (event.type === 'slice.completed') {
      sliceCompletedEventCount += 1;
      if (
        event.completedNights !== state.completedNights ||
        event.targetNightCount !== state.targetNightCount
      ) {
        throw new RangeError('Slice completion event does not match loaded state.');
      }
    }
    assertEventContentReferences(event, context, knownEmployeeIds);
  }

  if (startedEventCount !== 1) {
    throw new RangeError('Event ledger needs exactly one simulation start event.');
  }
  if (state.nextEventSequence !== state.eventLedger.length) {
    throw new RangeError('Next event sequence does not follow the ledger.');
  }
  if (completedNightEventCount !== state.completedNights) {
    throw new RangeError('Night completion events do not match completed nights.');
  }
  if (sliceCompletedEventCount !== (state.isSliceComplete ? 1 : 0)) {
    throw new RangeError('Slice completion event does not match terminal state.');
  }
  if (state.isSliceComplete && state.eventLedger.at(-1)?.type !== 'slice.completed') {
    throw new RangeError('Slice completion must be the final domain event.');
  }
  assertEventLedgerSemantics(context, state);
};
