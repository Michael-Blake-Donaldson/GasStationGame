import source from './great-plains.json';
import { regionSchema } from '../schema';

export const greatPlainsRegion = regionSchema.parse(source);
