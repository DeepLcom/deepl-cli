/**
 * Tests for DeepL API Client
 * Following TDD approach - these tests should fail initially
 */

import nock from 'nock';
import { DeepLClient } from '../../src/api/deepl-client';

describe('DeepLClient', () => {
  let client: DeepLClient;
  const apiKey = 'test-api-key';
  const baseUrl = 'https://api-free.deepl.com';

  beforeAll(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  beforeEach(() => {
    client = new DeepLClient(apiKey);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  describe('initialization', () => {
    it('should create a DeepLClient instance', () => {
      expect(client).toBeInstanceOf(DeepLClient);
    });

    it('should use free API endpoint by default', () => {
      const freeClient = new DeepLClient('test-key');
      expect(freeClient).toBeDefined();
    });

    it('should use pro API endpoint when specified', () => {
      const proClient = new DeepLClient('test-key', { usePro: true });
      expect(proClient).toBeDefined();
    });

    it('should throw error for invalid API key', () => {
      expect(() => {
        new DeepLClient('');
      }).toThrow('API key is required');
    });
  });

  describe('translate()', () => {
    it('should translate text successfully', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(200, {
          translations: [
            {
              detected_source_language: 'EN',
              text: 'Hola',
            },
          ],
        });

      const result = await client.translate('Hello', {
        targetLang: 'es',
      });

      expect(result.text).toBe('Hola');
      expect(result.detectedSourceLang).toBe('en');
    });

    it('should include source language when specified', async () => {
      nock(baseUrl)
        .post('/v2/translate', (body) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return body.source_lang === 'EN';
        })
        .reply(200, {
          translations: [
            {
              detected_source_language: 'EN',
              text: 'Hola',
            },
          ],
        });

      await client.translate('Hello', {
        sourceLang: 'en',
        targetLang: 'es',
      });

      expect(nock.isDone()).toBe(true);
    });

    it('should handle formality parameter', async () => {
      nock(baseUrl)
        .post('/v2/translate', (body) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return body.formality === 'more';
        })
        .reply(200, {
          translations: [{ text: 'Buenos días' }],
        });

      const result = await client.translate('Good morning', {
        targetLang: 'es',
        formality: 'more',
      });

      expect(result.text).toBe('Buenos días');
    });

    it('should handle glossary parameter', async () => {
      nock(baseUrl)
        .post('/v2/translate', (body) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return body.glossary_id === 'glossary-123';
        })
        .reply(200, {
          translations: [{ text: 'API REST' }],
        });

      await client.translate('REST API', {
        targetLang: 'es',
        glossaryId: 'glossary-123',
      });

      expect(nock.isDone()).toBe(true);
    });

    it('should handle preserve_formatting option', async () => {
      nock(baseUrl)
        .post('/v2/translate', (body) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return body.preserve_formatting === '1';
        })
        .reply(200, {
          translations: [{ text: 'Hola\nmundo' }],
        });

      await client.translate('Hello\nworld', {
        targetLang: 'es',
        preserveFormatting: true,
      });

      expect(nock.isDone()).toBe(true);
    });

    it('should handle context parameter', async () => {
      nock(baseUrl)
        .post('/v2/translate', (body) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return body.context === 'API documentation';
        })
        .reply(200, {
          translations: [{ text: 'Punto final' }],
        });

      await client.translate('Endpoint', {
        targetLang: 'es',
        context: 'API documentation',
      });

      expect(nock.isDone()).toBe(true);
    });

    it('should handle split_sentences parameter', async () => {
      nock(baseUrl)
        .post('/v2/translate', (body) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return body.split_sentences === 'nonewlines';
        })
        .reply(200, {
          translations: [{ text: 'Texto traducido' }],
        });

      await client.translate('Translated text', {
        targetLang: 'es',
        splitSentences: 'nonewlines',
      });

      expect(nock.isDone()).toBe(true);
    });

    it('should handle tag_handling parameter', async () => {
      nock(baseUrl)
        .post('/v2/translate', (body) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return body.tag_handling === 'xml';
        })
        .reply(200, {
          translations: [{ text: '<p>Hola</p>' }],
        });

      await client.translate('<p>Hello</p>', {
        targetLang: 'es',
        tagHandling: 'xml',
      });

      expect(nock.isDone()).toBe(true);
    });

    it('should throw error for invalid target language', async () => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        client.translate('Hello', { targetLang: 'invalid' as any })
      ).rejects.toThrow();
    });

    it('should throw error for empty text', async () => {
      await expect(
        client.translate('', { targetLang: 'es' })
      ).rejects.toThrow('Text cannot be empty');
    });
  });

  describe('error handling', () => {
    it('should handle 403 authentication error', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(403, {
          message: 'Authorization failed',
        });

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('Authentication failed');
    });

    it('should handle 456 quota exceeded error', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(456, {
          message: 'Quota exceeded',
        });

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('Quota exceeded');
    });

    it('should handle 429 rate limit error', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(429, {
          message: 'Too many requests',
        });

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle 503 service unavailable', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .times(4) // Should retry 3 times + initial = 4 requests total
        .reply(503, {
          message: 'Service temporarily unavailable',
        });

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('Service temporarily unavailable');
    });

    it('should handle network errors', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .times(4) // Should retry 3 times + initial = 4 requests total
        .replyWithError('Network error');

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('Network error');
    });

    it('should handle invalid JSON response', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(200, 'Invalid JSON');

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow();
    });

    it('should handle missing translations in response', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(200, {});

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('No translation returned');
    });
  });

  describe('getUsage()', () => {
    it('should return usage statistics', async () => {
      nock(baseUrl)
        .get('/v2/usage')
        .reply(200, {
          character_count: 12345,
          character_limit: 500000,
        });

      const usage = await client.getUsage();

      expect(usage.characterCount).toBe(12345);
      expect(usage.characterLimit).toBe(500000);
    });

    it('should handle usage API errors', async () => {
      nock(baseUrl)
        .get('/v2/usage')
        .reply(403);

      await expect(client.getUsage()).rejects.toThrow();
    });
  });

  describe('getSupportedLanguages()', () => {
    it('should return supported source languages', async () => {
      nock(baseUrl)
        .get('/v2/languages')
        .query({ type: 'source' })
        .reply(200, [
          { language: 'EN', name: 'English' },
          { language: 'ES', name: 'Spanish' },
        ]);

      const languages = await client.getSupportedLanguages('source');

      expect(languages).toHaveLength(2);
      expect(languages[0]?.language).toBe('en');
      expect(languages[0]?.name).toBe('English');
    });

    it('should return supported target languages', async () => {
      nock(baseUrl)
        .get('/v2/languages')
        .query({ type: 'target' })
        .reply(200, [
          { language: 'ES', name: 'Spanish' },
          { language: 'FR', name: 'French' },
        ]);

      const languages = await client.getSupportedLanguages('target');

      expect(languages).toHaveLength(2);
      expect(languages[0]?.language).toBe('es');
    });

    it('should handle language API errors', async () => {
      nock(baseUrl)
        .get('/v2/languages')
        .query({ type: 'source' })
        .reply(500);

      await expect(
        client.getSupportedLanguages('source')
      ).rejects.toThrow();
    });
  });

  describe('retry logic', () => {
    it('should retry on transient failures', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(503)
        .post('/v2/translate')
        .reply(503)
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      const result = await client.translate('Hello', { targetLang: 'es' });

      expect(result.text).toBe('Hola');
    });

    it('should give up after max retries', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .times(4)
        .reply(503);

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow();
    });

    it('should not retry on 4xx errors', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(400, { message: 'Bad request' });

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow();

      expect(nock.isDone()).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limits', async () => {
      const requests: number[] = [];

      nock(baseUrl)
        .post('/v2/translate')
        .times(5)
        .reply(200, () => {
          requests.push(Date.now());
          return { translations: [{ text: 'Hola' }] };
        });

      const promises = Array(5)
        .fill(null)
        .map(() => client.translate('Hello', { targetLang: 'es' }));

      await Promise.all(promises);

      expect(requests).toHaveLength(5);
    });
  });

  describe('edge cases', () => {
    it('should handle very long text', async () => {
      const longText = 'a'.repeat(50000);

      nock(baseUrl)
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: 'a'.repeat(50000) }],
        });

      const result = await client.translate(longText, { targetLang: 'es' });

      expect(result.text.length).toBe(50000);
    });

    it('should handle special characters', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: '¡Hola! ¿Cómo estás?' }],
        });

      const result = await client.translate('Hello! How are you?', {
        targetLang: 'es',
      });

      expect(result.text).toContain('¡');
      expect(result.text).toContain('¿');
    });

    it('should handle newlines and whitespace', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: 'Línea 1\n\nLínea 2' }],
        });

      const result = await client.translate('Line 1\n\nLine 2', {
        targetLang: 'es',
      });

      expect(result.text).toContain('\n\n');
    });

    it('should handle unicode characters', async () => {
      nock(baseUrl)
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: '你好世界 🌍' }],
        });

      const result = await client.translate('Hello world', {
        targetLang: 'zh',
      });

      expect(result.text).toContain('你好');
      expect(result.text).toContain('🌍');
    });
  });

  describe('configuration', () => {
    it('should allow custom timeout', () => {
      const customClient = new DeepLClient(apiKey, { timeout: 5000 });
      expect(customClient).toBeDefined();
    });

    it('should allow custom max retries', () => {
      const customClient = new DeepLClient(apiKey, { maxRetries: 5 });
      expect(customClient).toBeDefined();
    });

    it('should allow custom base URL', () => {
      const customClient = new DeepLClient(apiKey, {
        baseUrl: 'https://custom.api.com',
      });
      expect(customClient).toBeDefined();
    });
  });
});
