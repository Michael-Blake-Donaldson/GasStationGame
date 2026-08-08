import { describe, expect, it } from 'vitest';
import { createInitialCampaignState } from '../campaign/campaignState';
import {
  createInitialState,
  decodeGameSave,
  dispatchSimulationCommand,
  encodeGameSave,
  greatPlainsSaveContext,
  greatPlainsSimulationContext,
  hashSimulationState,
} from '../scenarios/greatPlains';
import { advanceSimulationByClockUnits as advanceByClockUnitsWithContext } from '../simulation/advanceSimulation';
import { CLOCK_UNITS_PER_MINUTE, phaseForClockUnit } from '../simulation/clock';
import { drawSimulationRandomInteger } from '../simulation/random';
import type { SimulationState } from '../simulation/types';
import {
  hashCanonicalJson,
  stringifyCanonicalJson,
} from '../serialization/canonicalJson';
import {
  decodeGameSave as decodeGameSaveWithContext,
  type GameSaveSnapshot,
  type SaveIssueCode,
} from './saveCodec';
import initialSaveFixture from './fixtures/save-v1-initial.json?raw';
import initialSaveV2Fixture from './fixtures/save-v2-initial.json?raw';
import initialSaveV3Fixture from './fixtures/save-v3-initial.json?raw';
import initialSaveV4Fixture from './fixtures/save-v4-initial.json?raw';

const advanceSimulationByClockUnits = (
  state: SimulationState,
  clockUnits: number,
  context = greatPlainsSimulationContext,
) => advanceByClockUnitsWithContext(state, clockUnits, context);

const campaign = createInitialCampaignState('great-plains');

const snapshotFor = (
  simulation: SimulationState,
  nextCommandSequence = 7,
  saveSequence = 3,
): GameSaveSnapshot => ({
  campaign,
  nextCommandSequence,
  saveSequence,
  simulation,
});

const expectSuccessfulLoad = (serialized: string) => {
  const loaded = decodeGameSave(serialized);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
  expect(loaded.ok).toBe(true);
  return loaded;
};

const asRecord = (value: unknown, name: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} is not an object.`);
  }
  return value as Record<string, unknown>;
};

const mutateSave = (
  serialized: string,
  mutate: (document: Record<string, unknown>) => void,
  refreshChecksum = true,
): string => {
  const document = asRecord(JSON.parse(serialized) as unknown, 'save document');
  mutate(document);
  if (refreshChecksum) {
    const payload = Object.fromEntries(
      Object.entries(document).filter(([key]) => key !== 'checksum'),
    );
    document.checksum = {
      algorithm: 'fnv1a32',
      value: hashCanonicalJson(payload),
    };
  }
  return stringifyCanonicalJson(document);
};

const downgradeCurrentSaveToV2 = (serialized: string): string =>
  mutateSave(serialized, (document) => {
    document.schemaVersion = 2;
    const content = asRecord(document.content, 'content');
    content.scenarioVersion = 4;
    const station = asRecord(document.station, 'station');
    station.version = 6;
    station.scenarioVersion = 4;
    delete station.nextConstructionSequence;
    const business = asRecord(station.business, 'business');
    delete business.performanceBaselineReason;
    delete business.performanceStartsAtClockUnit;
    for (const customer of business.activeCustomers as Record<string, unknown>[]) {
      delete asRecord(customer.stage, 'customer stage').performance;
    }
    for (const employee of station.employees as Record<string, unknown>[]) {
      delete employee.skills;
    }
    const ledger = (station.eventLedger as Record<string, unknown>[])
      .filter((event) => event.type !== 'service.started')
      .map((event, sequence) => {
        event.sequence = sequence;
        if (event.type === 'simulation.started') event.scenarioVersion = 4;
        return event;
      });
    station.eventLedger = ledger;
    station.nextEventSequence = ledger.length;
  });

const expectFailureCode = (serialized: string, code: SaveIssueCode): void => {
  const loaded = decodeGameSave(serialized);
  expect(loaded.ok).toBe(false);
  if (loaded.ok) throw new Error('Expected save load to fail.');
  expect(loaded.issues.map((issue) => issue.code)).toContain(code);
};

const runningInitialState = (): SimulationState =>
  dispatchSimulationCommand(createInitialState(), {
    atTick: 0,
    command: { mode: 'normal', type: 'time-mode.set' },
    id: 'start-clock',
    sequence: 0,
  }).state;

const staffedBusinessState = (clockUnits: number): SimulationState => {
  let state = createInitialState();
  state = dispatchSimulationCommand(state, {
    atTick: 0,
    command: {
      employeeId: 'employee-ada',
      jobId: 'staff-checkout',
      type: 'job.assign',
    },
    id: 'save-test-checkout',
    sequence: 0,
  }).state;
  state = dispatchSimulationCommand(state, {
    atTick: 0,
    command: {
      employeeId: 'employee-bo',
      jobId: 'staff-pumps',
      type: 'job.assign',
    },
    id: 'save-test-pumps',
    sequence: 1,
  }).state;
  return advanceSimulationByClockUnits(state, clockUnits, greatPlainsSimulationContext);
};

describe('versioned game save codec', () => {
  it('loads the frozen v1-v4 fixtures and writes current v4 saves', () => {
    const serialized = encodeGameSave(snapshotFor(createInitialState(), 0, 0));
    expect(JSON.parse(serialized)).toMatchObject({
      schemaVersion: 4,
      station: { version: 8 },
    });
    expect(expectSuccessfulLoad(initialSaveFixture).simulation).toEqual(
      createInitialState(),
    );
    expect(expectSuccessfulLoad(initialSaveV2Fixture).simulation).toEqual(
      createInitialState(),
    );
    expect(expectSuccessfulLoad(initialSaveV3Fixture).simulation).toEqual(
      createInitialState(),
    );
    expect(expectSuccessfulLoad(initialSaveV4Fixture).simulation).toEqual(
      createInitialState(),
    );
    expect(expectSuccessfulLoad(serialized).simulation).toEqual(createInitialState());
  });

  it('migrates later v1 saves without preserving placeholder daytime income', () => {
    const migrated = expectSuccessfulLoad(
      mutateSave(initialSaveFixture, (document) => {
        const station = asRecord(document.station, 'station');
        station.absoluteClockUnit = 9 * 60 * CLOCK_UNITS_PER_MINUTE;
        station.resources = {
          ammunition: 36,
          cash: 432,
          food: 47,
          fuel: 158,
          power: 100,
          scrap: 32,
        };
        station.eventLedger = [
          ...(station.eventLedger as Record<string, unknown>[]),
          {
            absoluteClockUnit: 9 * 60 * CLOCK_UNITS_PER_MINUTE,
            changes: [
              {
                after: 432,
                appliedDelta: 12,
                before: 420,
                requestedDelta: 12,
                resource: 'cash',
              },
              {
                after: 47,
                appliedDelta: -1,
                before: 48,
                requestedDelta: -1,
                resource: 'food',
              },
              {
                after: 158,
                appliedDelta: -2,
                before: 160,
                requestedDelta: -2,
                resource: 'fuel',
              },
            ],
            minute: 9 * 60,
            reason: 'day-hourly-flow',
            sequence: 1,
            tick: 0,
            type: 'resources.changed',
          },
        ];
        station.nextEventSequence = 2;
      }),
    );

    expect(migrated.simulation).toMatchObject({
      business: {
        activeCustomers: [],
        completedCustomerCount: 0,
        nextCustomerSequence: 0,
        trafficBaselineReason: 'legacy-save-migration',
        trafficStartsAtClockUnit: 9 * 60 * CLOCK_UNITS_PER_MINUTE + 1,
      },
      nextEventSequence: 1,
      resources: createInitialState().resources,
      scenarioVersion: 7,
    });
    expect(migrated.simulation.eventLedger).toHaveLength(1);
  });

  it.each([
    ['day', 0],
    ['dusk', 10 * 60 * CLOCK_UNITS_PER_MINUTE],
    ['night', 11 * 60 * CLOCK_UNITS_PER_MINUTE],
    ['morning', 22 * 60 * CLOCK_UNITS_PER_MINUTE],
  ] as const)('round-trips exact %s state at its phase boundary', (phase, units) => {
    const initial = units === 0 ? createInitialState() : runningInitialState();
    const state = advanceSimulationByClockUnits(initial, units);
    const serialized = encodeGameSave(snapshotFor(state));
    const loaded = expectSuccessfulLoad(serialized);

    expect(state.phase).toBe(phase);
    expect(loaded.simulation).toEqual(state);
    expect(loaded.campaign).toEqual(campaign);
    expect(loaded.nextCommandSequence).toBe(7);
    expect(loaded.saveSequence).toBe(3);
    expect(hashSimulationState(loaded.simulation)).toBe(hashSimulationState(state));
    expect(encodeGameSave(snapshotFor(loaded.simulation))).toBe(serialized);
  });

  it('preserves mid-route, mid-work, RNG, ledger, and continuation state', () => {
    const assigned = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: {
        employeeId: 'employee-dale',
        jobId: 'watch-beacon',
        type: 'job.assign',
      },
      id: 'assign-dale-before-save',
      sequence: 4,
    }).state;
    const midRoute = advanceSimulationByClockUnits(assigned, 27);
    const randomized = drawSimulationRandomInteger(midRoute, 0, 100).state;
    const serialized = encodeGameSave(snapshotFor(randomized, 5, 8));
    const loaded = expectSuccessfulLoad(serialized);

    expect(loaded.simulation).toEqual(randomized);
    const originalNext = advanceSimulationByClockUnits(randomized, 200);
    const loadedNext = advanceSimulationByClockUnits(loaded.simulation, 200);
    expect(loadedNext).toEqual(originalNext);
    expect(hashSimulationState(loadedNext)).toBe(hashSimulationState(originalNext));
    const nextEnvelope = {
      atTick: randomized.tick,
      command: { employeeId: 'employee-dale', type: 'job.cancel' as const },
      id: `ui-command-${String(loaded.nextCommandSequence)}`,
      sequence: loaded.nextCommandSequence,
    };
    expect(dispatchSimulationCommand(loaded.simulation, nextEnvelope)).toEqual(
      dispatchSimulationCommand(randomized, nextEnvelope),
    );

    const working = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: {
        employeeId: 'employee-ada',
        jobId: 'open-checkout',
        type: 'job.assign',
      },
      id: 'assign-ada-before-save',
      sequence: 0,
    }).state;
    const midWork = advanceSimulationByClockUnits(working, 31);
    expect(
      expectSuccessfulLoad(encodeGameSave(snapshotFor(midWork))).simulation,
    ).toEqual(midWork);
  });

  it('preserves a customer mid-service and resumes deterministically', () => {
    const midService = staffedBusinessState(61 * CLOCK_UNITS_PER_MINUTE);
    expect(midService.business.activeCustomers[0]?.stage.type).toBe('pump-service');

    const loaded = expectSuccessfulLoad(encodeGameSave(snapshotFor(midService, 2, 9)));
    expect(loaded.simulation).toEqual(midService);

    const originalNext = advanceSimulationByClockUnits(
      midService,
      3 * CLOCK_UNITS_PER_MINUTE,
      greatPlainsSimulationContext,
    );
    const loadedNext = advanceSimulationByClockUnits(
      loaded.simulation,
      3 * CLOCK_UNITS_PER_MINUTE,
      greatPlainsSimulationContext,
    );
    expect(loadedNext).toEqual(originalNext);
    expect(hashSimulationState(loadedNext)).toBe(hashSimulationState(originalNext));
  });

  it('migrates a v2 mid-service save to authored skills and a fresh service baseline', () => {
    const midService = staffedBusinessState(61 * CLOCK_UNITS_PER_MINUTE);
    expect(midService.business.activeCustomers[0]?.stage.type).toBe('pump-service');
    const loaded = expectSuccessfulLoad(
      downgradeCurrentSaveToV2(encodeGameSave(snapshotFor(midService, 2, 10))),
    );

    expect(loaded.simulation.scenarioVersion).toBe(7);
    expect(loaded.simulation.business).toMatchObject({
      performanceBaselineReason: 'legacy-save-migration',
      performanceStartsAtClockUnit: midService.absoluteClockUnit + 1,
    });
    expect(loaded.simulation.business.activeCustomers[0]?.stage.type).toBe(
      'pump-queue',
    );
    expect(
      loaded.simulation.employees.find(({ id }) => id === 'employee-bo')?.skills,
    ).toEqual([
      { id: 'checkout', level: 1 },
      { id: 'pumps', level: 4 },
    ]);

    const resumed = advanceSimulationByClockUnits(loaded.simulation, 1);
    expect(resumed.eventLedger.at(-1)).toMatchObject({
      performance: { employeeId: 'employee-bo', skillLevel: 4 },
      type: 'service.started',
    });
  });

  it('rejects forged service modifier facts even with a refreshed checksum', () => {
    const midService = staffedBusinessState(61 * CLOCK_UNITS_PER_MINUTE);
    const forged = mutateSave(encodeGameSave(snapshotFor(midService)), (document) => {
      const station = asRecord(document.station, 'station');
      const service = (station.eventLedger as Record<string, unknown>[]).find(
        (event) => event.type === 'service.started',
      );
      if (service === undefined) throw new Error('Service event is missing.');
      const performance = asRecord(service.performance, 'service performance');
      performance.skillLevel = 5;
    });
    expectFailureCode(forged, 'semantic-invariant-failed');
  });

  it('rejects a legacy v4 layout that cannot preserve required access', () => {
    const stranded = mutateSave(initialSaveV4Fixture, (document) => {
      const station = asRecord(document.station, 'station');
      const occupancy = asRecord(station.stationOccupancy, 'station occupancy');
      const occupants = occupancy.occupants as Record<string, unknown>[];
      occupants.push({
        footprint: { height: 1, width: 1 },
        id: 'built-wall-0',
        origin: { x: 10, z: 17 },
        placement: 'flexible',
        rotation: 0,
        structureId: 'wall',
      });
      occupants.sort(({ id: left }, { id: right }) =>
        String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0,
      );
    });

    expectFailureCode(stranded, 'legacy-layout-strands-required-route');
  });

  it('returns a semantic failure for malformed legacy occupancy instead of throwing', () => {
    const overlapping = mutateSave(initialSaveV4Fixture, (document) => {
      const station = asRecord(document.station, 'station');
      const occupancy = asRecord(station.stationOccupancy, 'station occupancy');
      const occupants = occupancy.occupants as Record<string, unknown>[];
      occupants.push({
        footprint: { height: 1, width: 1 },
        id: 'built-wall-0',
        origin: { x: 9, z: 6 },
        placement: 'flexible',
        rotation: 0,
        structureId: 'wall',
      });
      occupants.sort(({ id: left }, { id: right }) =>
        String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0,
      );
    });

    expectFailureCode(overlapping, 'semantic-invariant-failed');
  });

  it('rejects the scenario-v6 migration edge when the target is newer than v7', () => {
    const futureContext = {
      ...greatPlainsSaveContext,
      simulation: {
        scenario: { ...greatPlainsSaveContext.simulation.scenario, version: 8 },
      },
    };
    const loaded = decodeGameSaveWithContext(initialSaveV4Fixture, futureContext);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) throw new Error('Expected future migration to fail.');
    expect(loaded.issues.map(({ code }) => code)).toContain(
      'unsupported-content-version',
    );
  });

  it('migrates safe scenario-v6 construction history without changing its facts', () => {
    const built = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: {
        blueprintId: 'wall',
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 0 },
        type: 'construction.place',
      },
      id: 'safe-v6-construction',
      sequence: 0,
    }).state;
    const legacy = mutateSave(encodeGameSave(snapshotFor(built)), (document) => {
      asRecord(document.content, 'content').scenarioVersion = 6;
      const station = asRecord(document.station, 'station');
      station.scenarioVersion = 6;
      const started = (station.eventLedger as Record<string, unknown>[]).find(
        ({ type }) => type === 'simulation.started',
      );
      if (started === undefined) throw new Error('Simulation start event is missing.');
      started.scenarioVersion = 6;
    });
    const loaded = expectSuccessfulLoad(legacy);

    expect(loaded.simulation).toMatchObject({
      nextConstructionSequence: 1,
      scenarioId: 'great-plains',
      scenarioVersion: 7,
    });
    expect(loaded.simulation.stationOccupancy).toEqual(built.stationOccupancy);
    expect(
      loaded.simulation.eventLedger.find(({ type }) => type === 'construction.placed'),
    ).toEqual(built.eventLedger.find(({ type }) => type === 'construction.placed'));
  });

  it('round-trips inventory purchases and completed customer sales', () => {
    const sold = staffedBusinessState(63 * CLOCK_UNITS_PER_MINUTE);
    const ordered = dispatchSimulationCommand(sold, {
      atTick: sold.tick,
      command: { product: 'fuel', quantity: 5, type: 'inventory.order' },
      id: 'save-test-order',
      sequence: 2,
    }).state;

    expect(
      expectSuccessfulLoad(encodeGameSave(snapshotFor(ordered))).simulation,
    ).toEqual(ordered);
  });

  it('round-trips mixed construction and preserves the next canonical identity', () => {
    const initial = createInitialState();
    const garage = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: {
        blueprintId: 'garage',
        placement: { kind: 'authored-plot', plotId: 'garage-plot' },
        type: 'construction.place',
      },
      id: 'save-garage',
      sequence: 0,
    }).state;
    const built = dispatchSimulationCommand(garage, {
      atTick: 0,
      command: {
        blueprintId: 'gate',
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 1 },
        type: 'construction.place',
      },
      id: 'save-gate',
      sequence: 1,
    }).state;
    const loaded = expectSuccessfulLoad(encodeGameSave(snapshotFor(built)));

    expect(loaded.simulation).toEqual(built);
    expect(loaded.simulation.nextConstructionSequence).toBe(2);
    expect(loaded.simulation.stationOccupancy.occupants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'built-garage-0' }),
        expect.objectContaining({ id: 'built-gate-1', rotation: 1 }),
      ]),
    );
  });

  it('rejects a forged construction cost with a fresh checksum', () => {
    const built = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: {
        blueprintId: 'wall',
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 0 },
        type: 'construction.place',
      },
      id: 'forged-wall-source',
      sequence: 0,
    }).state;
    const forged = mutateSave(encodeGameSave(snapshotFor(built)), (document) => {
      const station = asRecord(document.station, 'station');
      const event = (station.eventLedger as Record<string, unknown>[]).find(
        ({ type }) => type === 'construction.placed',
      );
      if (event === undefined) throw new Error('Construction event is missing.');
      const changes = event.costChanges as Record<string, unknown>[];
      const scrap = changes[1];
      if (scrap === undefined) throw new Error('Scrap cost is missing.');
      scrap.cost = 1;
    });

    expectFailureCode(forged, 'semantic-invariant-failed');
  });

  it.each([
    {
      label: 'event cells',
      mutate: (station: Record<string, unknown>) => {
        const event = (station.eventLedger as Record<string, unknown>[]).find(
          ({ type }) => type === 'construction.placed',
        );
        if (event === undefined) throw new Error('Construction event is missing.');
        event.cells = [{ x: 1, z: 4 }];
      },
    },
    {
      label: 'event occupant geometry',
      mutate: (station: Record<string, unknown>) => {
        const event = (station.eventLedger as Record<string, unknown>[]).find(
          ({ type }) => type === 'construction.placed',
        );
        if (event === undefined) throw new Error('Construction event is missing.');
        asRecord(event.occupant, 'construction occupant').origin = { x: 1, z: 4 };
      },
    },
    {
      label: 'final occupancy',
      mutate: (station: Record<string, unknown>) => {
        const occupancy = asRecord(station.stationOccupancy, 'station occupancy');
        const occupant = (occupancy.occupants as Record<string, unknown>[]).find(
          ({ id }) => id === 'built-wall-0',
        );
        if (occupant === undefined) throw new Error('Constructed occupant is missing.');
        occupant.origin = { x: 1, z: 4 };
      },
    },
    {
      label: 'construction cursor',
      mutate: (station: Record<string, unknown>) => {
        station.nextConstructionSequence = 2;
      },
    },
  ])('rejects forged construction $label with a fresh checksum', ({ mutate }) => {
    const built = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: {
        blueprintId: 'wall',
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 0 },
        type: 'construction.place',
      },
      id: 'forged-wall-facts-source',
      sequence: 0,
    }).state;
    const forged = mutateSave(encodeGameSave(snapshotFor(built)), (document) => {
      mutate(asRecord(document.station, 'station'));
    });

    expectFailureCode(forged, 'semantic-invariant-failed');
  });

  it('rejects forged construction that obstructs the active workforce route', () => {
    const assigned = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: {
        employeeId: 'employee-dale',
        jobId: 'inspect-garage-plot',
        type: 'job.assign',
      },
      id: 'route-before-forged-construction',
      sequence: 0,
    }).state;
    const dale = assigned.employees.find(({ id }) => id === 'employee-dale');
    if (dale?.activity.status !== 'traveling') {
      throw new Error('Dale does not have an active test route.');
    }
    const routeCell = dale.activity.path[dale.activity.nextPathIndex];
    if (routeCell === undefined) throw new Error('Dale test route is empty.');
    const built = dispatchSimulationCommand(assigned, {
      atTick: 0,
      command: {
        blueprintId: 'wall',
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 0 },
        type: 'construction.place',
      },
      id: 'valid-wall-away-from-route',
      sequence: 1,
    }).state;
    const forged = mutateSave(encodeGameSave(snapshotFor(built)), (document) => {
      const station = asRecord(document.station, 'station');
      const event = (station.eventLedger as Record<string, unknown>[]).find(
        ({ type }) => type === 'construction.placed',
      );
      if (event === undefined) throw new Error('Construction event is missing.');
      event.cells = [{ ...routeCell }];
      asRecord(event.occupant, 'event occupant').origin = { ...routeCell };
      const occupancy = asRecord(station.stationOccupancy, 'station occupancy');
      const occupant = (occupancy.occupants as Record<string, unknown>[]).find(
        ({ id }) => id === 'built-wall-0',
      );
      if (occupant === undefined) throw new Error('Constructed occupant is missing.');
      occupant.origin = { ...routeCell };
    });

    expectFailureCode(forged, 'semantic-invariant-failed');
  });

  it('rejects forged construction history that strands future workforce access', () => {
    let state = createInitialState();
    for (const [sequence, origin] of [
      { x: 19, z: 18 },
      { x: 20, z: 19 },
      { x: 21, z: 18 },
      { x: 0, z: 4 },
    ].entries()) {
      state = dispatchSimulationCommand(state, {
        atTick: 0,
        command: {
          blueprintId: 'wall',
          placement: { kind: 'flexible', origin, rotation: 0 },
          type: 'construction.place',
        },
        id: `forged-access-source-${String(sequence)}`,
        sequence,
      }).state;
    }
    const forged = mutateSave(encodeGameSave(snapshotFor(state)), (document) => {
      const station = asRecord(document.station, 'station');
      const events = station.eventLedger as Record<string, unknown>[];
      const event = [...events]
        .reverse()
        .find(({ type }) => type === 'construction.placed');
      if (event === undefined) throw new Error('Construction event is missing.');
      event.cells = [{ x: 20, z: 17 }];
      asRecord(event.occupant, 'construction occupant').origin = { x: 20, z: 17 };
      const occupancy = asRecord(station.stationOccupancy, 'station occupancy');
      const occupant = (occupancy.occupants as Record<string, unknown>[]).find(
        ({ id }) => id === 'built-wall-3',
      );
      if (occupant === undefined) throw new Error('Constructed occupant is missing.');
      occupant.origin = { x: 20, z: 17 };
    });

    expectFailureCode(forged, 'semantic-invariant-failed');
  });

  it('round-trips a terminal slice without retaining transient clock work', () => {
    const running = dispatchSimulationCommand(createInitialState(1987, 1), {
      atTick: 0,
      command: { mode: 'normal', type: 'time-mode.set' },
      id: 'start-one-night-slice',
      sequence: 0,
    }).state;
    const terminal = advanceSimulationByClockUnits(
      running,
      22 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    const loaded = expectSuccessfulLoad(encodeGameSave(snapshotFor(terminal)));

    expect(loaded.simulation).toEqual(terminal);
    expect(loaded.simulation.isSliceComplete).toBe(true);
    expect(loaded.simulation.clockStepRemainderTimeUnits).toBe(0);
  });

  it('round-trips after scheduled resources are fully depleted', () => {
    const running = dispatchSimulationCommand(createInitialState(1987, 4), {
      atTick: 0,
      command: { mode: 'normal', type: 'time-mode.set' },
      id: 'start-four-night-slice',
      sequence: 0,
    }).state;
    const terminal = advanceSimulationByClockUnits(
      running,
      94 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    const loaded = expectSuccessfulLoad(encodeGameSave(snapshotFor(terminal)));

    expect(terminal.resources).toMatchObject({ ammunition: 0, power: 0 });
    expect(loaded.simulation).toEqual(terminal);
  }, 15_000);

  it('round-trips automatic paused-to-slow conversion at the night boundary', () => {
    const night = advanceSimulationByClockUnits(
      createInitialState(),
      11 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    const loaded = expectSuccessfulLoad(encodeGameSave(snapshotFor(night)));

    expect(night.phase).toBe('night');
    expect(night.timeMode).toBe('slow');
    expect(loaded.simulation).toEqual(night);
  });

  it('round-trips a player time command issued exactly at the night boundary', () => {
    const fast = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: { mode: 'fast', type: 'time-mode.set' },
      id: 'select-fast-before-night',
      sequence: 0,
    }).state;
    const night = advanceSimulationByClockUnits(fast, 11 * 60 * CLOCK_UNITS_PER_MINUTE);
    const slowed = dispatchSimulationCommand(night, {
      atTick: night.tick,
      command: { mode: 'slow', type: 'time-mode.set' },
      id: 'select-slow-at-night-boundary',
      sequence: 1,
    }).state;

    expect(
      expectSuccessfulLoad(encodeGameSave(snapshotFor(slowed))).simulation,
    ).toEqual(slowed);

    const pausedRequest = dispatchSimulationCommand(night, {
      atTick: night.tick,
      command: { mode: 'paused', type: 'time-mode.set' },
      id: 'request-pause-at-night-boundary',
      sequence: 1,
    }).state;
    expect(pausedRequest.timeMode).toBe('slow');
    expect(
      expectSuccessfulLoad(encodeGameSave(snapshotFor(pausedRequest))).simulation,
    ).toEqual(pausedRequest);
  });

  it('canonicalizes completed-region IDs and detaches loaded nested state', () => {
    const state = createInitialState();
    const serialized = encodeGameSave({
      ...snapshotFor(state),
      campaign: {
        ...campaign,
        completedRegionIds: ['great-plains', 'great-plains'],
      },
    });
    const loaded = expectSuccessfulLoad(serialized);

    expect(loaded.campaign.completedRegionIds).toEqual(['great-plains']);
    const loadedEmployee = loaded.simulation.employees[0];
    const sourceEmployee = state.employees[0];
    if (loadedEmployee === undefined || sourceEmployee === undefined) {
      throw new Error('Employee fixture is missing.');
    }
    (loadedEmployee.position as { x: number }).x = 31;
    expect(loadedEmployee.position).not.toEqual(sourceEmployee.position);
  });

  it('preserves nonempty player data without trimming or normalizing it', () => {
    const initial = createInitialState();
    const spaced = {
      ...initial,
      employees: initial.employees.map((employee) =>
        employee.id === 'employee-ada'
          ? { ...employee, name: ' Ada ', role: ' Checkout ' }
          : employee,
      ),
    };

    expect(
      expectSuccessfulLoad(encodeGameSave(snapshotFor(spaced))).simulation,
    ).toEqual(spaced);
  });

  it('rejects malformed JSON, primitives, formats, and unsupported versions', () => {
    const valid = encodeGameSave(snapshotFor(createInitialState()));
    expectFailureCode('{', 'invalid-json');
    expectFailureCode('null', 'invalid-save-structure');
    expectFailureCode(
      mutateSave(
        valid,
        (document) => {
          document.format = 'foreign-save';
        },
        false,
      ),
      'unsupported-save-format',
    );
    expectFailureCode(
      mutateSave(
        valid,
        (document) => {
          document.schemaVersion = 5;
        },
        false,
      ),
      'unsupported-save-version',
    );
    expectFailureCode(
      mutateSave(
        valid,
        (document) => {
          asRecord(document.station, 'station').version = 4;
        },
        false,
      ),
      'unsupported-checkpoint-version',
    );
    expectFailureCode(
      mutateSave(
        valid,
        (document) => {
          const station = asRecord(document.station, 'station');
          asRecord(station.rng, 'station.rng').version = 2;
        },
        false,
      ),
      'unsupported-rng-version',
    );
  });

  it('rejects checksum, structure, content, campaign, and semantic corruption', () => {
    const valid = encodeGameSave(snapshotFor(createInitialState()));
    expectFailureCode(
      mutateSave(
        valid,
        (document) => {
          asRecord(document.checksum, 'checksum').value = '00000000';
        },
        false,
      ),
      'checksum-mismatch',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        document.unexpected = true;
      }),
      'invalid-save-structure',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        asRecord(document.content, 'content').scenarioId = 'other-region';
      }),
      'content-id-mismatch',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        asRecord(document.content, 'content').scenarioVersion = 99;
      }),
      'unsupported-content-version',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        asRecord(document.campaign, 'campaign').completedRegionIds = [
          'great-plains',
          'great-plains',
        ];
      }),
      'invalid-campaign',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        asRecord(document.station, 'station').phase = 'night';
      }),
      'semantic-invariant-failed',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        const station = asRecord(document.station, 'station');
        const ledger = station.eventLedger as Record<string, unknown>[];
        const first = ledger[0];
        if (first === undefined) throw new Error('Start event is missing.');
        first.sequence = 1;
      }),
      'semantic-invariant-failed',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        const station = asRecord(document.station, 'station');
        asRecord(station.resources, 'station.resources').cash = -1;
      }),
      'invalid-save-structure',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        asRecord(document.session, 'session').nextCommandSequence = -1;
      }),
      'invalid-save-structure',
    );
  });

  it('rejects checksummed but fabricated ledger, phase, and resource history', () => {
    const valid = encodeGameSave(snapshotFor(createInitialState()));
    expectFailureCode(
      mutateSave(valid, (document) => {
        const station = asRecord(document.station, 'station');
        const ledger = station.eventLedger as Record<string, unknown>[];
        ledger.push({
          absoluteClockUnit: 19_200,
          assignmentId: 'assignment-fabricated',
          employeeId: 'employee-ada',
          jobId: 'open-checkout',
          minute: 480,
          position: { x: 10, z: 17 },
          reason: 'work-duration-reached',
          sequence: 1,
          targetId: 'checkout-counter',
          tick: 0,
          type: 'job.completed',
        });
        station.nextEventSequence = 2;
      }),
      'semantic-invariant-failed',
    );
    expectFailureCode(
      mutateSave(valid, (document) => {
        const station = asRecord(document.station, 'station');
        asRecord(station.resources, 'station.resources').cash = 421;
      }),
      'semantic-invariant-failed',
    );

    const business = encodeGameSave(
      snapshotFor(staffedBusinessState(63 * CLOCK_UNITS_PER_MINUTE)),
    );
    expectFailureCode(
      mutateSave(business, (document) => {
        const station = asRecord(document.station, 'station');
        const ledger = station.eventLedger as Record<string, unknown>[];
        const sale = ledger.find((event) => event.type === 'sale.completed');
        if (sale === undefined) throw new Error('Sale event is missing.');
        sale.revenue = 25;
      }),
      'semantic-invariant-failed',
    );
    expectFailureCode(
      mutateSave(business, (document) => {
        const station = asRecord(document.station, 'station');
        const businessState = asRecord(station.business, 'station.business');
        asRecord(businessState.prices, 'station.business.prices').fuel = 7;
      }),
      'semantic-invariant-failed',
    );

    const firstArrival = advanceSimulationByClockUnits(
      createInitialState(),
      60 * CLOCK_UNITS_PER_MINUTE,
    );
    expectFailureCode(
      mutateSave(encodeGameSave(snapshotFor(firstArrival)), (document) => {
        const station = asRecord(document.station, 'station');
        const businessState = asRecord(station.business, 'station.business');
        businessState.activeCustomers = [];
        businessState.nextCustomerSequence = 0;
        const ledger = (station.eventLedger as Record<string, unknown>[]).filter(
          (event) => event.type !== 'customer.arrived',
        );
        ledger.forEach((event, sequence) => {
          event.sequence = sequence;
        });
        station.eventLedger = ledger;
        station.nextEventSequence = ledger.length;
      }),
      'semantic-invariant-failed',
    );

    const dusk = advanceSimulationByClockUnits(
      runningInitialState(),
      10 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    expectFailureCode(
      mutateSave(encodeGameSave(snapshotFor(dusk)), (document) => {
        const station = asRecord(document.station, 'station');
        const ledger = station.eventLedger as Record<string, unknown>[];
        const phaseEvent = ledger.find((event) => event.type === 'phase.entered');
        if (phaseEvent === undefined) throw new Error('Dusk event is missing.');
        phaseEvent.previousPhase = 'morning';
      }),
      'semantic-invariant-failed',
    );
  });

  it('rejects fabricated job timing and altered active progress', () => {
    const valid = encodeGameSave(snapshotFor(createInitialState()));
    expectFailureCode(
      mutateSave(valid, (document) => {
        const station = asRecord(document.station, 'station');
        const employees = station.employees as Record<string, unknown>[];
        const ada = employees.find((employee) => employee.id === 'employee-ada');
        if (ada === undefined) throw new Error('Ada is missing.');
        ada.position = { x: 10, z: 17 };
        const base = { absoluteClockUnit: 19_200, minute: 480, tick: 0 };
        const ledger = station.eventLedger as Record<string, unknown>[];
        ledger.push(
          {
            ...base,
            assignmentId: 'assignment-fabricated-timing',
            destination: { x: 10, z: 17 },
            employeeId: 'employee-ada',
            jobId: 'open-checkout',
            pathLength: 1,
            reason: 'player-request',
            sequence: 1,
            targetId: 'checkout-counter',
            type: 'job.assigned',
          },
          {
            ...base,
            assignmentId: 'assignment-fabricated-timing',
            destination: { x: 10, z: 17 },
            employeeId: 'employee-ada',
            jobId: 'open-checkout',
            reason: 'job-travel-completed',
            sequence: 2,
            targetId: 'checkout-counter',
            traveledCellCount: 1,
            type: 'employee.arrived',
          },
          {
            ...base,
            assignmentId: 'assignment-fabricated-timing',
            employeeId: 'employee-ada',
            jobId: 'open-checkout',
            reason: 'employee-at-interaction-cell',
            sequence: 3,
            targetId: 'checkout-counter',
            totalWorkClockUnits: 80,
            type: 'job.started',
          },
          {
            ...base,
            assignmentId: 'assignment-fabricated-timing',
            employeeId: 'employee-ada',
            jobId: 'open-checkout',
            position: { x: 10, z: 17 },
            reason: 'work-duration-reached',
            sequence: 4,
            targetId: 'checkout-counter',
            type: 'job.completed',
          },
        );
        station.nextEventSequence = 5;
      }),
      'semantic-invariant-failed',
    );

    const assigned = dispatchSimulationCommand(createInitialState(), {
      atTick: 0,
      command: {
        employeeId: 'employee-dale',
        jobId: 'watch-beacon',
        type: 'job.assign',
      },
      id: 'assign-dale-progress-check',
      sequence: 0,
    }).state;
    const midRoute = advanceSimulationByClockUnits(assigned, 7);
    expectFailureCode(
      mutateSave(encodeGameSave(snapshotFor(midRoute)), (document) => {
        const station = asRecord(document.station, 'station');
        const employees = station.employees as Record<string, unknown>[];
        const dale = employees.find((employee) => employee.id === 'employee-dale');
        if (dale === undefined) throw new Error('Dale is missing.');
        asRecord(dale.activity, 'Dale activity').movementProgressClockUnits = 8;
      }),
      'semantic-invariant-failed',
    );
  });

  it('rejects an enormous checksummed clock before bounded history validation', () => {
    const valid = encodeGameSave(snapshotFor(createInitialState()));
    expectFailureCode(
      mutateSave(valid, (document) => {
        const station = asRecord(document.station, 'station');
        station.absoluteClockUnit = Number.MAX_SAFE_INTEGER;
        station.phase = phaseForClockUnit(Number.MAX_SAFE_INTEGER);
      }),
      'semantic-invariant-failed',
    );
  });

  it('rejects a checksummed event fabricated after terminal slice completion', () => {
    const running = dispatchSimulationCommand(createInitialState(1987, 1), {
      atTick: 0,
      command: { mode: 'normal', type: 'time-mode.set' },
      id: 'start-terminal-forgery-fixture',
      sequence: 0,
    }).state;
    const terminal = advanceSimulationByClockUnits(
      running,
      22 * 60 * CLOCK_UNITS_PER_MINUTE,
    );
    expectFailureCode(
      mutateSave(encodeGameSave(snapshotFor(terminal)), (document) => {
        const station = asRecord(document.station, 'station');
        const ledger = station.eventLedger as Record<string, unknown>[];
        const nextSequence = ledger.length;
        ledger.push({
          absoluteClockUnit: station.absoluteClockUnit,
          currentMode: 'slow',
          effectiveCurrentMode: 'slow',
          effectivePreviousMode: 'normal',
          minute: Math.floor(Number(station.absoluteClockUnit) / 40),
          previousMode: 'normal',
          reason: 'player-request',
          requestedMode: 'slow',
          sequence: nextSequence,
          tick: station.tick,
          type: 'time-mode.changed',
        });
        station.nextEventSequence = nextSequence + 1;
        station.timeMode = 'slow';
      }),
      'semantic-invariant-failed',
    );
  });
});
