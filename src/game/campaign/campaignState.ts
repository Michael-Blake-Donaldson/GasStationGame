export const CAMPAIGN_STATE_VERSION = 1 as const;

export interface CampaignStateV1 {
  readonly activeRegionId: string;
  readonly campaignId: string;
  readonly completedRegionIds: readonly string[];
  readonly schemaVersion: typeof CAMPAIGN_STATE_VERSION;
}

const TECHNICAL_ID = /^[a-z0-9-]+$/u;

const assertTechnicalId = (value: string, name: string): void => {
  if (!TECHNICAL_ID.test(value)) throw new TypeError(`${name} must be a technical ID.`);
};

const compareIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const createInitialCampaignState = (
  activeRegionId: string,
  campaignId = 'primary-campaign',
): CampaignStateV1 => {
  assertTechnicalId(activeRegionId, 'activeRegionId');
  assertTechnicalId(campaignId, 'campaignId');
  return {
    activeRegionId,
    campaignId,
    completedRegionIds: [],
    schemaVersion: CAMPAIGN_STATE_VERSION,
  };
};

export const canonicalizeCampaignState = (state: CampaignStateV1): CampaignStateV1 => ({
  activeRegionId: state.activeRegionId,
  campaignId: state.campaignId,
  completedRegionIds: [...new Set(state.completedRegionIds)].sort(compareIds),
  schemaVersion: CAMPAIGN_STATE_VERSION,
});

export const assertCampaignState = (
  state: CampaignStateV1,
  knownRegionIds: readonly string[],
): void => {
  assertTechnicalId(state.campaignId, 'campaign.campaignId');
  assertTechnicalId(state.activeRegionId, 'campaign.activeRegionId');
  const known = new Set(knownRegionIds);
  if (!known.has(state.activeRegionId)) {
    throw new RangeError('Campaign active region is unknown.');
  }
  const canonical = canonicalizeCampaignState(state).completedRegionIds;
  if (
    canonical.length !== state.completedRegionIds.length ||
    canonical.some((id, index) => id !== state.completedRegionIds[index])
  ) {
    throw new RangeError('Campaign completed region IDs must be unique and sorted.');
  }
  for (const id of state.completedRegionIds) {
    assertTechnicalId(id, 'campaign.completedRegionIds');
    if (!known.has(id)) throw new RangeError(`Campaign region ${id} is unknown.`);
  }
};
