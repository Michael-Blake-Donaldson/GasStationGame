import type { SimulationState } from './types';

export const SEEDED_RANDOM_ALGORITHM = 'xoshiro128ss' as const;
export const SEEDED_RANDOM_VERSION = 1 as const;

const UINT32_MAX = 0xffff_ffff;
const UINT32_RANGE = 0x1_0000_0000;

export type RandomWords = readonly [number, number, number, number];

export interface SeededRandomState {
  readonly algorithm: typeof SEEDED_RANDOM_ALGORITHM;
  readonly drawCount: number;
  readonly version: typeof SEEDED_RANDOM_VERSION;
  readonly words: RandomWords;
}

export interface RandomDraw<Value> {
  readonly rng: SeededRandomState;
  readonly value: Value;
}

export interface SimulationRandomDraw<Value> {
  readonly state: SimulationState;
  readonly value: Value;
}

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

const isUint32 = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= UINT32_MAX;

export const assertSeededRandomState: (
  value: unknown,
) => asserts value is SeededRandomState = (value) => {
  if (!isRecord(value) || value.algorithm !== SEEDED_RANDOM_ALGORITHM) {
    throw new RangeError(`Random algorithm must be ${SEEDED_RANDOM_ALGORITHM}.`);
  }
  if (value.version !== SEEDED_RANDOM_VERSION) {
    throw new RangeError(`Random version must be ${String(SEEDED_RANDOM_VERSION)}.`);
  }
  if (
    typeof value.drawCount !== 'number' ||
    !Number.isSafeInteger(value.drawCount) ||
    value.drawCount < 0
  ) {
    throw new RangeError('Random draw count must be a non-negative safe integer.');
  }
  if (
    !Array.isArray(value.words) ||
    value.words.length !== 4 ||
    !value.words.every((word) => isUint32(word))
  ) {
    throw new RangeError('Random state must contain exactly four uint32 words.');
  }
  if (value.words.every((word) => word === 0)) {
    throw new RangeError('Random state cannot be all zero.');
  }
};

const rotateLeft = (value: number, shift: number): number =>
  ((value << shift) | (value >>> (32 - shift))) >>> 0;

const hashSeedWord = (seed: number, wordIndex: number): number => {
  let hash = (0x811c_9dc5 ^ Math.imul(wordIndex + 1, 0x9e37_79b9)) >>> 0;

  for (const character of `${String(seed)}:${String(wordIndex)}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x21f0_aaad) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x735a_2d97) >>> 0;
  return (hash ^ (hash >>> 15)) >>> 0;
};

export const createSeededRandomState = (seed: number): SeededRandomState => {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError('Random seed must be a non-negative safe integer.');
  }

  const generated: RandomWords = [
    hashSeedWord(seed, 0),
    hashSeedWord(seed, 1),
    hashSeedWord(seed, 2),
    hashSeedWord(seed, 3),
  ];
  const words: RandomWords = generated.every((word) => word === 0)
    ? [0, 0, 0, 1]
    : generated;

  return {
    algorithm: SEEDED_RANDOM_ALGORITHM,
    drawCount: 0,
    version: SEEDED_RANDOM_VERSION,
    words,
  };
};

export const drawRandomUint32 = (random: SeededRandomState): RandomDraw<number> => {
  assertSeededRandomState(random);
  if (random.drawCount >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Random draw count exceeded the safe integer range.');
  }

  let [first, second, third, fourth] = random.words;
  const value = Math.imul(rotateLeft(Math.imul(second, 5) >>> 0, 7), 9) >>> 0;
  const shifted = (second << 9) >>> 0;

  third = (third ^ first) >>> 0;
  fourth = (fourth ^ second) >>> 0;
  second = (second ^ third) >>> 0;
  first = (first ^ fourth) >>> 0;
  third = (third ^ shifted) >>> 0;
  fourth = rotateLeft(fourth, 11);

  return {
    rng: {
      algorithm: SEEDED_RANDOM_ALGORITHM,
      drawCount: random.drawCount + 1,
      version: SEEDED_RANDOM_VERSION,
      words: [first, second, third, fourth],
    },
    value,
  };
};

export const drawRandomInteger = (
  random: SeededRandomState,
  minimumInclusive: number,
  maximumExclusive: number,
): RandomDraw<number> => {
  if (
    !Number.isSafeInteger(minimumInclusive) ||
    !Number.isSafeInteger(maximumExclusive) ||
    minimumInclusive >= maximumExclusive
  ) {
    throw new RangeError('Random integer bounds must be ordered safe integers.');
  }

  const range = maximumExclusive - minimumInclusive;
  if (!Number.isSafeInteger(range) || range > UINT32_RANGE) {
    throw new RangeError('Random integer range cannot exceed the uint32 range.');
  }

  const acceptanceLimit = Math.floor(UINT32_RANGE / range) * range;
  let draw = drawRandomUint32(random);

  while (draw.value >= acceptanceLimit) {
    draw = drawRandomUint32(draw.rng);
  }

  return {
    rng: draw.rng,
    value: minimumInclusive + (draw.value % range),
  };
};

export const drawRandomIndex = (
  random: SeededRandomState,
  length: number,
): RandomDraw<number> => {
  if (!Number.isSafeInteger(length) || length < 1 || length > UINT32_RANGE) {
    throw new RangeError('Random index length must be between 1 and 2^32.');
  }
  return drawRandomInteger(random, 0, length);
};

export const chooseRandomValue = <Value>(
  random: SeededRandomState,
  values: readonly Value[],
): RandomDraw<Value> => {
  const index = drawRandomIndex(random, values.length);
  const value = values[index.value] as Value;
  return { rng: index.rng, value };
};

export const rollRandomRatio = (
  random: SeededRandomState,
  numerator: number,
  denominator: number,
): RandomDraw<boolean> => {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator < 1 ||
    denominator > UINT32_RANGE ||
    numerator < 0 ||
    numerator > denominator
  ) {
    throw new RangeError('Random ratio must satisfy 0 <= numerator <= denominator.');
  }
  const draw = drawRandomInteger(random, 0, denominator);
  return { rng: draw.rng, value: draw.value < numerator };
};

export const drawSimulationRandomInteger = (
  state: SimulationState,
  minimumInclusive: number,
  maximumExclusive: number,
): SimulationRandomDraw<number> => {
  const draw = drawRandomInteger(state.rng, minimumInclusive, maximumExclusive);
  return { state: { ...state, rng: draw.rng }, value: draw.value };
};
