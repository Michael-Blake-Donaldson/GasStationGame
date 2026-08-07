import { describe, expect, it } from 'vitest';
import { greatPlainsRegion } from './regions/greatPlains';
import { regionSchema } from './schema';

describe('region content schema', () => {
  it('accepts the Great Plains slice definition', () => {
    expect(greatPlainsRegion.id).toBe('great-plains');
    expect(greatPlainsRegion.sliceNightCount).toBe(3);
  });

  it('rejects invalid technical identifiers', () => {
    expect(() =>
      regionSchema.parse({ ...greatPlainsRegion, id: 'Last Stop' }),
    ).toThrow();
  });
});
