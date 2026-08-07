import { applyHourlyFlow } from './advanceSimulation';
import {
  CLOCK_UNITS_PER_MINUTE,
  effectiveTimeMode,
  phaseForClockUnit,
  wholeMinuteForClockUnit,
} from './clock';
import { createInitialState } from './createInitialState';
import type { GridCoordinate } from './grid';
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
  const expectedEvents: {
    readonly absoluteClockUnit: number;
    readonly changes: readonly ResourceChange[];
    readonly reason: 'day-hourly-flow' | 'night-hourly-flow';
  }[] = [];
  const startMinute = 8 * 60;
  const finalMinute = wholeMinuteForClockUnit(state.absoluteClockUnit);
  for (let minute = startMinute + 1; minute <= finalMinute; minute += 1) {
    if (minute % 60 !== 0) continue;
    const absoluteClockUnit = minute * CLOCK_UNITS_PER_MINUTE;
    const phase = phaseForClockUnit(absoluteClockUnit);
    const flow = applyHourlyFlow(resources, phase);
    resources = flow.resources;
    if (flow.changes.length > 0) {
      expectedEvents.push({
        absoluteClockUnit,
        changes: flow.changes,
        reason: phase === 'night' ? 'night-hourly-flow' : 'day-hourly-flow',
      });
    }
  }
  const actualEvents = state.eventLedger.filter(
    (event): event is Extract<DomainEvent, { type: 'resources.changed' }> =>
      event.type === 'resources.changed',
  );
  if (actualEvents.length !== expectedEvents.length) {
    throw new RangeError('Resource events do not cover every scheduled flow.');
  }
  for (const [index, event] of actualEvents.entries()) {
    const expected = expectedEvents[index];
    if (expected === undefined) {
      throw new RangeError('Resource event does not match scheduled flow.');
    }
    if (
      event.absoluteClockUnit !== expected.absoluteClockUnit ||
      event.reason !== expected.reason ||
      !resourceChangesEqual(event.changes, expected.changes)
    ) {
      throw new RangeError('Resource event does not match scheduled flow.');
    }
  }
  for (const key of Object.keys(resources) as (keyof Resources)[]) {
    if (state.resources[key] !== resources[key]) {
      throw new RangeError('Final resources do not reconcile with the event ledger.');
    }
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
  let previousEvent: DomainEvent | undefined;

  for (const event of state.eventLedger) {
    if (event.type === 'job.assigned') {
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
      const route = findJobRoute(
        context.scenario,
        state.stationOccupancy,
        startPosition,
        job,
      );
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
  assertTimeModeHistory(state);
  assertJobHistory(context, state);
};
