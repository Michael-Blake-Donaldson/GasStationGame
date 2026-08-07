import { describe, expect, it } from 'vitest';
import { createInitialCampaignState } from '../campaign/campaignState';
import { createInitialState, greatPlainsSaveContext } from '../scenarios/greatPlains';
import { decodeGameSave, encodeGameSave } from '../persistence/saveCodec';
import { adoptLoadedRuntime } from './recoveredRuntime';

describe('recovered runtime adoption', () => {
  it('preserves authoritative state while resetting transient runtime state', () => {
    const serialized = encodeGameSave(
      {
        campaign: createInitialCampaignState('great-plains'),
        nextCommandSequence: 14,
        saveSequence: 3,
        simulation: createInitialState(),
      },
      greatPlainsSaveContext,
    );
    const loaded = decodeGameSave(serialized, greatPlainsSaveContext);
    if (!loaded.ok) throw new Error('Expected fixture to load.');

    expect(adoptLoadedRuntime(loaded)).toEqual({
      campaign: loaded.campaign,
      lastCommandReceipt: null,
      nextAutosaveEventSequence: loaded.simulation.nextEventSequence,
      nextCommandSequence: 14,
      runner: { accumulatedMicroseconds: 0 },
      simulation: loaded.simulation,
    });
  });
});
