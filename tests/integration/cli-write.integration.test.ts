/**
 * Integration Tests for Write CLI Command
 * Tests the DeepL Write API integration with text improvement workflows
 */

import nock from 'nock';
import { DeepLClient } from '../../src/api/deepl-client.js';
import { WriteService } from '../../src/services/write.js';
import { ConfigService } from '../../src/storage/config.js';

describe('Write Command Integration', () => {
  const API_KEY = 'test-api-key-123:fx';
  const FREE_API_URL = 'https://api-free.deepl.com';
  let client: DeepLClient;
  let writeService: WriteService;
  let mockConfig: ConfigService;

  beforeEach(() => {
    client = new DeepLClient(API_KEY);
    mockConfig = {} as ConfigService; // Mock config (not used in tests)
    writeService = new WriteService(client, mockConfig);
  });

  afterEach(() => {
    nock.cleanAll();
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

  describe('improve() - Writing Styles', () => {
    it('should apply business writing style', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBe('business');
          expect(body.text).toBe('I want to buy your product');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'I would like to purchase your product',
              target_language: 'en-US',
            },
          ],
        });

      const result = await writeService.improve('I want to buy your product', {
        targetLang: 'en-US',
        writingStyle: 'business',
      });

      expect(result[0]?.text).toBe('I would like to purchase your product');
      expect(scope.isDone()).toBe(true);
    });

    it('should apply casual writing style', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBe('casual');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'Hey! Thanks for reaching out!',
              target_language: 'en-US',
            },
          ],
        });

      const result = await writeService.improve('Thank you for contacting us', {
        targetLang: 'en-US',
        writingStyle: 'casual',
      });

      expect(result[0]?.text).toBe('Hey! Thanks for reaching out!');
      expect(scope.isDone()).toBe(true);
    });

    it('should apply academic writing style', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBe('academic');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'The findings demonstrate a significant correlation',
              target_language: 'en-US',
            },
          ],
        });

      const result = await writeService.improve('The results show a connection', {
        targetLang: 'en-US',
        writingStyle: 'academic',
      });

      expect(result[0]?.text).toContain('demonstrate');
      expect(scope.isDone()).toBe(true);
    });

    it('should apply simple writing style', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.writing_style).toBe('simple');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'Use this feature',
              target_language: 'en-US',
            },
          ],
        });

      await writeService.improve('Utilize this functionality', {
        targetLang: 'en-US',
        writingStyle: 'simple',
      });

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('improve() - Tones', () => {
    it('should apply friendly tone', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.tone).toBe('friendly');
          expect(body.writing_style).toBeUndefined();
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'We would love to help you with that!',
              target_language: 'en-US',
            },
          ],
        });

      const result = await writeService.improve('We can help with that', {
        targetLang: 'en-US',
        tone: 'friendly',
      });

      expect(result[0]?.text).toContain('love to help');
      expect(scope.isDone()).toBe(true);
    });

    it('should apply confident tone', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.tone).toBe('confident');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'We will definitely deliver on time',
              target_language: 'en-US',
            },
          ],
        });

      const result = await writeService.improve('We hope to deliver on time', {
        targetLang: 'en-US',
        tone: 'confident',
      });

      expect(result[0]?.text).toContain('will definitely');
      expect(scope.isDone()).toBe(true);
    });

    it('should apply diplomatic tone', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.tone).toBe('diplomatic');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'We respectfully suggest considering an alternative approach',
              target_language: 'en-US',
            },
          ],
        });

      await writeService.improve('Your approach might not work', {
        targetLang: 'en-US',
        tone: 'diplomatic',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should apply enthusiastic tone', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.tone).toBe('enthusiastic');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'This is fantastic news!',
              target_language: 'en-US',
            },
          ],
        });

      await writeService.improve('This is good news', {
        targetLang: 'en-US',
        tone: 'enthusiastic',
      });

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('improve() - Different Languages', () => {
    it('should improve German text', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.target_lang).toBe('de');
          expect(body.text).toBe('Ich möchte das kaufen');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'Ich würde das gerne kaufen',
              target_language: 'de',
            },
          ],
        });

      const result = await writeService.improve('Ich möchte das kaufen', {
        targetLang: 'de',
      });

      expect(result[0]?.text).toBe('Ich würde das gerne kaufen');
      expect(scope.isDone()).toBe(true);
    });

    it('should improve French text', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.target_lang).toBe('fr');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'Je voudrais acheter cela',
              target_language: 'fr',
            },
          ],
        });

      await writeService.improve('Je veux acheter ça', { targetLang: 'fr' });
      expect(scope.isDone()).toBe(true);
    });

    it('should improve Spanish text', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.target_lang).toBe('es');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'Me gustaría comprar esto',
              target_language: 'es',
            },
          ],
        });

      await writeService.improve('Quiero comprar esto', { targetLang: 'es' });
      expect(scope.isDone()).toBe(true);
    });

    it('should improve British English text', async () => {
      const scope = nock(FREE_API_URL)
        .post('/v2/write/rephrase', (body) => {
          expect(body.target_lang).toBe('en-GB');
          return true;
        })
        .reply(200, {
          improvements: [
            {
              text: 'I should like to purchase this item',
              target_language: 'en-GB',
            },
          ],
        });

      await writeService.improve('I want to buy this', { targetLang: 'en-GB' });
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
        .reply(429, { message: 'Too many requests' });

      await expect(
        writeService.improve('Test', { targetLang: 'en-US' })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle network errors', async () => {
      nock(FREE_API_URL)
        .post('/v2/write/rephrase')
        .replyWithError('Network error');

      await expect(
        writeService.improve('Test', { targetLang: 'en-US' })
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
});
