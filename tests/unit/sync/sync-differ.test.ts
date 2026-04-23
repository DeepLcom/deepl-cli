import { computeDiff } from '../../../src/sync/sync-differ';
import { computeSourceHash } from '../../../src/sync/sync-lock';
import type { SyncLockEntry } from '../../../src/sync/types';
import type { ExtractedEntry } from '../../../src/formats/format';

function makeLockEntry(value: string, translations: Record<string, string> = {}): SyncLockEntry {
  const translationEntries: SyncLockEntry['translations'] = {};
  for (const [locale, hash] of Object.entries(translations)) {
    translationEntries[locale] = {
      hash,
      translated_at: '2026-01-01T00:00:00.000Z', status: 'translated',
    };
  }
  return {
    source_hash: computeSourceHash(value),
    source_text: 'test',
    translations: translationEntries,
  };
}

describe('computeDiff()', () => {
  it('should return empty array when both inputs are empty', () => {
    const result = computeDiff({}, []);
    expect(result).toEqual([]);
  });

  it('should mark all entries as "new" when lock is empty', () => {
    const current: ExtractedEntry[] = [
      { key: 'greeting', value: 'Hello' },
      { key: 'farewell', value: 'Goodbye' },
    ];
    const result = computeDiff({}, current);
    expect(result.every((d) => d.status === 'new')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('should mark entries as "current" when hashes match', () => {
    const lock: Record<string, SyncLockEntry> = {
      greeting: makeLockEntry('Hello'),
    };
    const current: ExtractedEntry[] = [{ key: 'greeting', value: 'Hello' }];
    const result = computeDiff(lock, current);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('current');
  });

  it('should mark entries as "stale" when source hash differs', () => {
    const lock: Record<string, SyncLockEntry> = {
      greeting: makeLockEntry('Hello'),
    };
    const current: ExtractedEntry[] = [{ key: 'greeting', value: 'Hello World' }];
    const result = computeDiff(lock, current);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('stale');
  });

  it('should mark entries as "deleted" when in lock but not in current', () => {
    const lock: Record<string, SyncLockEntry> = {
      old_key: makeLockEntry('old_value'),
    };
    const result = computeDiff(lock, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('deleted');
  });

  it('should handle mixed statuses (new + stale + current + deleted)', () => {
    const lock: Record<string, SyncLockEntry> = {
      current_key: makeLockEntry('same'),
      stale_key: makeLockEntry('old'),
      deleted_key: makeLockEntry('gone'),
    };
    const current: ExtractedEntry[] = [
      { key: 'current_key', value: 'same' },
      { key: 'stale_key', value: 'changed' },
      { key: 'new_key', value: 'brand new' },
    ];
    const result = computeDiff(lock, current);
    const statuses = new Map(result.map((d) => [d.key, d.status]));
    expect(statuses.get('current_key')).toBe('current');
    expect(statuses.get('stale_key')).toBe('stale');
    expect(statuses.get('new_key')).toBe('new');
    expect(statuses.get('deleted_key')).toBe('deleted');
    expect(result).toHaveLength(4);
  });

  it('should include previous_hash for stale entries', () => {
    const lock: Record<string, SyncLockEntry> = {
      greeting: makeLockEntry('Hello'),
    };
    const current: ExtractedEntry[] = [{ key: 'greeting', value: 'Hi there' }];
    const result = computeDiff(lock, current);
    expect(result[0]!.previous_hash).toBe(computeSourceHash('Hello'));
  });

  it('should include previous_hash for deleted entries', () => {
    const lock: Record<string, SyncLockEntry> = {
      old_key: makeLockEntry('old_value'),
    };
    const result = computeDiff(lock, []);
    expect(result[0]!.previous_hash).toBe(computeSourceHash('old_value'));
  });

  it('should include value for new entries', () => {
    const current: ExtractedEntry[] = [{ key: 'greeting', value: 'Hello' }];
    const result = computeDiff({}, current);
    expect(result[0]!.value).toBe('Hello');
  });

  it('should include value for stale entries', () => {
    const lock: Record<string, SyncLockEntry> = {
      greeting: makeLockEntry('Hello'),
    };
    const current: ExtractedEntry[] = [{ key: 'greeting', value: 'Hi there' }];
    const result = computeDiff(lock, current);
    expect(result[0]!.value).toBe('Hi there');
  });

  it('should not include value for deleted entries', () => {
    const lock: Record<string, SyncLockEntry> = {
      old_key: makeLockEntry('old_value'),
    };
    const result = computeDiff(lock, []);
    expect(result[0]!.value).toBeUndefined();
  });

  it('should sort output by key', () => {
    const current: ExtractedEntry[] = [
      { key: 'zebra', value: 'z' },
      { key: 'alpha', value: 'a' },
      { key: 'middle', value: 'm' },
    ];
    const result = computeDiff({}, current);
    const keys = result.map((d) => d.key);
    expect(keys).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('should handle unicode keys and values', () => {
    const lock: Record<string, SyncLockEntry> = {
      'こんにちは': makeLockEntry('日本語'),
    };
    const current: ExtractedEntry[] = [{ key: 'こんにちは', value: '日本語' }];
    const result = computeDiff(lock, current);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('current');
  });

  it('should handle entries with empty string values', () => {
    const lock: Record<string, SyncLockEntry> = {
      empty: makeLockEntry(''),
    };
    const current: ExtractedEntry[] = [{ key: 'empty', value: '' }];
    const result = computeDiff(lock, current);
    expect(result[0]!.status).toBe('current');
  });

  it('should propagate metadata from ExtractedEntry to SyncDiff', () => {
    const lock: Record<string, SyncLockEntry> = {
      stale_key: makeLockEntry('old value'),
    };
    const current: ExtractedEntry[] = [
      { key: 'new_key', value: 'Hello', metadata: { description: 'A greeting' } },
      { key: 'stale_key', value: 'changed', metadata: { maxLength: 100 } },
      { key: 'no_meta', value: 'plain' },
    ];
    const result = computeDiff(lock, current);
    const byKey = new Map(result.map(d => [d.key, d]));

    expect(byKey.get('new_key')!.metadata).toEqual({ description: 'A greeting' });
    expect(byKey.get('stale_key')!.metadata).toEqual({ maxLength: 100 });
    expect(byKey.get('no_meta')!.metadata).toBeUndefined();
  });

  it('should mark entry as stale when any locale translation has failed status', () => {
    const lock: Record<string, SyncLockEntry> = {
      greeting: {
        source_hash: computeSourceHash('Hello'),
        source_text: 'Hello',
        translations: {
          de: { hash: computeSourceHash('Hello'), translated_at: '2026-01-01T00:00:00.000Z', status: 'translated' },
          fr: { hash: computeSourceHash('Hello'), translated_at: '2026-01-01T00:00:00.000Z', status: 'failed' },
        },
      },
    };
    const current: ExtractedEntry[] = [{ key: 'greeting', value: 'Hello' }];
    const result = computeDiff(lock, current);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('stale');
    expect(result[0]!.previous_hash).toBe(computeSourceHash('Hello'));
  });

  it('should mark entry as stale when primary is same but plural metadata differs', () => {
    const lock: Record<string, SyncLockEntry> = {
      item_count: {
        source_hash: computeSourceHash('%d items', {
          plurals: [{ quantity: 'one', value: '1 item' }, { quantity: 'other', value: '%d items' }],
        }),
        source_text: '%d items',
        translations: {
          de: { hash: 'abc', translated_at: '2026-01-01T00:00:00.000Z', status: 'translated' },
        },
      },
    };
    const current: ExtractedEntry[] = [{
      key: 'item_count',
      value: '%d items',
      metadata: {
        plurals: [{ quantity: 'one', value: '1 thing' }, { quantity: 'other', value: '%d items' }],
      },
    }];
    const result = computeDiff(lock, current);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('stale');
  });

  it('should mark entry as current when primary and plural metadata are unchanged', () => {
    const metadata = {
      plurals: [{ quantity: 'one', value: '1 item' }, { quantity: 'other', value: '%d items' }],
    };
    const lock: Record<string, SyncLockEntry> = {
      item_count: {
        source_hash: computeSourceHash('%d items', metadata),
        source_text: '%d items',
        translations: {
          de: { hash: 'abc', translated_at: '2026-01-01T00:00:00.000Z', status: 'translated' },
        },
      },
    };
    const current: ExtractedEntry[] = [{
      key: 'item_count',
      value: '%d items',
      metadata: {
        plurals: [{ quantity: 'one', value: '1 item' }, { quantity: 'other', value: '%d items' }],
      },
    }];
    const result = computeDiff(lock, current);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('current');
  });

  it('should handle large number of entries efficiently', () => {
    const lock: Record<string, SyncLockEntry> = {};
    const current: ExtractedEntry[] = [];
    for (let i = 0; i < 1000; i++) {
      const key = `key_${String(i).padStart(4, '0')}`;
      const value = `value_${i}`;
      lock[key] = makeLockEntry(value);
      current.push({ key, value });
    }
    lock['deleted_key'] = makeLockEntry('will_be_deleted');
    current.push({ key: 'new_key', value: 'brand_new' });

    const start = Date.now();
    const result = computeDiff(lock, current);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(result).toHaveLength(1002);

    const statuses = new Map(result.map((d) => [d.key, d.status]));
    expect(statuses.get('new_key')).toBe('new');
    expect(statuses.get('deleted_key')).toBe('deleted');
    expect(statuses.get('key_0000')).toBe('current');
  });
});
