import { describe, expect, it } from 'vitest';
import { greatPlainsRegion } from '../../content/regions/greatPlains';
import type { StationGridDefinition } from '../../content/schema';
import {
  assertStationGridDefinition,
  assertStationOccupancyState,
  buildOccupancyIndex,
  cellsForFootprint,
  cellsOccupiedBy,
  checkAuthoredPlotOccupancy,
  checkFlexibleOccupancy,
  createStationOccupancyState,
  gridCellIndex,
  isGridCellInBounds,
  occupantAt,
  type GridCoordinate,
  type QuarterTurn,
} from './grid';

const definition: StationGridDefinition = greatPlainsRegion.stationGrid;

describe('station grid and occupancy', () => {
  it('validates the authored Great Plains grid and creates canonical initial occupancy', () => {
    expect(() => assertStationGridDefinition(definition)).not.toThrow();
    const state = createStationOccupancyState(definition);
    expect(state).toEqual({
      gridDefinitionId: 'great-plains-station-grid',
      gridDefinitionVersion: 1,
      occupants: [
        {
          footprint: { height: 1, width: 1 },
          id: 'beacon-sign',
          origin: { x: 3, z: 6 },
          placement: 'fixed',
          rotation: 0,
          structureId: 'beacon-sign',
        },
        {
          facilityId: 'facility-main-store',
          id: 'main-store',
          placement: 'authored-plot',
          plotId: 'main-store-plot',
        },
        {
          footprint: { height: 2, width: 2 },
          id: 'pump-island-east',
          origin: { x: 14, z: 6 },
          placement: 'fixed',
          rotation: 0,
          structureId: 'fuel-pump-island',
        },
        {
          footprint: { height: 2, width: 2 },
          id: 'pump-island-west',
          origin: { x: 9, z: 6 },
          placement: 'fixed',
          rotation: 0,
          structureId: 'fuel-pump-island',
        },
      ],
    });
  });

  it('queries fixed, authored, empty, and out-of-bounds cells', () => {
    const state = createStationOccupancyState(definition);
    expect(occupantAt(definition, state, { x: 3, z: 6 })).toBe('beacon-sign');
    expect(occupantAt(definition, state, { x: 9, z: 6 })).toBe('pump-island-west');
    expect(occupantAt(definition, state, { x: 8, z: 11 })).toBe('main-store');
    expect(occupantAt(definition, state, { x: 21, z: 11 })).toBeUndefined();
    expect(() => occupantAt(definition, state, { x: 32, z: 0 })).toThrow(/outside/u);
  });

  it('keeps an empty authored garage plot reserved from flexible placement', () => {
    const result = checkFlexibleOccupancy(
      definition,
      createStationOccupancyState(definition),
      {
        footprint: { height: 1, width: 1 },
        id: 'candidate-wall',
        origin: { x: 21, z: 11 },
        rotation: 0,
        structureId: 'wall',
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok)
      throw new Error('Garage reservation unexpectedly accepted placement.');
    expect(result.issues.map(({ reason }) => reason)).toEqual([
      'authored-plot-reserved',
    ]);
  });

  it('accepts free property cells and rejects road and occupied cells with causes', () => {
    const state = createStationOccupancyState(definition);
    const free = checkFlexibleOccupancy(definition, state, {
      footprint: { height: 1, width: 2 },
      id: 'candidate-wall',
      origin: { x: 0, z: 20 },
      rotation: 0,
      structureId: 'wall',
    });
    expect(free).toEqual({
      cells: [
        { x: 0, z: 20 },
        { x: 1, z: 20 },
      ],
      ok: true,
    });

    const road = checkFlexibleOccupancy(definition, state, {
      footprint: { height: 1, width: 1 },
      id: 'candidate-road-wall',
      origin: { x: 4, z: 3 },
      rotation: 0,
      structureId: 'wall',
    });
    expect(road.ok ? [] : road.issues.map(({ reason }) => reason)).toEqual([
      'cell-not-buildable',
    ]);

    const pump = checkFlexibleOccupancy(definition, state, {
      footprint: { height: 1, width: 1 },
      id: 'candidate-pump-wall',
      origin: { x: 9, z: 6 },
      rotation: 0,
      structureId: 'wall',
    });
    expect(pump.ok ? [] : pump.issues.map(({ reason }) => reason)).toEqual([
      'cell-occupied',
    ]);
    if (!pump.ok) {
      expect(pump.issues[0]?.conflictingOccupantIds).toEqual(['pump-island-west']);
    }
  });

  it('reports every out-of-bounds footprint cell in row-major order', () => {
    const result = checkFlexibleOccupancy(
      definition,
      createStationOccupancyState(definition),
      {
        footprint: { height: 2, width: 2 },
        id: 'candidate-edge-wall',
        origin: { x: 31, z: 23 },
        rotation: 0,
        structureId: 'wall',
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Out-of-bounds placement was accepted.');
    expect(
      result.issues.find(({ reason }) => reason === 'out-of-bounds')?.cells,
    ).toEqual([
      { x: 32, z: 23 },
      { x: 31, z: 24 },
      { x: 32, z: 24 },
    ]);
  });

  it('checks compatible, incompatible, occupied, and missing authored plots', () => {
    const state = createStationOccupancyState(definition);
    expect(
      checkAuthoredPlotOccupancy(definition, state, {
        facilityId: 'facility-garage',
        id: 'garage',
        plotId: 'garage-plot',
      }).ok,
    ).toBe(true);

    const incompatible = checkAuthoredPlotOccupancy(definition, state, {
      facilityId: 'facility-diner',
      id: 'diner',
      plotId: 'garage-plot',
    });
    expect(
      incompatible.ok ? [] : incompatible.issues.map(({ reason }) => reason),
    ).toEqual(['facility-not-allowed']);

    const occupied = checkAuthoredPlotOccupancy(definition, state, {
      facilityId: 'facility-main-store',
      id: 'second-store',
      plotId: 'main-store-plot',
    });
    expect(occupied.ok ? [] : occupied.issues.map(({ reason }) => reason)).toEqual([
      'authored-plot-occupied',
    ]);

    const missing = checkAuthoredPlotOccupancy(definition, state, {
      facilityId: 'facility-garage',
      id: 'garage',
      plotId: 'missing-plot',
    });
    expect(missing.ok ? [] : missing.issues.map(({ reason }) => reason)).toEqual([
      'authored-plot-not-found',
    ]);
  });

  it('expands every rotation into a unique row-major footprint', () => {
    const expectedByRotation: Record<QuarterTurn, readonly GridCoordinate[]> = {
      0: [
        { x: 4, z: 5 },
        { x: 5, z: 5 },
        { x: 6, z: 5 },
        { x: 4, z: 6 },
        { x: 5, z: 6 },
        { x: 6, z: 6 },
      ],
      1: [
        { x: 4, z: 5 },
        { x: 5, z: 5 },
        { x: 4, z: 6 },
        { x: 5, z: 6 },
        { x: 4, z: 7 },
        { x: 5, z: 7 },
      ],
      2: [
        { x: 4, z: 5 },
        { x: 5, z: 5 },
        { x: 6, z: 5 },
        { x: 4, z: 6 },
        { x: 5, z: 6 },
        { x: 6, z: 6 },
      ],
      3: [
        { x: 4, z: 5 },
        { x: 5, z: 5 },
        { x: 4, z: 6 },
        { x: 5, z: 6 },
        { x: 4, z: 7 },
        { x: 5, z: 7 },
      ],
    };

    for (const rotation of [0, 1, 2, 3] as const) {
      const cells = cellsForFootprint(
        { x: 4, z: 5 },
        { height: 2, width: 3 },
        rotation,
      );
      expect(cells).toEqual(expectedByRotation[rotation]);
      expect(
        new Set(cells.map(({ x, z }) => `${String(x)},${String(z)}`)),
      ).toHaveLength(6);
      expect(cells).toEqual(
        [...cells].sort((left, right) => left.z - right.z || left.x - right.x),
      );
    }
  });

  it('keeps bounds and numeric index behavior exact across the full grid', () => {
    const indexes = new Set<number>();
    for (let z = 0; z < definition.height; z += 1) {
      for (let x = 0; x < definition.width; x += 1) {
        const cell = { x, z };
        expect(isGridCellInBounds(definition, cell)).toBe(true);
        indexes.add(gridCellIndex(definition, cell));
      }
    }
    expect(indexes.size).toBe(definition.width * definition.height);
    expect(Math.min(...indexes)).toBe(0);
    expect(Math.max(...indexes)).toBe(definition.width * definition.height - 1);
  });

  it('builds the same state and index regardless of authored source order', () => {
    const reversed: StationGridDefinition = {
      ...definition,
      authoredPlots: [...definition.authoredPlots].reverse(),
      flexibleBuildAreas: [...definition.flexibleBuildAreas].reverse(),
      initialAuthoredOccupants: [...definition.initialAuthoredOccupants].reverse(),
      initialFixedOccupants: [...definition.initialFixedOccupants].reverse(),
    };
    const originalState = createStationOccupancyState(definition);
    const reversedState = createStationOccupancyState(reversed);
    expect(reversedState).toEqual(originalState);
    expect([...buildOccupancyIndex(reversed, reversedState)]).toEqual([
      ...buildOccupancyIndex(definition, originalState),
    ]);
  });

  it('returns detached cells and state snapshots', () => {
    const mutableDefinition = structuredClone(definition);
    const state = createStationOccupancyState(mutableDefinition);
    const storeCells = cellsOccupiedBy(mutableDefinition, state, 'main-store');
    expect(storeCells).toHaveLength(48);
    const firstFixedOccupant = mutableDefinition.initialFixedOccupants.at(0);
    if (firstFixedOccupant === undefined) {
      throw new Error('Great Plains grid fixtures are incomplete.');
    }

    firstFixedOccupant.origin.x = 30;
    (storeCells[0] as { x: number }).x = 31;
    expect(state.occupants.find(({ id }) => id === 'beacon-sign')).toMatchObject({
      origin: { x: 3, z: 6 },
    });
    expect(cellsOccupiedBy(definition, state, 'main-store')[0]).toEqual({
      x: 8,
      z: 11,
    });
  });

  it('rejects malformed or overlapping authored definitions', () => {
    const firstPlot = definition.authoredPlots.at(0);
    if (firstPlot === undefined)
      throw new Error('Great Plains plot fixture is missing.');
    expect(() => assertStationGridDefinition({ ...definition, width: 0 })).toThrow(
      /positive/u,
    );
    expect(() =>
      assertStationGridDefinition({
        ...definition,
        height: Number.MAX_SAFE_INTEGER,
        width: 2,
      }),
    ).toThrow(/cell count/u);
    expect(() =>
      assertStationGridDefinition({
        ...definition,
        authoredPlots: [firstPlot, firstPlot],
      }),
    ).toThrow(/duplicate/u);
    expect(() =>
      assertStationGridDefinition({
        ...definition,
        initialFixedOccupants: [
          ...definition.initialFixedOccupants,
          {
            footprint: { height: 1, width: 1 },
            id: 'store-overlap',
            origin: { x: 8, z: 11 },
            rotation: 0,
            structureId: 'wall',
          },
        ],
      }),
    ).toThrow(/authored plot/u);
  });

  it('rejects duplicate occupant identities before building an index', () => {
    const state = createStationOccupancyState(definition);
    const firstOccupant = state.occupants[0];
    if (firstOccupant === undefined) throw new Error('Expected an occupant fixture.');
    const duplicate = {
      ...state,
      occupants: [...state.occupants, firstOccupant],
    };

    expect(() => assertStationOccupancyState(definition, duplicate)).toThrow(
      /duplicate ID/u,
    );
    expect(() => buildOccupancyIndex(definition, duplicate)).toThrow(/duplicate ID/u);
  });
});
