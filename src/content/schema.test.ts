import { describe, expect, it } from 'vitest';
import { greatPlainsRegion } from './regions/greatPlains';
import { assertStationGridDefinition } from '../game/simulation/grid';
import { regionSchema } from './schema';

describe('region content schema', () => {
  it('accepts the Great Plains slice definition', () => {
    expect(greatPlainsRegion.id).toBe('great-plains');
    expect(greatPlainsRegion.sliceNightCount).toBe(3);
    expect(greatPlainsRegion.stationGrid).toMatchObject({
      height: 24,
      id: 'great-plains-station-grid',
      version: 1,
      width: 32,
    });
    expect(greatPlainsRegion.initialEmployeePositions).toHaveLength(4);
    expect(greatPlainsRegion.workTargets).toHaveLength(4);
    expect(greatPlainsRegion.jobs).toHaveLength(6);
    expect(() =>
      assertStationGridDefinition(greatPlainsRegion.stationGrid),
    ).not.toThrow();
  });

  it('rejects invalid technical identifiers', () => {
    expect(() =>
      regionSchema.parse({ ...greatPlainsRegion, id: 'Last Stop' }),
    ).toThrow();
    expect(() =>
      regionSchema.parse({
        ...greatPlainsRegion,
        jobs: [{ ...greatPlainsRegion.jobs[0], id: 'Open Checkout' }],
      }),
    ).toThrow();
  });

  it('rejects malformed employee performance content', () => {
    const employee = greatPlainsRegion.initialEmployeePositions[0];
    expect(employee).toBeDefined();
    if (employee === undefined) return;
    expect(() =>
      regionSchema.parse({
        ...greatPlainsRegion,
        initialEmployeePositions: [
          { ...employee, fatigue: 101 },
          ...greatPlainsRegion.initialEmployeePositions.slice(1),
        ],
      }),
    ).toThrow();
    expect(() =>
      regionSchema.parse({
        ...greatPlainsRegion,
        initialEmployeePositions: [
          { ...employee, skills: [...employee.skills].reverse() },
          ...greatPlainsRegion.initialEmployeePositions.slice(1),
        ],
      }),
    ).toThrow(/unique ascending IDs/u);
    expect(() =>
      regionSchema.parse({
        ...greatPlainsRegion,
        business: {
          ...greatPlainsRegion.business,
          performanceRules: {
            ...greatPlainsRegion.business.performanceRules,
            maximumErrorChancePermille: 1001,
          },
        },
      }),
    ).toThrow();
  });
});
