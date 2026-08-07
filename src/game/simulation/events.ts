import { wholeMinuteForClockUnit } from './clock';
import type { DomainEvent, DomainEventBase, SimulationState } from './types';

type DomainEventDraft = DomainEvent extends infer Event
  ? Event extends DomainEvent
    ? Omit<Event, keyof DomainEventBase>
    : never
  : never;

export const appendDomainEvent = (
  state: SimulationState,
  draft: DomainEventDraft,
): SimulationState => {
  if (
    !Number.isSafeInteger(state.nextEventSequence) ||
    state.nextEventSequence < 0 ||
    state.nextEventSequence >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError('nextEventSequence exceeded the safe integer range.');
  }

  const event: DomainEvent = {
    ...draft,
    absoluteClockUnit: state.absoluteClockUnit,
    minute: wholeMinuteForClockUnit(state.absoluteClockUnit),
    sequence: state.nextEventSequence,
    tick: state.tick,
  };

  return {
    ...state,
    eventLedger: [...state.eventLedger, event],
    nextEventSequence: state.nextEventSequence + 1,
  };
};
