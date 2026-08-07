import { z } from 'zod';

const technicalIdSchema = z.string().regex(/^[a-z0-9-]+$/u);

export const gridCoordinateSchema = z.object({
  x: z.number().int().nonnegative(),
  z: z.number().int().nonnegative(),
});

export const gridFootprintSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const gridRectangleSchema = z.object({
  origin: gridCoordinateSchema,
  footprint: gridFootprintSchema,
});

const quarterTurnSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const facilityPlotSchema = gridRectangleSchema.extend({
  id: technicalIdSchema,
  rotation: quarterTurnSchema,
  allowedFacilityIds: z.array(technicalIdSchema).min(1),
});

export const stationGridDefinitionSchema = z.object({
  id: technicalIdSchema,
  version: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cellSizeMeters: z.number().positive(),
  flexibleBuildAreas: z.array(gridRectangleSchema),
  authoredPlots: z.array(facilityPlotSchema),
  initialFixedOccupants: z.array(
    gridRectangleSchema.extend({
      id: technicalIdSchema,
      structureId: technicalIdSchema,
      rotation: quarterTurnSchema,
    }),
  ),
  initialAuthoredOccupants: z.array(
    z.object({
      id: technicalIdSchema,
      facilityId: technicalIdSchema,
      plotId: technicalIdSchema,
    }),
  ),
});

const workSubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('occupant'), occupantId: technicalIdSchema }),
  z.object({ kind: z.literal('authored-plot'), plotId: technicalIdSchema }),
]);

export const initialEmployeePositionSchema = z.object({
  employeeId: technicalIdSchema,
  position: gridCoordinateSchema,
});

export const workTargetDefinitionSchema = z.object({
  id: technicalIdSchema,
  interactionCells: z.array(gridCoordinateSchema).min(1),
  subject: workSubjectSchema,
});

export const jobDefinitionSchema = z.object({
  id: technicalIdSchema,
  targetId: technicalIdSchema,
  workDurationClockUnits: z.number().int().positive(),
});

export const regionSchema = z.object({
  id: technicalIdSchema,
  displayName: z.string().min(1),
  identity: z.array(z.string().min(1)).min(1),
  pressures: z.array(z.string().min(1)).min(1),
  initialEmployeePositions: z.array(initialEmployeePositionSchema).min(1),
  jobs: z.array(jobDefinitionSchema).min(1),
  startingThreats: z.array(z.string().min(1)).min(1),
  sliceNightCount: z.number().int().positive(),
  stationGrid: stationGridDefinitionSchema,
  workTargets: z.array(workTargetDefinitionSchema).min(1),
});

export type RegionDefinition = z.infer<typeof regionSchema>;
export type StationGridDefinition = z.infer<typeof stationGridDefinitionSchema>;
