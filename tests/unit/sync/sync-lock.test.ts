import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  computeSourceHash,
  createEmptyLockFile,
  serializeLockFile,
  SyncLockManager,
} from '../../../src/sync/sync-lock';
import { Logger } from '../../../src/utils/logger';
import { LOCK_FILE_VERSION, LOCK_FILE_COMMENT } from '../../../src/sync/types';
import type { SyncLockFile, SyncLockEntry } from '../../../src/sync/types';

describe('computeSourceHash()', () => {
  it('should return a 12-character hex string', () => {
    const hash = computeSourceHash('Hello');
    expect(hash).toHaveLength(12);
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('should return consistent hash for same input', () => {
    const hash1 = computeSourceHash('Hello');
    const hash2 = computeSourceHash('Hello');
    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different inputs', () => {
    const hash1 = computeSourceHash('Hello');
    const hash2 = computeSourceHash('World');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = computeSourceHash('');
    expect(hash).toHaveLength(12);
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('should handle unicode characters', () => {
    const hash = computeSourceHash('こんにちは');
    expect(hash).toHaveLength(12);
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('should produce different hash when plural metadata is provided', () => {
    const hashWithout = computeSourceHash('text');
    const hashWith = computeSourceHash('text', {
      plurals: [
        { quantity: 'one', value: '1 item' },
        { quantity: 'other', value: '%d items' },
      ],
    });
    expect(hashWith).toHaveLength(12);
    expect(hashWith).not.toBe(hashWithout);
  });

  it('should produce different hashes for different plural metadata', () => {
    const hash1 = computeSourceHash('text', {
      plurals: [{ quantity: 'one', value: '1 item' }],
    });
    const hash2 = computeSourceHash('text', {
      plurals: [{ quantity: 'one', value: '1 thing' }],
    });
    expect(hash1).not.toBe(hash2);
  });

  it('should produce same hash when metadata has no plural fields', () => {
    const hashWithout = computeSourceHash('text');
    const hashWith = computeSourceHash('text', { description: 'some context' });
    expect(hashWith).toBe(hashWithout);
  });

  it('should include msgid_plural in hash', () => {
    const hashWithout = computeSourceHash('item');
    const hashWith = computeSourceHash('item', { msgid_plural: 'items' });
    expect(hashWith).not.toBe(hashWithout);
  });

  it('should include plural_forms in hash', () => {
    const hashWithout = computeSourceHash('item');
    const hashWith = computeSourceHash('item', {
      plural_forms: { 'msgstr[0]': '', 'msgstr[1]': '' },
    });
    expect(hashWith).not.toBe(hashWithout);
  });
});

describe('serializeLockFile()', () => {
  function lockWith(
    translations: Record<string, unknown>,
    extra: Record<string, Record<string, SyncLockEntry>> = {}
  ): SyncLockFile {
    const lockFile = createEmptyLockFile('en');
    lockFile.entries['locales/en.json'] = {
      greeting: {
        source_hash: '185f8db32271',
        source_text: 'Hello',
        translations: translations as SyncLockEntry['translations'],
      },
    };
    Object.assign(lockFile.entries, extra);
    return lockFile;
  }

  const de = {
    hash: 'h1',
    translated_at: '2026-01-01T00:00:00.000Z',
    status: 'translated',
    review_status: 'machine_translated',
  };
  const fr = {
    hash: 'h2',
    translated_at: '2026-01-02T00:00:00.000Z',
    status: 'translated',
    review_status: 'human_reviewed',
  };

  function localeLines(serialized: string): string[] {
    return serialized.split('\n').filter((line) => /^\s*"(de|fr)":/.test(line));
  }

  // A translation is only meaningful as a whole: its hash, timestamp and review
  // status describe one act of translating. Splitting it across lines lets git
  // merge the fields independently and fabricate a combination that existed on
  // neither branch, so each one occupies a single line.
  it('should put every translation on one line', () => {
    const lines = localeLines(serializeLockFile(lockWith({ de, fr })));

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.trimEnd().replace(/,$/, '')).toMatch(/\}$/);
    }
  });

  it('should keep every field of a translation on that one line', () => {
    const [line] = localeLines(serializeLockFile(lockWith({ de })));

    expect(line).toContain('"hash": "h1"');
    expect(line).toContain('"translated_at": "2026-01-01T00:00:00.000Z"');
    expect(line).toContain('"status": "translated"');
    expect(line).toContain('"review_status": "machine_translated"');
  });

  it('should still expand the containers above a translation', () => {
    const serialized = serializeLockFile(lockWith({ de }));

    expect(serialized).toContain('\n  "entries": {\n');
    expect(serialized).toContain('\n    "locales/en.json": {\n');
    expect(serialized).toContain('\n      "greeting": {\n');
    expect(serialized).toContain('\n        "translations": {\n');
  });

  it('should round-trip to an identical object', () => {
    const lockFile = lockWith({ de, fr });

    expect(JSON.parse(serializeLockFile(lockFile))).toEqual(
      JSON.parse(JSON.stringify(lockFile))
    );
  });

  it('should sort the keys inside a one-line translation', () => {
    const [line] = localeLines(serializeLockFile(lockWith({ de })));

    expect(line!.indexOf('"hash"')).toBeLessThan(
      line!.indexOf('"review_status"')
    );
    expect(line!.indexOf('"review_status"')).toBeLessThan(
      line!.indexOf('"status"')
    );
  });

  it('should sort container keys and end with a newline', () => {
    const serialized = serializeLockFile(
      lockWith({ fr, de }, { 'z.json': {}, 'a.json': {} })
    );

    expect(serialized.indexOf('"a.json"')).toBeLessThan(
      serialized.indexOf('"z.json"')
    );
    expect(serialized.indexOf('"de"')).toBeLessThan(serialized.indexOf('"fr"'));
    expect(serialized.endsWith('\n')).toBe(true);
  });

  // An i18n key of this name is a real possibility and must not be mistaken for
  // the translations container that sits one level deeper.
  it('should not compact an entry under an i18n key named translations', () => {
    const lockFile = createEmptyLockFile('en');
    lockFile.entries['locales/en.json'] = {
      translations: {
        source_hash: 'abc',
        source_text: 'Hello',
        translations: { de: de as never },
      },
    };

    const serialized = serializeLockFile(lockFile);

    expect(serialized).toContain('\n      "translations": {\n');
    expect(serialized).toContain('\n        "source_hash": "abc",\n');
  });

  // No field of the lock file is an array today, but `sync resolve` serializes
  // whatever it parsed out of a conflicted file, which may have been written by
  // a version that added one. Rewriting it as {"0": ...} would be silent damage.
  describe('array members', () => {
    it('should keep an array in a container an array', () => {
      const lockFile = JSON.parse(
        '{"version": 1, "notes": ["a", "b"], "empty": [], "entries": {}}'
      ) as SyncLockFile;

      const out = JSON.parse(serializeLockFile(lockFile)) as {
        notes: string[];
        empty: string[];
      };

      expect(out.notes).toEqual(['a', 'b']);
      expect(out.empty).toEqual([]);
    });

    it('should keep an array inside a translation on the one line', () => {
      const lockFile = JSON.parse(
        '{"version": 1, "entries": {"locales/en.json": {"greeting": {"translations": {"de": {"hash": "h", "tags": ["x", "y"], "nested": [{"k": 1}]}}}}}}'
      ) as SyncLockFile;

      const serialized = serializeLockFile(lockFile);

      expect(serialized).toContain(
        '"de": {"hash": "h", "nested": [{"k": 1}], "tags": ["x", "y"]}'
      );
    });
  });
});

describe('createEmptyLockFile()', () => {
  it('should create lock file with correct version', () => {
    const lockFile = createEmptyLockFile('en');
    expect(lockFile.version).toBe(LOCK_FILE_VERSION);
  });

  it('should set source_locale from parameter', () => {
    const lockFile = createEmptyLockFile('de');
    expect(lockFile.source_locale).toBe('de');
  });

  it('should have empty entries', () => {
    const lockFile = createEmptyLockFile('en');
    expect(lockFile.entries).toEqual({});
  });

  it('should have zero stats', () => {
    const lockFile = createEmptyLockFile('en');
    expect(lockFile.stats.total_keys).toBe(0);
    expect(lockFile.stats.total_translations).toBe(0);
  });
});

describe('SyncLockManager', () => {
  let tmpDir: string;
  let lockFilePath: string;
  let manager: SyncLockManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-lock-test-'));
    lockFilePath = path.join(tmpDir, '.deepl-sync.lock');
    manager = new SyncLockManager(lockFilePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('read()', () => {
    it('should return empty lock file when file does not exist', async () => {
      const result = await manager.read();
      expect(result.entries).toEqual({});
      expect(result.stats.total_keys).toBe(0);
    });

    it('should parse valid lock file', async () => {
      const lockFile: SyncLockFile = {
        _comment: LOCK_FILE_COMMENT,
        version: LOCK_FILE_VERSION,
        generated_at: '2026-01-01T00:00:00.000Z',
        source_locale: 'en',
        entries: {},
        stats: {
          total_keys: 0,
          total_translations: 0,
          last_sync: '2026-01-01T00:00:00.000Z',
        },
      };
      fs.writeFileSync(lockFilePath, JSON.stringify(lockFile, null, 2));
      const result = await manager.read();
      expect(result.version).toBe(LOCK_FILE_VERSION);
      expect(result.source_locale).toBe('en');
    });

    it('should warn and return empty on corrupted JSON', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      fs.writeFileSync(lockFilePath, '{not valid json!!!');
      const result = await manager.read();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lock file corrupted')
      );
      expect(result.entries).toEqual({});
    });

    it('should warn and return empty on wrong version', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      const lockFile = { version: 999, entries: {} };
      fs.writeFileSync(lockFilePath, JSON.stringify(lockFile));
      const result = await manager.read();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `Unsupported lock file version 999 (expected ${LOCK_FILE_VERSION})`
        )
      );
      expect(result.entries).toEqual({});
    });

    it('should warn and return empty on missing version', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      const lockFile = { entries: {} };
      fs.writeFileSync(lockFilePath, JSON.stringify(lockFile));
      const result = await manager.read();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lock file corrupted (missing version)')
      );
      expect(result.entries).toEqual({});
    });

    describe('backup before reset', () => {
      const backupPattern =
        /^\.deepl-sync\.lock\.bak-(?:corrupt|v\d+)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z$/;

      const listBackups = (): string[] =>
        fs
          .readdirSync(tmpDir)
          .filter((name) => name.startsWith('.deepl-sync.lock.bak-'));

      it('should back up corrupt JSON lockfile before resetting', async () => {
        jest.spyOn(Logger, 'warn').mockImplementation(() => {});
        const original = '{not valid json!!!';
        fs.writeFileSync(lockFilePath, original);

        await manager.read();

        const backups = listBackups();
        expect(backups).toHaveLength(1);
        const backupName = backups[0]!;
        expect(backupName).toMatch(backupPattern);
        expect(backupName).toContain('.bak-corrupt-');
        expect(fs.readFileSync(path.join(tmpDir, backupName), 'utf-8')).toBe(
          original
        );
      });

      it('should back up wrong-version lockfile before resetting and tag version in filename', async () => {
        jest.spyOn(Logger, 'warn').mockImplementation(() => {});
        const original = JSON.stringify({ version: 0, entries: {} });
        fs.writeFileSync(lockFilePath, original);

        await manager.read();

        const backups = listBackups();
        expect(backups).toHaveLength(1);
        const backupName = backups[0]!;
        expect(backupName).toMatch(backupPattern);
        expect(backupName).toContain('.bak-v0-');
        expect(fs.readFileSync(path.join(tmpDir, backupName), 'utf-8')).toBe(
          original
        );
      });

      it('should back up missing-version lockfile as v-unknown and preserve contents', async () => {
        jest.spyOn(Logger, 'warn').mockImplementation(() => {});
        const original = JSON.stringify({ entries: {} });
        fs.writeFileSync(lockFilePath, original);

        await manager.read();

        const backups = listBackups();
        expect(backups).toHaveLength(1);
        const backupName = backups[0]!;
        expect(backupName).toContain('.bak-v-unknown-');
        expect(fs.readFileSync(path.join(tmpDir, backupName), 'utf-8')).toBe(
          original
        );
      });

      it('should log the backup path at WARN level', async () => {
        const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
        fs.writeFileSync(
          lockFilePath,
          JSON.stringify({ version: 99, entries: {} })
        );

        await manager.read();

        const backups = listBackups();
        expect(backups).toHaveLength(1);
        const logged = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toContain(backups[0]!);
      });

      it('should NOT write a backup when the lockfile is valid', async () => {
        const lockFile: SyncLockFile = {
          _comment: LOCK_FILE_COMMENT,
          version: LOCK_FILE_VERSION,
          generated_at: '2026-01-01T00:00:00.000Z',
          source_locale: 'en',
          entries: {},
          stats: {
            total_keys: 0,
            total_translations: 0,
            last_sync: '2026-01-01T00:00:00.000Z',
          },
        };
        fs.writeFileSync(lockFilePath, JSON.stringify(lockFile, null, 2));

        await manager.read();

        expect(listBackups()).toHaveLength(0);
      });

      it('should NOT write a backup when the lockfile does not exist', async () => {
        await manager.read();
        expect(listBackups()).toHaveLength(0);
      });
    });

    it('should warn and return empty when entries field is missing', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      const lockFile = { version: LOCK_FILE_VERSION };
      fs.writeFileSync(lockFilePath, JSON.stringify(lockFile));
      const result = await manager.read();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lock file missing entries')
      );
      expect(result.entries).toEqual({});
    });

    it('should read lock file with multiple entries', async () => {
      const lockFile: SyncLockFile = {
        _comment: LOCK_FILE_COMMENT,
        version: LOCK_FILE_VERSION,
        generated_at: '2026-01-01T00:00:00.000Z',
        source_locale: 'en',
        entries: {
          'locales/en.json': {
            greeting: {
              source_hash: '185f8db32271',
              source_text: 'Hello',
              translations: {
                es: {
                  hash: 'abc',
                  translated_at: '2026-01-01T00:00:00.000Z',
                  status: 'translated',
                },
              },
            },
            farewell: {
              source_hash: 'c015ad6ddaf8',
              source_text: 'Hello',
              translations: {},
            },
          },
        },
        stats: {
          total_keys: 2,
          total_translations: 1,
          last_sync: '2026-01-01T00:00:00.000Z',
        },
      };
      fs.writeFileSync(lockFilePath, JSON.stringify(lockFile, null, 2));
      const result = await manager.read();
      expect(Object.keys(result.entries['locales/en.json']!)).toHaveLength(2);
    });
  });

  describe('write()', () => {
    it('should write lock file to disk', async () => {
      const lockFile = createEmptyLockFile('en');
      await manager.write(lockFile);
      expect(fs.existsSync(lockFilePath)).toBe(true);
    });

    it('should sort keys deterministically', async () => {
      const lockFile = createEmptyLockFile('en');
      lockFile.entries['z-file.json'] = {};
      lockFile.entries['a-file.json'] = {};
      await manager.write(lockFile);
      const raw = fs.readFileSync(lockFilePath, 'utf-8');
      const aIndex = raw.indexOf('a-file.json');
      const zIndex = raw.indexOf('z-file.json');
      expect(aIndex).toBeLessThan(zIndex);
    });

    it('should include trailing newline', async () => {
      const lockFile = createEmptyLockFile('en');
      await manager.write(lockFile);
      const raw = fs.readFileSync(lockFilePath, 'utf-8');
      expect(raw.endsWith('\n')).toBe(true);
    });

    it('should update generated_at timestamp', async () => {
      const lockFile = createEmptyLockFile('en');
      lockFile.generated_at = '2020-01-01T00:00:00.000Z';
      const before = new Date().toISOString();
      await manager.write(lockFile);
      const raw = fs.readFileSync(lockFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as SyncLockFile;
      expect(parsed.generated_at >= before).toBe(true);
    });

    it('should sort nested entries and locale keys', async () => {
      const lockFile = createEmptyLockFile('en');
      lockFile.entries['file.json'] = {
        zebra: {
          source_hash: 'aaa',
          source_text: 'Hello',
          translations: {
            fr: {
              hash: 'h1',
              translated_at: '2026-01-01T00:00:00.000Z',
              status: 'translated',
            },
            de: {
              hash: 'h2',
              translated_at: '2026-01-01T00:00:00.000Z',
              status: 'translated',
            },
          },
        },
        alpha: {
          source_hash: 'bbb',
          source_text: 'Hello',
          translations: {},
        },
      };
      await manager.write(lockFile);
      const raw = fs.readFileSync(lockFilePath, 'utf-8');
      const alphaIndex = raw.indexOf('"alpha"');
      const zebraIndex = raw.indexOf('"zebra"');
      expect(alphaIndex).toBeLessThan(zebraIndex);
      const deIndex = raw.indexOf('"de"');
      const frIndex = raw.indexOf('"fr"');
      expect(deIndex).toBeLessThan(frIndex);
    });
  });

  describe('updateEntry()', () => {
    it('should add entry to empty lock file', async () => {
      const entry: SyncLockEntry = {
        source_hash: '185f8db32271',
        source_text: 'Hello',
        translations: {},
      };
      await manager.updateEntry('file.json', 'greeting', entry);
      const result = await manager.read();
      expect(result.entries['file.json']!['greeting']).toBeDefined();
      expect(result.stats.total_keys).toBe(1);
    });

    it('should update existing entry', async () => {
      const entry1: SyncLockEntry = {
        source_hash: 'aaa',
        source_text: 'Hello',
        translations: {},
      };
      await manager.updateEntry('file.json', 'greeting', entry1);

      const entry2: SyncLockEntry = {
        source_hash: 'bbb',
        source_text: 'Updated',
        translations: {},
      };
      await manager.updateEntry('file.json', 'greeting', entry2);

      const result = await manager.read();
      expect(result.entries['file.json']!['greeting']!.source_hash).toBe('bbb');
      expect(result.stats.total_keys).toBe(1);
    });

    it('should create file path key if missing', async () => {
      const entry: SyncLockEntry = {
        source_hash: 'ccc',
        source_text: 'Hello',
        translations: {},
      };
      await manager.updateEntry('new-file.json', 'key1', entry);
      const result = await manager.read();
      expect(result.entries['new-file.json']).toBeDefined();
    });
  });

  describe('removeEntry()', () => {
    it('should remove existing entry', async () => {
      const entry: SyncLockEntry = {
        source_hash: 'aaa',
        source_text: 'Hello',
        translations: {},
      };
      await manager.updateEntry('file.json', 'greeting', entry);
      await manager.updateEntry('file.json', 'farewell', {
        ...entry,
        source_hash: 'bbb',
      });

      await manager.removeEntry('file.json', 'greeting');
      const result = await manager.read();
      expect(result.entries['file.json']!['greeting']).toBeUndefined();
      expect(result.entries['file.json']!['farewell']).toBeDefined();
      expect(result.stats.total_keys).toBe(1);
    });

    it('should clean up empty file path keys', async () => {
      const entry: SyncLockEntry = {
        source_hash: 'aaa',
        source_text: 'Hello',
        translations: {},
      };
      await manager.updateEntry('file.json', 'greeting', entry);
      await manager.removeEntry('file.json', 'greeting');
      const result = await manager.read();
      expect(result.entries['file.json']).toBeUndefined();
    });

    it('should handle removing non-existent entry gracefully', async () => {
      await expect(
        manager.removeEntry('missing.json', 'no-key')
      ).resolves.not.toThrow();
    });
  });

  describe('exists()', () => {
    it('should return false when file does not exist', async () => {
      expect(await manager.exists()).toBe(false);
    });

    it('should return true when file exists', async () => {
      fs.writeFileSync(lockFilePath, '{}');
      expect(await manager.exists()).toBe(true);
    });
  });
});
