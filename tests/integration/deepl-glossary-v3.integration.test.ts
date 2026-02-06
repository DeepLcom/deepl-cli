/**
 * Integration Tests for DeepL Client v3 Glossary API
 * Tests HTTP request/response handling for v3 glossary endpoints with mocked DeepL API using nock
 * This validates that the client correctly formats v3 requests and parses v3 responses
 */

import nock from 'nock';
import { DeepLClient } from '../../src/api/deepl-client.js';

describe('DeepLClient v3 Glossary Integration', () => {
  const API_KEY = 'test-api-key-123:fx';
  const FREE_API_URL = 'https://api-free.deepl.com';

  afterEach(() => {
    // Clean up nock mocks after each test
    nock.cleanAll();
  });

  describe('createGlossary() - v3 API', () => {
    it('should make correct HTTP POST request for single-target glossary', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v3/glossaries', (body) => {
          // Verify request body uses v3 format with dictionaries array
          expect(body.name).toBe('Test Glossary');
          expect(body.dictionaries).toHaveLength(1);
          expect(body.dictionaries[0].source_lang).toBe('EN');
          expect(body.dictionaries[0].target_lang).toBe('ES');
          expect(body.dictionaries[0].entries).toBe('Hello\tHola');
          expect(body.dictionaries[0].entries_format).toBe('tsv');
          return true;
        })
        .reply(200, {
          glossary_id: 'glossary-123',
          name: 'Test Glossary',
          dictionaries: [
            {
              source_lang: 'en',
              target_lang: 'es',
              entry_count: 1,
            },
          ],
          creation_time: '2025-10-13T10:00:00Z',
        });

      const result = await client.createGlossary('Test Glossary', 'en', ['es'], 'Hello\tHola');

      expect(result.glossary_id).toBe('glossary-123');
      expect(result.name).toBe('Test Glossary');
      expect(result.source_lang).toBe('en');
      expect(result.target_langs).toEqual(['es']);
      expect(result.dictionaries).toHaveLength(1);
      expect(result.dictionaries[0]?.entry_count).toBe(1);
      expect(scope.isDone()).toBe(true);
    });

    it('should make correct HTTP POST request for multilingual glossary', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .post('/v3/glossaries', (body) => {
          // Verify request body uses v3 format with dictionaries array (one per target language)
          expect(body.name).toBe('Multilingual Glossary');
          expect(body.dictionaries).toHaveLength(3);
          expect(body.dictionaries[0].source_lang).toBe('EN');
          expect(body.dictionaries[0].target_lang).toBe('ES');
          expect(body.dictionaries[0].entries).toBe('Hello\tHola');
          expect(body.dictionaries[0].entries_format).toBe('tsv');
          expect(body.dictionaries[1].target_lang).toBe('FR');
          expect(body.dictionaries[2].target_lang).toBe('DE');
          return true;
        })
        .reply(200, {
          glossary_id: 'glossary-456',
          name: 'Multilingual Glossary',
          dictionaries: [
            {
              source_lang: 'en',
              target_lang: 'es',
              entry_count: 10,
            },
            {
              source_lang: 'en',
              target_lang: 'fr',
              entry_count: 10,
            },
            {
              source_lang: 'en',
              target_lang: 'de',
              entry_count: 10,
            },
          ],
          creation_time: '2025-10-13T10:00:00Z',
        });

      const result = await client.createGlossary(
        'Multilingual Glossary',
        'en',
        ['es', 'fr', 'de'],
        'Hello\tHola'
      );

      expect(result.glossary_id).toBe('glossary-456');
      expect(result.target_langs).toEqual(['es', 'fr', 'de']);
      expect(result.dictionaries).toHaveLength(3);
      expect(scope.isDone()).toBe(true);
    });

    it('should throw error for empty target_langs array', async () => {
      const client = new DeepLClient(API_KEY);

      await expect(
        client.createGlossary('Test', 'en', [], 'Hello\tHola')
      ).rejects.toThrow('At least one target language is required');
    });

    it('should use correct Authorization header', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL, {
        reqheaders: {
          'authorization': `DeepL-Auth-Key ${API_KEY}`,
        },
      })
        .post('/v3/glossaries')
        .reply(200, {
          glossary_id: 'glossary-123',
          name: 'Test',
          source_lang: 'en',
          target_langs: ['es'],
          dictionaries: [{ source_lang: 'en', target_lang: 'es', entry_count: 1 }],
          creation_time: '2025-10-13T10:00:00Z',
        });

      await client.createGlossary('Test', 'en', ['es'], 'Hello\tHola');
      expect(scope.isDone()).toBe(true);
    });

    it('should use JSON content type', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL, {
        reqheaders: {
          'content-type': 'application/json',
        },
      })
        .post('/v3/glossaries')
        .reply(200, {
          glossary_id: 'glossary-123',
          name: 'Test',
          dictionaries: [{ source_lang: 'en', target_lang: 'es', entry_count: 1 }],
          creation_time: '2025-10-13T10:00:00Z',
        });

      await client.createGlossary('Test', 'en', ['es'], 'Hello\tHola');
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 403 authentication errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .post('/v3/glossaries')
        .reply(403, { message: 'Invalid API key' });

      await expect(
        client.createGlossary('Test', 'en', ['es'], 'Hello\tHola')
      ).rejects.toThrow('Authentication failed');
    });

    it('should handle 456 quota exceeded errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .post('/v3/glossaries')
        .reply(456, { message: 'Quota exceeded' });

      await expect(
        client.createGlossary('Test', 'en', ['es'], 'Hello\tHola')
      ).rejects.toThrow('Quota exceeded');
    });
  });

  describe('listGlossaries() - v3 API', () => {
    it('should make correct HTTP GET request', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .get('/v3/glossaries')
        .reply(200, {
          glossaries: [
            {
              glossary_id: 'glossary-1',
              name: 'Glossary 1',
              source_lang: 'en',
              target_langs: ['es'],
              dictionaries: [{ source_lang: 'en', target_lang: 'es', entry_count: 10 }],
              creation_time: '2025-10-13T10:00:00Z',
            },
            {
              glossary_id: 'glossary-2',
              name: 'Glossary 2',
              source_lang: 'en',
              target_langs: ['fr', 'de'],
              dictionaries: [
                { source_lang: 'en', target_lang: 'fr', entry_count: 5 },
                { source_lang: 'en', target_lang: 'de', entry_count: 5 },
              ],
              creation_time: '2025-10-13T11:00:00Z',
            },
          ],
        });

      const result = await client.listGlossaries();

      expect(result).toHaveLength(2);
      expect(result[0]?.glossary_id).toBe('glossary-1');
      expect(result[0]?.target_langs).toEqual(['es']);
      expect(result[1]?.glossary_id).toBe('glossary-2');
      expect(result[1]?.target_langs).toEqual(['fr', 'de']);
      expect(scope.isDone()).toBe(true);
    });

    it('should return empty array when no glossaries exist', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .get('/v3/glossaries')
        .reply(200, { glossaries: [] });

      const result = await client.listGlossaries();

      expect(result).toEqual([]);
    });

    it('should handle authentication errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .get('/v3/glossaries')
        .reply(403, { message: 'Invalid API key' });

      await expect(client.listGlossaries()).rejects.toThrow('Authentication failed');
    });
  });

  describe('getGlossary() - v3 API', () => {
    it('should make correct HTTP GET request', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .get('/v3/glossaries/glossary-123')
        .reply(200, {
          glossary_id: 'glossary-123',
          name: 'Test Glossary',
          source_lang: 'en',
          target_langs: ['es'],
          dictionaries: [{ source_lang: 'en', target_lang: 'es', entry_count: 15 }],
          creation_time: '2025-10-13T10:00:00Z',
        });

      const result = await client.getGlossary('glossary-123');

      expect(result.glossary_id).toBe('glossary-123');
      expect(result.name).toBe('Test Glossary');
      expect(result.target_langs).toEqual(['es']);
      expect(result.dictionaries[0]?.entry_count).toBe(15);
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 404 glossary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .get('/v3/glossaries/nonexistent')
        .reply(404, { message: 'Glossary not found' });

      await expect(client.getGlossary('nonexistent')).rejects.toThrow('API error');
    });
  });

  describe('deleteGlossary() - v3 API', () => {
    it('should make correct HTTP DELETE request', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .delete('/v3/glossaries/glossary-123')
        .reply(204);

      await client.deleteGlossary('glossary-123');

      expect(scope.isDone()).toBe(true);
    });

    it('should handle 404 glossary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .delete('/v3/glossaries/nonexistent')
        .reply(404, { message: 'Glossary not found' });

      await expect(client.deleteGlossary('nonexistent')).rejects.toThrow('API error');
    });
  });

  describe('getGlossaryEntries() - v3 API', () => {
    it('should make correct HTTP GET request with language pair', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .get('/v3/glossaries/glossary-123/entries')
        .query({
          source_lang: 'EN',
          target_lang: 'ES',
        })
        .reply(200, {
          dictionaries: [
            {
              source_lang: 'EN',
              target_lang: 'ES',
              entries: 'Hello\tHola\nWorld\tMundo',
              entries_format: 'tsv',
            },
          ],
        });

      const result = await client.getGlossaryEntries('glossary-123', 'en', 'es');

      expect(result).toBe('Hello\tHola\nWorld\tMundo');
      expect(scope.isDone()).toBe(true);
    });

    it('should extract TSV from JSON response', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .get('/v3/glossaries/glossary-123/entries')
        .query({ source_lang: 'EN', target_lang: 'ES' })
        .reply(200, {
          dictionaries: [
            {
              source_lang: 'EN',
              target_lang: 'ES',
              entries: 'Test\tPrueba',
              entries_format: 'tsv',
            },
          ],
        });

      const result = await client.getGlossaryEntries('glossary-123', 'en', 'es');
      expect(result).toBe('Test\tPrueba');
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 404 glossary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .get('/v3/glossaries/nonexistent/entries')
        .query({ source_lang: 'EN', target_lang: 'ES' })
        .reply(404, { message: 'Glossary not found' });

      await expect(
        client.getGlossaryEntries('nonexistent', 'en', 'es')
      ).rejects.toThrow();
    });

    it('should handle invalid language pair errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .get('/v3/glossaries/glossary-123/entries')
        .query({ source_lang: 'EN', target_lang: 'FR' })
        .reply(400, { message: 'Language pair not in glossary' });

      await expect(
        client.getGlossaryEntries('glossary-123', 'en', 'fr')
      ).rejects.toThrow();
    });
  });

  describe('updateGlossaryEntries() - v3 API', () => {
    it('should make correct HTTP PATCH request', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .patch('/v3/glossaries/glossary-123/dictionaries/EN-ES', (body) => {
          expect(body.entries).toBe('Hello\tHola\nWorld\tMundo');
          expect(body.entries_format).toBe('tsv');
          return true;
        })
        .reply(204);

      await client.updateGlossaryEntries('glossary-123', 'en', 'es', 'Hello\tHola\nWorld\tMundo');

      expect(scope.isDone()).toBe(true);
    });

    it('should use form-encoded content type', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL, {
        reqheaders: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
        .patch('/v3/glossaries/glossary-123/dictionaries/EN-ES')
        .reply(204);

      await client.updateGlossaryEntries('glossary-123', 'en', 'es', 'Test\tPrueba');
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 404 glossary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .patch('/v3/glossaries/nonexistent/dictionaries/EN-ES')
        .reply(404, { message: 'Glossary not found' });

      await expect(
        client.updateGlossaryEntries('nonexistent', 'en', 'es', 'Test\tPrueba')
      ).rejects.toThrow();
    });

    it('should handle invalid language pair errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .patch('/v3/glossaries/glossary-123/dictionaries/EN-FR')
        .reply(400, { message: 'Language pair not in glossary' });

      await expect(
        client.updateGlossaryEntries('glossary-123', 'en', 'fr', 'Test\tPrueba')
      ).rejects.toThrow();
    });
  });

  describe('renameGlossary() - v3 API', () => {
    it('should make correct HTTP PATCH request', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .patch('/v3/glossaries/glossary-123', (body) => {
          expect(body.name).toBe('New Glossary Name');
          return true;
        })
        .reply(204);

      await client.renameGlossary('glossary-123', 'New Glossary Name');

      expect(scope.isDone()).toBe(true);
    });

    it('should use form-encoded content type', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL, {
        reqheaders: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
        .patch('/v3/glossaries/glossary-123')
        .reply(204);

      await client.renameGlossary('glossary-123', 'New Name');
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 404 glossary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .patch('/v3/glossaries/nonexistent')
        .reply(404, { message: 'Glossary not found' });

      await expect(
        client.renameGlossary('nonexistent', 'New Name')
      ).rejects.toThrow();
    });
  });

  describe('deleteGlossaryDictionary() - v3 API', () => {
    it('should make correct HTTP DELETE request', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .delete('/v3/glossaries/glossary-123/dictionaries/EN-ES')
        .reply(204);

      await client.deleteGlossaryDictionary('glossary-123', 'en', 'es');

      expect(scope.isDone()).toBe(true);
    });

    it('should uppercase language codes in URL', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .delete('/v3/glossaries/glossary-456/dictionaries/EN-FR')
        .reply(204);

      await client.deleteGlossaryDictionary('glossary-456', 'en', 'fr');

      expect(scope.isDone()).toBe(true);
    });

    it('should handle 404 glossary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .delete('/v3/glossaries/nonexistent/dictionaries/EN-ES')
        .reply(404, { message: 'Glossary not found' });

      await expect(
        client.deleteGlossaryDictionary('nonexistent', 'en', 'es')
      ).rejects.toThrow();
    });

    it('should handle 404 dictionary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .delete('/v3/glossaries/glossary-123/dictionaries/EN-FR')
        .reply(404, { message: 'Dictionary not found in glossary' });

      await expect(
        client.deleteGlossaryDictionary('glossary-123', 'en', 'fr')
      ).rejects.toThrow();
    });

    it('should handle 400 last dictionary errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .delete('/v3/glossaries/glossary-123/dictionaries/EN-ES')
        .reply(400, { message: 'Cannot delete last dictionary' });

      await expect(
        client.deleteGlossaryDictionary('glossary-123', 'en', 'es')
      ).rejects.toThrow();
    });
  });

  describe('replaceGlossaryDictionary() - v3 API', () => {
    it('should make correct HTTP PUT request', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .put('/v3/glossaries/glossary-123/dictionaries/EN-ES', (body) => {
          expect(body.entries).toBe('hello\thola');
          expect(body.entries_format).toBe('tsv');
          return true;
        })
        .reply(204);

      await client.replaceGlossaryDictionary('glossary-123', 'en', 'es', 'hello\thola');
      expect(scope.isDone()).toBe(true);
    });

    it('should uppercase language codes in URL', async () => {
      const client = new DeepLClient(API_KEY);

      const scope = nock(FREE_API_URL)
        .put('/v3/glossaries/glossary-456/dictionaries/EN-FR')
        .reply(204);

      await client.replaceGlossaryDictionary('glossary-456', 'en', 'fr', 'hello\tbonjour');
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 404 glossary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .put('/v3/glossaries/nonexistent/dictionaries/EN-ES')
        .reply(404, { message: 'Glossary not found' });

      await expect(
        client.replaceGlossaryDictionary('nonexistent', 'en', 'es', 'hello\thola')
      ).rejects.toThrow();
    });

    it('should handle 404 dictionary not found errors', async () => {
      const client = new DeepLClient(API_KEY);

      nock(FREE_API_URL)
        .put('/v3/glossaries/glossary-123/dictionaries/EN-ZH')
        .reply(404, { message: 'Dictionary not found' });

      await expect(
        client.replaceGlossaryDictionary('glossary-123', 'en', 'zh', 'hello\t你好')
      ).rejects.toThrow();
    });
  });
});
