/**
 * Integration Tests for DeepL Client
 * Tests HTTP request/response handling with mocked DeepL API using nock
 * This validates that the client correctly formats requests and parses responses
 */

import nock from 'nock';
import { DeepLClient } from '../../src/api/deepl-client.js';

describe('DeepLClient Integration', () => {
  const API_KEY = 'test-api-key-123:fx';
  const FREE_API_URL = 'https://api-free.deepl.com';
  const PRO_API_URL = 'https://api.deepl.com';

  afterEach(() => {
    // Clean up nock mocks after each test
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should create client with API key', () => {
      const client = new DeepLClient(API_KEY);
      expect(client).toBeInstanceOf(DeepLClient);
    });

    it('should throw error for empty API key', () => {
      expect(() => new DeepLClient('')).toThrow('API key is required');
    });

    it('should use free API URL by default', () => {
      // This is implicitly tested by checking which URL nock intercepts
      const client = new DeepLClient(API_KEY);
      expect(client).toBeDefined();
    });

    it('should use pro API URL when usePro is true', () => {
      const client = new DeepLClient(API_KEY, { usePro: true });
      expect(client).toBeDefined();
    });

    it('should use custom baseUrl when provided', () => {
      const client = new DeepLClient(API_KEY, { baseUrl: 'https://custom-api.example.com' });
      expect(client).toBeDefined();
    });
  });

  describe('translate()', () => {
    it('should make correct HTTP POST request for translation', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body) => {
          // Verify request body (nock parses form-encoded to object)
          expect(body.text).toBe('Hello');
          expect(body.target_lang).toBe('ES');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hola', detected_source_language: 'EN' }],
        });

      const result = await client.translate('Hello', { targetLang: 'es' });

      expect(result.text).toBe('Hola');
      expect(result.detectedSourceLang).toBe('en');
      expect(scope.isDone()).toBe(true);
    });

    it('should include source language when specified', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body) => {
          expect(body.source_lang).toBe('EN');
          expect(body.target_lang).toBe('ES');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      await client.translate('Hello', { targetLang: 'es', sourceLang: 'en' });
      expect(scope.isDone()).toBe(true);
    });

    it('should include formality when specified', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body) => {
          expect(body.formality).toBe('more');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      await client.translate('Hello', { targetLang: 'es', formality: 'more' });
      expect(scope.isDone()).toBe(true);
    });

    it('should include context when specified', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body) => {
          expect(body.context).toBe('This is a greeting');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      await client.translate('Hello', { targetLang: 'es', context: 'This is a greeting' });
      expect(scope.isDone()).toBe(true);
    });

    it('should include splitSentences when specified', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body) => {
          expect(body.split_sentences).toBe('nonewlines');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      await client.translate('Hello', { targetLang: 'es', splitSentences: 'nonewlines' });
      expect(scope.isDone()).toBe(true);
    });

    it('should include tagHandling when specified', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body) => {
          expect(body.tag_handling).toBe('xml');
          return true;
        })
        .reply(200, {
          translations: [{ text: '<p>Hola</p>' }],
        });

      await client.translate('<p>Hello</p>', { targetLang: 'es', tagHandling: 'xml' });
      expect(scope.isDone()).toBe(true);
    });

    it('should include modelType when specified', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/translate', (body) => {
          expect(body.model_type).toBe('quality_optimized');
          return true;
        })
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      await client.translate('Hello', { targetLang: 'es', modelType: 'quality_optimized' });
      expect(scope.isDone()).toBe(true);
    });

    it('should use correct Authorization header', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL, {
        reqheaders: {
          'authorization': `DeepL-Auth-Key ${API_KEY}`,
        },
      })
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      await client.translate('Hello', { targetLang: 'es' });
      expect(scope.isDone()).toBe(true);
    });

    it('should use form-encoded content type', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL, {
        reqheaders: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      await client.translate('Hello', { targetLang: 'es' });
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 403 authentication errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(403, { message: 'Authorization failed' });

      await expect(client.translate('Hello', { targetLang: 'es' })).rejects.toThrow(
        'Authentication failed: Invalid API key'
      );
    });

    it('should handle 456 quota exceeded errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(456, { message: 'Quota exceeded' });

      await expect(client.translate('Hello', { targetLang: 'es' })).rejects.toThrow(
        'Quota exceeded: Character limit reached'
      );
    });

    it('should handle 429 rate limit errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(429, { message: 'Too many requests' });

      await expect(client.translate('Hello', { targetLang: 'es' })).rejects.toThrow(
        'Rate limit exceeded: Too many requests'
      );
    });

    it('should handle 503 service unavailable errors', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 2 });

      // Mock all retry attempts (initial + 2 retries = 3 total)
      nock(FREE_API_URL).post('/v2/translate').reply(503, { message: 'Service temporarily unavailable' });
      nock(FREE_API_URL).post('/v2/translate').reply(503, { message: 'Service temporarily unavailable' });
      nock(FREE_API_URL).post('/v2/translate').reply(503, { message: 'Service temporarily unavailable' });

      await expect(client.translate('Hello', { targetLang: 'es' })).rejects.toThrow(
        'Service temporarily unavailable: Please try again later'
      );
    });

    it('should handle network timeouts', async () => {
      const client = new DeepLClient(API_KEY, { timeout: 100 });

      nock(FREE_API_URL)
        .post('/v2/translate')
        .delayConnection(200)
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      await expect(client.translate('Hello', { targetLang: 'es' })).rejects.toThrow();
    });

    it('should handle malformed API responses', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL).post('/v2/translate').reply(200, { invalid: 'response' });

      await expect(client.translate('Hello', { targetLang: 'es' })).rejects.toThrow(
        'No translation returned'
      );
    });

    it('should throw error for empty text', async () => {
      const client = new DeepLClient(API_KEY);

      await expect(client.translate('', { targetLang: 'es' })).rejects.toThrow('Text cannot be empty');
    });

    it('should retry on 500 errors', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 2 });

      // First two attempts fail with 500, third succeeds
      nock(FREE_API_URL).post('/v2/translate').reply(500, 'Internal Server Error');
      nock(FREE_API_URL).post('/v2/translate').reply(500, 'Internal Server Error');
      nock(FREE_API_URL)
        .post('/v2/translate')
        .reply(200, {
          translations: [{ text: 'Hola' }],
        });

      const result = await client.translate('Hello', { targetLang: 'es' });
      expect(result.text).toBe('Hola');
    });

    it('should NOT retry on 4xx errors', async () => {
      const client = new DeepLClient(API_KEY, { maxRetries: 2 });

      // Only one request should be made for 4xx errors
      const scope = nock(FREE_API_URL).post('/v2/translate').reply(403, 'Forbidden');

      await expect(client.translate('Hello', { targetLang: 'es' })).rejects.toThrow(
        'Authentication failed'
      );

      expect(scope.isDone()).toBe(true);
      // No additional retries should have been attempted
      expect(nock.pendingMocks().length).toBe(0);
    });
  });

  describe('getUsage()', () => {
    it('should make correct HTTP GET request for usage', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .get('/v2/usage')
        .reply(200, {
          character_count: 200000,
          character_limit: 500000,
        });

      const result = await client.getUsage();

      expect(result.characterCount).toBe(200000);
      expect(result.characterLimit).toBe(500000);
      expect(scope.isDone()).toBe(true);
    });

    it('should parse usage response correctly', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .get('/v2/usage')
        .reply(200, {
          character_count: 12345,
          character_limit: 50000,
        });

      const result = await client.getUsage();

      expect(result.characterCount).toBe(12345);
      expect(result.characterLimit).toBe(50000);
    });

    it('should handle authentication errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL).get('/v2/usage').reply(403, { message: 'Invalid API key' });

      await expect(client.getUsage()).rejects.toThrow('Authentication failed');
    });
  });

  describe('getSupportedLanguages()', () => {
    it('should make correct HTTP GET request for source languages', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .get('/v2/languages')
        .query({ type: 'source' })
        .reply(200, [
          { language: 'EN', name: 'English' },
          { language: 'DE', name: 'German' },
        ]);

      const result = await client.getSupportedLanguages('source');

      expect(result).toEqual([
        { language: 'en', name: 'English' },
        { language: 'de', name: 'German' },
      ]);
      expect(scope.isDone()).toBe(true);
    });

    it('should make correct HTTP GET request for target languages', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .get('/v2/languages')
        .query({ type: 'target' })
        .reply(200, [
          { language: 'ES', name: 'Spanish' },
          { language: 'FR', name: 'French' },
        ]);

      const result = await client.getSupportedLanguages('target');

      expect(result).toEqual([
        { language: 'es', name: 'Spanish' },
        { language: 'fr', name: 'French' },
      ]);
      expect(scope.isDone()).toBe(true);
    });

    it('should normalize language codes to lowercase', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .get('/v2/languages')
        .query({ type: 'source' })
        .reply(200, [{ language: 'EN-US', name: 'English (American)' }]);

      const result = await client.getSupportedLanguages('source');

      expect(result[0]?.language).toBe('en-us');
    });
  });

  describe('improveText() - Write API', () => {
    it('should make correct HTTP POST request for text improvement', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.text).toBe('Hello world');
          expect(body.target_lang).toBe('en-US');
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Hello, world!', target_language: 'en-US' }],
        });

      const result = await client.improveText('Hello world', { targetLang: 'en-US' });

      expect(result[0]?.text).toBe('Hello, world!');
      expect(result[0]?.targetLanguage).toBe('en-US');
      expect(scope.isDone()).toBe(true);
    });

    it('should include writing style when specified', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBe('business');
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Improved text', target_language: 'en-US' }],
        });

      await client.improveText('Test', { targetLang: 'en-US', writingStyle: 'business' });
      expect(scope.isDone()).toBe(true);
    });

    it('should include tone when specified', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.tone).toBe('friendly');
          return true;
        })
        .reply(200, {
          improvements: [{ text: 'Improved text', target_language: 'en-US' }],
        });

      await client.improveText('Test', { targetLang: 'en-US', tone: 'friendly' });
      expect(scope.isDone()).toBe(true);
    });

    it('should throw error when both style and tone are specified', async () => {
      const client = new DeepLClient(API_KEY);

      await expect(
        client.improveText('Test', {
          targetLang: 'en-US',
          writingStyle: 'business',
          tone: 'friendly',
        })
      ).rejects.toThrow('Cannot specify both writing_style and tone');
    });

    it('should throw error for empty text', async () => {
      const client = new DeepLClient(API_KEY);

      await expect(client.improveText('', { targetLang: 'en-US' })).rejects.toThrow(
        'Text cannot be empty'
      );
    });
  });

  describe('custom API URLs', () => {
    it('should use custom baseUrl when provided', async () => {
      const customUrl = 'https://custom-api.example.com';
      const client = new DeepLClient(API_KEY, { baseUrl: customUrl });

      const scope = nock(customUrl)
        .get('/v2/usage')
        .reply(200, {
          character_count: 100,
          character_limit: 500,
        });

      await client.getUsage();
      expect(scope.isDone()).toBe(true);
    });

    it('should use pro API URL when usePro is true', async () => {
      const client = new DeepLClient(API_KEY, { usePro: true });

      const scope = nock(PRO_API_URL)
        .get('/v2/usage')
        .reply(200, {
          character_count: 100,
          character_limit: 500,
        });

      await client.getUsage();
      expect(scope.isDone()).toBe(true);
    });
  });
});
