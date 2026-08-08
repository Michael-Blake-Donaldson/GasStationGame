import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  dispatchSimulationCommand,
  GREAT_PLAINS_SCENARIO_ID,
  GREAT_PLAINS_SCENARIO_VERSION,
  runClockReplay,
  runScenarioReplay,
  type ClockReplayV1,
  type ScenarioReplayV6,
} from '../scenarios/greatPlains';
import { SEEDED_RANDOM_ALGORITHM, SEEDED_RANDOM_VERSION } from './random';

const replayFixture = (): ClockReplayV1 => ({
  commands: [
    {
      atTick: 0,
      command: { type: 'time-mode.set', mode: 'normal' },
      id: 'start-clock',
      sequence: 0,
    },
    {
      atTick: 20,
      command: { type: 'time-mode.set', mode: 'fast' },
      id: 'speed-up',
      sequence: 1,
    },
  ],
  replayVersion: 1,
  seed: 1987,
  stopAfterTick: 100,
  targetNightCount: 3,
});

const scenarioReplayFixture = (): ScenarioReplayV6 => ({
  commands: replayFixture().commands,
  gridDefinitionId: 'great-plains-station-grid',
  gridDefinitionVersion: 1,
  replayKind: 'scenario',
  replayVersion: 6,
  rng: {
    algorithm: SEEDED_RANDOM_ALGORITHM,
    seed: 1987,
    version: SEEDED_RANDOM_VERSION,
  },
  scenarioId: GREAT_PLAINS_SCENARIO_ID,
  scenarioVersion: GREAT_PLAINS_SCENARIO_VERSION,
  stopAfterTick: 100,
  targetNightCount: 3,
});

describe('clock commands and replay', () => {
  it('returns stable, correlated receipts for time-mode commands', () => {
    const initial = createInitialState();
    const started = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: { type: 'time-mode.set', mode: 'normal' },
      id: 'start-clock',
      sequence: 0,
    });
    const unchanged = dispatchSimulationCommand(started.state, {
      atTick: 0,
      command: { type: 'time-mode.set', mode: 'normal' },
      id: 'keep-clock',
      sequence: 1,
    });

    expect(started.receipt).toEqual({
      atTick: 0,
      changed: true,
      commandId: 'start-clock',
      commandSequence: 0,
      emittedEventSequences: [1],
      reason: 'time-mode-updated',
      status: 'accepted',
    });
    expect(unchanged.receipt.reason).toBe('time-mode-unchanged');
    expect(unchanged.receipt.emittedEventSequences).toEqual([]);
    expect(unchanged.state).toBe(started.state);
  });

  it('replays versioned scenario metadata to identical authoritative results', () => {
    const first = runScenarioReplay(scenarioReplayFixture());
    const repeated = runScenarioReplay(scenarioReplayFixture());
    const shuffled = runScenarioReplay({
      ...scenarioReplayFixture(),
      commands: [...scenarioReplayFixture().commands].reverse(),
    });

    expect(repeated).toEqual(first);
    expect(shuffled).toEqual(first);
    expect(first.eventLedger).toBe(first.state.eventLedger);
    expect(first.finalRng).toBe(first.state.rng);
    expect(first.finalRng.drawCount).toBe(0);
    expect(first.eventLedger[0]).toMatchObject({
      gridDefinitionId: 'great-plains-station-grid',
      gridDefinitionVersion: 1,
      rngAlgorithm: SEEDED_RANDOM_ALGORITHM,
      rngVersion: SEEDED_RANDOM_VERSION,
      type: 'simulation.started',
    });
    expect(first.consumedCommandIds).toEqual(['start-clock', 'speed-up']);
    expect(first.unconsumedCommandIds).toEqual([]);
    expect(first.stopReason).toBe('tick-limit-reached');
  });

  it('replays construction to identical occupancy, cost, event, and hash facts', () => {
    const replay: ScenarioReplayV6 = {
      ...scenarioReplayFixture(),
      commands: [
        {
          atTick: 0,
          command: {
            blueprintId: 'gate',
            placement: {
              kind: 'flexible',
              origin: { x: 0, z: 4 },
              rotation: 1,
            },
            type: 'construction.place',
          },
          id: 'replay-gate',
          sequence: 0,
        },
        {
          atTick: 0,
          command: { mode: 'normal', type: 'time-mode.set' },
          id: 'replay-construction-clock',
          sequence: 1,
        },
      ],
      stopAfterTick: 2,
    };
    const first = runScenarioReplay(replay);
    const repeated = runScenarioReplay(replay);

    expect(repeated).toEqual(first);
    expect(first.state).toMatchObject({
      nextConstructionSequence: 1,
      resources: { cash: 412, scrap: 29 },
    });
    const event = first.state.eventLedger.find(
      (candidate) => candidate.type === 'construction.placed',
    );
    expect(event?.type).toBe('construction.placed');
    if (event?.type !== 'construction.placed') return;
    expect(event).toMatchObject({
      blueprintId: 'gate',
      constructionSequence: 0,
      type: 'construction.placed',
    });
    expect(event.occupant).toMatchObject({ id: 'built-gate-0', rotation: 1 });
  });

  it('replays required-route rejection without changing construction state', () => {
    const replay: ScenarioReplayV6 = {
      ...scenarioReplayFixture(),
      commands: [
        ...[
          { x: 19, z: 18 },
          { x: 20, z: 19 },
          { x: 21, z: 18 },
          { x: 20, z: 17 },
        ].map((origin, sequence) => ({
          atTick: 0,
          command: {
            blueprintId: 'wall',
            placement: { kind: 'flexible' as const, origin, rotation: 0 as const },
            type: 'construction.place' as const,
          },
          id: `replay-enclosure-${String(sequence)}`,
          sequence,
        })),
        {
          atTick: 0,
          command: { mode: 'normal', type: 'time-mode.set' },
          id: 'replay-enclosure-clock',
          sequence: 4,
        },
      ],
      stopAfterTick: 2,
    };
    const first = runScenarioReplay(replay);
    const repeated = runScenarioReplay(replay);

    expect(repeated).toEqual(first);
    expect(first.receipts[3]).toMatchObject({
      changed: false,
      reason: 'required-route-unreachable',
      status: 'rejected',
    });
    expect(first.state.nextConstructionSequence).toBe(3);
    expect(
      first.state.stationOccupancy.occupants.filter(({ id }) =>
        id.startsWith('built-wall-'),
      ),
    ).toHaveLength(3);
  });

  it('replays staffed service errors with identical RNG consumption and facts', () => {
    const replay: ScenarioReplayV6 = {
      ...scenarioReplayFixture(),
      commands: [
        {
          atTick: 0,
          command: {
            employeeId: 'employee-bo',
            jobId: 'staff-pumps',
            type: 'job.assign',
          },
          id: 'replay-staff-pumps',
          sequence: 0,
        },
        {
          atTick: 0,
          command: { mode: 'normal', type: 'time-mode.set' },
          id: 'replay-start-clock',
          sequence: 1,
        },
      ],
      rng: { ...scenarioReplayFixture().rng, seed: 1 },
      stopAfterTick: 210,
    };
    const first = runScenarioReplay(replay);
    const repeated = runScenarioReplay(replay);
    const service = first.eventLedger.find((event) => event.type === 'service.started');

    expect(repeated).toEqual(first);
    expect(first.finalRng.drawCount).toBe(1);
    expect(service).toMatchObject({
      performance: {
        employeeId: 'employee-bo',
        errorOccurred: true,
        errorReworkClockUnits: 40,
        errorRoll: 61,
        rngDrawCount: 1,
      },
      type: 'service.started',
    });
  });

  it('replays job assignment through travel, work, and completion', () => {
    const result = runScenarioReplay({
      ...scenarioReplayFixture(),
      commands: [
        {
          atTick: 0,
          command: {
            employeeId: 'employee-ada',
            jobId: 'open-checkout',
            type: 'job.assign',
          },
          id: 'assign-ada',
          sequence: 0,
        },
        {
          atTick: 0,
          command: { mode: 'normal', type: 'time-mode.set' },
          id: 'start-clock',
          sequence: 1,
        },
      ],
      stopAfterTick: 20,
    });

    expect(result.receipts.map(({ reason }) => reason)).toEqual([
      'job-assigned',
      'time-mode-updated',
    ]);
    expect(
      result.eventLedger
        .filter(({ type }) =>
          ['job.assigned', 'employee.arrived', 'job.started', 'job.completed'].includes(
            type,
          ),
        )
        .map(({ type }) => type),
    ).toEqual(['job.assigned', 'employee.arrived', 'job.started', 'job.completed']);
    expect(
      result.state.employees.find(({ id }) => id === 'employee-ada')?.activity,
    ).toEqual({ status: 'idle' });
    expect(result.finalRng.drawCount).toBe(0);
  });

  it('changes RNG, state, ledger, and diagnostic hashes when the seed changes', () => {
    const baseline = runScenarioReplay(scenarioReplayFixture());
    const changed = runScenarioReplay({
      ...scenarioReplayFixture(),
      rng: { ...scenarioReplayFixture().rng, seed: 1988 },
    });

    expect(changed.finalRng).not.toEqual(baseline.finalRng);
    expect(changed.state).not.toEqual(baseline.state);
    expect(changed.eventLedger).not.toEqual(baseline.eventLedger);
    expect(changed.stateHash).not.toBe(baseline.stateHash);
    expect(changed.eventLedgerHash).not.toBe(baseline.eventLedgerHash);
  });

  it('reports slice completion without consuming RNG', () => {
    const result = runScenarioReplay({
      ...scenarioReplayFixture(),
      commands: [scenarioReplayFixture().commands[0]].filter(
        (command) => command !== undefined,
      ),
      stopAfterTick: 5_000,
      targetNightCount: 1,
    });

    expect(result.stopReason).toBe('slice-completed');
    expect(result.state.completedNights).toBe(1);
    expect(result.finalRng.drawCount).toBe(0);
  });

  it.each([
    [{ replayKind: 'clock' }, 'format'],
    [{ replayVersion: 2 }, 'format'],
    [{ scenarioId: 'unknown' }, 'scenario'],
    [{ scenarioVersion: 1 }, 'scenario'],
    [{ gridDefinitionId: 'unknown-grid' }, 'grid'],
    [{ gridDefinitionVersion: 2 }, 'grid'],
    [{ rng: { ...scenarioReplayFixture().rng, algorithm: 'unknown' } }, 'RNG'],
    [{ rng: { ...scenarioReplayFixture().rng, version: 2 } }, 'RNG'],
    [{ rng: { ...scenarioReplayFixture().rng, seed: -1 } }, 'rng.seed'],
  ] as const)(
    'rejects unsupported scenario replay metadata %#',
    (override, message) => {
      const invalid = {
        ...scenarioReplayFixture(),
        ...override,
      } as unknown as ScenarioReplayV6;
      expect(() => runScenarioReplay(invalid)).toThrow(message);
    },
  );

  it('replays the same commands to the same state, ledger, and hash', () => {
    const first = runClockReplay(replayFixture());
    const second = runClockReplay(replayFixture());
    const shuffled = runClockReplay({
      ...replayFixture(),
      commands: [...replayFixture().commands].reverse(),
    });

    expect(second).toEqual(first);
    expect(shuffled).toEqual(first);
    expect(first.receipts).toHaveLength(2);
    expect(first.events).toBe(first.state.eventLedger);
    expect(
      first.events.filter((event) => event.type === 'time-mode.changed'),
    ).toHaveLength(2);
    expect(first.unconsumedCommandIds).toEqual([]);
  });

  it('changes the checkpoint hash when a time command changes', () => {
    const baseline = runClockReplay(replayFixture());
    const changed = runClockReplay({
      ...replayFixture(),
      commands: replayFixture().commands.map((envelope) =>
        envelope.id === 'speed-up'
          ? { ...envelope, command: { type: 'time-mode.set', mode: 'slow' } }
          : envelope,
      ),
    });

    expect(changed.stateHash).not.toBe(baseline.stateHash);
  });

  it('orders commands sharing a tick by sequence', () => {
    const result = runClockReplay({
      ...replayFixture(),
      commands: [
        {
          atTick: 0,
          command: { type: 'time-mode.set', mode: 'fast' },
          id: 'fast-first',
          sequence: 0,
        },
        {
          atTick: 0,
          command: { type: 'time-mode.set', mode: 'slow' },
          id: 'slow-second',
          sequence: 1,
        },
      ],
      stopAfterTick: 1,
    });

    expect(result.state.timeMode).toBe('slow');
    expect(result.receipts.map((receipt) => receipt.commandId)).toEqual([
      'fast-first',
      'slow-second',
    ]);
    expect(
      result.events
        .filter((event) => event.type === 'time-mode.changed')
        .map((event) => event.currentMode),
    ).toEqual(['fast', 'slow']);
  });

  it('reports future commands that cannot be reached while paused', () => {
    const result = runClockReplay({
      ...replayFixture(),
      commands: [
        {
          atTick: 1,
          command: { type: 'time-mode.set', mode: 'normal' },
          id: 'unreachable-start',
          sequence: 0,
        },
      ],
      stopAfterTick: 2,
    });

    expect(result.state.tick).toBe(0);
    expect(result.stopReason).toBe('paused-with-no-reachable-command');
    expect(result.consumedCommandIds).toEqual([]);
    expect(result.unconsumedCommandIds).toEqual(['unreachable-start']);
  });

  it('rejects duplicate command identity before replaying', () => {
    const fixture = replayFixture();
    const firstCommand = fixture.commands[0];
    if (firstCommand === undefined) throw new Error('Replay fixture is incomplete.');
    const duplicate = { ...firstCommand, sequence: 1 };

    expect(() =>
      runClockReplay({ ...fixture, commands: [firstCommand, duplicate] }),
    ).toThrow('unique');
  });

  it('rejects unsupported replay data before producing a partial result', () => {
    const invalidVersion = {
      ...replayFixture(),
      replayVersion: 2,
    } as unknown as ClockReplayV1;
    const invalidCommand = {
      ...replayFixture(),
      commands: [
        {
          atTick: 0,
          command: { type: 'unknown', mode: 'normal' },
          id: 'bad-command',
          sequence: 0,
        },
      ],
    } as unknown as ClockReplayV1;
    const legacyJobCommand = {
      ...replayFixture(),
      commands: [
        {
          atTick: 0,
          command: {
            employeeId: 'employee-ada',
            jobId: 'open-checkout',
            type: 'job.assign',
          },
          id: 'legacy-job',
          sequence: 0,
        },
      ],
    } as ClockReplayV1;

    expect(() => runClockReplay(invalidVersion)).toThrow('version');
    expect(() => runClockReplay(invalidCommand)).toThrow('command');
    expect(() => runClockReplay(legacyJobCommand)).toThrow('only supports time');
  });

  it.each([
    null,
    { ...replayFixture(), commands: null },
    {
      ...replayFixture(),
      commands: [
        {
          atTick: 0,
          command: null,
          id: 'null-command',
          sequence: 0,
        },
      ],
    },
  ])(
    'rejects malformed replay structure %# with a stable validation error',
    (value) => {
      expect(() => runClockReplay(value as unknown as ClockReplayV1)).toThrow(
        RangeError,
      );
    },
  );

  it.each([
    [{ seed: -1 }, 'seed'],
    [{ stopAfterTick: 0.5 }, 'stopAfterTick'],
    [{ targetNightCount: 0 }, 'targetNightCount'],
    [
      {
        commands: [
          {
            atTick: 0,
            command: { type: 'time-mode.set', mode: 'normal' },
            id: '',
            sequence: 0,
          },
        ],
      },
      'ids',
    ],
    [
      {
        commands: [
          {
            atTick: 0,
            command: { type: 'time-mode.set', mode: 'normal' },
            id: 'one',
            sequence: 0,
          },
          {
            atTick: 0,
            command: { type: 'time-mode.set', mode: 'fast' },
            id: 'two',
            sequence: 0,
          },
        ],
      },
      'sequences',
    ],
  ] as const)('rejects malformed replay field %#', (override, message) => {
    const invalid = { ...replayFixture(), ...override } as ClockReplayV1;
    expect(() => runClockReplay(invalid)).toThrow(message);
  });
});
