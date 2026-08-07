export type JsonValue =
  | boolean
  | null
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export const canonicalizeJson = (value: unknown): JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RangeError('Cannot serialize non-finite numbers.');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
    );
    return Object.fromEntries(
      entries.map(([key, item]) => [key, canonicalizeJson(item)]),
    );
  }
  throw new RangeError(`Cannot serialize value of type ${typeof value}.`);
};

export const stringifyCanonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalizeJson(value));

export const fnv1a32 = (value: string): string => {
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const hashCanonicalJson = (value: unknown): string =>
  fnv1a32(stringifyCanonicalJson(value));
