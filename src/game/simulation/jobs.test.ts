import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  dispatchSimulationCommand,
  greatPlainsScenario,
  greatPlainsStationGrid,
} from '../scenarios/greatPlains';
import {
  advanceSimulationByClockUnits,
  advanceSimulationStep,
} from './advanceSimulation';
import { CLOCK_UNITS_PER_MINUTE } from './clock';
import { createStationOccupancyState, type StationOccupancyState } from './grid';
import { assertScenarioDefinition, findJobRoute } from './jobs';

type GreatPlainsState = ReturnType<typeof createInitialState>;

const assignJob = (
  state: GreatPlainsState,
  employeeId: string,
  jobId: string,
  id = `assign-${employeeId}-${jobId}`,
) =>
  dispatchSimulationCommand(state, {
    atTick: state.tick,
    command: { employeeId, jobId, type: 'job.assign' },
    id,
    sequence: 0,
  });

const withFixedWalls = (
  state: GreatPlainsState,
  cells: readonly { readonly x: number; readonly z: number }[],
): GreatPlainsState => ({
  ...state,
  stationOccupancy: {
    ...state.stationOccupancy,
    occupants: [
      ...state.stationOccupancy.occupants,
      ...cells.map(({ x, z }, index) => ({
        footprint: { height: 1, width: 1 },
        id: `test-wall-${String(index)}`,
        origin: { x, z },
        placement: 'fixed' as const,
        rotation: 0 as const,
        structureId: 'wall',
      })),
    ],
  } satisfies StationOccupancyState,
});

describe('scenario jobs and work targets', () => {
  it('validates the four Great Plains employees, targets, and jobs', () => {
    expect(() => assertScenarioDefinition(greatPlainsScenario)).not.toThrow();
    expect(greatPlainsScenario.initialEmployeePositions).toHaveLength(4);
    expect(greatPlainsScenario.workTargets).toHaveLength(4);
    expect(greatPlainsScenario.jobs).toHaveLength(4);
  });

  it('routes every employee to its fixture job without consuming source order', () => {
    const occupancy = createStationOccupancyState(greatPlainsStationGrid);
    for (const [
      index,
      employee,
    ] of greatPlainsScenario.initialEmployeePositions.entries()) {
      const job = greatPlainsScenario.jobs[index];
      if (job === undefined) throw new Error('Great Plains job fixture is incomplete.');
      const route = findJobRoute(
        greatPlainsScenario,
        occupancy,
        employee.position,
        job,
      );
      expect(route.ok).toBe(true);
      if (!route.ok) throw new Error(`Fixture route failed: ${route.reason}`);
      expect(route.path.at(-1)).toEqual(route.destination);
    }
  });

  it('rejects duplicate positions, broken references, blocked starts, and invalid durations', () => {
    const firstPosition = greatPlainsScenario.initialEmployeePositions[0];
    const firstTarget = greatPlainsScenario.workTargets[0];
    const authoredPlotTarget = greatPlainsScenario.workTargets.find(
      ({ id }) => id === 'garage-inspection',
    );
    const firstJob = greatPlainsScenario.jobs[0];
    if (
      firstPosition === undefined ||
      firstTarget === undefined ||
      authoredPlotTarget === undefined ||
      firstJob === undefined
    ) {
      throw new Error('Great Plains work fixtures are incomplete.');
    }

    expect(() =>
      assertScenarioDefinition({
        ...greatPlainsScenario,
        initialEmployeePositions: [firstPosition, firstPosition],
      }),
    ).toThrow(/multiple initial positions/u);
    expect(() =>
      assertScenarioDefinition({
        ...greatPlainsScenario,
        workTargets: [
          { ...firstTarget, subject: { kind: 'occupant', occupantId: 'missing' } },
        ],
      }),
    ).toThrow(/unknown occupant/u);
    expect(() =>
      assertScenarioDefinition({
        ...greatPlainsScenario,
        jobs: [{ ...firstJob, workDurationClockUnits: 0 }],
      }),
    ).toThrow(/positive safe integer/u);
    expect(() =>
      assertScenarioDefinition({
        ...greatPlainsScenario,
        initialEmployeePositions: [{ ...firstPosition, position: { x: 9, z: 6 } }],
      }),
    ).toThrow(/starts on a structure/u);
    expect(() =>
      assertScenarioDefinition({
        ...greatPlainsScenario,
        workTargets: [{ ...firstTarget, interactionCells: [{ x: 31, z: 23 }] }],
      }),
    ).toThrow(/away from its subject/u);
    expect(() =>
      assertScenarioDefinition({
        ...greatPlainsScenario,
        workTargets: [{ ...authoredPlotTarget, interactionCells: [{ x: 0, z: 23 }] }],
      }),
    ).toThrow(/away from its subject/u);
  });

  it('is invariant to interaction-cell source order', () => {
    const occupancy = createStationOccupancyState(greatPlainsStationGrid);
    const job = greatPlainsScenario.jobs.find(({ id }) => id === 'watch-beacon');
    if (job === undefined) throw new Error('Beacon job fixture is missing.');
    const reversedScenario = {
      ...greatPlainsScenario,
      workTargets: greatPlainsScenario.workTargets.map((target) => ({
        ...target,
        interactionCells: [...target.interactionCells].reverse(),
      })),
    };
    const start = { x: 5, z: 8 };

    expect(findJobRoute(reversedScenario, occupancy, start, job)).toEqual(
      findJobRoute(greatPlainsScenario, occupancy, start, job),
    );
  });

  it('accepts a traveling assignment with a canonical route and correlated event', () => {
    const initial = createInitialState();
    const result = assignJob(initial, 'employee-ada', 'open-checkout');
    const ada = result.state.employees.find(({ id }) => id === 'employee-ada');

    expect(result.receipt).toMatchObject({
      changed: true,
      emittedEventSequences: [1],
      reason: 'job-assigned',
      status: 'accepted',
    });
    expect(ada?.activity).toMatchObject({
      destination: { x: 10, z: 17 },
      jobId: 'open-checkout',
      path: [{ x: 10, z: 17 }],
      status: 'traveling',
    });
    expect(result.state.eventLedger.at(-1)).toMatchObject({
      assignmentId: 'assignment-1',
      employeeId: 'employee-ada',
      pathLength: 1,
      type: 'job.assigned',
    });
  });

  it('derives unique assignment identities independently of live envelope IDs', () => {
    const first = assignJob(
      createInitialState(),
      'employee-ada',
      'open-checkout',
      'reused-command-id',
    ).state;
    const second = assignJob(
      first,
      'employee-bo',
      'check-pumps',
      'reused-command-id',
    ).state;
    const activeAssignmentIds = second.employees.flatMap((employee) =>
      employee.activity.status === 'idle' ? [] : [employee.activity.assignmentId],
    );

    expect(activeAssignmentIds).toEqual(['assignment-1', 'assignment-2']);
  });

  it('starts immediately when the employee already occupies an interaction cell', () => {
    const initial = createInitialState();
    const atCheckout = {
      ...initial,
      employees: initial.employees.map((employee) =>
        employee.id === 'employee-ada'
          ? { ...employee, position: { x: 10, z: 17 } }
          : employee,
      ),
    };
    const result = assignJob(atCheckout, 'employee-ada', 'open-checkout');

    expect(result.receipt.emittedEventSequences).toEqual([1, 2]);
    expect(
      result.state.employees.find(({ id }) => id === 'employee-ada')?.activity,
    ).toMatchObject({ remainingWorkClockUnits: 80, status: 'working' });
    expect(result.state.eventLedger.slice(-2).map(({ type }) => type)).toEqual([
      'job.assigned',
      'job.started',
    ]);
  });

  it('distinguishes missing, busy, unavailable, blocked, and unreachable work', () => {
    const initial = createInitialState();
    expect(assignJob(initial, 'missing', 'open-checkout').receipt.reason).toBe(
      'employee-not-found',
    );
    expect(assignJob(initial, 'employee-ada', 'missing').receipt.reason).toBe(
      'job-not-found',
    );

    const assigned = assignJob(initial, 'employee-ada', 'open-checkout').state;
    expect(assignJob(assigned, 'employee-ada', 'check-pumps').receipt.reason).toBe(
      'employee-busy',
    );
    expect(assignJob(assigned, 'employee-bo', 'open-checkout').receipt.reason).toBe(
      'job-unavailable',
    );

    const missingTarget = {
      ...initial,
      stationOccupancy: {
        ...initial.stationOccupancy,
        occupants: initial.stationOccupancy.occupants.filter(
          ({ id }) => id !== 'main-store',
        ),
      },
    };
    expect(
      assignJob(missingTarget, 'employee-ada', 'open-checkout').receipt.reason,
    ).toBe('job-target-unavailable');

    const blocked = withFixedWalls(initial, [{ x: 10, z: 17 }]);
    expect(assignJob(blocked, 'employee-ada', 'open-checkout').receipt.reason).toBe(
      'job-target-has-no-walkable-interaction',
    );

    const isolated = withFixedWalls(initial, [
      { x: 10, z: 17 },
      { x: 9, z: 18 },
      { x: 11, z: 18 },
      { x: 10, z: 19 },
    ]);
    expect(
      assignJob(isolated, 'employee-ada', 'inspect-garage-plot').receipt.reason,
    ).toBe('job-target-unreachable');
  });

  it('travels and works by exact authoritative clock units before completing', () => {
    const assigned = assignJob(
      createInitialState(),
      'employee-ada',
      'open-checkout',
    ).state;
    const beforeMove = advanceSimulationByClockUnits(assigned, 19);
    const arrived = advanceSimulationByClockUnits(beforeMove, 1);
    const beforeComplete = advanceSimulationByClockUnits(arrived, 79);
    const completed = advanceSimulationByClockUnits(beforeComplete, 1);

    expect(beforeMove.employees.find(({ id }) => id === 'employee-ada')).toMatchObject({
      activity: { movementProgressClockUnits: 19, status: 'traveling' },
      position: { x: 10, z: 18 },
    });
    expect(arrived.employees.find(({ id }) => id === 'employee-ada')).toMatchObject({
      activity: { remainingWorkClockUnits: 80, status: 'working' },
      position: { x: 10, z: 17 },
    });
    expect(arrived.eventLedger.slice(-2).map(({ type }) => type)).toEqual([
      'employee.arrived',
      'job.started',
    ]);
    expect(
      beforeComplete.employees.find(({ id }) => id === 'employee-ada')?.activity,
    ).toMatchObject({ remainingWorkClockUnits: 1, status: 'working' });
    expect(
      completed.employees.find(({ id }) => id === 'employee-ada')?.activity,
    ).toEqual({ status: 'idle' });
    expect(completed.eventLedger.at(-1)?.type).toBe('job.completed');
    expect(completed.rng).toEqual(assigned.rng);
  });

  it('is partition-invariant and paused fixed steps do not progress jobs', () => {
    const assigned = assignJob(
      createInitialState(),
      'employee-dale',
      'watch-beacon',
    ).state;
    const whole = advanceSimulationByClockUnits(assigned, 40);
    const partitioned = advanceSimulationByClockUnits(
      advanceSimulationByClockUnits(assigned, 13),
      27,
    );

    expect(partitioned).toEqual(whole);
    expect(advanceSimulationStep(assigned)).toBe(assigned);
  });

  it('cancels travel in place and allows a route to be recalculated', () => {
    const assigned = assignJob(
      createInitialState(),
      'employee-dale',
      'watch-beacon',
    ).state;
    const moved = advanceSimulationByClockUnits(assigned, 20);
    const daleBeforeCancel = moved.employees.find(({ id }) => id === 'employee-dale');
    const cancelled = dispatchSimulationCommand(moved, {
      atTick: moved.tick,
      command: { employeeId: 'employee-dale', type: 'job.cancel' },
      id: 'cancel-dale',
      sequence: 1,
    });

    expect(cancelled.receipt.reason).toBe('job-cancelled');
    expect(
      cancelled.state.employees.find(({ id }) => id === 'employee-dale'),
    ).toMatchObject({
      activity: { status: 'idle' },
      position: daleBeforeCancel?.position,
    });
    expect(cancelled.state.eventLedger.at(-1)).toMatchObject({
      previousActivity: 'traveling',
      type: 'job.cancelled',
    });
    expect(
      assignJob(cancelled.state, 'employee-dale', 'watch-beacon').state.employees.find(
        ({ id }) => id === 'employee-dale',
      )?.activity,
    ).toMatchObject({ movementProgressClockUnits: 0, status: 'traveling' });
  });

  it('cancels work in place and rejects cancellation while idle', () => {
    const initial = createInitialState();
    const atCheckout = {
      ...initial,
      employees: initial.employees.map((employee) =>
        employee.id === 'employee-ada'
          ? { ...employee, position: { x: 10, z: 17 } }
          : employee,
      ),
    };
    const working = assignJob(atCheckout, 'employee-ada', 'open-checkout').state;
    const cancelled = dispatchSimulationCommand(working, {
      atTick: working.tick,
      command: { employeeId: 'employee-ada', type: 'job.cancel' },
      id: 'cancel-working-ada',
      sequence: 1,
    });
    const repeated = dispatchSimulationCommand(cancelled.state, {
      atTick: cancelled.state.tick,
      command: { employeeId: 'employee-ada', type: 'job.cancel' },
      id: 'cancel-idle-ada',
      sequence: 2,
    });

    expect(cancelled.state.employees[0]).toMatchObject({
      activity: { status: 'idle' },
      position: { x: 10, z: 17 },
    });
    expect(cancelled.state.eventLedger.at(-1)).toMatchObject({
      previousActivity: 'working',
      remainingWorkClockUnits: 80,
      type: 'job.cancelled',
    });
    expect(repeated.receipt.reason).toBe('employee-idle');
    expect(repeated.state).toBe(cancelled.state);
  });

  it('orders simultaneous completions by employee ID, not storage order', () => {
    const initial = createInitialState();
    const working = {
      ...initial,
      employees: [...initial.employees].reverse().map((employee) => ({
        ...employee,
        activity: {
          assignmentId: `assignment-${employee.id}`,
          destination: { ...employee.position },
          jobId: `job-${employee.id}`,
          remainingWorkClockUnits: 1,
          status: 'working' as const,
          targetId: `target-${employee.id}`,
          totalWorkClockUnits: 1,
        },
      })),
    };
    const completed = advanceSimulationByClockUnits(working, 1);

    expect(
      completed.eventLedger
        .filter(({ type }) => type === 'job.completed')
        .map((event) => (event.type === 'job.completed' ? event.employeeId : '')),
    ).toEqual(['employee-ada', 'employee-bo', 'employee-cora', 'employee-dale']);
  });

  it('processes the final sunrise clock unit before freezing completed state', () => {
    const almostSunrise = advanceSimulationByClockUnits(
      createInitialState(1987, 1),
      22 * 60 * CLOCK_UNITS_PER_MINUTE - 1,
    );
    const almostDone = {
      ...almostSunrise,
      employees: almostSunrise.employees.map((employee) =>
        employee.id === 'employee-ada'
          ? {
              ...employee,
              activity: {
                assignmentId: 'assignment-final-unit',
                destination: { x: 10, z: 17 },
                jobId: 'open-checkout',
                remainingWorkClockUnits: 1,
                status: 'working' as const,
                targetId: 'checkout-counter',
                totalWorkClockUnits: 80,
              },
              position: { x: 10, z: 17 },
            }
          : employee,
      ),
    };
    const completed = advanceSimulationByClockUnits(almostDone, 1);

    expect(completed.isSliceComplete).toBe(true);
    expect(completed.employees[0]?.activity).toEqual({ status: 'idle' });
    expect(completed.eventLedger.slice(-4).map(({ type }) => type)).toEqual([
      'phase.entered',
      'night.completed',
      'job.completed',
      'slice.completed',
    ]);
  });

  it('lets all four employees complete independent jobs', () => {
    let state = createInitialState();
    const assignments = [
      ['employee-ada', 'open-checkout'],
      ['employee-bo', 'check-pumps'],
      ['employee-cora', 'inspect-garage-plot'],
      ['employee-dale', 'watch-beacon'],
    ] as const;
    for (const [employeeId, jobId] of assignments) {
      state = assignJob(state, employeeId, jobId).state;
    }
    const completed = advanceSimulationByClockUnits(state, 400);

    expect(completed.employees.map(({ activity }) => activity.status)).toEqual([
      'idle',
      'idle',
      'idle',
      'idle',
    ]);
    expect(
      completed.eventLedger.filter(({ type }) => type === 'job.completed'),
    ).toHaveLength(4);
  });
});
