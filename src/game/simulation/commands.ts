import { effectiveTimeMode } from './clock';
import { appendDomainEvent } from './events';
import { findJobRoute } from './jobs';
import type { SimulationContext } from './scenario';
import type { SimulationState, TimeMode } from './types';

export interface SetTimeModeCommand {
  readonly mode: TimeMode;
  readonly type: 'time-mode.set';
}

export interface AssignJobCommand {
  readonly employeeId: string;
  readonly jobId: string;
  readonly type: 'job.assign';
}

export interface CancelJobCommand {
  readonly employeeId: string;
  readonly type: 'job.cancel';
}

export type SimulationCommand =
  AssignJobCommand | CancelJobCommand | SetTimeModeCommand;

export interface CommandEnvelope {
  readonly atTick: number;
  readonly command: SimulationCommand;
  readonly id: string;
  readonly sequence: number;
}

export type CommandReceiptReason =
  | 'command-scheduled-in-future'
  | 'command-scheduled-in-past'
  | 'invalid-command-envelope'
  | 'invalid-command-payload'
  | 'employee-busy'
  | 'employee-idle'
  | 'employee-not-found'
  | 'job-assigned'
  | 'job-cancelled'
  | 'job-not-found'
  | 'job-target-has-no-walkable-interaction'
  | 'job-target-unavailable'
  | 'job-target-unreachable'
  | 'job-unavailable'
  | 'night-fast-capped'
  | 'night-pause-converted'
  | 'simulation-complete'
  | 'time-mode-unchanged'
  | 'time-mode-updated'
  | 'unsupported-command-type';

export interface CommandReceipt {
  readonly atTick: number;
  readonly changed: boolean;
  readonly commandId: string;
  readonly commandSequence: number;
  readonly emittedEventSequences: readonly number[];
  readonly reason: CommandReceiptReason;
  readonly status: 'accepted' | 'rejected';
}

export interface DispatchCommandResult {
  readonly receipt: CommandReceipt;
  readonly state: SimulationState;
}

const TIME_MODES: readonly TimeMode[] = ['paused', 'slow', 'normal', 'fast'];

interface RuntimeCommandEnvelope {
  readonly atTick: number;
  readonly command: unknown;
  readonly id: string;
  readonly sequence: number;
}

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

const isValidEnvelopeMetadata = (
  envelope: unknown,
): envelope is RuntimeCommandEnvelope =>
  isRecord(envelope) &&
  typeof envelope.id === 'string' &&
  envelope.id.trim().length > 0 &&
  typeof envelope.atTick === 'number' &&
  Number.isSafeInteger(envelope.atTick) &&
  envelope.atTick >= 0 &&
  typeof envelope.sequence === 'number' &&
  Number.isSafeInteger(envelope.sequence) &&
  envelope.sequence >= 0;

const isTimeMode = (value: unknown): value is TimeMode =>
  TIME_MODES.includes(value as TimeMode);

const isTechnicalId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9-]+$/u.test(value);

export const parseSimulationCommand = (
  value: unknown,
): SimulationCommand | undefined => {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;
  switch (value.type) {
    case 'time-mode.set':
      return isTimeMode(value.mode)
        ? { mode: value.mode, type: 'time-mode.set' }
        : undefined;
    case 'job.assign':
      return isTechnicalId(value.employeeId) && isTechnicalId(value.jobId)
        ? {
            employeeId: value.employeeId,
            jobId: value.jobId,
            type: 'job.assign',
          }
        : undefined;
    case 'job.cancel':
      return isTechnicalId(value.employeeId)
        ? { employeeId: value.employeeId, type: 'job.cancel' }
        : undefined;
    default:
      return undefined;
  }
};

const receiptFor = (
  envelope: RuntimeCommandEnvelope,
  fields: Pick<
    CommandReceipt,
    'changed' | 'emittedEventSequences' | 'reason' | 'status'
  >,
): CommandReceipt => ({
  ...fields,
  atTick: envelope.atTick,
  commandId: envelope.id,
  commandSequence: envelope.sequence,
});

const invalidEnvelopeReceipt = (state: SimulationState): CommandReceipt => ({
  atTick: state.tick,
  changed: false,
  commandId: '<invalid-command>',
  commandSequence: 0,
  emittedEventSequences: [],
  reason: 'invalid-command-envelope',
  status: 'rejected',
});

const dispatchTimeMode = (
  state: SimulationState,
  envelope: RuntimeCommandEnvelope,
  command: SetTimeModeCommand,
): DispatchCommandResult => {
  const previousMode = state.timeMode;
  const currentMode =
    state.phase === 'night' && command.mode === 'paused' ? 'slow' : command.mode;
  const reason: CommandReceiptReason =
    state.phase === 'night' && command.mode === 'paused'
      ? 'night-pause-converted'
      : state.phase === 'night' && command.mode === 'fast'
        ? 'night-fast-capped'
        : currentMode === previousMode
          ? 'time-mode-unchanged'
          : 'time-mode-updated';

  if (currentMode === previousMode) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason,
        status: 'accepted',
      }),
      state,
    };
  }

  const eventSequence = state.nextEventSequence;
  const next = appendDomainEvent(
    { ...state, timeMode: currentMode },
    {
      currentMode,
      effectiveCurrentMode: effectiveTimeMode(currentMode, state.phase),
      effectivePreviousMode: effectiveTimeMode(previousMode, state.phase),
      previousMode,
      reason:
        reason === 'night-pause-converted' || reason === 'night-fast-capped'
          ? reason
          : 'player-request',
      requestedMode: command.mode,
      type: 'time-mode.changed',
    },
  );

  return {
    receipt: receiptFor(envelope, {
      changed: true,
      emittedEventSequences: [eventSequence],
      reason,
      status: 'accepted',
    }),
    state: next,
  };
};

const rejectedJobCommand = (
  state: SimulationState,
  envelope: RuntimeCommandEnvelope,
  reason: Extract<
    CommandReceiptReason,
    | 'employee-busy'
    | 'employee-idle'
    | 'employee-not-found'
    | 'job-not-found'
    | 'job-target-has-no-walkable-interaction'
    | 'job-target-unavailable'
    | 'job-target-unreachable'
    | 'job-unavailable'
  >,
): DispatchCommandResult => ({
  receipt: receiptFor(envelope, {
    changed: false,
    emittedEventSequences: [],
    reason,
    status: 'rejected',
  }),
  state,
});

const replaceEmployee = (
  state: SimulationState,
  employeeId: string,
  replacement: SimulationState['employees'][number],
): SimulationState => ({
  ...state,
  employees: state.employees.map((employee) =>
    employee.id === employeeId ? replacement : employee,
  ),
});

const dispatchAssignJob = (
  state: SimulationState,
  envelope: RuntimeCommandEnvelope,
  command: AssignJobCommand,
  context: SimulationContext,
): DispatchCommandResult => {
  const employee = state.employees.find(
    (candidate) => candidate.id === command.employeeId,
  );
  if (employee === undefined) {
    return rejectedJobCommand(state, envelope, 'employee-not-found');
  }
  const job = context.scenario.jobs.find((candidate) => candidate.id === command.jobId);
  if (job === undefined) return rejectedJobCommand(state, envelope, 'job-not-found');
  if (employee.activity.status !== 'idle') {
    return rejectedJobCommand(state, envelope, 'employee-busy');
  }
  if (
    state.employees.some(
      (candidate) =>
        candidate.activity.status !== 'idle' &&
        candidate.activity.jobId === command.jobId,
    )
  ) {
    return rejectedJobCommand(state, envelope, 'job-unavailable');
  }

  const route = findJobRoute(
    context.scenario,
    state.stationOccupancy,
    employee.position,
    job,
  );
  if (!route.ok) return rejectedJobCommand(state, envelope, route.reason);

  const assignmentId = `assignment-${String(state.nextEventSequence)}`;
  const eventSequences = [state.nextEventSequence];
  const activity =
    route.path.length === 0
      ? {
          assignmentId,
          destination: { ...route.destination },
          jobId: job.id,
          remainingWorkClockUnits: job.workDurationClockUnits,
          status: 'working' as const,
          targetId: route.target.id,
          totalWorkClockUnits: job.workDurationClockUnits,
        }
      : {
          assignmentId,
          destination: { ...route.destination },
          jobId: job.id,
          movementProgressClockUnits: 0,
          nextPathIndex: 0,
          path: route.path.map((cell) => ({ ...cell })),
          status: 'traveling' as const,
          targetId: route.target.id,
          totalWorkClockUnits: job.workDurationClockUnits,
        };
  let next = replaceEmployee(state, employee.id, { ...employee, activity });
  next = appendDomainEvent(next, {
    assignmentId,
    destination: { ...route.destination },
    employeeId: employee.id,
    jobId: job.id,
    pathLength: route.path.length,
    reason: 'player-request',
    targetId: route.target.id,
    type: 'job.assigned',
  });
  if (activity.status === 'working') {
    eventSequences.push(next.nextEventSequence);
    next = appendDomainEvent(next, {
      assignmentId,
      employeeId: employee.id,
      jobId: job.id,
      reason: 'employee-at-interaction-cell',
      targetId: route.target.id,
      totalWorkClockUnits: job.workDurationClockUnits,
      type: 'job.started',
    });
  }

  return {
    receipt: receiptFor(envelope, {
      changed: true,
      emittedEventSequences: eventSequences,
      reason: 'job-assigned',
      status: 'accepted',
    }),
    state: next,
  };
};

const dispatchCancelJob = (
  state: SimulationState,
  envelope: RuntimeCommandEnvelope,
  command: CancelJobCommand,
): DispatchCommandResult => {
  const employee = state.employees.find(
    (candidate) => candidate.id === command.employeeId,
  );
  if (employee === undefined) {
    return rejectedJobCommand(state, envelope, 'employee-not-found');
  }
  const activity = employee.activity;
  if (activity.status === 'idle') {
    return rejectedJobCommand(state, envelope, 'employee-idle');
  }

  let next = replaceEmployee(state, employee.id, {
    ...employee,
    activity: { status: 'idle' },
  });
  next = appendDomainEvent(next, {
    assignmentId: activity.assignmentId,
    employeeId: employee.id,
    jobId: activity.jobId,
    position: { ...employee.position },
    previousActivity: activity.status,
    reason: 'player-request',
    remainingPathCells:
      activity.status === 'traveling'
        ? activity.path.length - activity.nextPathIndex
        : 0,
    remainingWorkClockUnits:
      activity.status === 'working' ? activity.remainingWorkClockUnits : 0,
    type: 'job.cancelled',
  });
  return {
    receipt: receiptFor(envelope, {
      changed: true,
      emittedEventSequences: [state.nextEventSequence],
      reason: 'job-cancelled',
      status: 'accepted',
    }),
    state: next,
  };
};

export const dispatchSimulationCommand = (
  state: SimulationState,
  envelope: unknown,
  context: SimulationContext,
): DispatchCommandResult => {
  if (
    state.scenarioId !== context.scenario.id ||
    state.scenarioVersion !== context.scenario.version ||
    state.stationOccupancy.gridDefinitionId !==
      context.scenario.stationGridDefinition.id ||
    state.stationOccupancy.gridDefinitionVersion !==
      context.scenario.stationGridDefinition.version
  ) {
    throw new RangeError('Simulation state does not match its command context.');
  }
  if (!isValidEnvelopeMetadata(envelope)) {
    return {
      receipt: invalidEnvelopeReceipt(state),
      state,
    };
  }

  if (envelope.atTick < state.tick) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: 'command-scheduled-in-past',
        status: 'rejected',
      }),
      state,
    };
  }
  if (envelope.atTick > state.tick) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: 'command-scheduled-in-future',
        status: 'rejected',
      }),
      state,
    };
  }
  if (state.isSliceComplete) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: 'simulation-complete',
        status: 'rejected',
      }),
      state,
    };
  }

  const runtimeCommand = envelope.command;
  if (
    typeof runtimeCommand !== 'object' ||
    runtimeCommand === null ||
    !('type' in runtimeCommand) ||
    typeof runtimeCommand.type !== 'string'
  ) {
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: 'invalid-command-payload',
        status: 'rejected',
      }),
      state,
    };
  }

  const command = parseSimulationCommand(runtimeCommand);
  if (command === undefined) {
    const knownType = ['job.assign', 'job.cancel', 'time-mode.set'].includes(
      runtimeCommand.type,
    );
    return {
      receipt: receiptFor(envelope, {
        changed: false,
        emittedEventSequences: [],
        reason: knownType ? 'invalid-command-payload' : 'unsupported-command-type',
        status: 'rejected',
      }),
      state,
    };
  }
  switch (command.type) {
    case 'time-mode.set':
      return dispatchTimeMode(state, envelope, command);
    case 'job.assign':
      return dispatchAssignJob(state, envelope, command, context);
    case 'job.cancel':
      return dispatchCancelJob(state, envelope, command);
    default:
      return command satisfies never;
  }
};
