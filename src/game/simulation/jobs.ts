import {
  assertStationGridDefinition,
  buildOccupancyIndex,
  cellsForFootprint,
  createStationOccupancyState,
  gridCellIndex,
  isGridCellInBounds,
  type GridCoordinate,
  type StationOccupancyState,
} from './grid';
import { findStationPath } from './pathfinding';
import { assertBusinessDefinition } from './business';
import type {
  JobDefinition,
  ScenarioDefinition,
  SimulationContext,
  WorkTargetDefinition,
} from './scenario';
import { appendDomainEvent } from './events';
import type { Employee, SimulationState } from './types';

export const MOVEMENT_CLOCK_UNITS_PER_CELL = 20;

export type JobRouteResult =
  | {
      readonly destination: GridCoordinate;
      readonly job: JobDefinition;
      readonly ok: true;
      readonly path: readonly GridCoordinate[];
      readonly target: WorkTargetDefinition;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'job-target-has-no-walkable-interaction'
        | 'job-target-unavailable'
        | 'job-target-unreachable';
    };

const TECHNICAL_ID = /^[a-z0-9-]+$/u;

const assertTechnicalId = (value: string, name: string): void => {
  if (!TECHNICAL_ID.test(value)) throw new TypeError(`${name} must be a technical ID.`);
};

const assertPositiveSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
};

const assertCoordinate = (coordinate: GridCoordinate, name: string): void => {
  if (
    !Number.isSafeInteger(coordinate.x) ||
    !Number.isSafeInteger(coordinate.z) ||
    coordinate.x < 0 ||
    coordinate.z < 0
  ) {
    throw new RangeError(`${name} must contain non-negative safe integers.`);
  }
};

const areCardinalNeighbors = (left: GridCoordinate, right: GridCoordinate): boolean =>
  Math.abs(left.x - right.x) + Math.abs(left.z - right.z) === 1;

const assertUniqueIds = (
  values: readonly { readonly id: string }[],
  name: string,
): void => {
  const ids = new Set<string>();
  for (const value of values) {
    assertTechnicalId(value.id, `${name}.id`);
    if (ids.has(value.id))
      throw new RangeError(`${name} contains duplicate ID ${value.id}.`);
    ids.add(value.id);
  }
};

export const assertScenarioDefinition = (scenario: ScenarioDefinition): void => {
  assertTechnicalId(scenario.id, 'scenario.id');
  assertPositiveSafeInteger(scenario.version, 'scenario.version');
  assertStationGridDefinition(scenario.stationGridDefinition);
  assertBusinessDefinition(scenario.business);
  assertUniqueIds(scenario.workTargets, 'scenario.workTargets');
  assertUniqueIds(scenario.jobs, 'scenario.jobs');

  const initialOccupancy = createStationOccupancyState(scenario.stationGridDefinition);
  const occupancyIndex = buildOccupancyIndex(
    scenario.stationGridDefinition,
    initialOccupancy,
  );
  const positionedEmployees = new Set<string>();
  for (const position of scenario.initialEmployeePositions) {
    assertTechnicalId(position.employeeId, 'initialEmployeePositions.employeeId');
    if (positionedEmployees.has(position.employeeId)) {
      throw new RangeError(
        `Employee ${position.employeeId} has multiple initial positions.`,
      );
    }
    positionedEmployees.add(position.employeeId);
    if (
      position.name.trim().length === 0 ||
      position.role.trim().length === 0 ||
      !Number.isSafeInteger(position.fatigue) ||
      position.fatigue < 0 ||
      position.fatigue > 100 ||
      !Number.isSafeInteger(position.relationship)
    ) {
      throw new RangeError(`Employee ${position.employeeId} profile is invalid.`);
    }
    const requiredSkillIds = new Set([
      scenario.business.products.food.serviceSkillId,
      scenario.business.products.fuel.serviceSkillId,
    ]);
    const skillIds = position.skills.map(({ id }) => id);
    if (
      position.skills.some(
        ({ id, level }) =>
          !requiredSkillIds.has(id) ||
          !Number.isSafeInteger(level) ||
          level < 0 ||
          level > 5,
      ) ||
      new Set(skillIds).size !== skillIds.length ||
      skillIds.some((id, index) => index > 0 && id <= (skillIds[index - 1] ?? '')) ||
      [...requiredSkillIds].some((id) => !skillIds.includes(id))
    ) {
      throw new RangeError(`Employee ${position.employeeId} skills are invalid.`);
    }
    if (!isGridCellInBounds(scenario.stationGridDefinition, position.position)) {
      throw new RangeError(
        `Employee ${position.employeeId} starts outside the station grid.`,
      );
    }
    if (
      occupancyIndex.has(
        gridCellIndex(scenario.stationGridDefinition, position.position),
      )
    ) {
      throw new RangeError(`Employee ${position.employeeId} starts on a structure.`);
    }
  }

  const initialOccupantIds = new Set(
    initialOccupancy.occupants.map((occupant) => occupant.id),
  );
  const plotIds = new Set(
    scenario.stationGridDefinition.authoredPlots.map((plot) => plot.id),
  );
  for (const target of scenario.workTargets) {
    const subject = target.subject;
    let subjectCells: readonly GridCoordinate[];
    if (subject.kind === 'occupant' && !initialOccupantIds.has(subject.occupantId)) {
      throw new RangeError(`Work target ${target.id} references an unknown occupant.`);
    }
    if (subject.kind === 'authored-plot' && !plotIds.has(subject.plotId)) {
      throw new RangeError(`Work target ${target.id} references an unknown plot.`);
    }
    if (subject.kind === 'authored-plot') {
      const plot = scenario.stationGridDefinition.authoredPlots.find(
        ({ id }) => id === subject.plotId,
      );
      if (plot === undefined) {
        throw new RangeError(`Work target ${target.id} references an unknown plot.`);
      }
      subjectCells = cellsForFootprint(plot.origin, plot.footprint, plot.rotation);
    } else {
      const occupant = initialOccupancy.occupants.find(
        ({ id }) => id === subject.occupantId,
      );
      if (occupant === undefined) {
        throw new RangeError(
          `Work target ${target.id} references an unknown occupant.`,
        );
      }
      if (occupant.placement === 'authored-plot') {
        const plot = scenario.stationGridDefinition.authoredPlots.find(
          ({ id }) => id === occupant.plotId,
        );
        if (plot === undefined) {
          throw new RangeError(
            `Work target ${target.id} references an occupant without a plot.`,
          );
        }
        subjectCells = cellsForFootprint(plot.origin, plot.footprint, plot.rotation);
      } else {
        subjectCells = cellsForFootprint(
          occupant.origin,
          occupant.footprint,
          occupant.rotation,
        );
      }
    }
    if (target.interactionCells.length === 0) {
      throw new RangeError(`Work target ${target.id} needs an interaction cell.`);
    }
    const cellIndexes = new Set<number>();
    let walkableCellCount = 0;
    for (const cell of target.interactionCells) {
      if (!isGridCellInBounds(scenario.stationGridDefinition, cell)) {
        throw new RangeError(`Work target ${target.id} has an out-of-bounds cell.`);
      }
      const index = gridCellIndex(scenario.stationGridDefinition, cell);
      if (cellIndexes.has(index)) {
        throw new RangeError(`Work target ${target.id} repeats an interaction cell.`);
      }
      cellIndexes.add(index);
      if (
        !subjectCells.some((subjectCell) => areCardinalNeighbors(subjectCell, cell))
      ) {
        throw new RangeError(
          `Work target ${target.id} has an interaction cell away from its subject.`,
        );
      }
      if (!occupancyIndex.has(index)) walkableCellCount += 1;
    }
    if (walkableCellCount === 0) {
      throw new RangeError(
        `Work target ${target.id} has no walkable interaction cell.`,
      );
    }
  }

  const targetIds = new Set(scenario.workTargets.map((target) => target.id));
  for (const job of scenario.jobs) {
    assertTechnicalId(job.targetId, `job ${job.id} targetId`);
    assertPositiveSafeInteger(
      job.workDurationClockUnits,
      `job ${job.id} workDurationClockUnits`,
    );
    if (!targetIds.has(job.targetId)) {
      throw new RangeError(`Job ${job.id} references an unknown work target.`);
    }
  }
};

export const assertWorkforceSnapshot = (employees: readonly Employee[]): void => {
  assertUniqueIds(employees, 'employees');
  const activeAssignmentIds = new Set<string>();
  const activeJobIds = new Set<string>();
  for (const employee of employees) {
    assertCoordinate(employee.position, `employee ${employee.id} position`);
    const activity = employee.activity;
    if (activity.status === 'idle') continue;
    if (activity.assignmentId.trim().length === 0) {
      throw new RangeError(`Employee ${employee.id} has an empty assignment ID.`);
    }
    if (activeAssignmentIds.has(activity.assignmentId)) {
      throw new RangeError(
        `Assignment ${activity.assignmentId} is active more than once.`,
      );
    }
    activeAssignmentIds.add(activity.assignmentId);
    assertTechnicalId(activity.jobId, `employee ${employee.id} jobId`);
    assertTechnicalId(activity.targetId, `employee ${employee.id} targetId`);
    assertCoordinate(activity.destination, `employee ${employee.id} destination`);
    if (activeJobIds.has(activity.jobId)) {
      throw new RangeError(`Job ${activity.jobId} is assigned more than once.`);
    }
    activeJobIds.add(activity.jobId);
    assertPositiveSafeInteger(
      activity.totalWorkClockUnits,
      `employee ${employee.id} totalWorkClockUnits`,
    );

    if (activity.status === 'working') {
      assertPositiveSafeInteger(
        activity.remainingWorkClockUnits,
        `employee ${employee.id} remainingWorkClockUnits`,
      );
      if (activity.remainingWorkClockUnits > activity.totalWorkClockUnits) {
        throw new RangeError(`Employee ${employee.id} has excess remaining work.`);
      }
      continue;
    }

    if (activity.path.length === 0) {
      throw new RangeError(`Employee ${employee.id} has an empty travel path.`);
    }
    for (const [index, cell] of activity.path.entries()) {
      assertCoordinate(cell, `employee ${employee.id} path[${String(index)}]`);
    }
    if (
      !Number.isSafeInteger(activity.nextPathIndex) ||
      activity.nextPathIndex < 0 ||
      activity.nextPathIndex >= activity.path.length
    ) {
      throw new RangeError(`Employee ${employee.id} has an invalid path cursor.`);
    }
    if (
      !Number.isSafeInteger(activity.movementProgressClockUnits) ||
      activity.movementProgressClockUnits < 0 ||
      activity.movementProgressClockUnits >= MOVEMENT_CLOCK_UNITS_PER_CELL
    ) {
      throw new RangeError(`Employee ${employee.id} has invalid movement progress.`);
    }
    if (
      activity.path.at(-1)?.x !== activity.destination.x ||
      activity.path.at(-1)?.z !== activity.destination.z
    ) {
      throw new RangeError(`Employee ${employee.id} path misses its destination.`);
    }
  }
};

const coordinatesEqual = (left: GridCoordinate, right: GridCoordinate): boolean =>
  left.x === right.x && left.z === right.z;

export const assertWorkforceState = (
  context: SimulationContext,
  state: SimulationState,
): void => {
  assertWorkforceSnapshot(state.employees);
  const scenario = context.scenario;
  if (
    state.scenarioId !== scenario.id ||
    state.scenarioVersion !== scenario.version ||
    state.stationOccupancy.gridDefinitionId !== scenario.stationGridDefinition.id ||
    state.stationOccupancy.gridDefinitionVersion !==
      scenario.stationGridDefinition.version
  ) {
    throw new RangeError('Workforce state does not match its scenario context.');
  }
  const occupancyIndex = buildOccupancyIndex(
    scenario.stationGridDefinition,
    state.stationOccupancy,
  );

  for (const employee of state.employees) {
    if (!isGridCellInBounds(scenario.stationGridDefinition, employee.position)) {
      throw new RangeError(`Employee ${employee.id} is outside the station grid.`);
    }
    if (
      occupancyIndex.has(
        gridCellIndex(scenario.stationGridDefinition, employee.position),
      )
    ) {
      throw new RangeError(`Employee ${employee.id} occupies a blocked cell.`);
    }
    const activity = employee.activity;
    if (activity.status === 'idle') continue;

    const job = scenario.jobs.find((candidate) => candidate.id === activity.jobId);
    const target = scenario.workTargets.find(
      (candidate) => candidate.id === activity.targetId,
    );
    if (job === undefined || target === undefined) {
      throw new RangeError(`Employee ${employee.id} has an invalid job activity.`);
    }
    if (
      job.targetId !== target.id ||
      job.workDurationClockUnits !== activity.totalWorkClockUnits ||
      !target.interactionCells.some((cell) =>
        coordinatesEqual(cell, activity.destination),
      )
    ) {
      throw new RangeError(`Employee ${employee.id} has an invalid job activity.`);
    }
    if (activity.status === 'working') {
      if (!coordinatesEqual(employee.position, activity.destination)) {
        throw new RangeError(`Employee ${employee.id} works away from the target.`);
      }
      continue;
    }

    for (const cell of activity.path) {
      if (!isGridCellInBounds(scenario.stationGridDefinition, cell)) {
        throw new RangeError(`Employee ${employee.id} path leaves the station grid.`);
      }
      if (occupancyIndex.has(gridCellIndex(scenario.stationGridDefinition, cell))) {
        throw new RangeError(`Employee ${employee.id} path crosses a blocked cell.`);
      }
    }
    for (let index = 1; index < activity.path.length; index += 1) {
      const previous = activity.path[index - 1];
      const current = activity.path[index];
      if (
        previous === undefined ||
        current === undefined ||
        !areCardinalNeighbors(previous, current)
      ) {
        throw new RangeError(`Employee ${employee.id} path is not contiguous.`);
      }
    }
    const priorCell =
      activity.nextPathIndex === 0
        ? employee.position
        : activity.path[activity.nextPathIndex - 1];
    const nextCell = activity.path[activity.nextPathIndex];
    if (
      priorCell === undefined ||
      nextCell === undefined ||
      (activity.nextPathIndex === 0
        ? !areCardinalNeighbors(priorCell, nextCell)
        : !coordinatesEqual(employee.position, priorCell))
    ) {
      throw new RangeError(`Employee ${employee.id} path cursor is disconnected.`);
    }
  }
};

const targetIsAvailable = (
  scenario: ScenarioDefinition,
  occupancy: StationOccupancyState,
  target: WorkTargetDefinition,
): boolean => {
  const subject = target.subject;
  return subject.kind === 'authored-plot'
    ? scenario.stationGridDefinition.authoredPlots.some(
        (plot) => plot.id === subject.plotId,
      )
    : occupancy.occupants.some((occupant) => occupant.id === subject.occupantId);
};

export const findJobRoute = (
  scenario: ScenarioDefinition,
  occupancy: StationOccupancyState,
  start: GridCoordinate,
  job: JobDefinition,
): JobRouteResult => {
  const target = scenario.workTargets.find(
    (candidate) => candidate.id === job.targetId,
  );
  if (target === undefined || !targetIsAvailable(scenario, occupancy, target)) {
    return { ok: false, reason: 'job-target-unavailable' };
  }
  const path = findStationPath(
    scenario.stationGridDefinition,
    occupancy,
    start,
    target.interactionCells,
  );
  if (!path.ok) {
    return {
      ok: false,
      reason:
        path.reason === 'no-walkable-destination'
          ? 'job-target-has-no-walkable-interaction'
          : 'job-target-unreachable',
    };
  }
  return {
    ...path,
    job,
    target: {
      ...target,
      interactionCells: [...target.interactionCells].sort(
        (left, right) =>
          gridCellIndex(scenario.stationGridDefinition, left) -
          gridCellIndex(scenario.stationGridDefinition, right),
      ),
    },
  };
};

const replaceEmployee = (
  state: SimulationState,
  replacement: Employee,
): SimulationState => ({
  ...state,
  employees: state.employees.map((employee) =>
    employee.id === replacement.id ? replacement : employee,
  ),
});

export const advanceEmployeeActivitiesByClockUnit = (
  state: SimulationState,
): SimulationState => {
  let next = state;
  const employeeIds = state.employees
    .map((employee) => employee.id)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  for (const employeeId of employeeIds) {
    const employee = next.employees.find((candidate) => candidate.id === employeeId);
    if (employee === undefined) {
      throw new RangeError(`Employee ${employeeId} disappeared during job progress.`);
    }
    const activity = employee.activity;
    if (activity.status === 'idle') continue;

    if (activity.status === 'working') {
      if (
        !Number.isSafeInteger(activity.remainingWorkClockUnits) ||
        activity.remainingWorkClockUnits < 1
      ) {
        throw new RangeError('Working activity has invalid remaining clock units.');
      }
      const remainingWorkClockUnits = activity.remainingWorkClockUnits - 1;
      if (remainingWorkClockUnits > 0) {
        next = replaceEmployee(next, {
          ...employee,
          activity: { ...activity, remainingWorkClockUnits },
        });
        continue;
      }
      next = replaceEmployee(next, {
        ...employee,
        activity: { status: 'idle' },
      });
      next = appendDomainEvent(next, {
        assignmentId: activity.assignmentId,
        employeeId: employee.id,
        jobId: activity.jobId,
        position: { ...employee.position },
        reason: 'work-duration-reached',
        targetId: activity.targetId,
        type: 'job.completed',
      });
      continue;
    }

    if (
      !Number.isSafeInteger(activity.movementProgressClockUnits) ||
      activity.movementProgressClockUnits < 0 ||
      activity.movementProgressClockUnits >= MOVEMENT_CLOCK_UNITS_PER_CELL ||
      !Number.isSafeInteger(activity.nextPathIndex) ||
      activity.nextPathIndex < 0 ||
      activity.nextPathIndex >= activity.path.length
    ) {
      throw new RangeError('Traveling activity has invalid path progress.');
    }
    const movementProgressClockUnits = activity.movementProgressClockUnits + 1;
    if (movementProgressClockUnits < MOVEMENT_CLOCK_UNITS_PER_CELL) {
      next = replaceEmployee(next, {
        ...employee,
        activity: { ...activity, movementProgressClockUnits },
      });
      continue;
    }

    const position = activity.path[activity.nextPathIndex];
    if (position === undefined) {
      throw new RangeError('Traveling activity is missing its next path cell.');
    }
    const nextPathIndex = activity.nextPathIndex + 1;
    if (nextPathIndex < activity.path.length) {
      next = replaceEmployee(next, {
        ...employee,
        activity: {
          ...activity,
          movementProgressClockUnits: 0,
          nextPathIndex,
        },
        position: { ...position },
      });
      continue;
    }

    const job = activity;
    next = replaceEmployee(next, {
      ...employee,
      activity: {
        assignmentId: job.assignmentId,
        destination: { ...job.destination },
        jobId: job.jobId,
        remainingWorkClockUnits: job.totalWorkClockUnits,
        status: 'working',
        targetId: job.targetId,
        totalWorkClockUnits: job.totalWorkClockUnits,
      },
      position: { ...position },
    });
    next = appendDomainEvent(next, {
      assignmentId: job.assignmentId,
      destination: { ...job.destination },
      employeeId: employee.id,
      jobId: job.jobId,
      reason: 'job-travel-completed',
      targetId: job.targetId,
      traveledCellCount: job.path.length,
      type: 'employee.arrived',
    });
    next = appendDomainEvent(next, {
      assignmentId: job.assignmentId,
      employeeId: employee.id,
      jobId: job.jobId,
      reason: 'employee-at-interaction-cell',
      targetId: job.targetId,
      totalWorkClockUnits: job.totalWorkClockUnits,
      type: 'job.started',
    });
  }

  return next;
};
