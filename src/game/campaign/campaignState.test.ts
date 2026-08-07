import { describe, expect, it } from 'vitest';
import {
  assertCampaignState,
  canonicalizeCampaignState,
  createInitialCampaignState,
} from './campaignState';

describe('campaign state', () => {
  it('creates a generic Great Plains campaign boundary', () => {
    expect(createInitialCampaignState('great-plains')).toEqual({
      activeRegionId: 'great-plains',
      campaignId: 'primary-campaign',
      completedRegionIds: [],
      schemaVersion: 1,
    });
  });

  it('canonicalizes set-like completed region IDs without mutating input', () => {
    const source = {
      ...createInitialCampaignState('great-plains'),
      completedRegionIds: ['great-plains', 'great-plains'],
    };
    const canonical = canonicalizeCampaignState(source);

    expect(canonical.completedRegionIds).toEqual(['great-plains']);
    expect(source.completedRegionIds).toHaveLength(2);
  });

  it('rejects invalid, unknown, duplicate, and unsorted campaign identities', () => {
    const initial = createInitialCampaignState('great-plains');
    expect(() => assertCampaignState(initial, ['great-plains'])).not.toThrow();
    expect(() =>
      assertCampaignState({ ...initial, activeRegionId: 'unknown' }, ['great-plains']),
    ).toThrow(/active region/u);
    expect(() =>
      assertCampaignState(
        { ...initial, completedRegionIds: ['great-plains', 'great-plains'] },
        ['great-plains'],
      ),
    ).toThrow(/unique and sorted/u);
    expect(() =>
      assertCampaignState({ ...initial, campaignId: 'Visible Title' }, [
        'great-plains',
      ]),
    ).toThrow(/technical ID/u);
  });
});
