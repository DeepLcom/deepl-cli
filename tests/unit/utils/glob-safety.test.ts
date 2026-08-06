/**
 * fast-glob expands brace groups through `braces`, which caps only its INPUT
 * length and places no bound at all on the expansion it produces. The product
 * of alternatives is therefore unbounded: 20 `{a,b}` groups fit in 107 bytes
 * and allocate ~600MB, and 22 groups abort the process with a V8 OOM that no
 * try/catch can contain. These tests pin the pre-flight bound that keeps such
 * a pattern away from fast-glob.
 */

import {
  MAX_GLOB_EXPANSION,
  MAX_GLOB_PATTERN_LENGTH,
  assertBoundedGlobExpansion,
  countGlobExpansion,
} from '../../../src/utils/glob-safety';
import { ConfigError } from '../../../src/utils/errors';

describe('countGlobExpansion', () => {
  it.each([
    ['a literal path', 'locales/en.json', 1],
    ['a wildcard', 'src/**/*.json', 1],
    ['a single brace group', 'locales/{en,de}.json', 2],
    ['a three-way group', '**/*.{json,yaml,yml}', 3],
    ['sibling groups multiplying', '{en,de}/**/*.{json,yaml}', 4],
    ['a nested group', '{a,{b,c}}/*.json', 3],
    ['an empty alternative', '{,foo}/*.json', 2],
  ])('should count %s as %i', (_label, pattern, expected) => {
    expect(countGlobExpansion(pattern)).toBe(expected);
  });

  it('should treat a comma-less brace group as literal', () => {
    expect(countGlobExpansion('locales/{en}.json')).toBe(1);
  });

  it('should count a numeric range by its cardinality', () => {
    expect(countGlobExpansion('page{1..9}/*.json')).toBe(9);
  });

  it('should count a stepped numeric range by its cardinality', () => {
    expect(countGlobExpansion('page{1..9..2}/*.json')).toBe(5);
  });

  it('should count an alpha range by its cardinality', () => {
    expect(countGlobExpansion('{a..e}/*.json')).toBe(5);
  });

  it('should ignore escaped braces', () => {
    expect(countGlobExpansion('lit\\{a,b\\}/*.json')).toBe(1);
  });

  it('should saturate rather than compute the full product', () => {
    expect(countGlobExpansion('{a,b}'.repeat(200))).toBeGreaterThan(
      MAX_GLOB_EXPANSION
    );
  });

  it('should over-approximate an unbalanced group rather than under-count it', () => {
    expect(countGlobExpansion('{a,b}'.repeat(200) + '{c,d')).toBeGreaterThan(
      MAX_GLOB_EXPANSION
    );
  });

  it('should not recurse on deeply nested groups', () => {
    let nested = 'a';
    for (let i = 0; i < 5000; i += 1) nested = `{${nested},b}`;
    expect(() => countGlobExpansion(nested)).not.toThrow(RangeError);
  });
});

describe('assertBoundedGlobExpansion', () => {
  it.each([
    ['a literal path', 'locales/en.json'],
    ['a recursive wildcard', 'src/**/*.json'],
    ['a realistic multi-extension glob', '{en,de,fr}/**/*.{json,yaml,yml}'],
    ['an extglob', 'src/@(foo|bar)/*.json'],
  ])('should accept %s', (_label, pattern) => {
    expect(() =>
      assertBoundedGlobExpansion(pattern, 'buckets.json.include')
    ).not.toThrow();
  });

  it('should reject the 1KB brace bomb from the red-team repro', () => {
    const bomb = '{a,b}'.repeat(200) + '/*.json';
    expect(() =>
      assertBoundedGlobExpansion(bomb, 'buckets.json.include')
    ).toThrow(ConfigError);
  });

  it('should reject a pattern only 107 bytes long', () => {
    const bomb = '{a,b}'.repeat(20) + '/*.json';
    expect(bomb.length).toBeLessThan(120);
    expect(() =>
      assertBoundedGlobExpansion(bomb, 'buckets.json.include')
    ).toThrow(ConfigError);
  });

  it('should name the field and the cap in the error', () => {
    expect(() =>
      assertBoundedGlobExpansion('{a,b}'.repeat(30), 'context.scan_paths')
    ).toThrow(new RegExp(`context\\.scan_paths.*${MAX_GLOB_EXPANSION}`, 's'));
  });

  it('should sanitize control characters in the reported pattern', () => {
    expect.assertions(2);
    try {
      assertBoundedGlobExpansion(`\x1b]0;x\x07${'{a,b}'.repeat(30)}`, 'ignore');
    } catch (err) {
      expect((err as ConfigError).message).not.toContain('\x1b');
      expect((err as ConfigError).message).not.toContain('\x07');
    }
  });

  it('should reject a pattern longer than the length cap before braces sees it', () => {
    const long = `${'a'.repeat(MAX_GLOB_PATTERN_LENGTH + 1)}/*.json`;
    expect(() => assertBoundedGlobExpansion(long, 'ignore')).toThrow(
      ConfigError
    );
  });

  it('should keep the length cap below the point where braces itself throws', () => {
    expect(MAX_GLOB_PATTERN_LENGTH).toBeLessThan(10000);
  });

  it('should keep the expansion cap at or below the braces range limit', () => {
    // `braces` throws a RangeError once a single range expands past 1000
    // entries. Keeping the cap at or below that makes the RangeError
    // unreachable, so a hostile range is a ConfigError, not a raw throw.
    expect(MAX_GLOB_EXPANSION).toBeLessThanOrEqual(1000);
  });

  it('should reject a range wider than the cap', () => {
    expect(() =>
      assertBoundedGlobExpansion('page{1..100000}/*.json', 'ignore')
    ).toThrow(ConfigError);
  });
});
