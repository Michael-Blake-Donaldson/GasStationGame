import {
  buildOccupancyIndex,
  createStationOccupancyState,
  gridCellIndex,
  type GridCoordinate,
  type StationOccupancyState,
} from './grid';
import { findStationPath } from './pathfinding';
import type { ScenarioDefinition, WorkTargetDefinition } from './scenario';

export type RequiredAccessIssueReason =
  'required-interaction-blocked' | 'required-route-unreachable';

export interface RequiredAccessIssue {
  readonly anchorCells: readonly GridCoordinate[];
  readonly anchorTargetId: string;
  readonly cells: readonly GridCoordinate[];
  readonly conflictingOccupantIds?: readonly string[];
  readonly employeeIds?: readonly string[];
  readonly reason: RequiredAccessIssueReason;
  readonly workTargetIds?: readonly string[];
}

export interface WorkforcePosition {
  readonly id: string;
  readonly position: GridCoordinate;
}

const TECHNICAL_ID = /^[a-z0-9-]+$/u;

const compareIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedCells = (
  scenario: ScenarioDefinition,
  cells: readonly GridCoordinate[],
): readonly GridCoordinate[] =>
  [...cells]
    .sort(
      (left, right) =>
        gridCellIndex(scenario.stationGridDefinition, left) -
        gridCellIndex(scenario.stationGridDefinition, right),
    )
    .map(({ x, z }) => ({ x, z }));

const requiredTargets = (
  scenario: ScenarioDefinition,
): readonly WorkTargetDefinition[] => {
  const byId = new Map(scenario.workTargets.map((target) => [target.id, target]));
  return scenario.constructionAccess.requiredWorkTargetIds.map((id) => {
    const target = byId.get(id);
    if (target === undefined) {
      throw new RangeError(`Construction access references unknown target ${id}.`);
    }
    return target;
  });
};

const openInteractionCells = (
  scenario: ScenarioDefinition,
  occupancyIndex: ReadonlyMap<number, string>,
  target: WorkTargetDefinition,
): readonly GridCoordinate[] =>
  sortedCells(
    scenario,
    target.interactionCells.filter(
      (cell) =>
        !occupancyIndex.has(gridCellIndex(scenario.stationGridDefinition, cell)),
    ),
  );

const hasPathToAnchor = (
  scenario: ScenarioDefinition,
  occupancy: StationOccupancyState,
  starts: readonly GridCoordinate[],
  anchorCells: readonly GridCoordinate[],
): boolean =>
  starts.some(
    (start) =>
      findStationPath(scenario.stationGridDefinition, occupancy, start, anchorCells).ok,
  );

export const evaluateRequiredStationAccess = (
  scenario: ScenarioDefinition,
  occupancy: StationOccupancyState,
  employees: readonly WorkforcePosition[],
): readonly RequiredAccessIssue[] => {
  const occupancyIndex = buildOccupancyIndex(scenario.stationGridDefinition, occupancy);
  const targets = requiredTargets(scenario);
  const targetCells = new Map<string, readonly GridCoordinate[]>();
  const issues: RequiredAccessIssue[] = [];

  for (const target of targets) {
    const openCells = openInteractionCells(scenario, occupancyIndex, target);
    targetCells.set(target.id, openCells);
    if (openCells.length > 0) continue;
    const cells = sortedCells(scenario, target.interactionCells);
    const conflictingOccupantIds = [
      ...new Set(
        cells
          .map((cell) =>
            occupancyIndex.get(gridCellIndex(scenario.stationGridDefinition, cell)),
          )
          .filter((id): id is string => id !== undefined),
      ),
    ].sort(compareIds);
    issues.push({
      anchorCells: [],
      anchorTargetId: scenario.constructionAccess.anchorWorkTargetId,
      cells,
      conflictingOccupantIds,
      reason: 'required-interaction-blocked',
      workTargetIds: [target.id],
    });
  }

  const anchorTargetId = scenario.constructionAccess.anchorWorkTargetId;
  const anchorCells = targetCells.get(anchorTargetId) ?? [];
  if (anchorCells.length === 0) return issues;

  for (const employee of [...employees].sort((left, right) =>
    compareIds(left.id, right.id),
  )) {
    if (hasPathToAnchor(scenario, occupancy, [employee.position], anchorCells)) {
      continue;
    }
    issues.push({
      anchorCells,
      anchorTargetId,
      cells: [{ ...employee.position }],
      employeeIds: [employee.id],
      reason: 'required-route-unreachable',
    });
  }

  for (const target of targets) {
    if (target.id === anchorTargetId) continue;
    const openCells = targetCells.get(target.id) ?? [];
    if (
      openCells.length === 0 ||
      hasPathToAnchor(scenario, occupancy, openCells, anchorCells)
    ) {
      continue;
    }
    issues.push({
      anchorCells,
      anchorTargetId,
      cells: openCells,
      reason: 'required-route-unreachable',
      workTargetIds: [target.id],
    });
  }

  return issues;
};

export const assertRequiredStationAccessDefinition = (
  scenario: ScenarioDefinition,
): void => {
  const { anchorWorkTargetId, requiredWorkTargetIds } = scenario.constructionAccess;
  if (
    !TECHNICAL_ID.test(anchorWorkTargetId) ||
    requiredWorkTargetIds.some(
      (id, index) =>
        !TECHNICAL_ID.test(id) ||
        (index > 0 && id <= (requiredWorkTargetIds[index - 1] ?? '')),
    ) ||
    !requiredWorkTargetIds.includes(anchorWorkTargetId)
  ) {
    throw new RangeError(
      'Construction access needs an included anchor and unique ascending target IDs.',
    );
  }
  requiredTargets(scenario);
  const occupancy = createStationOccupancyState(scenario.stationGridDefinition);
  const initialEmployees = scenario.initialEmployeePositions.map(
    ({ employeeId, position }) => ({ id: employeeId, position }),
  );
  if (evaluateRequiredStationAccess(scenario, occupancy, initialEmployees).length > 0) {
    throw new RangeError('Initial station layout does not preserve required access.');
  }
};
