import {
  checkAuthoredPlotOccupancy,
  checkFlexibleOccupancy,
  type GridCoordinate,
  type OccupancyIssue,
  type PlacedOccupant,
  type QuarterTurn,
  type RectangularFootprint,
  type StationGridDefinition,
} from './grid';
import {
  evaluateRequiredStationAccess,
  type RequiredAccessIssue,
  type RequiredAccessIssueReason,
} from './layoutRoutes';
import type { SimulationContext } from './scenario';
import type { SimulationState } from './types';

export interface ConstructionCost {
  readonly cash: number;
  readonly scrap: number;
}

interface ConstructionDefinitionBase {
  readonly cost: ConstructionCost;
  readonly displayName: string;
  readonly id: string;
}

export interface AuthoredFacilityConstructionDefinition extends ConstructionDefinitionBase {
  readonly facilityId: string;
  readonly placement: 'authored-plot';
}

export interface FlexibleConstructionDefinition extends ConstructionDefinitionBase {
  readonly allowedRotations: readonly QuarterTurn[];
  readonly footprint: RectangularFootprint;
  readonly placement: 'flexible';
  readonly structureId: string;
}

export type ConstructionDefinition =
  AuthoredFacilityConstructionDefinition | FlexibleConstructionDefinition;

export type ConstructionPlacementRequest =
  | {
      readonly blueprintId: string;
      readonly placement: {
        readonly kind: 'authored-plot';
        readonly plotId: string;
      };
    }
  | {
      readonly blueprintId: string;
      readonly placement: {
        readonly kind: 'flexible';
        readonly origin: GridCoordinate;
        readonly rotation: QuarterTurn;
      };
    };

export type ConstructionIssueReason =
  | OccupancyIssue['reason']
  | RequiredAccessIssueReason
  | 'active-route-obstructed'
  | 'blueprint-not-found'
  | 'construction-closed'
  | 'construction-sequence-exhausted'
  | 'employee-cell-occupied'
  | 'insufficient-cash'
  | 'insufficient-scrap'
  | 'placement-kind-mismatch'
  | 'rotation-not-allowed';

export interface ConstructionIssue {
  readonly cells: readonly GridCoordinate[];
  readonly conflictingOccupantIds?: readonly string[];
  readonly employeeIds?: readonly string[];
  readonly anchorCells?: readonly GridCoordinate[];
  readonly anchorTargetId?: string;
  readonly plotId?: string;
  readonly reason: ConstructionIssueReason;
  readonly required?: number;
  readonly available?: number;
  readonly workTargetIds?: readonly string[];
}

interface ConstructionEvaluationBase {
  readonly blueprint?: ConstructionDefinition;
  readonly cells: readonly GridCoordinate[];
  readonly cost?: ConstructionCost;
  readonly occupant?: PlacedOccupant;
}

export type ConstructionEvaluation =
  | (ConstructionEvaluationBase & {
      readonly issues: readonly ConstructionIssue[];
      readonly ok: false;
    })
  | (Required<ConstructionEvaluationBase> & {
      readonly issues: readonly [];
      readonly ok: true;
    });

const TECHNICAL_ID = /^[a-z0-9-]+$/u;
const ISSUE_PRIORITY: Record<ConstructionIssueReason, number> = {
  'blueprint-not-found': 0,
  'placement-kind-mismatch': 1,
  'construction-closed': 2,
  'construction-sequence-exhausted': 3,
  'invalid-candidate': 4,
  'rotation-not-allowed': 5,
  'occupant-id-already-used': 6,
  'authored-plot-not-found': 7,
  'facility-not-allowed': 8,
  'out-of-bounds': 9,
  'cell-not-buildable': 10,
  'authored-plot-reserved': 11,
  'authored-plot-occupied': 12,
  'cell-occupied': 13,
  'employee-cell-occupied': 14,
  'active-route-obstructed': 15,
  'required-interaction-blocked': 16,
  'required-route-unreachable': 17,
  'insufficient-cash': 18,
  'insufficient-scrap': 19,
};

const compareCells = (left: GridCoordinate, right: GridCoordinate): number =>
  left.z - right.z || left.x - right.x;

const compareIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const cloneCells = (cells: readonly GridCoordinate[]): readonly GridCoordinate[] =>
  cells.map(({ x, z }) => ({ x, z }));

const sortedIssues = (
  issues: readonly ConstructionIssue[],
): readonly ConstructionIssue[] =>
  [...issues].sort(
    (left, right) =>
      ISSUE_PRIORITY[left.reason] - ISSUE_PRIORITY[right.reason] ||
      (left.cells[0] === undefined
        ? -1
        : right.cells[0] === undefined
          ? 1
          : compareCells(left.cells[0], right.cells[0])),
  );

const constructionIssue = (
  reason: ConstructionIssueReason,
  cells: readonly GridCoordinate[] = [],
  extra: Omit<ConstructionIssue, 'cells' | 'reason'> = {},
): ConstructionIssue => ({
  ...extra,
  cells: cloneCells([...cells].sort(compareCells)),
  reason,
});

const fromOccupancyIssue = (issue: OccupancyIssue): ConstructionIssue => ({
  cells: cloneCells(issue.cells),
  ...(issue.conflictingOccupantIds === undefined
    ? {}
    : { conflictingOccupantIds: [...issue.conflictingOccupantIds] }),
  ...(issue.plotId === undefined ? {} : { plotId: issue.plotId }),
  reason: issue.reason,
});

const fromRequiredAccessIssue = (issue: RequiredAccessIssue): ConstructionIssue => ({
  anchorCells: cloneCells(issue.anchorCells),
  anchorTargetId: issue.anchorTargetId,
  cells: cloneCells(issue.cells),
  ...(issue.conflictingOccupantIds === undefined
    ? {}
    : { conflictingOccupantIds: [...issue.conflictingOccupantIds] }),
  ...(issue.employeeIds === undefined ? {} : { employeeIds: [...issue.employeeIds] }),
  reason: issue.reason,
  ...(issue.workTargetIds === undefined
    ? {}
    : { workTargetIds: [...issue.workTargetIds] }),
});

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

export const assertConstructionDefinitions = (
  definitions: readonly ConstructionDefinition[],
  grid: StationGridDefinition,
): void => {
  if (definitions.length === 0) {
    throw new RangeError('Construction catalog must not be empty.');
  }
  let previousId = '';
  for (const definition of definitions) {
    if (
      !TECHNICAL_ID.test(definition.id) ||
      definition.id <= previousId ||
      definition.displayName.trim().length === 0
    ) {
      throw new RangeError(
        'Construction definitions need unique ascending technical IDs and names.',
      );
    }
    previousId = definition.id;
    assertNonNegativeSafeInteger(definition.cost.cash, `${definition.id}.cost.cash`);
    assertNonNegativeSafeInteger(definition.cost.scrap, `${definition.id}.cost.scrap`);
    if (definition.cost.cash + definition.cost.scrap < 1) {
      throw new RangeError(`${definition.id} must have a non-zero construction cost.`);
    }
    if (definition.placement === 'authored-plot') {
      if (
        !TECHNICAL_ID.test(definition.facilityId) ||
        !grid.authoredPlots.some((plot) =>
          plot.allowedFacilityIds.includes(definition.facilityId),
        )
      ) {
        throw new RangeError(
          `${definition.id} does not match an authored facility plot.`,
        );
      }
      continue;
    }
    if (
      !TECHNICAL_ID.test(definition.structureId) ||
      !Number.isSafeInteger(definition.footprint.width) ||
      !Number.isSafeInteger(definition.footprint.height) ||
      definition.footprint.width < 1 ||
      definition.footprint.height < 1 ||
      definition.allowedRotations.length === 0 ||
      definition.allowedRotations.some(
        (rotation, index) =>
          ![0, 1, 2, 3].includes(rotation) ||
          (index > 0 && rotation <= (definition.allowedRotations[index - 1] ?? -1)),
      )
    ) {
      throw new RangeError(`${definition.id} flexible construction rules are invalid.`);
    }
  }
};

const cellsOverlap = (
  candidateCells: readonly GridCoordinate[],
  otherCells: readonly GridCoordinate[],
): readonly GridCoordinate[] => {
  const other = new Set(otherCells.map(({ x, z }) => `${String(x)},${String(z)}`));
  return candidateCells.filter(({ x, z }) => other.has(`${String(x)},${String(z)}`));
};

const occupantIdFor = (blueprintId: string, sequence: number): string =>
  `built-${blueprintId}-${String(sequence)}`;

export const evaluateConstructionPlacement = (
  state: SimulationState,
  context: SimulationContext,
  request: ConstructionPlacementRequest,
): ConstructionEvaluation => {
  const blueprint = context.scenario.construction.find(
    ({ id }) => id === request.blueprintId,
  );
  if (blueprint === undefined) {
    return {
      cells: [],
      issues: [constructionIssue('blueprint-not-found')],
      ok: false,
    };
  }

  const issues: ConstructionIssue[] = [];
  if (state.phase !== 'day') issues.push(constructionIssue('construction-closed'));
  if (
    !Number.isSafeInteger(state.nextConstructionSequence) ||
    state.nextConstructionSequence < 0 ||
    state.nextConstructionSequence >= Number.MAX_SAFE_INTEGER
  ) {
    issues.push(constructionIssue('construction-sequence-exhausted'));
  }
  if (blueprint.placement !== request.placement.kind) {
    issues.push(constructionIssue('placement-kind-mismatch'));
    return {
      blueprint,
      cells: [],
      cost: { ...blueprint.cost },
      issues: sortedIssues(issues),
      ok: false,
    };
  }

  const occupantId = occupantIdFor(blueprint.id, state.nextConstructionSequence);
  let occupant: PlacedOccupant;
  let cells: readonly GridCoordinate[];
  let geometryValid: boolean;
  if (blueprint.placement === 'authored-plot') {
    const placement = request.placement;
    if (placement.kind !== 'authored-plot') {
      throw new RangeError('Construction placement narrowing failed.');
    }
    occupant = {
      facilityId: blueprint.facilityId,
      id: occupantId,
      placement: 'authored-plot',
      plotId: placement.plotId,
    };
    const occupancy = checkAuthoredPlotOccupancy(
      context.scenario.stationGridDefinition,
      state.stationOccupancy,
      occupant,
    );
    cells = occupancy.cells;
    geometryValid = occupancy.ok;
    if (!occupancy.ok) issues.push(...occupancy.issues.map(fromOccupancyIssue));
  } else {
    const placement = request.placement;
    if (placement.kind !== 'flexible') {
      throw new RangeError('Construction placement narrowing failed.');
    }
    occupant = {
      footprint: { ...blueprint.footprint },
      id: occupantId,
      origin: { ...placement.origin },
      placement: 'flexible',
      rotation: placement.rotation,
      structureId: blueprint.structureId,
    };
    const occupancy = checkFlexibleOccupancy(
      context.scenario.stationGridDefinition,
      state.stationOccupancy,
      occupant,
    );
    cells = occupancy.cells;
    geometryValid = occupancy.ok;
    if (!occupancy.ok) issues.push(...occupancy.issues.map(fromOccupancyIssue));
    if (!blueprint.allowedRotations.includes(placement.rotation)) {
      issues.push(constructionIssue('rotation-not-allowed', cells));
      geometryValid = false;
    }
  }

  const employeeCells = new Map<string, GridCoordinate[]>();
  const activeRouteCells = new Map<string, GridCoordinate[]>();
  for (const employee of state.employees) {
    const occupied = cellsOverlap(cells, [employee.position]);
    if (occupied.length > 0) employeeCells.set(employee.id, [...occupied]);
    if (employee.activity.status === 'traveling') {
      const remainingRoute = employee.activity.path.slice(
        employee.activity.nextPathIndex,
      );
      const blocked = cellsOverlap(cells, remainingRoute);
      if (blocked.length > 0) activeRouteCells.set(employee.id, [...blocked]);
    }
  }
  if (employeeCells.size > 0) {
    issues.push(
      constructionIssue('employee-cell-occupied', [...employeeCells.values()].flat(), {
        employeeIds: [...employeeCells.keys()].sort(compareIds),
      }),
    );
  }
  if (activeRouteCells.size > 0) {
    issues.push(
      constructionIssue(
        'active-route-obstructed',
        [...activeRouteCells.values()].flat(),
        { employeeIds: [...activeRouteCells.keys()].sort(compareIds) },
      ),
    );
  }
  if (geometryValid && employeeCells.size === 0) {
    const hypotheticalOccupancy = {
      ...state.stationOccupancy,
      occupants: [...state.stationOccupancy.occupants, occupant].sort((left, right) =>
        compareIds(left.id, right.id),
      ),
    };
    issues.push(
      ...evaluateRequiredStationAccess(
        context.scenario,
        hypotheticalOccupancy,
        state.employees,
      ).map(fromRequiredAccessIssue),
    );
  }
  if (state.resources.cash < blueprint.cost.cash) {
    issues.push(
      constructionIssue('insufficient-cash', [], {
        available: state.resources.cash,
        required: blueprint.cost.cash,
      }),
    );
  }
  if (state.resources.scrap < blueprint.cost.scrap) {
    issues.push(
      constructionIssue('insufficient-scrap', [], {
        available: state.resources.scrap,
        required: blueprint.cost.scrap,
      }),
    );
  }

  if (issues.length > 0) {
    return {
      blueprint,
      cells: cloneCells(cells),
      cost: { ...blueprint.cost },
      issues: sortedIssues(issues),
      occupant,
      ok: false,
    };
  }
  return {
    blueprint,
    cells: cloneCells(cells),
    cost: { ...blueprint.cost },
    issues: [],
    occupant,
    ok: true,
  };
};

export const appendConstructedOccupant = (
  state: SimulationState,
  evaluation: Extract<ConstructionEvaluation, { ok: true }>,
): Pick<
  SimulationState,
  'nextConstructionSequence' | 'resources' | 'stationOccupancy'
> => ({
  nextConstructionSequence: state.nextConstructionSequence + 1,
  resources: {
    ...state.resources,
    cash: state.resources.cash - evaluation.cost.cash,
    scrap: state.resources.scrap - evaluation.cost.scrap,
  },
  stationOccupancy: {
    ...state.stationOccupancy,
    occupants: [...state.stationOccupancy.occupants, evaluation.occupant].sort(
      (left, right) => compareIds(left.id, right.id),
    ),
  },
});
