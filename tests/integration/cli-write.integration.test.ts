/**
 * Integration Tests for Write CLI Command
 * Tests the DeepL Write API integration with text improvement workflows
 */

import nock from 'nock';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DeepLClient } from '../../src/api/deepl-client.js';
import { WriteService } from '../../src/services/write.js';
import { ConfigService } from '../../src/storage/config.js';
import { CacheService } from '../../src/storage/cache.js';
import { DEEPL_FREE_API_URL, TEST_API_KEY } from '../helpers';
import type { WritingStyle, WriteTone, WriteLanguage } from '../../src/types/api.js';

describe('Write Command Integration', () => {
  const API_KEY = TEST_API_KEY;
  const FREE_API_URL = DEEPL_FREE_API_URL;
  let client: DeepLClient;
  let writeService: WriteService;
  let configService: ConfigService;
  let cacheService: CacheService;
  const testDir = path.join(os.tmpdir(), `.deepl-cli-write-int-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const configPath = path.join(testDir, 'config.json');
    const cachePath = path.join(testDir, 'cache.db');
    configService = new ConfigService(configPath);
    cacheService = new CacheService({ dbPath: cachePath, maxSize: 1024 * 100 });
    client = new DeepLClient(API_KEY);
    writeService = new WriteService(client, configService, cacheService);
  });

  afterEach(() => {
    nock.cleanAll();
    try { cacheService.close(); } catch { /* ignore */ }
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('improve() - Basic Improvement', () => {
    it('should improve text with default settings', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.text).toBe('Hello world');
          expect(body.target_lang).toBe('en-US');
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Hello, world!', target_language: 'en-US' }],
        });

      const result = await writeService.improve('Hello world', { targetLang: 'en-US' });

      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe('Hello, world!');
      expect(scope.isDone()).toBe(true);
    });

    it('should return multiple improvement alternatives', async () => {
      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [
            { text: 'Hello, world!', target_language: 'en-US' },
            { text: 'Hi, world!', target_language: 'en-US' },
            { text: 'Greetings, world!', target_language: 'en-US' },
          ],
        });

      const result = await writeService.improve('Hello world', { targetLang: 'en-US' });

      expect(result).toHaveLength(3);
      expect(result[0]?.text).toBe('Hello, world!');
      expect(result[1]?.text).toBe('Hi, world!');
      expect(result[2]?.text).toBe('Greetings, world!');
    });

    it('should throw error for empty improvements array from API', async () => {
      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [],
        });

      await expect(
        writeService.improve('Perfect text', { targetLang: 'en-US' })
      ).rejects.toThrow('No improvements returned');
    });
  });

  describe('improve() - Language Auto-Detection', () => {
    it('should improve text without target_lang (auto-detect)', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.text).toBe('Hallo Welt');
          expect(body.target_lang).toBeUndefined();
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Hallo, Welt!', target_language: 'de', detected_source_language: 'de' }],
        });

      const result = await writeService.improve('Hallo Welt', {});

      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe('Hallo, Welt!');
      expect(result[0]?.detectedSourceLanguage).toBe('de');
      expect(scope.isDone()).toBe(true);
    });

    it('should still accept explicit target_lang', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.target_lang).toBe('en-GB');
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Hello, world!', target_language: 'en-GB' }],
        });

      const result = await writeService.improve('Hello world', { targetLang: 'en-GB' });

      expect(result[0]?.text).toBe('Hello, world!');
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('improve() - Writing Styles', () => {
    it.each([
      {
        style: 'business',
        input: 'I want to buy your product',
        output: 'I would like to purchase your product',
        expectedSubstring: 'I would like to purchase your product',
      },
      {
        style: 'casual',
        input: 'Thank you for contacting us',
        output: 'Hey! Thanks for reaching out!',
        expectedSubstring: 'Hey! Thanks for reaching out!',
      },
      {
        style: 'academic',
        input: 'The results show a connection',
        output: 'The findings demonstrate a significant correlation',
        expectedSubstring: 'demonstrate',
      },
      {
        style: 'simple',
        input: 'Utilize this functionality',
        output: 'Use this feature',
        expectedSubstring: undefined,
      },
    ])('should apply $style writing style', async ({ style, input, output, expectedSubstring }) => {
      const writingStyle = style as WritingStyle;
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBe(writingStyle);
          return true;
        })
        .reply(200, {
          improvements: [{ text: output, target_language: 'en-US' }],
        });

      const result = await writeService.improve(input, {
        targetLang: 'en-US',
        writingStyle,
      });

      if (expectedSubstring !== undefined) {
        expect(result[0]?.text).toContain(expectedSubstring);
      }
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('improve() - Tones', () => {
    it.each([
      {
        tone: 'friendly',
        input: 'We can help with that',
        output: 'We would love to help you with that!',
        expectedSubstring: 'love to help',
        checkNoWritingStyle: true,
      },
      {
        tone: 'confident',
        input: 'We hope to deliver on time',
        output: 'We will definitely deliver on time',
        expectedSubstring: 'will definitely',
        checkNoWritingStyle: false,
      },
      {
        tone: 'diplomatic',
        input: 'Your approach might not work',
        output: 'We respectfully suggest considering an alternative approach',
        expectedSubstring: undefined,
        checkNoWritingStyle: false,
      },
      {
        tone: 'enthusiastic',
        input: 'This is good news',
        output: 'This is fantastic news!',
        expectedSubstring: undefined,
        checkNoWritingStyle: false,
      },
    ])('should apply $tone tone', async ({ tone, input, output, expectedSubstring, checkNoWritingStyle }) => {
      const toneValue = tone as WriteTone;
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.tone).toBe(toneValue);
          if (checkNoWritingStyle) {
            expect(body.writing_style).toBeUndefined();
          }
          return true;
        })
        .reply(200, {
          improvements: [{ text: output, target_language: 'en-US' }],
        });

      const result = await writeService.improve(input, {
        targetLang: 'en-US',
        tone: toneValue,
      });

      if (expectedSubstring !== undefined) {
        expect(result[0]?.text).toContain(expectedSubstring);
      }
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('improve() - Different Languages', () => {
    it.each([
      {
        lang: 'de',
        label: 'German',
        input: 'Ich möchte das kaufen',
        output: 'Ich würde das gerne kaufen',
        expectedExact: 'Ich würde das gerne kaufen',
      },
      {
        lang: 'fr',
        label: 'French',
        input: 'Je veux acheter ça',
        output: 'Je voudrais acheter cela',
        expectedExact: undefined,
      },
      {
        lang: 'es',
        label: 'Spanish',
        input: 'Quiero comprar esto',
        output: 'Me gustaría comprar esto',
        expectedExact: undefined,
      },
      {
        lang: 'en-GB',
        label: 'British English',
        input: 'I want to buy this',
        output: 'I should like to purchase this item',
        expectedExact: undefined,
      },
    ])('should improve $label text', async ({ lang, input, output, expectedExact }) => {
      const targetLang = lang as WriteLanguage;
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.target_lang).toBe(targetLang);
          return true;
        })
        .reply(200, {
          improvements: [{ text: output, target_language: targetLang }],
        });

      const result = await writeService.improve(input, { targetLang });

      if (expectedExact !== undefined) {
        expect(result[0]?.text).toBe(expectedExact);
      }
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('improve() - Error Handling', () => {
    it('should throw error for empty text', async () => {
      await expect(writeService.improve('', { targetLang: 'en-US' })).rejects.toThrow(
        'Text cannot be empty'
      );
    });

    it('should throw error when both style and tone are specified', async () => {
      await expect(
        writeService.improve('Test', {
          targetLang: 'en-US',
          writingStyle: 'business',
          tone: 'friendly',
        })
      ).rejects.toThrow('Cannot specify both writing_style and tone');
    });

    it('should handle 403 authentication errors', async () => {
      nock(FREE_API_URL).post('/v2/write/rephrase').reply(403, { message: 'Invalid API key' });

      await expect(
        writeService.improve('Test', { targetLang: 'en-US' })
      ).rejects.toThrow('Authentication failed');
    });

    it('should handle 456 quota exceeded errors', async () => {
      nock(FREE_API_URL).post('/v2/write/rephrase').reply(456, { message: 'Quota exceeded' });

      await expect(
        writeService.improve('Test', { targetLang: 'en-US' })
      ).rejects.toThrow('Quota exceeded');
    });

    it('should handle 429 rate limit errors', async () => {
      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .times(4)
        .reply(429, { message: 'Too many requests' });

      await expect(
        writeService.improve('Test', { targetLang: 'en-US' })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle network errors', async () => {
      const noRetryClient = new DeepLClient(API_KEY, { maxRetries: 0 });
      const noRetryWriteService = new WriteService(noRetryClient, configService, cacheService);

      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .replyWithError('Network error');

      await expect(
        noRetryWriteService.improve('Test', { targetLang: 'en-US' })
      ).rejects.toThrow();
    });
  });

  describe('improve() - Edge Cases', () => {
    it('should handle very long text', async () => {
      const longText = 'This is a sentence. '.repeat(100); // ~2000 chars

      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.text).toBe(longText);
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Improved text', target_language: 'en-US' }],
        });

      await writeService.improve(longText, { targetLang: 'en-US' });
      expect(scope.isDone()).toBe(true);
    });

    it('should handle special characters', async () => {
      const specialText = 'Hello! @#$%^&*() <>"{}[]';

      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.text).toBe(specialText);
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Improved text!', target_language: 'en-US' }],
        });

      await writeService.improve(specialText, { targetLang: 'en-US' });
      expect(scope.isDone()).toBe(true);
    });

    it('should handle Unicode characters', async () => {
      const unicodeText = 'Hello 世界 🌍 café';

      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.text).toBe(unicodeText);
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Hello, 世界 🌍 café!', target_language: 'en-US' }],
        });

      const result = await writeService.improve(unicodeText, { targetLang: 'en-US' });
      expect(result[0]?.text).toContain('世界');
      expect(result[0]?.text).toContain('🌍');
      expect(scope.isDone()).toBe(true);
    });

    it('should preserve newlines in improved text', async () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';

      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [
            {
              text: 'First line\nSecond line\nThird line',
              target_language: 'en-US',
            },
          ],
        });

      const result = await writeService.improve(multilineText, { targetLang: 'en-US' });
      expect(result[0]?.text).toContain('\n');
      expect(result[0]?.text.split('\n')).toHaveLength(3);
    });
  });

  describe('getBestImprovement()', () => {
    it('should return the first improvement', async () => {
      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [
            { text: 'First improvement', target_language: 'en-US' },
            { text: 'Second improvement', target_language: 'en-US' },
          ],
        });

      const result = await writeService.getBestImprovement('Test text', {
        targetLang: 'en-US',
      });

      expect(result.text).toBe('First improvement');
    });

    it('should throw error when no improvements returned from API', async () => {
      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [],
        });

      await expect(
        writeService.getBestImprovement('Test', { targetLang: 'en-US' })
      ).rejects.toThrow('No improvements returned');
    });
  });

  describe('prefer_ prefix styles', () => {
    it('should apply prefer_simple writing style', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBe('prefer_simple');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'Use this',
              target_language: 'en-US',
            },
          ],
        });

      await writeService.improve('Utilize this', {
        targetLang: 'en-US',
        writingStyle: 'prefer_simple',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should apply prefer_enthusiastic tone', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.tone).toBe('prefer_enthusiastic');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'This is amazing!',
              target_language: 'en-US',
            },
          ],
        });

      await writeService.improve('This is good', {
        targetLang: 'en-US',
        tone: 'prefer_enthusiastic',
      });

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('caching', () => {
    it('should return cached result on second call without hitting API', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .once()
        .reply(200, {
          improvements: [{ text: 'Improved!', target_language: 'en-US' }],
        });

      const result1 = await writeService.improve('Test', { targetLang: 'en-US' });
      const result2 = await writeService.improve('Test', { targetLang: 'en-US' });

      expect(result1).toEqual(result2);
      expect(scope.isDone()).toBe(true);
    });

    it('should bypass cache when skipCache is true', async () => {
      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .twice()
        .reply(200, {
          improvements: [{ text: 'Improved!', target_language: 'en-US' }],
        });

      await writeService.improve('Test', { targetLang: 'en-US' });
      await writeService.improve('Test', { targetLang: 'en-US' }, { skipCache: true });

      expect(nock.isDone()).toBe(true);
    });

    it('should cache different styles separately', async () => {
      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [{ text: 'Business text', target_language: 'en-US' }],
        });

      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [{ text: 'Casual text', target_language: 'en-US' }],
        });

      const business = await writeService.improve('Test', { targetLang: 'en-US', writingStyle: 'business' });
      const casual = await writeService.improve('Test', { targetLang: 'en-US', writingStyle: 'casual' });

      expect(business[0]?.text).toBe('Business text');
      expect(casual[0]?.text).toBe('Casual text');
      expect(nock.isDone()).toBe(true);
    });
  });
});
