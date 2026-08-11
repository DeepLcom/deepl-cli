import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  findTargetGaps,
  targetGapsWarning,
} from '../../../src/sync/sync-target-audit';
import { PropertiesFormatParser } from '../../../src/formats/properties';
import { XcstringsFormatParser } from '../../../src/formats/xcstrings';
import { computeSourceHash } from '../../../src/sync/sync-lock';
import type { ResolvedSyncConfig } from '../../../src/sync/sync-config';
import type { SyncLockEntry } from '../../../src/sync/types';
import type { WalkedBucketFile } from '../../../src/sync/sync-bucket-walker';
import type { FormatParser } from '../../../src/formats/format';

const SOURCE = 'greeting=Hello\nadded=Translate me\n';

describe('findTargetGaps()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-target-audit-'));
    fs.mkdirSync(path.join(tmpDir, 'locales'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'locales', 'en.properties'), SOURCE);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function config(): ResolvedSyncConfig {
    return {
      version: 1,
      source_locale: 'en',
      target_locales: ['es'],
      buckets: { properties: { include: ['locales/en.properties'] } },
      configPath: path.join(tmpDir, '.deepl-sync.yaml'),
      projectRoot: tmpDir,
      overrides: {},
    };
  }

  function walked(overrides: Partial<WalkedBucketFile> = {}): WalkedBucketFile {
    const parser = new PropertiesFormatParser();
    return {
      bucket: 'properties',
      bucketConfig: { include: ['locales/en.properties'] },
      parser,
      sourceFile: path.join(tmpDir, 'locales', 'en.properties'),
      relPath: 'locales/en.properties',
      content: SOURCE,
      entries: parser.extract(SOURCE),
      skippedEntries: [],
      isMultiLocale: false,
      ...overrides,
    };
  }

  /** Both source keys recorded as translated for `es`. */
  function lockEntries(
    overrides: Record<string, Partial<SyncLockEntry>> = {}
  ): Record<string, SyncLockEntry> {
    const build = (value: string): SyncLockEntry => ({
      source_hash: computeSourceHash(value),
      source_text: value,
      translations: {
        es: {
          hash: computeSourceHash(value),
          translated_at: '2026-08-08T00:00:00.000Z',
          status: 'translated',
        },
      },
    });
    return {
      greeting: { ...build('Hello'), ...overrides['greeting'] },
      added: { ...build('Translate me'), ...overrides['added'] },
    };
  }

  function writeTarget(content: string): void {
    fs.writeFileSync(path.join(tmpDir, 'locales', 'es.properties'), content);
  }

  it('names a key the target file does not hold', async () => {
    writeTarget('greeting=Hola\n');

    const gaps = await findTargetGaps(config(), walked(), lockEntries(), [
      'es',
    ]);

    expect([...(gaps.get('es')?.keys ?? [])]).toEqual(['added']);
  });

  it('reports nothing when the target holds every claimed key', async () => {
    writeTarget('greeting=Hola\nadded=Traduceme\n');

    const gaps = await findTargetGaps(config(), walked(), lockEntries(), [
      'es',
    ]);

    expect(gaps.size).toBe(0);
  });

  it('treats a target file that does not exist as holding nothing', async () => {
    const gaps = await findTargetGaps(config(), walked(), lockEntries(), [
      'es',
    ]);

    expect([...(gaps.get('es')?.keys ?? [])].sort()).toEqual([
      'added',
      'greeting',
    ]);
  });

  it('treats a target file the parser refuses as holding nothing', async () => {
    writeTarget('greeting=Hola\nadded=Traduceme\n');
    const refusing: FormatParser = {
      ...new PropertiesFormatParser(),
      extract: () => {
        throw new Error('duplicate key');
      },
    } as unknown as FormatParser;

    const gaps = await findTargetGaps(
      config(),
      walked({
        parser: refusing,
        entries: new PropertiesFormatParser().extract(SOURCE),
      }),
      lockEntries(),
      ['es']
    );

    expect([...(gaps.get('es')?.keys ?? [])].sort()).toEqual([
      'added',
      'greeting',
    ]);
  });

  it('carries the reason a target file could not be parsed', async () => {
    writeTarget('greeting=Hola\nadded=Traduceme\n');
    const refusing: FormatParser = {
      ...new PropertiesFormatParser(),
      extract: () => {
        throw new Error('two strings share one key');
      },
    } as unknown as FormatParser;

    const gaps = await findTargetGaps(
      config(),
      walked({
        parser: refusing,
        entries: new PropertiesFormatParser().extract(SOURCE),
      }),
      lockEntries(),
      ['es']
    );

    expect(gaps.get('es')?.unusable).toBe('two strings share one key');
  });

  it('says nothing about usability when the file was read and simply lacks a key', async () => {
    writeTarget('greeting=Hola\n');

    const gaps = await findTargetGaps(config(), walked(), lockEntries(), [
      'es',
    ]);

    expect(gaps.get('es')?.unusable).toBeUndefined();
  });

  it('says nothing about usability when the file is not there at all', async () => {
    const gaps = await findTargetGaps(config(), walked(), lockEntries(), [
      'es',
    ]);

    expect(gaps.get('es')?.keys.size).toBe(2);
    expect(gaps.get('es')?.unusable).toBeUndefined();
  });

  // An empty source can only produce an empty translation, and PO and XLIFF
  // read an empty translation side as untranslated on purpose, so such a key is
  // legitimately absent from a bilingual target.
  it('exempts a key whose source value is empty', async () => {
    const source = 'greeting=Hello\nblank=\n';
    fs.writeFileSync(path.join(tmpDir, 'locales', 'en.properties'), source);
    writeTarget('greeting=Hola\n');
    const parser = new PropertiesFormatParser();
    const entries = parser.extract(source);
    const lock: Record<string, SyncLockEntry> = {
      greeting: lockEntries()['greeting']!,
      blank: {
        source_hash: computeSourceHash(''),
        source_text: '',
        translations: {
          es: {
            hash: computeSourceHash(''),
            translated_at: '2026-08-08T00:00:00.000Z',
            status: 'translated',
          },
        },
      },
    };

    const gaps = await findTargetGaps(
      config(),
      walked({ content: source, entries }),
      lock,
      ['es']
    );

    expect(gaps.size).toBe(0);
  });

  it('exempts a key whose last translation is recorded as failed', async () => {
    writeTarget('greeting=Hola\n');
    const lock = lockEntries();
    lock['added']!.translations['es']!.status = 'failed';

    const gaps = await findTargetGaps(config(), walked(), lock, ['es']);

    expect(gaps.size).toBe(0);
  });

  it('exempts a key whose recorded hash lags the source', async () => {
    writeTarget('greeting=Hola\n');
    const lock = lockEntries();
    lock['added']!.translations['es']!.hash = 'stale-hash';

    const gaps = await findTargetGaps(config(), walked(), lock, ['es']);

    expect(gaps.size).toBe(0);
  });

  it('does not read the target file when the lockfile claims nothing', async () => {
    writeTarget('greeting=Hola\n');
    const readFile = jest.spyOn(fs.promises, 'readFile');

    const gaps = await findTargetGaps(config(), walked(), {}, ['es']);

    expect(gaps.size).toBe(0);
    expect(readFile).not.toHaveBeenCalled();
  });
});

// A multi-locale format keeps every locale in the one file, so the gap check
// reads the walked content rather than a sibling path.
describe('findTargetGaps() over a multi-locale format', () => {
  const CONTENT =
    JSON.stringify(
      {
        sourceLanguage: 'en',
        version: '1.0',
        strings: {
          greeting: {
            localizations: {
              en: { stringUnit: { state: 'translated', value: 'Hello' } },
              es: { stringUnit: { state: 'translated', value: 'Hola' } },
            },
          },
          farewell: {
            localizations: {
              en: { stringUnit: { state: 'translated', value: 'Goodbye' } },
            },
          },
        },
      },
      null,
      2
    ) + '\n';

  function lockEntries(): Record<string, SyncLockEntry> {
    const build = (value: string): SyncLockEntry => ({
      source_hash: computeSourceHash(value),
      source_text: value,
      translations: {
        es: {
          hash: computeSourceHash(value),
          translated_at: '2026-08-08T00:00:00.000Z',
          status: 'translated',
        },
      },
    });
    return { greeting: build('Hello'), farewell: build('Goodbye') };
  }

  it('names the key the file has no localization for', async () => {
    const parser = new XcstringsFormatParser();
    const gaps = await findTargetGaps(
      {
        version: 1,
        source_locale: 'en',
        target_locales: ['es'],
        buckets: { xcstrings: { include: ['app.xcstrings'] } },
        configPath: '/project/.deepl-sync.yaml',
        projectRoot: '/project',
        overrides: {},
      },
      {
        bucket: 'xcstrings',
        bucketConfig: { include: ['app.xcstrings'] },
        parser,
        sourceFile: '/project/app.xcstrings',
        relPath: 'app.xcstrings',
        content: CONTENT,
        // The walker extracts a multi-locale source with the source locale.
        entries: parser.extract(CONTENT, 'en'),
        skippedEntries: [],
        isMultiLocale: true,
      },
      lockEntries(),
      ['es']
    );

    expect([...(gaps.get('es')?.keys ?? [])]).toEqual(['farewell']);
  });
});

describe('targetGapsWarning()', () => {
  it('names the locale, the file and the key for a single gap', () => {
    const message = targetGapsWarning([
      { locale: 'es', file: 'locales/es.properties', keys: ['added'] },
    ]);

    expect(message).toContain('1 key is recorded as translated');
    expect(message).toContain('es: locales/es.properties ("added")');
    expect(message).toContain('deepl sync');
  });

  it('counts every key and elides past the third', () => {
    const message = targetGapsWarning([
      { locale: 'es', file: 'es.json', keys: ['a', 'b', 'c', 'd'] },
      { locale: 'de', file: 'de.json', keys: ['a'] },
    ]);

    expect(message).toContain('5 keys are recorded as translated');
    expect(message).toContain('"a", "b", "c", …');
    expect(message).toContain('de: de.json ("a")');
  });

  // A file nobody could read has not been shown to be missing anything, and
  // `deepl sync` refuses to overwrite it — so neither half of the sentence above
  // is true of it.
  it('says a target file could not be read rather than that its keys are missing', () => {
    const message = targetGapsWarning([
      {
        locale: 'es',
        file: 'locales/es.json',
        keys: ['greeting'],
        unusable: "JSON: 'a.b' is the key of two different strings",
      },
    ]);

    expect(message).toContain('could not be read');
    expect(message).toContain(
      "es: locales/es.json (JSON: 'a.b' is the key of two different strings)"
    );
    expect(message).not.toContain('is not in the target file');
    expect(message).not.toContain('translate it again');
  });

  it('reports an unreadable file and a genuinely incomplete one separately', () => {
    const message = targetGapsWarning([
      {
        locale: 'es',
        file: 'locales/es.json',
        keys: ['a'],
        unusable: 'EISDIR',
      },
      { locale: 'de', file: 'locales/de.json', keys: ['b'] },
    ]);

    expect(message).toContain('1 key is recorded as translated');
    expect(message).toContain('de: locales/de.json ("b")');
    expect(message).toContain('could not be read');
    expect(message).toContain('es: locales/es.json (EISDIR)');
  });
});
