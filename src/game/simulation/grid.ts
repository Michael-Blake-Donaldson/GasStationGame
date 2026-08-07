export interface GridCoordinate {
  readonly x: number;
  readonly z: number;
}

export interface RectangularFootprint {
  readonly width: number;
  readonly height: number;
}

export type QuarterTurn = 0 | 1 | 2 | 3;

export interface GridRectangle {
  readonly origin: GridCoordinate;
  readonly footprint: RectangularFootprint;
}

export interface AuthoredPlotDefinition extends GridRectangle {
  readonly allowedFacilityIds: readonly string[];
  readonly id: string;
  readonly rotation: QuarterTurn;
}

export interface FixedOccupantDefinition extends GridRectangle {
  readonly id: string;
  readonly rotation: QuarterTurn;
  readonly structureId: string;
}

export interface AuthoredFacilityOccupantDefinition {
  readonly facilityId: string;
  readonly id: string;
  readonly plotId: string;
}

export interface StationGridDefinition {
  readonly authoredPlots: readonly AuthoredPlotDefinition[];
  readonly cellSizeMeters: number;
  readonly flexibleBuildAreas: readonly GridRectangle[];
  readonly height: number;
  readonly id: string;
  readonly initialAuthoredOccupants: readonly AuthoredFacilityOccupantDefinition[];
  readonly initialFixedOccupants: readonly FixedOccupantDefinition[];
  readonly version: number;
  readonly width: number;
}

export type PlacedOccupant =
  | {
      readonly id: string;
      readonly origin: GridCoordinate;
      readonly placement: 'fixed' | 'flexible';
      readonly footprint: RectangularFootprint;
      readonly rotation: QuarterTurn;
      readonly structureId: string;
    }
  | {
      readonly facilityId: string;
      readonly id: string;
      readonly placement: 'authored-plot';
      readonly plotId: string;
    };

export interface StationOccupancyState {
  readonly gridDefinitionId: string;
  readonly gridDefinitionVersion: number;
  readonly occupants: readonly PlacedOccupant[];
}

export type OccupancyRejectionReason =
  | 'authored-plot-not-found'
  | 'authored-plot-occupied'
  | 'authored-plot-reserved'
  | 'cell-not-buildable'
  | 'cell-occupied'
  | 'facility-not-allowed'
  | 'invalid-candidate'
  | 'occupant-id-already-used'
  | 'out-of-bounds';

export interface OccupancyIssue {
  readonly cells: readonly GridCoordinate[];
  readonly conflictingOccupantIds?: readonly string[];
  readonly plotId?: string;
  readonly reason: OccupancyRejectionReason;
}

export type OccupancyCheck =
  | { readonly cells: readonly GridCoordinate[]; readonly ok: true }
  | {
      readonly cells: readonly GridCoordinate[];
      readonly issues: readonly OccupancyIssue[];
      readonly ok: false;
    };

export interface FlexibleOccupancyCandidate extends GridRectangle {
  readonly id: string;
  readonly rotation: QuarterTurn;
  readonly structureId: string;
}

export interface AuthoredPlotOccupancyCandidate {
  readonly facilityId: string;
  readonly id: string;
  readonly plotId: string;
}

const TECHNICAL_ID = /^[a-z0-9-]+$/u;

const issuePriority: Record<OccupancyRejectionReason, number> = {
  'invalid-candidate': 0,
  'occupant-id-already-used': 1,
  'authored-plot-not-found': 2,
  'facility-not-allowed': 3,
  'out-of-bounds': 4,
  'cell-not-buildable': 5,
  'authored-plot-reserved': 6,
  'authored-plot-occupied': 7,
  'cell-occupied': 8,
};

const compareCells = (left: GridCoordinate, right: GridCoordinate): number =>
  left.z - right.z || left.x - right.x;

const compareTechnicalIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const cloneCells = (cells: readonly GridCoordinate[]): readonly GridCoordinate[] =>
  cells.map(({ x, z }) => ({ x, z }));

const assertSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${name} must be a safe integer.`);
};

const assertPositiveSafeInteger = (value: number, name: string): void => {
  assertSafeInteger(value, name);
  if (value < 1) throw new RangeError(`${name} must be positive.`);
};

const assertTechnicalId = (value: string, name: string): void => {
  if (!TECHNICAL_ID.test(value)) throw new TypeError(`${name} must be a technical ID.`);
};

const assertQuarterTurn: (rotation: number) => asserts rotation is QuarterTurn = (
  rotation,
) => {
  if (rotation !== 0 && rotation !== 1 && rotation !== 2 && rotation !== 3) {
    throw new RangeError('rotation must be a quarter turn from 0 through 3.');
  }
};

const assertFootprint = (footprint: RectangularFootprint): void => {
  assertPositiveSafeInteger(footprint.width, 'footprint.width');
  assertPositiveSafeInteger(footprint.height, 'footprint.height');
  if (!Number.isSafeInteger(footprint.width * footprint.height)) {
    throw new RangeError('footprint cell count exceeds the safe integer range.');
  }
};

const assertOrigin = (origin: GridCoordinate): void => {
  assertSafeInteger(origin.x, 'origin.x');
  assertSafeInteger(origin.z, 'origin.z');
};

export const isGridCellInBounds = (
  definition: Pick<StationGridDefinition, 'height' | 'width'>,
  coordinate: GridCoordinate,
): boolean =>
  Number.isSafeInteger(coordinate.x) &&
  Number.isSafeInteger(coordinate.z) &&
  coordinate.x >= 0 &&
  coordinate.z >= 0 &&
  coordinate.x < definition.width &&
  coordinate.z < definition.height;

export const gridCellIndex = (
  definition: Pick<StationGridDefinition, 'height' | 'width'>,
  coordinate: GridCoordinate,
): number => {
  if (!isGridCellInBounds(definition, coordinate)) {
    throw new RangeError('Grid coordinate is outside the station bounds.');
  }
  return coordinate.z * definition.width + coordinate.x;
};

export const cellsForFootprint = (
  origin: GridCoordinate,
  footprint: RectangularFootprint,
  rotation: QuarterTurn,
): readonly GridCoordinate[] => {
  assertOrigin(origin);
  assertFootprint(footprint);
  assertQuarterTurn(rotation);

  const cells: GridCoordinate[] = [];
  for (let z = 0; z < footprint.height; z += 1) {
    for (let x = 0; x < footprint.width; x += 1) {
      switch (rotation) {
        case 0:
          cells.push({ x: origin.x + x, z: origin.z + z });
          break;
        case 1:
          cells.push({ x: origin.x + footprint.height - 1 - z, z: origin.z + x });
          break;
        case 2:
          cells.push({
            x: origin.x + footprint.width - 1 - x,
            z: origin.z + footprint.height - 1 - z,
          });
          break;
        case 3:
          cells.push({ x: origin.x + z, z: origin.z + footprint.width - 1 - x });
          break;
      }
    }
  }
  return cells.sort(compareCells);
};

const cellsForPlot = (plot: AuthoredPlotDefinition): readonly GridCoordinate[] =>
  cellsForFootprint(plot.origin, plot.footprint, plot.rotation);

const findPlot = (
  definition: StationGridDefinition,
  plotId: string,
): AuthoredPlotDefinition | undefined =>
  definition.authoredPlots.find((plot) => plot.id === plotId);

const cellsForOccupant = (
  definition: StationGridDefinition,
  occupant: PlacedOccupant,
): readonly GridCoordinate[] => {
  if (occupant.placement !== 'authored-plot') {
    return cellsForFootprint(occupant.origin, occupant.footprint, occupant.rotation);
  }
  const plot = findPlot(definition, occupant.plotId);
  if (plot === undefined) {
    throw new RangeError(
      `Occupant ${occupant.id} references an unknown authored plot.`,
    );
  }
  return cellsForPlot(plot);
};

const assertRectangleInBounds = (
  definition: StationGridDefinition,
  rectangle: GridRectangle,
  name: string,
  rotation: QuarterTurn = 0,
): void => {
  const cells = cellsForFootprint(rectangle.origin, rectangle.footprint, rotation);
  if (cells.some((cell) => !isGridCellInBounds(definition, cell))) {
    throw new RangeError(`${name} extends outside the station grid.`);
  }
};

const assertUniqueIds = (
  entries: readonly { readonly id: string }[],
  name: string,
): void => {
  const ids = new Set<string>();
  for (const entry of entries) {
    assertTechnicalId(entry.id, `${name}.id`);
    if (ids.has(entry.id))
      throw new RangeError(`${name} contains duplicate ID ${entry.id}.`);
    ids.add(entry.id);
  }
};

export const assertStationGridDefinition = (
  definition: StationGridDefinition,
): void => {
  assertTechnicalId(definition.id, 'grid.id');
  assertPositiveSafeInteger(definition.version, 'grid.version');
  assertPositiveSafeInteger(definition.width, 'grid.width');
  assertPositiveSafeInteger(definition.height, 'grid.height');
  if (!Number.isSafeInteger(definition.width * definition.height)) {
    throw new RangeError('grid cell count exceeds the safe integer range.');
  }
  if (!Number.isFinite(definition.cellSizeMeters) || definition.cellSizeMeters <= 0) {
    throw new RangeError('grid.cellSizeMeters must be positive and finite.');
  }

  assertUniqueIds(definition.authoredPlots, 'authoredPlots');
  assertUniqueIds(definition.initialFixedOccupants, 'initialFixedOccupants');
  assertUniqueIds(definition.initialAuthoredOccupants, 'initialAuthoredOccupants');

  for (const [index, area] of definition.flexibleBuildAreas.entries()) {
    assertRectangleInBounds(definition, area, `flexibleBuildAreas[${String(index)}]`);
  }

  const reservedPlotCells = new Set<number>();
  for (const plot of definition.authoredPlots) {
    assertQuarterTurn(plot.rotation);
    assertRectangleInBounds(
      definition,
      plot,
      `authored plot ${plot.id}`,
      plot.rotation,
    );
    if (plot.allowedFacilityIds.length === 0) {
      throw new RangeError(
        `Authored plot ${plot.id} must allow at least one facility.`,
      );
    }
    const allowed = new Set<string>();
    for (const facilityId of plot.allowedFacilityIds) {
      assertTechnicalId(facilityId, `authored plot ${plot.id} facility ID`);
      if (allowed.has(facilityId)) {
        throw new RangeError(
          `Authored plot ${plot.id} repeats facility ${facilityId}.`,
        );
      }
      allowed.add(facilityId);
    }
    for (const cell of cellsForPlot(plot)) {
      const index = gridCellIndex(definition, cell);
      if (reservedPlotCells.has(index)) throw new RangeError('Authored plots overlap.');
      reservedPlotCells.add(index);
    }
  }

  const occupantIds = new Set<string>();
  const occupiedCells = new Set<number>();
  for (const fixed of definition.initialFixedOccupants) {
    assertTechnicalId(fixed.structureId, `fixed occupant ${fixed.id} structureId`);
    assertQuarterTurn(fixed.rotation);
    assertRectangleInBounds(
      definition,
      fixed,
      `fixed occupant ${fixed.id}`,
      fixed.rotation,
    );
    occupantIds.add(fixed.id);
    for (const cell of cellsForFootprint(
      fixed.origin,
      fixed.footprint,
      fixed.rotation,
    )) {
      const index = gridCellIndex(definition, cell);
      if (reservedPlotCells.has(index)) {
        throw new RangeError(`Fixed occupant ${fixed.id} overlaps an authored plot.`);
      }
      if (occupiedCells.has(index))
        throw new RangeError('Initial fixed occupants overlap.');
      occupiedCells.add(index);
    }
  }

  const occupiedPlots = new Set<string>();
  for (const occupant of definition.initialAuthoredOccupants) {
    assertTechnicalId(
      occupant.facilityId,
      `authored occupant ${occupant.id} facilityId`,
    );
    if (occupantIds.has(occupant.id)) {
      throw new RangeError(`Initial occupant ID ${occupant.id} is duplicated.`);
    }
    occupantIds.add(occupant.id);
    const plot = findPlot(definition, occupant.plotId);
    if (plot === undefined) {
      throw new RangeError(
        `Initial occupant ${occupant.id} references an unknown plot.`,
      );
    }
    if (!plot.allowedFacilityIds.includes(occupant.facilityId)) {
      throw new RangeError(
        `Initial occupant ${occupant.id} is not allowed on its plot.`,
      );
    }
    if (occupiedPlots.has(plot.id))
      throw new RangeError(`Authored plot ${plot.id} is occupied twice.`);
    occupiedPlots.add(plot.id);
  }
};

const compareOccupants = (left: PlacedOccupant, right: PlacedOccupant): number =>
  compareTechnicalIds(left.id, right.id);

export const createStationOccupancyState = (
  definition: StationGridDefinition,
): StationOccupancyState => {
  assertStationGridDefinition(definition);
  const occupants: PlacedOccupant[] = [
    ...definition.initialFixedOccupants.map((occupant): PlacedOccupant => ({
      footprint: { ...occupant.footprint },
      id: occupant.id,
      origin: { ...occupant.origin },
      placement: 'fixed',
      rotation: occupant.rotation,
      structureId: occupant.structureId,
    })),
    ...definition.initialAuthoredOccupants.map((occupant): PlacedOccupant => ({
      facilityId: occupant.facilityId,
      id: occupant.id,
      placement: 'authored-plot',
      plotId: occupant.plotId,
    })),
  ].sort(compareOccupants);
  return {
    gridDefinitionId: definition.id,
    gridDefinitionVersion: definition.version,
    occupants,
  };
};

const assertStateMatchesDefinition = (
  definition: StationGridDefinition,
  state: StationOccupancyState,
): void => {
  if (
    state.gridDefinitionId !== definition.id ||
    state.gridDefinitionVersion !== definition.version
  ) {
    throw new RangeError('Occupancy state does not match the station grid definition.');
  }
};

export const assertStationOccupancySnapshot = (state: StationOccupancyState): void => {
  assertTechnicalId(state.gridDefinitionId, 'occupancy.gridDefinitionId');
  assertPositiveSafeInteger(
    state.gridDefinitionVersion,
    'occupancy.gridDefinitionVersion',
  );
  assertUniqueIds(state.occupants, 'occupancy.occupants');

  for (const occupant of state.occupants) {
    const placement: unknown = occupant.placement;
    if (
      placement !== 'authored-plot' &&
      placement !== 'fixed' &&
      placement !== 'flexible'
    ) {
      throw new TypeError(`Occupant ${occupant.id} has an invalid placement kind.`);
    }
    if (occupant.placement === 'authored-plot') {
      assertTechnicalId(occupant.facilityId, `occupant ${occupant.id} facilityId`);
      assertTechnicalId(occupant.plotId, `occupant ${occupant.id} plotId`);
      continue;
    }
    assertTechnicalId(occupant.structureId, `occupant ${occupant.id} structureId`);
    assertOrigin(occupant.origin);
    assertFootprint(occupant.footprint);
    assertQuarterTurn(occupant.rotation);
  }
};

export const assertStationOccupancyState = (
  definition: StationGridDefinition,
  state: StationOccupancyState,
): void => {
  assertStationGridDefinition(definition);
  assertStationOccupancySnapshot(state);
  assertStateMatchesDefinition(definition, state);

  const occupiedPlots = new Set<string>();
  const occupiedCells = new Map<number, string>();
  const flexibleCells = cellSetForRectangles(definition, definition.flexibleBuildAreas);
  const reservedPlotCells = new Set(
    definition.authoredPlots.flatMap((plot) =>
      cellsForPlot(plot).map((cell) => gridCellIndex(definition, cell)),
    ),
  );

  for (const occupant of [...state.occupants].sort(compareOccupants)) {
    if (occupant.placement === 'authored-plot') {
      const plot = findPlot(definition, occupant.plotId);
      if (plot === undefined) {
        throw new RangeError(`Occupant ${occupant.id} references an unknown plot.`);
      }
      if (!plot.allowedFacilityIds.includes(occupant.facilityId)) {
        throw new RangeError(`Occupant ${occupant.id} is not allowed on its plot.`);
      }
      if (occupiedPlots.has(plot.id)) {
        throw new RangeError(`Authored plot ${plot.id} is occupied twice.`);
      }
      occupiedPlots.add(plot.id);
    } else {
      assertRectangleInBounds(
        definition,
        occupant,
        `occupant ${occupant.id}`,
        occupant.rotation,
      );
      const cells = cellsForFootprint(
        occupant.origin,
        occupant.footprint,
        occupant.rotation,
      );
      const overlapsReservedPlot = cells.some((cell) =>
        reservedPlotCells.has(gridCellIndex(definition, cell)),
      );
      if (occupant.placement === 'fixed' && overlapsReservedPlot) {
        throw new RangeError(
          `Fixed occupant ${occupant.id} overlaps an authored plot.`,
        );
      }
      if (
        occupant.placement === 'flexible' &&
        (overlapsReservedPlot ||
          cells.some((cell) => !flexibleCells.has(gridCellIndex(definition, cell))))
      ) {
        throw new RangeError(
          `Flexible occupant ${occupant.id} is outside valid flexible cells.`,
        );
      }
    }

    for (const cell of cellsForOccupant(definition, occupant)) {
      const index = gridCellIndex(definition, cell);
      const existing = occupiedCells.get(index);
      if (existing !== undefined) {
        throw new RangeError(`Occupants ${existing} and ${occupant.id} overlap.`);
      }
      occupiedCells.set(index, occupant.id);
    }
  }
};

export const buildOccupancyIndex = (
  definition: StationGridDefinition,
  state: StationOccupancyState,
): ReadonlyMap<number, string> => {
  assertStationOccupancyState(definition, state);
  return buildOccupancyIndexUnchecked(definition, state);
};

const buildOccupancyIndexUnchecked = (
  definition: StationGridDefinition,
  state: StationOccupancyState,
): ReadonlyMap<number, string> => {
  const index = new Map<number, string>();
  for (const occupant of [...state.occupants].sort(compareOccupants)) {
    for (const cell of cellsForOccupant(definition, occupant)) {
      const cellIndex = gridCellIndex(definition, cell);
      index.set(cellIndex, occupant.id);
    }
  }
  return index;
};

export const occupantAt = (
  definition: StationGridDefinition,
  state: StationOccupancyState,
  coordinate: GridCoordinate,
): string | undefined =>
  buildOccupancyIndex(definition, state).get(gridCellIndex(definition, coordinate));

export const cellsOccupiedBy = (
  definition: StationGridDefinition,
  state: StationOccupancyState,
  occupantId: string,
): readonly GridCoordinate[] => {
  assertStationOccupancyState(definition, state);
  const occupant = state.occupants.find((candidate) => candidate.id === occupantId);
  return occupant === undefined
    ? []
    : cloneCells(cellsForOccupant(definition, occupant));
};

const cellSetForRectangles = (
  definition: StationGridDefinition,
  rectangles: readonly GridRectangle[],
): ReadonlySet<number> => {
  const cells = new Set<number>();
  for (const rectangle of rectangles) {
    for (const cell of cellsForFootprint(rectangle.origin, rectangle.footprint, 0)) {
      if (isGridCellInBounds(definition, cell))
        cells.add(gridCellIndex(definition, cell));
    }
  }
  return cells;
};

const sortedIssues = (issues: readonly OccupancyIssue[]): readonly OccupancyIssue[] =>
  [...issues].sort(
    (left, right) =>
      issuePriority[left.reason] - issuePriority[right.reason] ||
      (left.cells[0] === undefined
        ? -1
        : right.cells[0] === undefined
          ? 1
          : compareCells(left.cells[0], right.cells[0])),
  );

const issue = (
  reason: OccupancyRejectionReason,
  cells: readonly GridCoordinate[],
  extra: Pick<OccupancyIssue, 'conflictingOccupantIds' | 'plotId'> = {},
): OccupancyIssue => ({
  ...extra,
  cells: cloneCells([...cells].sort(compareCells)),
  reason,
});

const invalidFlexibleCandidate = (candidate: FlexibleOccupancyCandidate): boolean => {
  try {
    assertTechnicalId(candidate.id, 'candidate.id');
    assertTechnicalId(candidate.structureId, 'candidate.structureId');
    assertOrigin(candidate.origin);
    assertFootprint(candidate.footprint);
    assertQuarterTurn(candidate.rotation);
    return false;
  } catch {
    return true;
  }
};

export const checkFlexibleOccupancy = (
  definition: StationGridDefinition,
  state: StationOccupancyState,
  candidate: FlexibleOccupancyCandidate,
): OccupancyCheck => {
  assertStationOccupancyState(definition, state);
  if (invalidFlexibleCandidate(candidate)) {
    return { cells: [], issues: [issue('invalid-candidate', [])], ok: false };
  }

  const cells = cellsForFootprint(
    candidate.origin,
    candidate.footprint,
    candidate.rotation,
  );
  const issues: OccupancyIssue[] = [];
  if (state.occupants.some((occupant) => occupant.id === candidate.id)) {
    issues.push(issue('occupant-id-already-used', []));
  }

  const outOfBounds = cells.filter((cell) => !isGridCellInBounds(definition, cell));
  if (outOfBounds.length > 0) issues.push(issue('out-of-bounds', outOfBounds));

  const flexibleCells = cellSetForRectangles(definition, definition.flexibleBuildAreas);
  const inBounds = cells.filter((cell) => isGridCellInBounds(definition, cell));
  const notBuildable = inBounds.filter(
    (cell) => !flexibleCells.has(gridCellIndex(definition, cell)),
  );
  if (notBuildable.length > 0) issues.push(issue('cell-not-buildable', notBuildable));

  for (const plot of definition.authoredPlots) {
    const reserved = new Set(
      cellsForPlot(plot).map((cell) => gridCellIndex(definition, cell)),
    );
    const overlap = inBounds.filter((cell) =>
      reserved.has(gridCellIndex(definition, cell)),
    );
    if (overlap.length > 0) {
      issues.push(issue('authored-plot-reserved', overlap, { plotId: plot.id }));
    }
  }

  const occupancyIndex = buildOccupancyIndexUnchecked(definition, state);
  const conflicts = new Map<string, GridCoordinate[]>();
  for (const cell of inBounds) {
    const occupantId = occupancyIndex.get(gridCellIndex(definition, cell));
    if (occupantId !== undefined) {
      const conflictCells = conflicts.get(occupantId) ?? [];
      conflictCells.push(cell);
      conflicts.set(occupantId, conflictCells);
    }
  }
  for (const [occupantId, conflictCells] of [...conflicts].sort(([left], [right]) =>
    compareTechnicalIds(left, right),
  )) {
    issues.push(
      issue('cell-occupied', conflictCells, { conflictingOccupantIds: [occupantId] }),
    );
  }

  return issues.length === 0
    ? { cells: cloneCells(cells), ok: true }
    : { cells: cloneCells(cells), issues: sortedIssues(issues), ok: false };
};

export const checkAuthoredPlotOccupancy = (
  definition: StationGridDefinition,
  state: StationOccupancyState,
  candidate: AuthoredPlotOccupancyCandidate,
): OccupancyCheck => {
  assertStationOccupancyState(definition, state);
  try {
    assertTechnicalId(candidate.id, 'candidate.id');
    assertTechnicalId(candidate.facilityId, 'candidate.facilityId');
    assertTechnicalId(candidate.plotId, 'candidate.plotId');
  } catch {
    return { cells: [], issues: [issue('invalid-candidate', [])], ok: false };
  }

  const issues: OccupancyIssue[] = [];
  if (state.occupants.some((occupant) => occupant.id === candidate.id)) {
    issues.push(issue('occupant-id-already-used', []));
  }
  const plot = findPlot(definition, candidate.plotId);
  if (plot === undefined) {
    issues.push(issue('authored-plot-not-found', [], { plotId: candidate.plotId }));
    return { cells: [], issues: sortedIssues(issues), ok: false };
  }

  const cells = cellsForPlot(plot);
  if (!plot.allowedFacilityIds.includes(candidate.facilityId)) {
    issues.push(issue('facility-not-allowed', cells, { plotId: plot.id }));
  }
  const plotOccupant = state.occupants.find(
    (occupant) => occupant.placement === 'authored-plot' && occupant.plotId === plot.id,
  );
  if (plotOccupant !== undefined) {
    issues.push(
      issue('authored-plot-occupied', cells, {
        conflictingOccupantIds: [plotOccupant.id],
        plotId: plot.id,
      }),
    );
  }

  const occupancyIndex = buildOccupancyIndexUnchecked(definition, state);
  const conflictingIds = [
    ...new Set(
      cells
        .map((cell) => occupancyIndex.get(gridCellIndex(definition, cell)))
        .filter((id): id is string => id !== undefined),
    ),
  ].sort(compareTechnicalIds);
  if (conflictingIds.length > 0 && plotOccupant === undefined) {
    issues.push(
      issue('cell-occupied', cells, {
        conflictingOccupantIds: conflictingIds,
        plotId: plot.id,
      }),
    );
  }

  return issues.length === 0
    ? { cells: cloneCells(cells), ok: true }
    : { cells: cloneCells(cells), issues: sortedIssues(issues), ok: false };
};
