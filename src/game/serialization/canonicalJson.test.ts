import { describe, expect, it } from 'vitest';
import {
  canonicalizeJson,
  fnv1a32,
  hashCanonicalJson,
  stringifyCanonicalJson,
} from './canonicalJson';

describe('canonical JSON', () => {
  it('sorts object keys recursively while preserving array order', () => {
    const value = { z: [{ b: 2, a: 1 }], a: true };

    expect(stringifyCanonicalJson(value)).toBe('{"a":true,"z":[{"a":1,"b":2}]}');
    expect(canonicalizeJson(value)).not.toBe(value);
  });

  it('provides a stable UTF-8 FNV-1a checksum', () => {
    expect(fnv1a32('hello')).toBe('4f9f2cab');
    expect(hashCanonicalJson({ b: 2, a: 1 })).toBe(hashCanonicalJson({ a: 1, b: 2 }));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, undefined, () => undefined])(
    'rejects non-JSON value %s',
    (value) => {
      expect(() => canonicalizeJson(value)).toThrow(/Cannot serialize/u);
    },
  );
});
