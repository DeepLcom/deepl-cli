/**
 * `translateBatch` returns one slot per input text, and that array is sparse: a
 * slot is `null` where the chunk request failed. An empty input text is not
 * such a case — it is never sent, and round-trips as an empty translation, a
 * result rather than a failure — so the null that remains means failure, and it
 * is in the declared return type, which forces consumers to handle it. Left
 * out of the type, an empty i18n value crashes structured file translation with
 * a TypeError before any output is written, and reaches sync as a permanent
 * per-key failure.
 *
 */

import { StructuredFileTranslationService } from '../../../src/services/structured-file-translation';
import {
  TranslationService,
  TRANSLATE_BATCH_SIZE,
} from '../../../src/services/translation';
import { BatchTranslationService } from '../../../src/services/batch-translation';
import type { FileTranslationService } from '../../../src/services/file-translation';
import type { DeepLClient } from '../../../src/api/deepl-client';
import type { ConfigService } from '../../../src/storage/config';
import type { TranslationResult } from '../../../src/api/translation-client';
import { DeepLCLIError, RateLimitError } from '../../../src/utils/errors';
import { Logger } from '../../../src/utils/logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type BatchImpl = (texts: string[]) => Promise<TranslationResult[]>;

function makeService(impl?: BatchImpl): {
  service: TranslationService;
  clientCalls: string[][];
} {
  const clientCalls: string[][] = [];
  const client = {
    resolvedBaseUrl: 'https://api-free.deepl.com',
    translateBatch: (texts: string[]) => {
      clientCalls.push([...texts]);
      return (
        impl?.(texts) ??
        Promise.resolve(texts.map((t) => ({ text: `DE(${t})` })))
      );
    },
    translate: (text: string) => Promise.resolve({ text: `DE(${text})` }),
  } as unknown as DeepLClient;

  const config = {
    get: () => ({ defaults: {} }),
    getValue: (key: string) => (key === 'cache.enabled' ? false : undefined),
  } as unknown as ConfigService;

  return {
    service: new TranslationService(client, config),
    clientCalls,
  };
}

/** Succeeds for a full chunk, rejects for the short trailing one. */
const failSecondChunk: BatchImpl = (batch) =>
  batch.length === TRANSLATE_BATCH_SIZE
    ? Promise.resolve(batch.map((t) => ({ text: `DE(${t})` })))
    : Promise.reject(new RateLimitError('Too many requests'));

function silenceLogger(): void {
  jest.spyOn(Logger, 'error').mockImplementation(() => {});
  jest.spyOn(Logger, 'warn').mockImplementation(() => {});
}

describe('translateBatch sparse-array contract', () => {
  describe('empty input texts', () => {
    it('should return an empty translation rather than a null slot', async () => {
      const { service } = makeService();

      const results = await service.translateBatch(['Hello', '', 'Goodbye'], {
        targetLang: 'de',
      });

      expect(results).toHaveLength(3);
      expect(results[0]?.text).toBe('DE(Hello)');
      expect(results[1]).not.toBeNull();
      expect(results[1]?.text).toBe('');
      expect(results[2]?.text).toBe('DE(Goodbye)');
    });

    it('should not send the empty text to the API or bill for it', async () => {
      const { service, clientCalls } = makeService();

      const results = await service.translateBatch(['Hello', '', 'Goodbye'], {
        targetLang: 'de',
      });

      expect(clientCalls).toEqual([['Hello', 'Goodbye']]);
      expect(results[1]?.billedCharacters).toBe(0);
    });

    it('should not warn that a translation failed', async () => {
      const { service } = makeService();
      const warnings: string[] = [];
      jest.spyOn(Logger, 'warn').mockImplementation((...args: unknown[]) => {
        warnings.push(String(args[0]));
      });

      await service.translateBatch(['Hello', '', 'Goodbye'], {
        targetLang: 'de',
      });

      expect(warnings.filter((w) => w.includes('translations failed'))).toEqual(
        []
      );
    });
  });

  describe('cache-state notice', () => {
    it('should announce a disabled cache once per run, not once per batch', async () => {
      const { service } = makeService();
      const notices: string[] = [];
      jest.spyOn(Logger, 'info').mockImplementation((...args: unknown[]) => {
        notices.push(String(args[0]));
      });

      await service.translateBatch(['a'], { targetLang: 'de' });
      await service.translateBatch(['b'], { targetLang: 'de' });
      await service.translate('c', { targetLang: 'de' });

      expect(
        notices.filter((n) => n.includes('Cache is disabled'))
      ).toHaveLength(1);
    });
  });

  describe('failed chunks', () => {
    it('should still leave a null slot so per-key consumers can retry', async () => {
      // Two chunks: the second rejects, so its texts have no result.
      const texts = Array.from(
        { length: TRANSLATE_BATCH_SIZE + 2 },
        (_, i) => `t${i}`
      );
      const { service } = makeService(failSecondChunk);
      silenceLogger();

      const results = await service.translateBatch(texts, {
        targetLang: 'de',
      });

      expect(results).toHaveLength(texts.length);
      expect(results[0]?.text).toBe('DE(t0)');
      expect(results[TRANSLATE_BATCH_SIZE]).toBeNull();
      expect(results[TRANSLATE_BATCH_SIZE + 1]).toBeNull();
    });
  });
});

describe('StructuredFileTranslationService batching', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sparse-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function writeJson(name: string, data: unknown): string {
    const p = path.join(testDir, name);
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
    return p;
  }

  it('should preserve an empty value and translate the rest', async () => {
    const { service: translation } = makeService();
    const structured = new StructuredFileTranslationService(translation);
    const inputPath = writeJson('en.json', {
      title: 'Hello world',
      placeholder: '',
      footer: 'Goodbye',
    });
    const outputPath = path.join(testDir, 'de.json');

    await structured.translateFile(inputPath, outputPath, {
      targetLang: 'de',
    });

    expect(JSON.parse(fs.readFileSync(outputPath, 'utf-8'))).toEqual({
      title: 'DE(Hello world)',
      placeholder: '',
      footer: 'DE(Goodbye)',
    });
  });

  function manyStrings(count: number): Record<string, string> {
    const data: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      data[`k${i}`] = `String number ${i}`;
    }
    return data;
  }

  it('should cap each translateBatch call at TRANSLATE_BATCH_SIZE texts', async () => {
    const { service: translation } = makeService();
    const spy = jest.spyOn(translation, 'translateBatch');
    const structured = new StructuredFileTranslationService(translation);
    const inputPath = writeJson(
      'en.json',
      manyStrings(TRANSLATE_BATCH_SIZE + 10)
    );

    await structured.translateFile(inputPath, path.join(testDir, 'de.json'), {
      targetLang: 'de',
    });

    expect(spy.mock.calls.map((c) => c[0].length)).toEqual([
      TRANSLATE_BATCH_SIZE,
      10,
    ]);
  });

  it('should classify a partly failed batch instead of crashing with a TypeError', async () => {
    const { service: translation } = makeService(failSecondChunk);
    const structured = new StructuredFileTranslationService(translation);
    const inputPath = writeJson(
      'en.json',
      manyStrings(TRANSLATE_BATCH_SIZE + 10)
    );
    const outputPath = path.join(testDir, 'de.json');
    silenceLogger();

    expect.assertions(4);
    try {
      await structured.translateFile(inputPath, outputPath, {
        targetLang: 'de',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(DeepLCLIError);
      expect((error as Error).message).not.toMatch(/Cannot read properties/);
      expect((error as DeepLCLIError).exitCode).toBe(3);
    }
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('should reject a missing per-index result with a typed error', async () => {
    const translation = {
      translateBatch: jest
        .fn<Promise<(TranslationResult | null)[]>, [string[]]>()
        .mockImplementation((texts: string[]) =>
          Promise.resolve(texts.map((t, i) => (i === 1 ? null : { text: t })))
        ),
    } as unknown as TranslationService;
    const structured = new StructuredFileTranslationService(translation);
    const inputPath = writeJson('en.json', { a: 'A', b: 'B', c: 'C' });
    const outputPath = path.join(testDir, 'de.json');

    expect.assertions(3);
    try {
      await structured.translateFile(inputPath, outputPath, {
        targetLang: 'de',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(DeepLCLIError);
      expect((error as Error).message).not.toMatch(/Cannot read properties/);
    }
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});

describe('BatchTranslationService null results', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sparse-batch-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should record a missing per-index result as a per-file failure', async () => {
    const files = [path.join(testDir, 'a.txt'), path.join(testDir, 'b.txt')];
    fs.writeFileSync(files[0]!, 'Alpha\n');
    fs.writeFileSync(files[1]!, 'Beta\n');
    const outDir = path.join(testDir, 'out');

    const translation = {
      translateBatch: jest
        .fn<Promise<(TranslationResult | null)[]>, [string[]]>()
        .mockImplementation((texts: string[]) =>
          Promise.resolve(texts.map((t, i) => (i === 0 ? null : { text: t })))
        ),
    } as unknown as TranslationService;
    const fileTranslation = {
      isSupportedFile: () => true,
    } as unknown as FileTranslationService;
    const batch = new BatchTranslationService(fileTranslation, {
      translationService: translation,
    });

    const result = await batch.translateFiles(
      files,
      { targetLang: 'de' },
      { outputDir: outDir }
    );

    expect(result.failed).toHaveLength(1);
    expect(result.successful).toHaveLength(1);
    expect(result.failed[0]?.error).not.toMatch(/Cannot read properties/);
  });
});
