/**
 * Integration Tests for Style Rules API Client
 * Tests HTTP request/response handling with mocked DeepL v3 Style Rules API using nock
 */

import nock from 'nock';
import { StyleRulesClient } from '../../src/api/style-rules-client.js';

describe('StyleRulesClient Integration', () => {
  const API_KEY = 'test-api-key:fx';
  const API_URL = 'https://api-free.deepl.com';

  afterEach(() => {
    nock.cleanAll();
  });

  describe('getStyleRules()', () => {
    it('should make GET request and parse basic style rules', async () => {
      const client = new StyleRulesClient(API_KEY);

      const scope = nock(API_URL)
        .get('/v3/style_rules')
        .reply(200, {
          style_rules: [
            {
              style_id: 'style-1',
              name: 'Formal Business',
              language: 'en-US',
              version: 1,
              creation_time: '2024-01-15T10:00:00Z',
              updated_time: '2024-06-20T14:30:00Z',
            },
            {
              style_id: 'style-2',
              name: 'Casual Blog',
              language: 'de',
              version: 3,
              creation_time: '2024-03-01T08:00:00Z',
              updated_time: '2024-07-01T09:15:00Z',
            },
          ],
        });

      const rules = await client.getStyleRules();

      expect(rules).toHaveLength(2);
      expect(rules[0]).toEqual({
        styleId: 'style-1',
        name: 'Formal Business',
        language: 'en-US',
        version: 1,
        creationTime: '2024-01-15T10:00:00Z',
        updatedTime: '2024-06-20T14:30:00Z',
      });
      expect(rules[1]?.styleId).toBe('style-2');
      expect(scope.isDone()).toBe(true);
    });

    it('should include detailed=true query parameter', async () => {
      const client = new StyleRulesClient(API_KEY);

      const scope = nock(API_URL)
        .get('/v3/style_rules')
        .query({ detailed: 'true' })
        .reply(200, {
          style_rules: [
            {
              style_id: 'style-1',
              name: 'Formal',
              language: 'en-US',
              version: 1,
              creation_time: '2024-01-15T10:00:00Z',
              updated_time: '2024-01-15T10:00:00Z',
              configured_rules: ['FORMAL_TONE', 'NO_SLANG'],
              custom_instructions: [{ label: 'Oxford comma', prompt: 'Always use Oxford comma' }],
            },
          ],
        });

      const rules = await client.getStyleRules({ detailed: true });

      expect(rules).toHaveLength(1);
      const rule = rules[0] as any;
      expect(rule.configuredRules).toEqual(['FORMAL_TONE', 'NO_SLANG']);
      expect(rule.customInstructions).toEqual([{ label: 'Oxford comma', prompt: 'Always use Oxford comma' }]);
      expect(scope.isDone()).toBe(true);
    });

    it('should include pagination parameters', async () => {
      const client = new StyleRulesClient(API_KEY);

      const scope = nock(API_URL)
        .get('/v3/style_rules')
        .query({ page: '2', page_size: '10' })
        .reply(200, { style_rules: [] });

      const rules = await client.getStyleRules({ page: 2, pageSize: 10 });

      expect(rules).toHaveLength(0);
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 403 authentication error', async () => {
      const client = new StyleRulesClient(API_KEY);

      nock(API_URL)
        .get('/v3/style_rules')
        .reply(403, { message: 'Invalid API key' });

      await expect(client.getStyleRules()).rejects.toThrow('Authentication failed');
    });

    it('should use correct Authorization header', async () => {
      const client = new StyleRulesClient(API_KEY);

      const scope = nock(API_URL, {
        reqheaders: {
          'authorization': `DeepL-Auth-Key ${API_KEY}`,
        },
      })
        .get('/v3/style_rules')
        .reply(200, { style_rules: [] });

      await client.getStyleRules();
      expect(scope.isDone()).toBe(true);
    });

    it('should handle empty style rules list', async () => {
      const client = new StyleRulesClient(API_KEY);

      nock(API_URL)
        .get('/v3/style_rules')
        .reply(200, { style_rules: [] });

      const rules = await client.getStyleRules();
      expect(rules).toEqual([]);
    });
  });
});
