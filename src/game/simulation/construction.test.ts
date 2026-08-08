import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  greatPlainsSimulationContext,
} from '../scenarios/greatPlains';
import {
  appendConstructedOccupant,
  assertConstructionDefinitions,
  evaluateConstructionPlacement,
  type ConstructionPlacementRequest,
} from './construction';

const evaluate = (
  request: ConstructionPlacementRequest,
  state = createInitialState(),
) => evaluateConstructionPlacement(state, greatPlainsSimulationContext, request);

const flexibleRequest = (
  blueprintId: string,
  x = 0,
  z = 4,
  rotation: 0 | 1 | 2 | 3 = 0,
): ConstructionPlacementRequest => ({
  blueprintId,
  placement: { kind: 'flexible', origin: { x, z }, rotation },
});

describe('construction rules', () => {
  it('accepts the authored catalog and every required Great Plains shell', () => {
    const definitions = greatPlainsSimulationContext.scenario.construction;
    expect(() =>
      assertConstructionDefinitions(
        definitions,
        greatPlainsSimulationContext.scenario.stationGridDefinition,
      ),
    ).not.toThrow();
    expect(
      definitions
        .filter(({ placement }) => placement === 'flexible')
        .map(({ id }) => id),
    ).toEqual([
      'ammo-storage',
      'floodlight',
      'gate',
      'generator-upgrade',
      'repair-station',
      'turret',
      'wall',
    ]);
  });

  it('rejects non-canonical, free, and incompatible blueprint definitions', () => {
    const definitions = greatPlainsSimulationContext.scenario.construction;
    const grid = greatPlainsSimulationContext.scenario.stationGridDefinition;
    expect(() =>
      assertConstructionDefinitions([...definitions].reverse(), grid),
    ).toThrow(/ascending technical IDs/u);
    expect(() =>
      assertConstructionDefinitions(
        definitions.map((definition) =>
          definition.id === 'wall'
            ? { ...definition, cost: { cash: 0, scrap: 0 } }
            : definition,
        ),
        grid,
      ),
    ).toThrow(/non-zero construction cost/u);
    expect(() =>
      assertConstructionDefinitions(
        definitions.map((definition) =>
          definition.id === 'garage' && definition.placement === 'authored-plot'
            ? { ...definition, facilityId: 'facility-unrecognized' }
            : definition,
        ),
        grid,
      ),
    ).toThrow(/does not match an authored facility plot/u);
  });

  it('places the garage only on its compatible authored plot', () => {
    const accepted = evaluate({
      blueprintId: 'garage',
      placement: { kind: 'authored-plot', plotId: 'garage-plot' },
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.cells).toContainEqual({ x: 21, z: 11 });
    expect(accepted.cost).toEqual({ cash: 120, scrap: 16 });
    expect(accepted.occupant).toEqual({
      facilityId: 'facility-garage',
      id: 'built-garage-0',
      placement: 'authored-plot',
      plotId: 'garage-plot',
    });
    expect(accepted.cells).toHaveLength(42);

    const rejected = evaluate({
      blueprintId: 'garage',
      placement: { kind: 'authored-plot', plotId: 'main-store-plot' },
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.issues.map(({ reason }) => reason)).toEqual([
      'facility-not-allowed',
      'authored-plot-occupied',
    ]);
  });

  it.each([
    'ammo-storage',
    'floodlight',
    'gate',
    'generator-upgrade',
    'repair-station',
    'turret',
    'wall',
  ])('accepts flexible %s placement through the shared grid rules', (blueprintId) => {
    expect(evaluate(flexibleRequest(blueprintId))).toMatchObject({ ok: true });
  });

  it('rotates authored rectangular footprints without accepting client geometry', () => {
    const result = evaluate(flexibleRequest('repair-station', 28, 20, 1));
    expect(result).toMatchObject({
      cells: [
        { x: 28, z: 20 },
        { x: 29, z: 20 },
        { x: 30, z: 20 },
        { x: 28, z: 21 },
        { x: 29, z: 21 },
        { x: 30, z: 21 },
      ],
      ok: true,
    });
  });

  it.each([
    ['outside the grid', flexibleRequest('wall', -1, 4), ['out-of-bounds']],
    ['outside the build area', flexibleRequest('wall', 0, 0), ['cell-not-buildable']],
    [
      'inside a reserved occupied plot',
      flexibleRequest('wall', 8, 11),
      ['authored-plot-reserved', 'cell-occupied'],
    ],
    ['on a fixed occupant', flexibleRequest('wall', 3, 6), ['cell-occupied']],
  ] as const)(
    'reports exact grid causes when placing %s',
    (_label, request, reasons) => {
      const result = evaluate(request);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.map(({ reason }) => reason)).toEqual(reasons);
    },
  );

  it('reports cash and scrap shortages independently with exact amounts', () => {
    const initial = createInitialState();
    const withoutCash = evaluate(flexibleRequest('floodlight'), {
      ...initial,
      resources: { ...initial.resources, cash: 17 },
    });
    expect(withoutCash).toMatchObject({
      issues: [{ available: 17, reason: 'insufficient-cash', required: 18 }],
      ok: false,
    });

    const withoutScrap = evaluate(flexibleRequest('floodlight'), {
      ...initial,
      resources: { ...initial.resources, scrap: 3 },
    });
    expect(withoutScrap).toMatchObject({
      issues: [{ available: 3, reason: 'insufficient-scrap', required: 4 }],
      ok: false,
    });
  });

  it('keeps multiple-cell work targets available until their final access closes', () => {
    const onePumpCellBlocked = evaluate(flexibleRequest('wall', 9, 8));
    expect(onePumpCellBlocked.ok).toBe(true);

    const checkoutBlocked = evaluate(flexibleRequest('wall', 10, 17));
    expect(checkoutBlocked.ok).toBe(false);
    if (checkoutBlocked.ok) return;
    expect(checkoutBlocked.issues).toContainEqual({
      anchorCells: [],
      anchorTargetId: 'checkout-counter',
      cells: [{ x: 10, z: 17 }],
      conflictingOccupantIds: ['built-wall-0'],
      reason: 'required-interaction-blocked',
      workTargetIds: ['checkout-counter'],
    });
  });

  it('rejects the final wall that would isolate a current employee', () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      stationOccupancy: {
        ...initial.stationOccupancy,
        occupants: [
          ...initial.stationOccupancy.occupants,
          ...[
            [19, 18],
            [20, 19],
            [21, 18],
          ].map(([x, z], index) => ({
            footprint: { height: 1, width: 1 },
            id: `built-wall-${String(index)}`,
            origin: { x: x ?? 0, z: z ?? 0 },
            placement: 'flexible' as const,
            rotation: 0 as const,
            structureId: 'wall',
          })),
        ].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      },
      nextConstructionSequence: 3,
    };
    const result = evaluate(flexibleRequest('wall', 20, 17), state);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      anchorCells: [{ x: 10, z: 17 }],
      anchorTargetId: 'checkout-counter',
      cells: [{ x: 20, z: 18 }],
      employeeIds: ['employee-cora'],
      reason: 'required-route-unreachable',
    });
  });

  it('reports grid, crew, route, phase, sequence, and resource blockers together', () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      nextConstructionSequence: Number.MAX_SAFE_INTEGER,
      phase: 'dusk' as const,
      resources: { ...initial.resources, cash: 0, scrap: 0 },
      employees: initial.employees.map((employee) =>
        employee.id === 'employee-dale'
          ? {
              ...employee,
              activity: {
                assignmentId: 'test-assignment',
                destination: { x: 5, z: 12 },
                jobId: 'test-job',
                movementProgressClockUnits: 0,
                nextPathIndex: 0,
                path: [
                  { x: 5, z: 11 },
                  { x: 5, z: 12 },
                ],
                status: 'traveling' as const,
                targetId: 'test-target',
                totalWorkClockUnits: 20,
              },
            }
          : employee,
      ),
    };
    const result = evaluate(flexibleRequest('repair-station', 5, 10), state);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map(({ reason }) => reason)).toEqual([
      'construction-closed',
      'construction-sequence-exhausted',
      'employee-cell-occupied',
      'active-route-obstructed',
      'insufficient-cash',
      'insufficient-scrap',
    ]);
  });

  it('applies an accepted placement atomically and canonically', () => {
    const state = createInitialState();
    const evaluation = evaluate(flexibleRequest('wall'), state);
    expect(evaluation.ok).toBe(true);
    if (!evaluation.ok) return;
    const next = appendConstructedOccupant(state, evaluation);
    expect(next.nextConstructionSequence).toBe(1);
    expect(next.resources).toMatchObject({ cash: 420, scrap: 30 });
    expect(next.stationOccupancy.occupants.map(({ id }) => id)).toEqual(
      [...next.stationOccupancy.occupants.map(({ id }) => id)].sort(),
    );
    expect(state.resources).toMatchObject({ cash: 420, scrap: 32 });
    expect(state.stationOccupancy.occupants).toHaveLength(4);
  });
});
