import { describe, expect, it } from 'vitest';
import { advanceSimulationByClockUnits } from '../simulation/advanceSimulation';
import { CLOCK_UNITS_PER_MINUTE } from '../simulation/clock';
import {
  createInitialState,
  dispatchSimulationCommand,
  greatPlainsSimulationContext,
} from '../scenarios/greatPlains';
import {
  presentCommandReceipt,
  presentDomainEvent,
  selectRecentDomainEvents,
} from './domainEventPresentation';

describe('domain event presentation', () => {
  it('projects the bounded recent view without truncating authoritative history', () => {
    const state = advanceSimulationByClockUnits(
      createInitialState(),
      12 * 60 * CLOCK_UNITS_PER_MINUTE,
      greatPlainsSimulationContext,
    );
    const ledgerLength = state.eventLedger.length;
    const recent = selectRecentDomainEvents(state.eventLedger, 8);

    expect(ledgerLength).toBeGreaterThan(8);
    expect(recent).toEqual(state.eventLedger.slice(-8));
    expect(state.eventLedger).toHaveLength(ledgerLength);
  });

  it('keeps player-facing copy outside authoritative events', () => {
    const event = createInitialState().eventLedger[0];
    if (event === undefined) throw new Error('Initial event is missing.');

    expect(event).not.toHaveProperty('message');
    expect(presentDomainEvent(event)).toEqual({
      message: 'Morning shift opened. The Beacon is stable.',
      tone: 'positive',
    });
  });

  it('presents deterministic rejection reasons', () => {
    expect(
      presentCommandReceipt({
        atTick: 0,
        changed: false,
        commandId: 'bad',
        commandSequence: 0,
        emittedEventSequences: [],
        reason: 'invalid-command-payload',
        status: 'rejected',
      }),
    ).toEqual({ message: 'Command rejected: invalid payload.', tone: 'warning' });
  });

  it('presents job lifecycle facts without storing player-facing copy', () => {
    const initial = createInitialState();
    const assigned = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: {
        employeeId: 'employee-ada',
        jobId: 'open-checkout',
        type: 'job.assign',
      },
      id: 'assign-ada',
      sequence: 0,
    });
    const event = assigned.state.eventLedger.at(-1);
    if (event === undefined) throw new Error('Assignment event is missing.');

    expect(event).not.toHaveProperty('message');
    expect(presentDomainEvent(event)).toEqual({
      message: 'Crew assignment accepted.',
      tone: 'neutral',
    });
    expect(presentCommandReceipt(assigned.receipt)).toEqual({
      message: 'Crew assignment accepted.',
      tone: 'neutral',
    });
  });

  it.each([-1, 0.5, Number.POSITIVE_INFINITY])(
    'rejects invalid projection limit %s',
    (limit) => {
      expect(() => selectRecentDomainEvents([], limit)).toThrow(RangeError);
    },
  );
});
