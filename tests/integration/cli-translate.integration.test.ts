/**
 * Integration Tests for Translation Memory wiring on `deepl translate`
 * Drives handler -> resolver -> service -> HTTP in-process against nock.
 * CLI flag handling lives in tests/e2e/cli-translate-flags.e2e.test.ts.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import nock from 'nock';
import {
  DEEPL_FREE_API_URL,
  TEST_API_KEY,
  createMockConfigService,
  createMockCacheService,
  createMockFileTranslationService,
  createMockDocumentTranslationService,
} from '../helpers';
import { DeepLClient } from '../../src/api/deepl-client';
import { TranslationService } from '../../src/services/translation';
import { GlossaryService } from '../../src/services/glossary';
import { TextTranslationHandler } from '../../src/cli/commands/translate/text-translation-handler';
import type {
  HandlerContext,
  TranslateOptions,
} from '../../src/cli/commands/translate/types';
import type { BatchTranslationService } from '../../src/services/batch-translation';

/**
 * Translation Memory wiring — full-stack integration coverage.
 *
 * These exercise the full stack (handler → resolver → service → HTTP) against
 * a real DeepLClient so nock can assert wire-level request bodies. Each
 * describe ends with `nock.isDone()` so any unmatched or missing interceptor
 * fails the test.
 */
describe('Translate CLI --translation-memory integration (nock)', () => {
  const TM_UUID = '11111111-2222-3333-4444-555555555555';
  const GLOSSARY_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const prevApiKey = process.env['DEEPL_API_KEY'];
  const prevConfigDir = process.env['DEEPL_CONFIG_DIR'];

  let tmpConfigDir: string;
  let client: DeepLClient;
  let handler: TextTranslationHandler;

  beforeEach(() => {
    tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-tm-int-'));
    process.env['DEEPL_CONFIG_DIR'] = tmpConfigDir;
    process.env['DEEPL_API_KEY'] = TEST_API_KEY;

    const mockConfig = createMockConfigService({
      get: jest.fn(() => ({
        auth: {},
        api: { baseUrl: DEEPL_FREE_API_URL, usePro: false },
        defaults: {
          targetLangs: [],
          formality: 'default',
          preserveFormatting: false,
        },
        cache: { enabled: false },
        output: { format: 'text', color: false },
        proxy: {},
      })),
      getValue: jest.fn((key: string) => {
        if (key === 'auth.apiKey') return TEST_API_KEY;
        if (key === 'cache.enabled') return false;
        return undefined;
      }),
    });
    const mockCache = createMockCacheService();

    client = new DeepLClient(TEST_API_KEY, { maxRetries: 0 });
    const translationService = new TranslationService(
      client,
      mockConfig,
      mockCache
    );
    const glossaryService = new GlossaryService(client);

    const ctx: HandlerContext = {
      translationService,
      glossaryService,
      fileTranslationService: createMockFileTranslationService(),
      batchTranslationService: {} as jest.Mocked<BatchTranslationService>,
      documentTranslationService: createMockDocumentTranslationService(),
      config: mockConfig,
    };
    handler = new TextTranslationHandler(ctx);
  });

  afterEach(() => {
    client.destroy();
    nock.cleanAll();
    if (fs.existsSync(tmpConfigDir)) {
      fs.rmSync(tmpConfigDir, { recursive: true, force: true });
    }
    if (prevApiKey !== undefined) {
      process.env['DEEPL_API_KEY'] = prevApiKey;
    } else {
      delete process.env['DEEPL_API_KEY'];
    }
    if (prevConfigDir !== undefined) {
      process.env['DEEPL_CONFIG_DIR'] = prevConfigDir;
    } else {
      delete process.env['DEEPL_CONFIG_DIR'];
    }
  });

  describe('happy path — name resolves, threshold defaults to 75', () => {
    it('sends translation_memory_id and translation_memory_threshold=75 when only --translation-memory is set', async () => {
      const listScope = nock(DEEPL_FREE_API_URL)
        .get('/v3/translation_memories')
        .reply(200, {
          translation_memories: [
            {
              translation_memory_id: TM_UUID,
              name: 'my-tm',
              source_language: 'en',
              target_languages: ['de'],
            },
          ],
        });

      const translateScope = nock(DEEPL_FREE_API_URL)
        .post('/v2/translate', (body: Record<string, string>) => {
          expect(body['translation_memory_id']).toBe(TM_UUID);
          expect(body['translation_memory_threshold']).toBe('75');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        translationMemory: 'my-tm',
        cache: false,
      };

      await handler.translateText('Hi', options);

      expect(listScope.isDone()).toBe(true);
      expect(translateScope.isDone()).toBe(true);
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('explicit --tm-threshold 80 with UUID input', () => {
    it('sends translation_memory_threshold=80 and skips the list call', async () => {
      const translateScope = nock(DEEPL_FREE_API_URL)
        .post('/v2/translate', (body: Record<string, string>) => {
          expect(body['translation_memory_id']).toBe(TM_UUID);
          expect(body['translation_memory_threshold']).toBe('80');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        translationMemory: TM_UUID,
        tmThreshold: 80,
        cache: false,
      };

      await handler.translateText('Hi', options);

      expect(nock.pendingMocks()).not.toContain(
        `GET ${DEEPL_FREE_API_URL}:443/v3/translation_memories`
      );
      expect(translateScope.isDone()).toBe(true);
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('omit-both — no TM flags', () => {
    it('sends neither translation_memory_id nor translation_memory_threshold', async () => {
      const translateScope = nock(DEEPL_FREE_API_URL)
        .post('/v2/translate', (body: Record<string, string>) => {
          expect(body['translation_memory_id']).toBeUndefined();
          expect(body['translation_memory_threshold']).toBeUndefined();
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        cache: false,
      };

      await handler.translateText('Hi', options);

      expect(translateScope.isDone()).toBe(true);
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('glossary + translation memory on the same call', () => {
    it('sends both glossary_id and translation_memory_id in one request', async () => {
      const glossaryListScope = nock(DEEPL_FREE_API_URL)
        .get('/v3/glossaries')
        .reply(200, {
          glossaries: [
            {
              glossary_id: GLOSSARY_UUID,
              name: 'my-glossary',
              ready: true,
              creation_time: '2026-04-19T00:00:00Z',
              dictionaries: [
                { source_lang: 'EN', target_lang: 'DE', entry_count: 1 },
              ],
            },
          ],
        });

      const tmListScope = nock(DEEPL_FREE_API_URL)
        .get('/v3/translation_memories')
        .reply(200, {
          translation_memories: [
            {
              translation_memory_id: TM_UUID,
              name: 'my-tm',
              source_language: 'en',
              target_languages: ['de'],
            },
          ],
        });

      const translateScope = nock(DEEPL_FREE_API_URL)
        .post('/v2/translate', (body: Record<string, string>) => {
          expect(body['glossary_id']).toBe(GLOSSARY_UUID);
          expect(body['translation_memory_id']).toBe(TM_UUID);
          expect(body['translation_memory_threshold']).toBe('75');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        glossary: ['my-glossary'],
        translationMemory: 'my-tm',
        cache: false,
      };

      await handler.translateText('Hi', options);

      expect(glossaryListScope.isDone()).toBe(true);
      expect(tmListScope.isDone()).toBe(true);
      expect(translateScope.isDone()).toBe(true);
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('multiple glossaries on one call', () => {
    const SECOND_GLOSSARY_UUID = 'ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb';

    const mockGlossaryList = (): nock.Scope =>
      nock(DEEPL_FREE_API_URL)
        .get('/v3/glossaries')
        .reply(200, {
          glossaries: [
            {
              glossary_id: GLOSSARY_UUID,
              name: 'base-terms',
              ready: true,
              creation_time: '2026-04-19T00:00:00Z',
              dictionaries: [
                { source_lang: 'EN', target_lang: 'DE', entry_count: 1 },
              ],
            },
            {
              glossary_id: SECOND_GLOSSARY_UUID,
              name: 'project-overrides',
              ready: true,
              creation_time: '2026-04-19T00:00:00Z',
              dictionaries: [
                { source_lang: 'EN', target_lang: 'DE', entry_count: 1 },
              ],
            },
          ],
        });

    it('resolves each name and sends glossary_ids in the given order', async () => {
      const glossaryListScope = mockGlossaryList();

      const translateScope = nock(DEEPL_FREE_API_URL)
        .post('/v2/translate', (body: Record<string, unknown>) => {
          expect(body['glossary_ids']).toEqual([
            GLOSSARY_UUID,
            SECOND_GLOSSARY_UUID,
          ]);
          expect(body['glossary_id']).toBeUndefined();
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        glossary: ['base-terms', 'project-overrides'],
        cache: false,
      };

      await handler.translateText('Hi', options);

      expect(glossaryListScope.isDone()).toBe(true);
      expect(translateScope.isDone()).toBe(true);
      expect(nock.isDone()).toBe(true);
    });

    it('preserves the reversed order, which selects the other winning glossary', async () => {
      const glossaryListScope = mockGlossaryList();

      const translateScope = nock(DEEPL_FREE_API_URL)
        .post('/v2/translate', (body: Record<string, unknown>) => {
          expect(body['glossary_ids']).toEqual([
            SECOND_GLOSSARY_UUID,
            GLOSSARY_UUID,
          ]);
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        glossary: ['project-overrides', 'base-terms'],
        cache: false,
      };

      await handler.translateText('Hi', options);

      expect(glossaryListScope.isDone()).toBe(true);
      expect(translateScope.isDone()).toBe(true);
      expect(nock.isDone()).toBe(true);
    });

    it('still sends singular glossary_id for one glossary', async () => {
      const glossaryListScope = mockGlossaryList();

      const translateScope = nock(DEEPL_FREE_API_URL)
        .post('/v2/translate', (body: Record<string, unknown>) => {
          expect(body['glossary_id']).toBe(GLOSSARY_UUID);
          expect(body['glossary_ids']).toBeUndefined();
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        glossary: ['base-terms'],
        cache: false,
      };

      await handler.translateText('Hi', options);

      expect(glossaryListScope.isDone()).toBe(true);
      expect(translateScope.isDone()).toBe(true);
      expect(nock.isDone()).toBe(true);
    });

    it('accepts a mix of names and UUIDs', async () => {
      const glossaryListScope = mockGlossaryList();

      const translateScope = nock(DEEPL_FREE_API_URL)
        .post('/v2/translate', (body: Record<string, unknown>) => {
          expect(body['glossary_ids']).toEqual([
            SECOND_GLOSSARY_UUID,
            GLOSSARY_UUID,
          ]);
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        glossary: [SECOND_GLOSSARY_UUID, 'base-terms'],
        cache: false,
      };

      await handler.translateText('Hi', options);

      expect(glossaryListScope.isDone()).toBe(true);
      expect(translateScope.isDone()).toBe(true);
      expect(nock.isDone()).toBe(true);
    });

    it('fails when one of several glossary names does not exist', async () => {
      const glossaryListScope = mockGlossaryList();

      const options: TranslateOptions = {
        to: 'de',
        from: 'en',
        glossary: ['base-terms', 'no-such-glossary'],
        cache: false,
      };

      await expect(handler.translateText('Hi', options)).rejects.toThrow(
        /no-such-glossary/
      );
      expect(glossaryListScope.isDone()).toBe(true);
    });
  });
});
