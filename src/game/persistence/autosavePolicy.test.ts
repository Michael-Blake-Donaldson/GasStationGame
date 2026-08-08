import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  greatPlainsSimulationContext,
} from '../scenarios/greatPlains';
import { advanceSimulationByClockUnits } from '../simulation/advanceSimulation';
import { createMajorChoiceAutosaveTrigger, planPhaseAutosave } from './autosavePolicy';

describe('autosave policy', () => {
  it('requests saves at dusk and morning, but not ordinary phase boundaries', () => {
    const initial = createInitialState();
    const dusk = advanceSimulationByClockUnits(
      initial,
      10 * 60 * 40,
      greatPlainsSimulationContext,
    );
    expect(planPhaseAutosave(dusk, initial.nextEventSequence)).toMatchObject({
      nextEventSequenceToInspect: dusk.nextEventSequence,
      trigger: { reason: 'dusk', type: 'phase-boundary' },
    });

    const night = advanceSimulationByClockUnits(
      dusk,
      2 * 60 * 40,
      greatPlainsSimulationContext,
    );
    expect(planPhaseAutosave(night, dusk.nextEventSequence).trigger).toBeNull();

    const morning = advanceSimulationByClockUnits(
      night,
      10 * 60 * 40,
      greatPlainsSimulationContext,
    );
    expect(planPhaseAutosave(morning, night.nextEventSequence)).toMatchObject({
      trigger: { reason: 'morning', type: 'phase-boundary' },
    });
  });

  it('coalesces multiple unseen save boundaries to the latest current-state save', () => {
    const initial = createInitialState();
    const nextMorning = advanceSimulationByClockUnits(
      initial,
      22 * 60 * 40,
      greatPlainsSimulationContext,
    );

    expect(planPhaseAutosave(nextMorning, initial.nextEventSequence)).toMatchObject({
      trigger: { reason: 'morning', type: 'phase-boundary' },
    });
  });

  it('starts a loaded runtime after existing ledger history', () => {
    const loaded = advanceSimulationByClockUnits(
      createInitialState(),
      22 * 60 * 40,
      greatPlainsSimulationContext,
    );

    expect(planPhaseAutosave(loaded, loaded.nextEventSequence).trigger).toBeNull();
  });

  it('provides a validated seam for future major-choice commands', () => {
    expect(createMajorChoiceAutosaveTrigger('traveler-offer-accepted', 9)).toEqual({
      choiceId: 'traveler-offer-accepted',
      commandSequence: 9,
      type: 'major-choice',
    });
    expect(() => createMajorChoiceAutosaveTrigger('Player Title', 9)).toThrow(
      TypeError,
    );
  });
});
