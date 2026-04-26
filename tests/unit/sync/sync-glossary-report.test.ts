import { generateGlossaryReport } from '../../../src/sync/sync-glossary-report';
import type { SyncLockFile } from '../../../src/sync/types';

function makeLockFile(entries: SyncLockFile['entries'] = {}): SyncLockFile {
  return {
    _comment: 'test',
    version: 1,
    generated_at: '2026-01-01T00:00:00Z',
    source_locale: 'en',
    entries,
    stats: { total_keys: 0, total_translations: 0, last_sync: '2026-01-01T00:00:00Z' },
  };
}

describe('generateGlossaryReport()', () => {
  it('should report no inconsistencies for consistent translations', () => {
    const lock = makeLockFile({
      'en/common.json': {
        greeting: {
          source_hash: 'abc123',
          source_text: 'Hello',
          translations: {
            de: { hash: 'hash_de_1', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
            fr: { hash: 'hash_fr_1', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
      'en/other.json': {
        greeting2: {
          source_hash: 'abc123',
          source_text: 'Hello',
          translations: {
            de: { hash: 'hash_de_1', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
            fr: { hash: 'hash_fr_1', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
    });

    const report = generateGlossaryReport(lock);

    expect(report.totalTerms).toBe(1);
    expect(report.inconsistencies).toHaveLength(0);
  });

  it('should detect inconsistency when same source_text has different hashes for same locale', () => {
    const lock = makeLockFile({
      'en/common.json': {
        greeting: {
          source_hash: 'abc123',
          source_text: 'Hello',
          translations: {
            de: { hash: 'hash_de_v1', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
      'en/other.json': {
        welcome: {
          source_hash: 'abc123',
          source_text: 'Hello',
          translations: {
            de: { hash: 'hash_de_v2', translated_at: '2026-01-02T00:00:00Z', status: 'translated' },
          },
        },
      },
    });

    const report = generateGlossaryReport(lock);

    expect(report.inconsistencies).toHaveLength(1);
    expect(report.inconsistencies[0]).toEqual({
      sourceText: 'Hello',
      locale: 'de',
      translations: expect.arrayContaining(['hash_de_v1', 'hash_de_v2']),
      files: expect.arrayContaining(['en/common.json', 'en/other.json']),
    });
  });

  it('should return zero terms and no inconsistencies for empty lock file', () => {
    const lock = makeLockFile({});

    const report = generateGlossaryReport(lock);

    expect(report.totalTerms).toBe(0);
    expect(report.inconsistencies).toHaveLength(0);
  });

  it('should populate files array correctly for multiple files with same source text', () => {
    const lock = makeLockFile({
      'file-a.json': {
        key1: {
          source_hash: 'h1',
          source_text: 'Save',
          translations: {
            de: { hash: 'same_hash', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
      'file-b.json': {
        key2: {
          source_hash: 'h1',
          source_text: 'Save',
          translations: {
            de: { hash: 'same_hash', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
      'file-c.json': {
        key3: {
          source_hash: 'h1',
          source_text: 'Save',
          translations: {
            de: { hash: 'same_hash', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
    });

    const report = generateGlossaryReport(lock);

    expect(report.totalTerms).toBe(1);
    expect(report.inconsistencies).toHaveLength(0);

    // Even with no inconsistency, verify the internal grouping worked by
    // introducing a divergent hash and checking the files list
    const lockWithDivergence = makeLockFile({
      ...lock.entries,
      'file-c.json': {
        key3: {
          source_hash: 'h1',
          source_text: 'Save',
          translations: {
            de: { hash: 'different_hash', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
    });

    const report2 = generateGlossaryReport(lockWithDivergence);
    expect(report2.inconsistencies).toHaveLength(1);
    expect(report2.inconsistencies[0]!.files).toEqual(
      expect.arrayContaining(['file-a.json', 'file-b.json', 'file-c.json']),
    );
    expect(report2.inconsistencies[0]!.files).toHaveLength(3);
  });

  it('surfaces actual translated text (not hashes) when a target-translation index is provided', () => {
    const lock = makeLockFile({
      'en/common.json': {
        greeting: {
          source_hash: 'h',
          source_text: 'Dashboard',
          translations: {
            de: { hash: 'de-v1', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
      'en/admin.json': {
        header: {
          source_hash: 'h',
          source_text: 'Dashboard',
          translations: {
            de: { hash: 'de-v2', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
    });

    const targets = new Map([
      ['en/common.json', new Map([['de', new Map([['greeting', 'Armaturenbrett']])]])],
      ['en/admin.json', new Map([['de', new Map([['header', 'Dashboard']])]])],
    ]);

    const report = generateGlossaryReport(lock, targets);

    expect(report.inconsistencies).toHaveLength(1);
    const inc = report.inconsistencies[0]!;
    expect(inc.sourceText).toBe('Dashboard');
    expect(inc.locale).toBe('de');
    expect(inc.translations).toEqual(expect.arrayContaining(['Armaturenbrett', 'Dashboard']));
    expect(inc.translations).not.toContain('de-v1');
    expect(inc.translations).not.toContain('de-v2');
  });

  it('falls back to the hash when the target-translation index is missing an entry', () => {
    const lock = makeLockFile({
      'en/common.json': {
        greeting: {
          source_hash: 'h',
          source_text: 'Hi',
          translations: {
            de: { hash: 'de-hashA', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
      'en/other.json': {
        greeting2: {
          source_hash: 'h',
          source_text: 'Hi',
          translations: {
            de: { hash: 'de-hashB', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
    });

    // Only en/common.json has a target; en/other.json is missing from the index.
    const partialTargets = new Map([
      ['en/common.json', new Map([['de', new Map([['greeting', 'Hallo']])]])],
    ]);

    const report = generateGlossaryReport(lock, partialTargets);

    expect(report.inconsistencies).toHaveLength(1);
    expect(report.inconsistencies[0]!.translations).toEqual(expect.arrayContaining(['Hallo', 'de-hashB']));
  });

  it('should count different source texts separately in totalTerms', () => {
    const lock = makeLockFile({
      'en/common.json': {
        greeting: {
          source_hash: 'h1',
          source_text: 'Hello',
          translations: {
            de: { hash: 'hash1', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
        farewell: {
          source_hash: 'h2',
          source_text: 'Goodbye',
          translations: {
            de: { hash: 'hash2', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
        save: {
          source_hash: 'h3',
          source_text: 'Save',
          translations: {
            de: { hash: 'hash3', translated_at: '2026-01-01T00:00:00Z', status: 'translated' },
          },
        },
      },
    });

    const report = generateGlossaryReport(lock);

    expect(report.totalTerms).toBe(3);
    expect(report.inconsistencies).toHaveLength(0);
  });
});
