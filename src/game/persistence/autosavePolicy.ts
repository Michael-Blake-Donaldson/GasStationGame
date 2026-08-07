import type { SimulationState } from '../simulation/types';

export type AutosaveTrigger =
  | {
      readonly eventSequence: number;
      readonly reason: 'dusk' | 'morning';
      readonly type: 'phase-boundary';
    }
  | {
      readonly choiceId: string;
      readonly commandSequence: number;
      readonly type: 'major-choice';
    };

export interface PhaseAutosavePlan {
  /** Adopt this cursor after the plan has either been saved or intentionally skipped. */
  readonly nextEventSequenceToInspect: number;
  readonly trigger: Extract<
    AutosaveTrigger,
    { readonly type: 'phase-boundary' }
  > | null;
}

const assertNonNegativeSafeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

export const planPhaseAutosave = (
  simulation: SimulationState,
  nextEventSequenceToInspect: number,
): PhaseAutosavePlan => {
  assertNonNegativeSafeInteger(
    nextEventSequenceToInspect,
    'nextEventSequenceToInspect',
  );
  if (nextEventSequenceToInspect > simulation.nextEventSequence) {
    throw new RangeError('Autosave event cursor is ahead of the simulation ledger.');
  }

  const trigger = simulation.eventLedger
    .filter(
      (event) =>
        event.sequence >= nextEventSequenceToInspect &&
        event.type === 'phase.entered' &&
        (event.currentPhase === 'dusk' || event.currentPhase === 'morning'),
    )
    .at(-1);

  return {
    nextEventSequenceToInspect: simulation.nextEventSequence,
    trigger:
      trigger?.type === 'phase.entered' &&
      (trigger.currentPhase === 'dusk' || trigger.currentPhase === 'morning')
        ? {
            eventSequence: trigger.sequence,
            reason: trigger.currentPhase,
            type: 'phase-boundary',
          }
        : null,
  };
};

const TECHNICAL_ID = /^[a-z0-9-]+$/u;

/** Explicit seam for future decision commands; it performs no storage access. */
export const createMajorChoiceAutosaveTrigger = (
  choiceId: string,
  commandSequence: number,
): Extract<AutosaveTrigger, { readonly type: 'major-choice' }> => {
  if (!TECHNICAL_ID.test(choiceId)) {
    throw new TypeError('choiceId must be a technical ID.');
  }
  assertNonNegativeSafeInteger(commandSequence, 'commandSequence');
  return { choiceId, commandSequence, type: 'major-choice' };
};
