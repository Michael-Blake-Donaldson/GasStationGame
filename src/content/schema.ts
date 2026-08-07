import { z } from 'zod';

export const regionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  displayName: z.string().min(1),
  identity: z.array(z.string().min(1)).min(1),
  pressures: z.array(z.string().min(1)).min(1),
  startingThreats: z.array(z.string().min(1)).min(1),
  sliceNightCount: z.number().int().positive(),
});

export type RegionDefinition = z.infer<typeof regionSchema>;
