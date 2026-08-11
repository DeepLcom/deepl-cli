/**
 * Every translate path must check that the placeholder tokens the CLI injected
 * came back intact. `restorePlaceholders` replaces the ones it can find and
 * leaves the rest alone, and re-casing or re-spacing an unknown token is
 * ordinary MT behaviour — so without the check, `__VAR_0__` returning as
 * `__ Var_0 __` writes the CLI's own internal scaffolding into the user's file,
 * or prints it to stdout, at exit 0 with no warning.
 *
 * The sync path has its own placeholder validator; these are the three
 * translate paths.
 */

import {
  preserveVariables,
  restorePlaceholders,
  unresolvedPlaceholders,
  unresolvedPlaceholderMessage,
} from '../../src/utils/text-preservation';
import { TranslationService } from '../../src/services/translation';
import { BatchTranslationService } from '../../src/services/batch-translation';
import type { FileTranslationService } from '../../src/services/file-translation';
import type { DeepLClient } from '../../src/api/deepl-client';
import type { ConfigService } from '../../src/storage/config';
import type { CacheService } from '../../src/storage/cache';
import type { TranslationResult } from '../../src/api/translation-client';
import { NetworkError } from '../../src/utils/errors';
import { Logger } from '../../src/utils/logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** How an engine commonly mangles a token it does not recognise. */
function mangle(text: string): string {
  return text.replace(/__VAR_(\d+)__/g, '__ Var_$1 __');
}

describe('unresolvedPlaceholders', () => {
  it('should name the originals whose tokens are missing from the text', () => {
    const map = new Map<string, string>();
    const processed = preserveVariables('Hi {name}, you have %d left', map);

    expect(unresolvedPlaceholders(mangle(processed), map)).toEqual([
      '{name}',
      '%d',
    ]);
  });

  it('should report only the tokens that are actually missing', () => {
    const map = new Map<string, string>();
    const processed = preserveVariables('Hi {name}, you have %d left', map);
    const partly = processed.replace('__VAR_0__', '__ Var_0 __');

    expect(unresolvedPlaceholders(partly, map)).toEqual(['{name}']);
  });

  it('should report nothing when every token survived', () => {
    const map = new Map<string, string>();
    const processed = preserveVariables('Hi {name}', map);

    expect(unresolvedPlaceholders(`[de] ${processed}`, map)).toEqual([]);
    expect(unresolvedPlaceholders('anything', new Map())).toEqual([]);
  });

  it('should read as a sentence for one placeholder and for several', () => {
    expect(unresolvedPlaceholderMessage(['{name}'])).toBe(
      'The translation lost the placeholder {name}. The endpoint returned the ' +
        'token the CLI substituted for it in an altered form, so the text would ' +
        "carry the CLI's internal placeholders instead. Nothing was written."
    );
    expect(unresolvedPlaceholderMessage(['{name}', '%d'])).toBe(
      'The translation lost the placeholders {name}, %d. The endpoint returned ' +
        'the tokens the CLI substituted for them in an altered form, so the text ' +
        "would carry the CLI's internal placeholders instead. Nothing was written."
    );
  });

  it('should leave restorePlaceholders itself unchanged', () => {
    const map = new Map([['__VAR_0__', '{name}']]);

    expect(restorePlaceholders('Hi __VAR_0__', map)).toBe('Hi {name}');
    expect(restorePlaceholders('Hi __ Var_0 __', map)).toBe('Hi __ Var_0 __');
  });
});

interface Harness {
  service: TranslationService;
  cacheSets: TranslationResult[];
}

function makeService(
  reply: (text: string) => string,
  cached?: TranslationResult
): Harness {
  const cacheSets: TranslationResult[] = [];
  const client = {
    resolvedBaseUrl: 'https://api-free.deepl.com',
    translate: (text: string) => Promise.resolve({ text: reply(text) }),
  } as unknown as DeepLClient;
  const config = {
    get: () => ({ defaults: {} }),
    getValue: (key: string) => (key === 'cache.enabled' ? true : undefined),
  } as unknown as ConfigService;
  const cache = {
    get: () => cached ?? null,
    set: (_key: string, value: TranslationResult) => {
      cacheSets.push(value);
    },
  } as unknown as CacheService;

  return {
    service: new TranslationService(client, config, cache),
    cacheSets,
  };
}

describe('TranslationService.translate placeholder post-condition', () => {
  it('should refuse a translation that lost the token, naming the variable', async () => {
    const { service } = makeService((t) => `[de] ${mangle(t)}`);

    expect.assertions(3);
    try {
      await service.translate('Welcome back, {username}!', {
        targetLang: 'de',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(NetworkError);
      expect((error as Error).message).toContain('{username}');
      expect((error as NetworkError).exitCode).toBe(5);
    }
  });

  it('should not cache a response whose placeholders were lost', async () => {
    const { service, cacheSets } = makeService((t) => `[de] ${mangle(t)}`);

    await expect(
      service.translate('Hi {name}', { targetLang: 'de' })
    ).rejects.toThrow(NetworkError);
    expect(cacheSets).toEqual([]);
  });

  it('should refuse a cached entry whose placeholders were already lost', async () => {
    const { service } = makeService((t) => t, { text: '[de] __ Var_0 __' });

    await expect(
      service.translate('Hi {name}', { targetLang: 'de' })
    ).rejects.toThrow(/\{name\}/);
  });

  it('should pass an intact translation through and cache it', async () => {
    const { service, cacheSets } = makeService((t) => `[de] ${t}`);

    const result = await service.translate('Welcome back, {username}!', {
      targetLang: 'de',
    });

    expect(result.text).toBe('[de] Welcome back, {username}!');
    expect(cacheSets).toHaveLength(1);
  });
});

describe('BatchTranslationService placeholder post-condition', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-postcond-'));
    jest.spyOn(Logger, 'error').mockImplementation(() => {});
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should fail the file rather than write the internal token into it', async () => {
    const good = path.join(testDir, 'good.txt');
    const bad = path.join(testDir, 'bad.txt');
    fs.writeFileSync(good, 'Plain sentence\n');
    fs.writeFileSync(bad, 'Welcome back, {username}!\n');
    const outDir = path.join(testDir, 'out');

    const translation = {
      translateBatch: (texts: string[]) =>
        Promise.resolve(texts.map((t) => ({ text: `[de] ${mangle(t)}` }))),
    } as unknown as TranslationService;
    const batch = new BatchTranslationService(
      { isSupportedFile: () => true } as unknown as FileTranslationService,
      { translationService: translation }
    );

    const result = await batch.translateFiles(
      [good, bad],
      { targetLang: 'de' },
      { outputDir: outDir }
    );

    expect(result.failed.map((f) => path.basename(f.file))).toEqual([
      'bad.txt',
    ]);
    expect(result.failed[0]?.error).toContain('{username}');
    expect(result.successful.map((s) => path.basename(s.file))).toEqual([
      'good.txt',
    ]);
    expect(fs.existsSync(path.join(outDir, 'bad.de.txt'))).toBe(false);
  });
});
