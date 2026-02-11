import {
  flattenStrings,
  flattenAll,
  getByPath,
  setByPath,
  pathToDisplayString,
  pathsEqual,
  pathSetDiff,
} from '../../../.claude/skills/i18n-translate/scripts/lib/flatten-keys';
import type { KeyPath } from '../../../.claude/skills/i18n-translate/scripts/lib/types';

describe('flatten-keys', () => {
  describe('flattenStrings', () => {
    it('should flatten a simple object', () => {
      const result = flattenStrings({ a: 'hello', b: 'world' });
      expect(result).toEqual([
        { path: ['a'], dotPath: 'a', value: 'hello' },
        { path: ['b'], dotPath: 'b', value: 'world' },
      ]);
    });

    it('should flatten nested objects', () => {
      const result = flattenStrings({ a: { b: { c: 'deep' } } });
      expect(result).toEqual([
        { path: ['a', 'b', 'c'], dotPath: 'a.b.c', value: 'deep' },
      ]);
    });

    it('should skip non-string scalars (numbers, booleans)', () => {
      const result = flattenStrings({ count: 42, active: true, name: 'hello' });
      expect(result).toEqual([
        { path: ['name'], dotPath: 'name', value: 'hello' },
      ]);
    });

    it('should skip null and undefined values', () => {
      const result = flattenStrings({ a: null, b: undefined, c: 'ok' });
      expect(result).toEqual([
        { path: ['c'], dotPath: 'c', value: 'ok' },
      ]);
    });

    it('should handle keys containing dots', () => {
      const result = flattenStrings({ 'terms.of.service': 'ToS text' });
      expect(result).toEqual([
        { path: ['terms.of.service'], dotPath: '["terms.of.service"]', value: 'ToS text' },
      ]);
    });

    it('should handle arrays with string elements', () => {
      const result = flattenStrings({ items: ['first', 'second'] });
      expect(result).toEqual([
        { path: ['items', 0], dotPath: 'items[0]', value: 'first' },
        { path: ['items', 1], dotPath: 'items[1]', value: 'second' },
      ]);
    });

    it('should handle arrays with mixed types (only strings)', () => {
      const result = flattenStrings({ items: [42, 'hello', true] });
      expect(result).toEqual([
        { path: ['items', 1], dotPath: 'items[1]', value: 'hello' },
      ]);
    });

    it('should handle empty objects', () => {
      expect(flattenStrings({})).toEqual([]);
    });

    it('should handle null input', () => {
      expect(flattenStrings(null)).toEqual([]);
    });

    it('should handle nested objects inside arrays', () => {
      const result = flattenStrings({ items: [{ label: 'one' }, { label: 'two' }] });
      expect(result).toEqual([
        { path: ['items', 0, 'label'], dotPath: 'items[0].label', value: 'one' },
        { path: ['items', 1, 'label'], dotPath: 'items[1].label', value: 'two' },
      ]);
    });
  });

  describe('flattenAll', () => {
    it('should include all scalar types', () => {
      const result = flattenAll({ name: 'hi', count: 42, active: true });
      expect(result).toEqual([
        { path: ['name'], value: 'hi' },
        { path: ['count'], value: 42 },
        { path: ['active'], value: true },
      ]);
    });

    it('should include null values as leaves', () => {
      const result = flattenAll({ a: null, b: 'hello' });
      expect(result).toEqual([
        { path: ['a'], value: null },
        { path: ['b'], value: 'hello' },
      ]);
    });
  });

  describe('getByPath', () => {
    it('should get a value at a simple path', () => {
      expect(getByPath({ a: 'hello' }, ['a'])).toBe('hello');
    });

    it('should get a nested value', () => {
      expect(getByPath({ a: { b: { c: 'deep' } } }, ['a', 'b', 'c'])).toBe('deep');
    });

    it('should get an array element', () => {
      expect(getByPath({ items: ['a', 'b'] }, ['items', 1])).toBe('b');
    });

    it('should return undefined for non-existent path', () => {
      expect(getByPath({ a: 'hello' }, ['b'])).toBeUndefined();
    });

    it('should return undefined when traversing through a scalar', () => {
      expect(getByPath({ a: 'hello' }, ['a', 'b'])).toBeUndefined();
    });
  });

  describe('setByPath', () => {
    it('should set a value at a simple path', () => {
      const data: Record<string, unknown> = {};
      setByPath(data, ['a'], 'hello');
      expect(data).toEqual({ a: 'hello' });
    });

    it('should set a nested value, creating intermediates', () => {
      const data: Record<string, unknown> = {};
      setByPath(data, ['a', 'b', 'c'], 'deep');
      expect(data).toEqual({ a: { b: { c: 'deep' } } });
    });

    it('should create arrays for numeric path segments', () => {
      const data: Record<string, unknown> = {};
      setByPath(data, ['items', 0], 'first');
      expect(data).toEqual({ items: ['first'] });
    });

    it('should do nothing for empty path', () => {
      const data: Record<string, unknown> = { a: 1 };
      setByPath(data, [], 'hello');
      expect(data).toEqual({ a: 1 });
    });
  });

  describe('pathToDisplayString', () => {
    it('should display simple paths with dots', () => {
      expect(pathToDisplayString(['a', 'b', 'c'])).toBe('a.b.c');
    });

    it('should display array indices with brackets', () => {
      expect(pathToDisplayString(['items', 0])).toBe('items[0]');
    });

    it('should quote keys containing dots', () => {
      expect(pathToDisplayString(['terms.of.service'])).toBe('["terms.of.service"]');
    });

    it('should quote keys containing brackets', () => {
      expect(pathToDisplayString(['key[0]'])).toBe('["key[0]"]');
    });

    it('should handle mixed paths', () => {
      expect(pathToDisplayString(['foo', 'terms.of.service', 0, 'bar'])).toBe('foo["terms.of.service"][0].bar');
    });

    it('should return empty string for empty path', () => {
      expect(pathToDisplayString([])).toBe('');
    });
  });

  describe('pathsEqual', () => {
    it('should return true for identical paths', () => {
      expect(pathsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    });

    it('should return false for different paths', () => {
      expect(pathsEqual(['a', 'b'], ['a', 'c'])).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(pathsEqual(['a'], ['a', 'b'])).toBe(false);
    });

    it('should distinguish string and number segments', () => {
      expect(pathsEqual(['a', 0 as string | number], ['a', '0' as string | number])).toBe(false);
    });
  });

  describe('pathSetDiff', () => {
    it('should find paths in a but not in b', () => {
      const a: KeyPath[] = [['a'], ['b'], ['c']];
      const b: KeyPath[] = [['b']];
      expect(pathSetDiff(a, b)).toEqual([['a'], ['c']]);
    });

    it('should return empty when a is subset of b', () => {
      const a: KeyPath[] = [['a']];
      const b: KeyPath[] = [['a'], ['b']];
      expect(pathSetDiff(a, b)).toEqual([]);
    });

    it('should handle dots-in-keys correctly (not confused by dot-join)', () => {
      const a: KeyPath[] = [['a.b', 'c']];
      const b: KeyPath[] = [['a', 'b.c']];
      // These should NOT be considered equal
      expect(pathSetDiff(a, b)).toEqual([['a.b', 'c']]);
    });
  });
});
