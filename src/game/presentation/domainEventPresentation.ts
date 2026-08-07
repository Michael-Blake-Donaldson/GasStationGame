import type { CommandReceipt } from '../simulation/commands';
import type { DomainEvent, ResourceChange } from '../simulation/types';

export interface DomainEventPresentation {
  readonly message: string;
  readonly tone: 'neutral' | 'positive' | 'warning';
}

export const selectRecentDomainEvents = (
  ledger: readonly DomainEvent[],
  limit = 8,
): readonly DomainEvent[] => {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError('Event projection limit must be a non-negative safe integer.');
  }
  return limit === 0 ? [] : ledger.slice(-limit);
};

const describeResourceChanges = (changes: readonly ResourceChange[]): string =>
  changes
    .map(
      ({ appliedDelta, resource }) =>
        `${appliedDelta > 0 ? '+' : ''}${String(appliedDelta)} ${resource}`,
    )
    .join(', ');

export const presentDomainEvent = (event: DomainEvent): DomainEventPresentation => {
  switch (event.type) {
    case 'simulation.started':
      return {
        message: 'Morning shift opened. The Beacon is stable.',
        tone: 'positive',
      };
    case 'phase.entered':
      switch (event.currentPhase) {
        case 'morning':
          return {
            message: 'Sunrise. The night report is ready.',
            tone: 'positive',
          };
        case 'day':
          return { message: 'Day operations resumed.', tone: 'neutral' };
        case 'dusk':
          return {
            message: 'Dusk readiness window opened.',
            tone: 'warning',
          };
        case 'night':
          return {
            message: 'Night attack conditions are active.',
            tone: 'warning',
          };
      }
      throw new RangeError('Unsupported simulation phase.');
    case 'night.completed':
      return {
        message: `Night ${String(event.completedNights)} survived.`,
        tone: 'positive',
      };
    case 'resources.changed':
      return {
        message: `${event.reason === 'day-hourly-flow' ? 'Day operations' : 'Night systems'}: ${describeResourceChanges(event.changes)}.`,
        tone: event.reason === 'day-hourly-flow' ? 'neutral' : 'warning',
      };
    case 'time-mode.changed':
      return {
        message:
          event.reason === 'night-pause-converted'
            ? 'Night cannot pause; slow time engaged.'
            : event.reason === 'night-fast-capped'
              ? 'Night speed set to fast; effective speed remains normal.'
              : `Time mode set to ${event.currentMode}.`,
        tone:
          event.reason === 'night-pause-converted' ||
          event.reason === 'night-fast-capped'
            ? 'warning'
            : 'neutral',
      };
    case 'slice.completed':
      return {
        message: `${String(event.targetNightCount)}-night vertical slice complete.`,
        tone: 'positive',
      };
  }
};

export const presentCommandReceipt = (
  receipt: CommandReceipt,
): DomainEventPresentation => {
  switch (receipt.reason) {
    case 'command-scheduled-in-future':
      return {
        message: 'Command rejected: scheduled tick is not ready.',
        tone: 'warning',
      };
    case 'command-scheduled-in-past':
      return {
        message: 'Command rejected: scheduled tick has passed.',
        tone: 'warning',
      };
    case 'invalid-command-envelope':
      return { message: 'Command rejected: invalid metadata.', tone: 'warning' };
    case 'invalid-command-payload':
      return { message: 'Command rejected: invalid payload.', tone: 'warning' };
    case 'simulation-complete':
      return {
        message: 'Command rejected: the scenario is complete.',
        tone: 'warning',
      };
    case 'night-pause-converted':
      return { message: 'Night cannot pause; slow time engaged.', tone: 'warning' };
    case 'night-fast-capped':
      return {
        message: 'Night speed set to fast; effective speed remains normal.',
        tone: 'warning',
      };
    case 'time-mode-unchanged':
      return { message: 'Time mode is already selected.', tone: 'neutral' };
    case 'time-mode-updated':
      return { message: 'Time mode updated.', tone: 'neutral' };
    case 'unsupported-command-type':
      return {
        message: 'Command rejected: unsupported command type.',
        tone: 'warning',
      };
  }
};
