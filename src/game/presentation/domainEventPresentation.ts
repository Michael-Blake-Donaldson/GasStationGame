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
    case 'job.assigned':
      return { message: 'Crew assignment accepted.', tone: 'neutral' };
    case 'employee.arrived':
      return {
        message: 'Assigned crew member reached the work area.',
        tone: 'neutral',
      };
    case 'job.started':
      return { message: 'Station work started.', tone: 'neutral' };
    case 'job.cancelled':
      return { message: 'Crew assignment cancelled.', tone: 'warning' };
    case 'job.completed':
      return { message: 'Station work completed.', tone: 'positive' };
    case 'customer.arrived':
      return { message: 'A routine customer joined the pump queue.', tone: 'neutral' };
    case 'service.started':
      return {
        message: `${event.performance.employeeId} started ${event.product} service at skill ${String(event.performance.skillLevel)}/5 and fatigue ${String(event.performance.fatigue)} (${String(event.performance.totalClockUnits)} units${event.performance.errorOccurred ? `, rework +${String(event.performance.errorReworkClockUnits)}` : ''}).`,
        tone: event.performance.errorOccurred ? 'warning' : 'neutral',
      };
    case 'service.interrupted':
      return {
        message: `${event.employeeId} stopped ${event.product} service with ${String(event.remainingClockUnits)} units remaining; the customer rejoined the queue.`,
        tone: 'warning',
      };
    case 'sale.completed':
      return {
        message: `${String(event.soldUnits)} ${event.product} sold for $${String(event.revenue)}.`,
        tone: event.soldUnits < event.requestedUnits ? 'warning' : 'positive',
      };
    case 'customer.completed':
      return {
        message: `Routine customer served for $${String(event.revenue)}.`,
        tone: 'positive',
      };
    case 'retail.price-changed':
      return {
        message: `${event.product} price set to $${String(event.currentUnitPrice)}.`,
        tone: 'neutral',
      };
    case 'inventory.ordered':
      return {
        message: `${String(event.quantity)} ${event.product} stocked for $${String(event.totalCost)}.`,
        tone: 'neutral',
      };
    case 'construction.placed':
      return {
        message: `${event.blueprintId.replaceAll('-', ' ')} placed for $${String(event.costChanges[0]?.cost ?? 0)} and ${String(event.costChanges[1]?.cost ?? 0)} scrap.`,
        tone: 'positive',
      };
  }
};

export const presentCommandReceipt = (
  receipt: CommandReceipt,
): DomainEventPresentation => {
  switch (receipt.reason) {
    case 'construction-placed':
      return { message: 'Construction completed.', tone: 'positive' };
    case 'construction-closed':
      return {
        message: 'Construction is available during day operations.',
        tone: 'warning',
      };
    case 'insufficient-cash':
      return { message: 'Construction rejected: insufficient cash.', tone: 'warning' };
    case 'insufficient-scrap':
      return {
        message: 'Construction rejected: insufficient scrap.',
        tone: 'warning',
      };
    case 'employee-cell-occupied':
    case 'active-route-obstructed':
      return {
        message: 'Construction rejected: the footprint blocks active crew movement.',
        tone: 'warning',
      };
    case 'required-interaction-blocked':
      return {
        message: 'Construction rejected: a required work area has no open access cell.',
        tone: 'warning',
      };
    case 'required-route-unreachable':
      return {
        message: 'Construction rejected: the layout would strand required access.',
        tone: 'warning',
      };
    case 'blueprint-not-found':
      return {
        message: 'Construction rejected: blueprint was not found.',
        tone: 'warning',
      };
    case 'construction-sequence-exhausted':
      return {
        message: 'Construction rejected: placement sequence is exhausted.',
        tone: 'warning',
      };
    case 'placement-kind-mismatch':
    case 'rotation-not-allowed':
    case 'authored-plot-not-found':
    case 'authored-plot-occupied':
    case 'authored-plot-reserved':
    case 'cell-not-buildable':
    case 'cell-occupied':
    case 'facility-not-allowed':
    case 'invalid-candidate':
    case 'occupant-id-already-used':
    case 'out-of-bounds':
      return {
        message: 'Construction rejected: placement is invalid.',
        tone: 'warning',
      };
    case 'employee-busy':
      return { message: 'Assignment rejected: employee is busy.', tone: 'warning' };
    case 'employee-idle':
      return { message: 'Cancellation rejected: employee is idle.', tone: 'warning' };
    case 'employee-not-found':
      return {
        message: 'Assignment rejected: employee was not found.',
        tone: 'warning',
      };
    case 'job-assigned':
      return { message: 'Crew assignment accepted.', tone: 'neutral' };
    case 'job-cancelled':
      return { message: 'Crew assignment cancelled.', tone: 'neutral' };
    case 'job-not-found':
      return { message: 'Assignment rejected: job was not found.', tone: 'warning' };
    case 'job-target-has-no-walkable-interaction':
      return {
        message: 'Assignment rejected: every work position is blocked.',
        tone: 'warning',
      };
    case 'job-target-unavailable':
      return {
        message: 'Assignment rejected: the work target is unavailable.',
        tone: 'warning',
      };
    case 'job-target-unreachable':
      return {
        message: 'Assignment rejected: no route reaches the work area.',
        tone: 'warning',
      };
    case 'job-unavailable':
      return {
        message: 'Assignment rejected: job is already assigned.',
        tone: 'warning',
      };
    case 'inventory-insufficient-cash':
      return { message: 'Stock order skipped: insufficient cash.', tone: 'warning' };
    case 'inventory-ordered':
      return { message: 'Stock order completed.', tone: 'positive' };
    case 'inventory-overflow':
      return {
        message: 'Stock order skipped: quantity is too large.',
        tone: 'warning',
      };
    case 'retail-closed':
      return {
        message: 'Retail changes are available during the day.',
        tone: 'warning',
      };
    case 'retail-price-unchanged':
      return { message: 'Retail price is already selected.', tone: 'neutral' };
    case 'retail-price-updated':
      return { message: 'Retail price updated.', tone: 'neutral' };
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
