/**
 * Integration Tests for Write API Client
 * Tests HTTP request/response handling with mocked DeepL Write API using nock
 */

import nock from 'nock';
import { WriteClient } from '../../src/api/write-client.js';

describe('WriteClient Integration', () => {
  const API_KEY = 'test-write-key:fx';
  const API_URL = 'https://api-free.deepl.com';

  afterEach(() => {
    nock.cleanAll();
  });

  describe('improveText()', () => {
    it('should POST to /v2/write/rephrase and parse improvements', async () => {
      const client = new WriteClient(API_KEY);

      const scope = nock(API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.text).toBe('This are a test sentence.');
          expect(body.target_lang).toBe('en-US');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'This is a test sentence.',
              target_language: 'en-US',
              detected_source_language: 'EN',
            },
          ],
        });

      const result = await client.improveText('This are a test sentence.', {
        targetLang: 'en-US',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe('This is a test sentence.');
      expect(result[0]?.targetLanguage).toBe('en-US');
      expect(result[0]?.detectedSourceLanguage).toBe('EN');
      expect(scope.isDone()).toBe(true);
    });

    it('should include writing_style when specified', async () => {
      const client = new WriteClient(API_KEY);

      const scope = nock(API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBe('business');
          return true;
        })
        .reply(200, {
          improvements: [{
            text: 'Improved business text.',
            target_language: 'en-US',
          }],
        });

      await client.improveText('Casual text here.', {
        targetLang: 'en-US',
        writingStyle: 'business',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should include tone when specified', async () => {
      const client = new WriteClient(API_KEY);

      const scope = nock(API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.tone).toBe('friendly');
          return true;
        })
        .reply(200, {
          improvements: [{
            text: 'Friendly improved text!',
            target_language: 'en-US',
          }],
        });

      await client.improveText('Text here.', {
        targetLang: 'en-US',
        tone: 'friendly',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should not include writing_style or tone when not specified', async () => {
      const client = new WriteClient(API_KEY);

      const scope = nock(API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBeUndefined();
          expect(body.tone).toBeUndefined();
          return true;
        })
        .reply(200, {
          improvements: [{
            text: 'Improved text.',
            target_language: 'en-US',
          }],
        });

      await client.improveText('Text.', { targetLang: 'en-US' });
      expect(scope.isDone()).toBe(true);
    });

    it('should throw on empty improvements response', async () => {
      const client = new WriteClient(API_KEY);

      nock(API_URL)
        .post('/v2/write/rephrase')
        .reply(200, { improvements: [] });

      await expect(
        client.improveText('Test.', { targetLang: 'en-US' })
      ).rejects.toThrow('No improvements returned');
    });

    it('should handle 403 authentication error', async () => {
      const client = new WriteClient(API_KEY);

      nock(API_URL)
        .post('/v2/write/rephrase')
        .reply(403, { message: 'Invalid API key' });

      await expect(
        client.improveText('Test.', { targetLang: 'en-US' })
      ).rejects.toThrow('Authentication failed');
    });

    it('should handle 456 quota exceeded', async () => {
      const client = new WriteClient(API_KEY);

      nock(API_URL)
        .post('/v2/write/rephrase')
        .reply(456, { message: 'Quota exceeded' });

      await expect(
        client.improveText('Test.', { targetLang: 'en-US' })
      ).rejects.toThrow('Quota exceeded');
    });

    it('should use correct Authorization header', async () => {
      const client = new WriteClient(API_KEY);

      const scope = nock(API_URL, {
        reqheaders: {
          'authorization': `DeepL-Auth-Key ${API_KEY}`,
        },
      })
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [{
            text: 'Improved.',
            target_language: 'en-US',
          }],
        });

      await client.improveText('Test.', { targetLang: 'en-US' });
      expect(scope.isDone()).toBe(true);
    });

    it('should use Pro URL when configured', async () => {
      const proUrl = 'https://api.deepl.com';
      const client = new WriteClient(API_KEY, { usePro: true });

      const scope = nock(proUrl)
        .post('/v2/write/rephrase')
        .reply(200, {
          improvements: [{
            text: 'Pro improved.',
            target_language: 'de',
          }],
        });

      await client.improveText('Test.', { targetLang: 'de' });
      expect(scope.isDone()).toBe(true);
    });
  });
});
