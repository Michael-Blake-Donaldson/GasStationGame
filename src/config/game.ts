const configuredTitle = import.meta.env.VITE_GAME_TITLE?.trim();

export const gameConfig = {
  playerFacingTitle:
    configuredTitle !== undefined && configuredTitle.length > 0
      ? configuredTitle
      : 'Last Stop',
  internalProjectName: 'Gas Station Game',
  verticalSliceRegionId: 'great-plains',
  verticalSliceNightCount: 3,
} as const;
