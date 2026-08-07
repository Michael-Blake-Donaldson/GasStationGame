import source from './great-plains.json';
import { assertStationGridDefinition } from '../../game/simulation/grid';
import { regionSchema } from '../schema';

export const greatPlainsRegion = regionSchema.parse(source);

assertStationGridDefinition(greatPlainsRegion.stationGrid);
