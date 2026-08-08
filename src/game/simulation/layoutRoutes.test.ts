import { describe, expect, it } from 'vitest';
import { greatPlainsScenario } from '../scenarios/greatPlains';
import {
  createStationOccupancyState,
  type PlacedOccupant,
  type StationOccupancyState,
} from './grid';
import {
  assertRequiredStationAccessDefinition,
  evaluateRequiredStationAccess,
} from './layoutRoutes';

const wall = (id: string, x: number, z: number): PlacedOccupant => ({
  footprint: { height: 1, width: 1 },
  id,
  origin: { x, z },
  placement: 'flexible',
  rotation: 0,
  structureId: 'wall',
});

const withOccupants = (occupants: readonly PlacedOccupant[]): StationOccupancyState => {
  const initial = createStationOccupancyState(
    greatPlainsScenario.stationGridDefinition,
  );
  return {
    ...initial,
    occupants: [...initial.occupants, ...occupants].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
  };
};

const employees = greatPlainsScenario.initialEmployeePositions.map(
  ({ employeeId, position }) => ({ id: employeeId, position }),
);

describe('required station access', () => {
  it('validates the authored access network and initial station topology', () => {
    expect(() =>
      assertRequiredStationAccessDefinition(greatPlainsScenario),
    ).not.toThrow();
    expect(
      evaluateRequiredStationAccess(
        greatPlainsScenario,
        createStationOccupancyState(greatPlainsScenario.stationGridDefinition),
        employees,
      ),
    ).toEqual([]);
  });

  it('allows one of several interaction cells to remain open', () => {
    expect(
      evaluateRequiredStationAccess(
        greatPlainsScenario,
        withOccupants([wall('built-wall-0', 9, 8)]),
        employees,
      ),
    ).toEqual([]);
  });

  it('identifies every blocked interaction cell and its occupant', () => {
    expect(
      evaluateRequiredStationAccess(
        greatPlainsScenario,
        withOccupants([wall('built-wall-0', 10, 17)]),
        employees,
      ),
    ).toEqual([
      {
        anchorCells: [],
        anchorTargetId: 'checkout-counter',
        cells: [{ x: 10, z: 17 }],
        conflictingOccupantIds: ['built-wall-0'],
        reason: 'required-interaction-blocked',
        workTargetIds: ['checkout-counter'],
      },
    ]);
  });

  it('identifies an employee isolated from the work network', () => {
    const occupancy = withOccupants([
      wall('built-wall-0', 19, 18),
      wall('built-wall-1', 20, 17),
      wall('built-wall-2', 20, 19),
      wall('built-wall-3', 21, 18),
    ]);
    const issues = evaluateRequiredStationAccess(
      greatPlainsScenario,
      occupancy,
      employees,
    );

    expect(issues).toContainEqual({
      anchorCells: [{ x: 10, z: 17 }],
      anchorTargetId: 'checkout-counter',
      cells: [{ x: 20, z: 18 }],
      employeeIds: ['employee-cora'],
      reason: 'required-route-unreachable',
    });
  });

  it('identifies a required work target disconnected from the anchor', () => {
    const occupancy = withOccupants([
      {
        facilityId: 'facility-garage',
        id: 'built-garage-0',
        placement: 'authored-plot',
        plotId: 'garage-plot',
      },
      wall('built-wall-1', 20, 17),
      wall('built-wall-2', 21, 18),
      wall('built-wall-3', 22, 18),
      wall('built-wall-4', 23, 17),
    ]);
    const issues = evaluateRequiredStationAccess(greatPlainsScenario, occupancy, []);

    expect(issues).toContainEqual({
      anchorCells: [{ x: 10, z: 17 }],
      anchorTargetId: 'checkout-counter',
      cells: [
        { x: 21, z: 17 },
        { x: 22, z: 17 },
      ],
      reason: 'required-route-unreachable',
      workTargetIds: ['garage-inspection'],
    });
  });

  it('rejects unknown, unordered, or anchorless access definitions', () => {
    expect(() =>
      assertRequiredStationAccessDefinition({
        ...greatPlainsScenario,
        constructionAccess: {
          ...greatPlainsScenario.constructionAccess,
          requiredWorkTargetIds: ['west-pump-service', 'checkout-counter'],
        },
      }),
    ).toThrow(/unique ascending target IDs/u);
    expect(() =>
      assertRequiredStationAccessDefinition({
        ...greatPlainsScenario,
        constructionAccess: {
          anchorWorkTargetId: 'checkout-counter',
          requiredWorkTargetIds: ['beacon-watch'],
        },
      }),
    ).toThrow(/included anchor/u);
    expect(() =>
      assertRequiredStationAccessDefinition({
        ...greatPlainsScenario,
        constructionAccess: {
          anchorWorkTargetId: 'missing-target',
          requiredWorkTargetIds: ['missing-target'],
        },
      }),
    ).toThrow(/unknown target/u);
  });
});
