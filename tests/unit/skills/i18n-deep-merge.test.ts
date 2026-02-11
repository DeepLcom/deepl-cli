import { deepMerge } from '../../../.claude/skills/i18n-translate/scripts/deep-merge';

describe('deepMerge', () => {
  it('should add new keys from patch', () => {
    const base = { greeting: 'Hello' };
    const patch = { greeting: 'Hello', farewell: 'Goodbye' };

    const result = deepMerge(base, patch);
    expect(result.merged).toEqual({ greeting: 'Hello', farewell: 'Goodbye' });
    expect(result.added).toEqual([['farewell']]);
    expect(result.updated).toEqual([]);
    expect(result.unchanged).toEqual([['greeting']]);
  });

  it('should update existing values that differ', () => {
    const base = { greeting: 'Hello' };
    const patch = { greeting: 'Hi there' };

    const result = deepMerge(base, patch);
    expect(result.merged).toEqual({ greeting: 'Hi there' });
    expect(result.updated).toEqual([['greeting']]);
    expect(result.added).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it('should preserve unchanged values', () => {
    const base = { a: 'one', b: 'two' };
    const patch = { a: 'one', b: 'two' };

    const result = deepMerge(base, patch);
    expect(result.merged).toEqual({ a: 'one', b: 'two' });
    expect(result.unchanged).toEqual([['a'], ['b']]);
    expect(result.added).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it('should handle deep nested merge', () => {
    const base = {
      nav: { home: 'Home', about: 'About' },
      footer: { copyright: '2024' },
    };
    const patch = {
      nav: { home: 'Home', about: 'About Us', contact: 'Contact' },
    };

    const result = deepMerge(base, patch);
    expect(result.merged).toEqual({
      nav: { home: 'Home', about: 'About Us', contact: 'Contact' },
      footer: { copyright: '2024' },
    });
    expect(result.added).toEqual([['nav', 'contact']]);
    expect(result.updated).toEqual([['nav', 'about']]);
    expect(result.unchanged).toEqual([['nav', 'home']]);
  });

  it('should preserve base keys not in patch', () => {
    const base = { a: 'one', b: 'two', c: 'three' };
    const patch = { b: 'TWO' };

    const result = deepMerge(base, patch);
    expect(result.merged).toEqual({ a: 'one', b: 'TWO', c: 'three' });
    expect(result.merged).toHaveProperty('a', 'one');
    expect(result.merged).toHaveProperty('c', 'three');
  });

  it('should preserve key ordering (base order, new keys at end)', () => {
    const base = { z: 'last', a: 'first', m: 'middle' };
    const patch = { a: 'first', newKey: 'added' };

    const result = deepMerge(base, patch);
    const keys = Object.keys(result.merged);
    expect(keys).toEqual(['z', 'a', 'm', 'newKey']);
  });

  it('should report correct added/updated/unchanged lists', () => {
    const base = { keep: 'same', change: 'old' };
    const patch = { keep: 'same', change: 'new', add: 'fresh' };

    const result = deepMerge(base, patch);
    expect(result.added).toEqual([['add']]);
    expect(result.updated).toEqual([['change']]);
    expect(result.unchanged).toEqual([['keep']]);
  });

  it('should handle array elements', () => {
    const base = { items: ['one', 'two'] };
    const patch = { items: ['ONE', 'two', 'three'] };

    const result = deepMerge(base, patch);
    expect(result.merged).toEqual({ items: ['ONE', 'two', 'three'] });
    expect(result.updated).toEqual([['items', 0]]);
    expect(result.unchanged).toEqual([['items', 1]]);
    expect(result.added).toEqual([['items', 2]]);
  });

  it('should handle empty patch (no changes)', () => {
    const base = { a: 'one', b: 'two' };
    const patch = {};

    const result = deepMerge(base, patch);
    expect(result.merged).toEqual({ a: 'one', b: 'two' });
    expect(result.added).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it('should handle empty base (all added)', () => {
    const base = {};
    const patch = { a: 'one', b: 'two' };

    const result = deepMerge(base, patch);
    expect(result.merged).toEqual({ a: 'one', b: 'two' });
    expect(result.added).toEqual([['a'], ['b']]);
    expect(result.updated).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it('should not mutate the original base object', () => {
    const base = { nested: { key: 'original' } };
    const patch = { nested: { key: 'changed' } };

    deepMerge(base, patch);
    expect(base).toEqual({ nested: { key: 'original' } });
  });

  it('should round-trip with JSON serialization', () => {
    const base = { greeting: 'Hello', nested: { a: '1' } };
    const patch = { greeting: 'Hi', nested: { a: '1', b: '2' } };

    const result = deepMerge(base, patch);
    const serialized = JSON.stringify(result.merged);
    const deserialized = JSON.parse(serialized);
    expect(deserialized).toEqual(result.merged);
  });
});
