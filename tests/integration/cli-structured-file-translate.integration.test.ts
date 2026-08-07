/**
 * Integration Tests for Structured File (JSON/YAML) Translation
 * Tests both CLI argument validation (via subprocess) and service-level integration (in-process)
 */

import * as fs from 'fs';
import * as path from 'path';
import nock from 'nock';
import { TranslationService } from '../../src/services/translation';
import { FileTranslationService } from '../../src/services/file-translation';
import { DeepLClient } from '../../src/api/deepl-client';
import { ConfigService } from '../../src/storage/config';
import { CacheService } from '../../src/storage/cache';
import {
  createTestConfigDir,
  createTestDir,
  DEEPL_FREE_API_URL,
} from '../helpers';

describe('Structured File Translation service integration', () => {
  const testConfig = createTestConfigDir('test-structured');
  const testFiles = createTestDir('structured-files');
  const testDir = testFiles.path;
  beforeAll(() => {
    fs.writeFileSync(
      path.join(testConfig.path, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'test-api-key-123' },
        api: { baseUrl: 'https://api-free.deepl.com/v2', usePro: false },
        defaults: {
          sourceLang: undefined,
          targetLangs: [],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: { enabled: false, maxSize: 1073741824, ttl: 2592000 },
      })
    );
  });

  afterAll(() => {
    nock.cleanAll();
    testConfig.cleanup();
    testFiles.cleanup();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('service-level integration (in-process with nock)', () => {
    const API_KEY = 'test-api-key-123:fx';
    const FREE_API_URL = DEEPL_FREE_API_URL;
    let fileTranslationService: FileTranslationService;
    let cacheService: CacheService;
    let client: DeepLClient;

    beforeEach(() => {
      const svcDir = path.join(testDir, `svc-${Date.now()}`);
      fs.mkdirSync(svcDir, { recursive: true });
      const configPath = path.join(svcDir, 'config.json');
      const cachePath = path.join(svcDir, 'cache.db');
      const config = new ConfigService(configPath);
      cacheService = new CacheService({
        dbPath: cachePath,
        maxSize: 1024 * 100,
      });
      client = new DeepLClient(API_KEY);
      const translationService = new TranslationService(
        client,
        config,
        cacheService
      );
      fileTranslationService = new FileTranslationService(translationService);
    });

    afterEach(() => {
      client.destroy();
      try {
        cacheService.close();
      } catch {
        /* ignore */
      }
    });

    it('should translate flat JSON file via FileTranslationService', async () => {
      const inputPath = path.join(testDir, 'svc-en.json');
      const outputPath = path.join(testDir, 'svc-es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            greeting: 'Hello',
            farewell: 'Goodbye',
          },
          null,
          2
        )
      );

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: [
            { text: 'Hola', detected_source_language: 'EN' },
            { text: 'Adiós', detected_source_language: 'EN' },
          ],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'es',
      });

      const result = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(result.greeting).toBe('Hola');
      expect(result.farewell).toBe('Adiós');
    });

    it('should write an empty value back unchanged without sending it', async () => {
      const inputPath = path.join(testDir, 'svc-empty-en.json');
      const outputPath = path.join(testDir, 'svc-empty-de.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            title: 'Hello world',
            placeholder: '',
            footer: 'Goodbye',
          },
          null,
          2
        )
      );

      let sentTexts: string[] = [];
      nock(FREE_API_URL)
        .post('/v2/translate', (body: Record<string, unknown>) => {
          sentTexts = body['text'] as string[];
          return true;
        })
        .reply(200, {
          translations: [
            { text: 'Hallo Welt', detected_source_language: 'EN' },
            { text: 'Auf Wiedersehen', detected_source_language: 'EN' },
          ],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'de',
      });

      expect(sentTexts).toEqual(['Hello world', 'Goodbye']);
      expect(JSON.parse(fs.readFileSync(outputPath, 'utf-8'))).toEqual({
        title: 'Hallo Welt',
        placeholder: '',
        footer: 'Auf Wiedersehen',
      });
    });

    it('should surface a rate limit on the second request as exit code 3', async () => {
      const inputPath = path.join(testDir, 'svc-partial-en.json');
      const outputPath = path.join(testDir, 'svc-partial-de.json');

      const data: Record<string, string> = {};
      for (let i = 0; i < 60; i++) {
        data[`k${i}`] = `String number ${i}`;
      }
      fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: Object.values(data)
            .slice(0, 50)
            .map((v) => ({ text: `DE ${v}`, detected_source_language: 'EN' })),
        });
      nock(FREE_API_URL)
        .post('/v2/translate')
        .times(6)
        .reply(429, { message: 'Too many requests' });

      expect.assertions(3);
      try {
        await fileTranslationService.translateFile(inputPath, outputPath, {
          targetLang: 'de',
        });
      } catch (error) {
        expect((error as Error).message).not.toMatch(/Cannot read properties/);
        expect((error as { exitCode?: number }).exitCode).toBe(3);
      }
      expect(fs.existsSync(outputPath)).toBe(false);
    });

    it('should refuse to write a file when the endpoint reorders the batch', async () => {
      const inputPath = path.join(testDir, 'svc-reorder-en.json');
      const outputPath = path.join(testDir, 'svc-reorder-de.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            confirm_delete: 'Delete account permanently',
            cancel: 'Cancel',
            save: 'Save changes',
          },
          null,
          2
        )
      );

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: [
            { text: 'Cancel', detected_source_language: 'EN' },
            { text: 'Save changes', detected_source_language: 'EN' },
            {
              text: 'Delete account permanently',
              detected_source_language: 'EN',
            },
          ],
        });

      await expect(
        fileTranslationService.translateFile(inputPath, outputPath, {
          targetLang: 'de',
        })
      ).rejects.toThrow('returned the submitted texts in a different order');

      expect(fs.existsSync(outputPath)).toBe(false);
    });

    it('should translate nested JSON preserving structure', async () => {
      const inputPath = path.join(testDir, 'svc-nested.json');
      const outputPath = path.join(testDir, 'svc-nested-es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            nav: { home: 'Home', about: 'About' },
            footer: { copyright: 'All rights reserved' },
            version: 2,
          },
          null,
          2
        )
      );

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: [
            { text: 'Inicio', detected_source_language: 'EN' },
            { text: 'Acerca de', detected_source_language: 'EN' },
            {
              text: 'Todos los derechos reservados',
              detected_source_language: 'EN',
            },
          ],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'es',
      });

      const result = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(result.nav.home).toBe('Inicio');
      expect(result.nav.about).toBe('Acerca de');
      expect(result.footer.copyright).toBe('Todos los derechos reservados');
      expect(result.version).toBe(2);
    });

    it('should preserve JSON indentation', async () => {
      const inputPath = path.join(testDir, 'svc-indent.json');
      const outputPath = path.join(testDir, 'svc-indent-es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify({ key: 'Hello' }, null, 4) + '\n'
      );

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: 'Hola', detected_source_language: 'EN' }],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'es',
      });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('    "key"');
      expect(raw.endsWith('\n')).toBe(true);
    });

    it('should translate YAML file via FileTranslationService', async () => {
      const inputPath = path.join(testDir, 'svc-en.yaml');
      const outputPath = path.join(testDir, 'svc-es.yaml');

      fs.writeFileSync(inputPath, 'greeting: Hello\nfarewell: Goodbye\n');

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: [
            { text: 'Hola', detected_source_language: 'EN' },
            { text: 'Adiós', detected_source_language: 'EN' },
          ],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'es',
      });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('greeting: Hola');
      expect(raw).toContain('farewell: Adiós');
    });

    it('should preserve YAML comments', async () => {
      const inputPath = path.join(testDir, 'svc-comments.yaml');
      const outputPath = path.join(testDir, 'svc-comments-es.yaml');

      fs.writeFileSync(
        inputPath,
        ['# Main heading', 'greeting: Hello # inline', ''].join('\n')
      );

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: 'Hola', detected_source_language: 'EN' }],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'es',
      });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('# Main heading');
      expect(raw).toContain('# inline');
    });

    it('should send only string values to the API', async () => {
      const inputPath = path.join(testDir, 'svc-api-check.json');
      const outputPath = path.join(testDir, 'svc-api-check-es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            title: 'Hello World',
            count: 42,
          },
          null,
          2
        )
      );

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body: any) => {
          // text is sent as URL-encoded; nock parses it for us
          const texts = Array.isArray(body.text) ? body.text : [body.text];
          expect(texts).toEqual(['Hello World']);
          expect(body.target_lang).toBe('ES');
          return true;
        })
        .reply(200, {
          translations: [
            { text: 'Hola Mundo', detected_source_language: 'EN' },
          ],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'es',
      });
      expect(scope.isDone()).toBe(true);
    });

    it('should pass formality option through to API', async () => {
      const inputPath = path.join(testDir, 'svc-formality.json');
      const outputPath = path.join(testDir, 'svc-formality-es.json');

      fs.writeFileSync(inputPath, JSON.stringify({ msg: 'Hello' }, null, 2));

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body: any) => {
          expect(body.formality).toBe('more');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hallo', detected_source_language: 'EN' }],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'de',
        formality: 'more',
      });
      expect(scope.isDone()).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      const inputPath = path.join(testDir, 'svc-error.json');
      const outputPath = path.join(testDir, 'svc-error-es.json');

      fs.writeFileSync(inputPath, JSON.stringify({ key: 'Hello' }, null, 2));

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(403, { message: 'Forbidden' });

      await expect(
        fileTranslationService.translateFile(inputPath, outputPath, {
          targetLang: 'es',
        })
      ).rejects.toThrow();
    });

    it('should translate .yml files', async () => {
      const inputPath = path.join(testDir, 'svc-en.yml');
      const outputPath = path.join(testDir, 'svc-es.yml');

      fs.writeFileSync(inputPath, 'title: Welcome\n');

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: [
            { text: 'Bienvenido', detected_source_language: 'EN' },
          ],
        });

      await fileTranslationService.translateFile(inputPath, outputPath, {
        targetLang: 'es',
      });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('title: Bienvenido');
    });

    it('should translate file to multiple languages', async () => {
      const inputPath = path.join(testDir, 'svc-multi.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify({ greeting: 'Hello' }, null, 2)
      );

      nock(FREE_API_URL)
        .post('/v2/translate', (body: any) => body.target_lang === 'ES')
        .reply(200, {
          translations: [{ text: 'Hola', detected_source_language: 'EN' }],
        })
        .post('/v2/translate', (body: any) => body.target_lang === 'FR')
        .reply(200, {
          translations: [{ text: 'Bonjour', detected_source_language: 'EN' }],
        });

      const results = await fileTranslationService.translateFileToMultiple(
        inputPath,
        ['es', 'fr'],
        { outputDir: testDir }
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.targetLang).toBe('es');
      expect(results[1]?.targetLang).toBe('fr');

      const esResult = JSON.parse(
        fs.readFileSync(results[0]!.outputPath!, 'utf-8')
      );
      expect(esResult.greeting).toBe('Hola');
    });
  });
});
