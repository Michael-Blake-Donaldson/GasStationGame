import { describe, expect, it } from 'vitest';
import { greatPlainsStationGrid } from '../scenarios/greatPlains';
import {
  createStationOccupancyState,
  type StationGridDefinition,
  type StationOccupancyState,
} from './grid';
import { findStationPath } from './pathfinding';

const openGrid: StationGridDefinition = {
  authoredPlots: [],
  cellSizeMeters: 1,
  flexibleBuildAreas: [{ footprint: { height: 5, width: 5 }, origin: { x: 0, z: 0 } }],
  height: 5,
  id: 'test-grid',
  initialAuthoredOccupants: [],
  initialFixedOccupants: [],
  version: 1,
  width: 5,
};

const withFixedWalls = (
  cells: readonly { readonly x: number; readonly z: number }[],
): StationOccupancyState => ({
  gridDefinitionId: openGrid.id,
  gridDefinitionVersion: openGrid.version,
  occupants: cells.map(({ x, z }, index) => ({
    footprint: { height: 1, width: 1 },
    id: `wall-${String(index).padStart(2, '0')}`,
    origin: { x, z },
    placement: 'fixed' as const,
    rotation: 0 as const,
    structureId: 'wall',
  })),
});

describe('deterministic station pathfinding', () => {
  it('returns the shortest four-way path while excluding the start cell', () => {
    const result = findStationPath(
      openGrid,
      createStationOccupancyState(openGrid),
      { x: 0, z: 0 },
      [{ x: 2, z: 0 }],
    );

    expect(result).toEqual({
      destination: { x: 2, z: 0 },
      ok: true,
      path: [
        { x: 1, z: 0 },
        { x: 2, z: 0 },
      ],
    });
  });

  it('routes around structural occupancy with canonical neighbor tie-breaking', () => {
    const result = findStationPath(
      openGrid,
      withFixedWalls([{ x: 1, z: 0 }]),
      { x: 0, z: 0 },
      [{ x: 2, z: 0 }],
    );

    expect(result).toMatchObject({
      ok: true,
      path: [
        { x: 0, z: 1 },
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 2, z: 0 },
      ],
    });
  });

  it('chooses the lowest row-major destination among equal shortest routes', () => {
    const occupancy = createStationOccupancyState(openGrid);
    const result = findStationPath(openGrid, occupancy, { x: 2, z: 2 }, [
      { x: 3, z: 1 },
      { x: 1, z: 1 },
    ]);

    expect(result).toMatchObject({ destination: { x: 1, z: 1 }, ok: true });
    expect(
      findStationPath(openGrid, occupancy, { x: 2, z: 2 }, [
        { x: 1, z: 1 },
        { x: 3, z: 1 },
      ]),
    ).toEqual(result);
  });

  it('returns an empty path when already standing at an interaction cell', () => {
    expect(
      findStationPath(openGrid, createStationOccupancyState(openGrid), { x: 2, z: 2 }, [
        { x: 2, z: 2 },
      ]),
    ).toEqual({ destination: { x: 2, z: 2 }, ok: true, path: [] });
  });

  it('distinguishes blocked, unreachable, and invalid endpoints', () => {
    const blockedTarget = withFixedWalls([{ x: 2, z: 2 }]);
    expect(
      findStationPath(openGrid, blockedTarget, { x: 0, z: 0 }, [{ x: 2, z: 2 }]),
    ).toEqual({ ok: false, reason: 'no-walkable-destination' });

    const barrier = withFixedWalls(Array.from({ length: 5 }, (_, x) => ({ x, z: 1 })));
    expect(
      findStationPath(openGrid, barrier, { x: 0, z: 0 }, [{ x: 0, z: 2 }]),
    ).toEqual({ ok: false, reason: 'no-reachable-destination' });
    expect(
      findStationPath(openGrid, barrier, { x: -1, z: 0 }, [{ x: 0, z: 2 }]),
    ).toEqual({ ok: false, reason: 'start-out-of-bounds' });
    expect(
      findStationPath(openGrid, barrier, { x: 0, z: 0 }, [{ x: 5, z: 0 }]),
    ).toEqual({ ok: false, reason: 'target-out-of-bounds' });
  });

  it('treats road and empty authored plots as walkable', () => {
    const occupancy = createStationOccupancyState(greatPlainsStationGrid);
    const road = findStationPath(greatPlainsStationGrid, occupancy, { x: 0, z: 4 }, [
      { x: 0, z: 3 },
    ]);
    const garage = findStationPath(
      greatPlainsStationGrid,
      occupancy,
      { x: 20, z: 11 },
      [{ x: 21, z: 11 }],
    );

    expect(road.ok).toBe(true);
    expect(garage.ok).toBe(true);
  });
});
