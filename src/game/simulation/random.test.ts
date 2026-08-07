import { describe, expect, it } from 'vitest';
import { createInitialState } from '../scenarios/greatPlains';
import {
  SEEDED_RANDOM_ALGORITHM,
  SEEDED_RANDOM_VERSION,
  assertSeededRandomState,
  chooseRandomValue,
  createSeededRandomState,
  drawRandomInteger,
  drawRandomIndex,
  drawRandomUint32,
  drawSimulationRandomInteger,
  rollRandomRatio,
  type SeededRandomState,
} from './random';
import { GREAT_PLAINS_SCENARIO_ID, GREAT_PLAINS_SCENARIO_VERSION } from './scenario';

describe('seeded simulation random generator', () => {
  it('locks the versioned seed expansion and uint32 sequence', () => {
    let random = createSeededRandomState(1987);
    const values: number[] = [];

    expect(random).toEqual({
      algorithm: 'xoshiro128ss',
      drawCount: 0,
      version: 1,
      words: [439_128_798, 4_031_992_304, 2_647_505_109, 814_116_628],
    });

    for (let index = 0; index < 6; index += 1) {
      const draw = drawRandomUint32(random);
      random = draw.rng;
      values.push(draw.value);
    }

    expect(values).toEqual([
      1_387_502_360, 803_574_019, 3_441_312_846, 1_835_747_347, 809_249_103,
      3_227_194_386,
    ]);
    expect(random).toEqual({
      algorithm: SEEDED_RANDOM_ALGORITHM,
      drawCount: 6,
      version: SEEDED_RANDOM_VERSION,
      words: [3_660_605_383, 1_457_817_847, 1_184_933_695, 1_349_528_333],
    });
  });

  it('matches the xoshiro128** transition independently of seed expansion', () => {
    const result = drawRandomUint32({
      algorithm: SEEDED_RANDOM_ALGORITHM,
      drawCount: 0,
      version: SEEDED_RANDOM_VERSION,
      words: [1, 2, 3, 4],
    });

    expect(result).toEqual({
      rng: {
        algorithm: SEEDED_RANDOM_ALGORITHM,
        drawCount: 1,
        version: SEEDED_RANDOM_VERSION,
        words: [7, 0, 1_026, 12_288],
      },
      value: 11_520,
    });
  });

  it.each([
    [0, [1_171_201_963, 2_435_796_908, 2_925_880_092, 117_301_396]],
    [1, [3_429_890_061, 12_105_346, 762_702_041, 3_806_938_505]],
    [0xffff_ffff, [2_454_493_276, 255_552_620, 1_771_063_556, 1_150_666_385]],
    [0x1_0000_0001, [1_285_164_056, 3_263_685_898, 2_252_580_138, 2_817_410_509]],
  ] as const)('pins the first outputs for seed %s', (seed, expected) => {
    let random = createSeededRandomState(seed);
    const values: number[] = [];
    expect(random.words.some((word) => word !== 0)).toBe(true);

    for (const expectedValue of expected) {
      const draw = drawRandomUint32(random);
      random = draw.rng;
      values.push(draw.value);
      expect(draw.value).toBe(expectedValue);
    }

    expect(values).toEqual(expected);
  });

  it('repeats the same thousand-output sequence for the same seed', () => {
    let first = createSeededRandomState(91_827_364_554);
    let second = createSeededRandomState(91_827_364_554);

    for (let index = 0; index < 1_000; index += 1) {
      const firstDraw = drawRandomUint32(first);
      const secondDraw = drawRandomUint32(second);
      expect(secondDraw).toEqual(firstDraw);
      expect(Number.isInteger(firstDraw.value)).toBe(true);
      expect(firstDraw.value).toBeGreaterThanOrEqual(0);
      expect(firstDraw.value).toBeLessThan(0x1_0000_0000);
      first = firstDraw.rng;
      second = secondDraw.rng;
    }
  });

  it('continues exactly after a JSON serialization boundary', () => {
    let uninterrupted = createSeededRandomState(Number.MAX_SAFE_INTEGER);
    for (let index = 0; index < 12; index += 1) {
      uninterrupted = drawRandomUint32(uninterrupted).rng;
    }

    const restored: unknown = JSON.parse(JSON.stringify(uninterrupted));
    assertSeededRandomState(restored);

    const expected = drawRandomUint32(uninterrupted);
    const resumed = drawRandomUint32(restored);
    expect(resumed).toEqual(expected);
  });

  it('uses rejection sampling for unbiased bounded integers', () => {
    let random = createSeededRandomState(1987);
    const values: number[] = [];

    for (let index = 0; index < 3; index += 1) {
      const draw = drawRandomInteger(random, 0, 2_147_483_649);
      random = draw.rng;
      values.push(draw.value);
    }

    expect(values).toEqual([1_387_502_360, 803_574_019, 1_835_747_347]);
    expect(random.drawCount).toBe(4);
  });

  it('maps the full uint32 range without narrowing through signed arithmetic', () => {
    const random = createSeededRandomState(1987);
    const raw = drawRandomUint32(random);
    const bounded = drawRandomInteger(random, -2_147_483_648, 2_147_483_648);

    expect(bounded.value).toBe(-2_147_483_648 + raw.value);
    expect(bounded.rng).toEqual(raw.rng);
  });

  it('maps a known raw output into an exact small integer span', () => {
    const result = drawRandomInteger(createSeededRandomState(1987), 10, 20);

    expect(result.value).toBe(10);
    expect(result.rng.drawCount).toBe(1);
  });

  it('keeps bounded draws reproducible and inside their requested interval', () => {
    let first = createSeededRandomState(42);
    let second = createSeededRandomState(42);

    for (let index = 0; index < 1_000; index += 1) {
      const firstDraw = drawRandomInteger(first, -7, 13);
      const secondDraw = drawRandomInteger(second, -7, 13);
      expect(firstDraw).toEqual(secondDraw);
      expect(firstDraw.value).toBeGreaterThanOrEqual(-7);
      expect(firstDraw.value).toBeLessThan(13);
      first = firstDraw.rng;
      second = secondDraw.rng;
    }
  });

  it('supports index, choice, and ratio draws with stable consumption', () => {
    const initial = createSeededRandomState(7);
    const index = drawRandomIndex(initial, 4);
    const choice = chooseRandomValue(index.rng, ['north', 'south'] as const);
    const impossible = rollRandomRatio(choice.rng, 0, 10);
    const certain = rollRandomRatio(impossible.rng, 10, 10);

    expect(index.value).toBeGreaterThanOrEqual(0);
    expect(index.value).toBeLessThan(4);
    expect(['north', 'south']).toContain(choice.value);
    expect(impossible.value).toBe(false);
    expect(certain.value).toBe(true);
    expect(certain.rng.drawCount).toBe(4);
  });

  it('consumes one raw draw for a one-item choice', () => {
    const initial = createSeededRandomState(7);
    const result = chooseRandomValue(initial, ['only'] as const);

    expect(result.value).toBe('only');
    expect(result.rng.drawCount).toBe(1);
  });

  it('produces divergent streams for representative different seeds', () => {
    const first = drawRandomUint32(createSeededRandomState(1987));
    const second = drawRandomUint32(createSeededRandomState(1988));

    expect(second).not.toEqual(first);
  });

  it('uses seed information above the low uint32 word', () => {
    expect(createSeededRandomState(1 + 0x1_0000_0000)).not.toEqual(
      createSeededRandomState(1),
    );
  });

  it('does not mutate the input RNG state', () => {
    const initial = createSeededRandomState(1987);
    const snapshot = structuredClone(initial);
    drawRandomUint32(initial);

    expect(initial).toEqual(snapshot);
  });

  it('updates only authoritative RNG state when a simulation consumes a draw', () => {
    const initial = createInitialState();
    const draw = drawSimulationRandomInteger(initial, 3, 8);

    expect(draw.value).toBeGreaterThanOrEqual(3);
    expect(draw.value).toBeLessThan(8);
    expect(draw.state).toEqual({ ...initial, rng: draw.state.rng });
    expect(draw.state.rng.drawCount).toBe(1);
    expect(initial.rng.drawCount).toBe(0);
  });

  it('makes the initial ledger self-describing without consuming a draw', () => {
    const initial = createInitialState(1987);

    expect(initial.eventLedger[0]).toMatchObject({
      rngAlgorithm: SEEDED_RANDOM_ALGORITHM,
      rngVersion: SEEDED_RANDOM_VERSION,
      scenarioId: GREAT_PLAINS_SCENARIO_ID,
      scenarioVersion: GREAT_PLAINS_SCENARIO_VERSION,
      seed: 1987,
      type: 'simulation.started',
    });
    expect(initial.rng.drawCount).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5])(
    'rejects invalid seed %s',
    (seed) => {
      expect(() => createSeededRandomState(seed)).toThrow(RangeError);
    },
  );

  it.each([
    [0, 0],
    [2, 1],
    [0.5, 2],
    [0, Number.MAX_SAFE_INTEGER],
  ] as const)('rejects unsupported integer bounds [%s, %s)', (minimum, maximum) => {
    const random = createSeededRandomState(1);
    expect(() => drawRandomInteger(random, minimum, maximum)).toThrow(RangeError);
    expect(random.drawCount).toBe(0);
  });

  it.each([0, -1, 0.5, 0x1_0000_0001])(
    'rejects invalid random index length %s before drawing',
    (length) => {
      const random = createSeededRandomState(1);
      expect(() => drawRandomIndex(random, length)).toThrow(RangeError);
      expect(random.drawCount).toBe(0);
    },
  );

  it('rejects an empty choice before drawing', () => {
    const random = createSeededRandomState(1);
    expect(() => chooseRandomValue(random, [])).toThrow(RangeError);
    expect(random.drawCount).toBe(0);
  });

  it.each([
    [-1, 1],
    [2, 1],
    [0, 0],
    [0.5, 1],
    [1, 0x1_0000_0001],
  ] as const)('rejects invalid random ratio %s/%s before drawing', (part, total) => {
    const random = createSeededRandomState(1);
    expect(() => rollRandomRatio(random, part, total)).toThrow(RangeError);
    expect(random.drawCount).toBe(0);
  });

  it.each([
    null,
    {},
    { algorithm: 'unknown', drawCount: 0, version: 1, words: [1, 2, 3, 4] },
    {
      algorithm: SEEDED_RANDOM_ALGORITHM,
      drawCount: 0,
      version: 2,
      words: [1, 2, 3, 4],
    },
    {
      algorithm: SEEDED_RANDOM_ALGORITHM,
      drawCount: -1,
      version: 1,
      words: [1, 2, 3, 4],
    },
    {
      algorithm: SEEDED_RANDOM_ALGORITHM,
      drawCount: 0,
      version: 1,
      words: [1, 2, 3],
    },
    {
      algorithm: SEEDED_RANDOM_ALGORITHM,
      drawCount: 0,
      version: 1,
      words: [0, 0, 0, 0],
    },
    {
      algorithm: SEEDED_RANDOM_ALGORITHM,
      drawCount: 0,
      version: 1,
      words: [1, 2, 3, 0x1_0000_0000],
    },
  ])('rejects malformed persisted random state %#', (value) => {
    expect(() => assertSeededRandomState(value)).toThrow(RangeError);
  });

  it('fails before advancing an exhausted draw counter', () => {
    const exhausted: SeededRandomState = {
      ...createSeededRandomState(1),
      drawCount: Number.MAX_SAFE_INTEGER,
    };

    expect(() => drawRandomUint32(exhausted)).toThrow('safe integer');
    expect(exhausted.drawCount).toBe(Number.MAX_SAFE_INTEGER);
  });
});
