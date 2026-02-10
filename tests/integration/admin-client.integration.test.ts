/**
 * Integration Tests for Admin API Client
 * Tests HTTP request/response handling with mocked DeepL Admin API using nock
 */

import nock from 'nock';
import { AdminClient } from '../../src/api/admin-client.js';
import { DEEPL_FREE_API_URL } from '../helpers';

describe('AdminClient Integration', () => {
  const API_KEY = 'test-admin-key:fx';
  const API_URL = DEEPL_FREE_API_URL;

  afterEach(() => {
    nock.cleanAll();
  });

  describe('listApiKeys()', () => {
    it('should make GET request and normalize response', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .get('/v2/admin/developer-keys')
        .reply(200, [
          {
            key_id: 'key-1',
            label: 'Production',
            creation_time: '2024-01-01T00:00:00Z',
            is_deactivated: false,
            usage_limits: { characters: 1000000 },
          },
          {
            key_id: 'key-2',
            label: 'Test',
            creation_time: '2024-06-01T00:00:00Z',
            is_deactivated: true,
          },
        ]);

      const keys = await client.listApiKeys();

      expect(keys).toHaveLength(2);
      expect(keys[0]).toEqual({
        keyId: 'key-1',
        label: 'Production',
        creationTime: '2024-01-01T00:00:00Z',
        isDeactivated: false,
        usageLimits: { characters: 1000000 },
      });
      expect(keys[1]?.isDeactivated).toBe(true);
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 403 authentication error', async () => {
      const client = new AdminClient(API_KEY);

      nock(API_URL)
        .get('/v2/admin/developer-keys')
        .reply(403, { message: 'Forbidden' });

      await expect(client.listApiKeys()).rejects.toThrow('Authentication failed');
    });
  });

  describe('createApiKey()', () => {
    it('should POST with label and return new key', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .post('/v2/admin/developer-keys', (body) => {
          expect(body.label).toBe('New Key');
          return true;
        })
        .reply(200, {
          key_id: 'key-new',
          key: 'actual-api-key-value',
          label: 'New Key',
          creation_time: '2024-07-01T00:00:00Z',
          is_deactivated: false,
        });

      const key = await client.createApiKey('New Key');

      expect(key.keyId).toBe('key-new');
      expect(key.key).toBe('actual-api-key-value');
      expect(key.label).toBe('New Key');
      expect(scope.isDone()).toBe(true);
    });

    it('should POST without label when not provided', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .post('/v2/admin/developer-keys', (body) => {
          expect(body.label).toBeUndefined();
          return true;
        })
        .reply(200, {
          key_id: 'key-new',
          label: '',
          creation_time: '2024-07-01T00:00:00Z',
          is_deactivated: false,
        });

      await client.createApiKey();
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('deactivateApiKey()', () => {
    it('should PUT with key_id', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .put('/v2/admin/developer-keys/deactivate', (body) => {
          expect(body.key_id).toBe('key-1');
          return true;
        })
        .reply(204);

      await client.deactivateApiKey('key-1');
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('renameApiKey()', () => {
    it('should PUT with key_id and label', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .put('/v2/admin/developer-keys/label', (body) => {
          expect(body.key_id).toBe('key-1');
          expect(body.label).toBe('Renamed Key');
          return true;
        })
        .reply(204);

      await client.renameApiKey('key-1', 'Renamed Key');
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('setApiKeyLimit()', () => {
    it('should PUT with character limit', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .put('/v2/admin/developer-keys/limits', (body) => {
          expect(body.key_id).toBe('key-1');
          expect(body.characters).toBe(500000);
          return true;
        })
        .reply(204);

      await client.setApiKeyLimit('key-1', 500000);
      expect(scope.isDone()).toBe(true);
    });

    it('should PUT with null to remove limit', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .put('/v2/admin/developer-keys/limits', (body) => {
          expect(body.key_id).toBe('key-1');
          expect(body.characters).toBeNull();
          return true;
        })
        .reply(204);

      await client.setApiKeyLimit('key-1', null);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('getAdminUsage()', () => {
    it('should GET with date range and parse response', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .get('/v2/admin/analytics')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' })
        .reply(200, {
          usage_report: {
            total_usage: {
              total_characters: 5000000,
              text_translation_characters: 3000000,
              document_translation_characters: 1500000,
              text_improvement_characters: 500000,
              speech_to_text_milliseconds: 120000,
            },
            start_date: '2024-01-01',
            end_date: '2024-12-31',
          },
        });

      const report = await client.getAdminUsage({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(report.totalUsage.totalCharacters).toBe(5000000);
      expect(report.totalUsage.textTranslationCharacters).toBe(3000000);
      expect(report.totalUsage.documentTranslationCharacters).toBe(1500000);
      expect(report.totalUsage.textImprovementCharacters).toBe(500000);
      expect(report.totalUsage.speechToTextMilliseconds).toBe(120000);
      expect(report.startDate).toBe('2024-01-01');
      expect(report.endDate).toBe('2024-12-31');
      expect(scope.isDone()).toBe(true);
    });

    it('should include group_by when specified', async () => {
      const client = new AdminClient(API_KEY);

      const scope = nock(API_URL)
        .get('/v2/admin/analytics')
        .query({ start_date: '2024-01-01', end_date: '2024-01-31', group_by: 'key' })
        .reply(200, {
          usage_report: {
            total_usage: {
              total_characters: 1000,
              text_translation_characters: 800,
              document_translation_characters: 200,
              text_improvement_characters: 0,
              speech_to_text_milliseconds: 0,
            },
            start_date: '2024-01-01',
            end_date: '2024-01-31',
            group_by: 'key',
            key_usages: [
              {
                api_key: 'key-1',
                api_key_label: 'Production',
                usage: {
                  total_characters: 1000,
                  text_translation_characters: 800,
                  document_translation_characters: 200,
                  text_improvement_characters: 0,
                  speech_to_text_milliseconds: 0,
                },
              },
            ],
          },
        });

      const report = await client.getAdminUsage({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        groupBy: 'key',
      });

      expect(report.groupBy).toBe('key');
      expect(report.entries).toHaveLength(1);
      expect(report.entries[0]?.apiKey).toBe('key-1');
      expect(report.entries[0]?.apiKeyLabel).toBe('Production');
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 403 for non-admin keys', async () => {
      const client = new AdminClient(API_KEY);

      nock(API_URL)
        .get('/v2/admin/analytics')
        .query(true)
        .reply(403, { message: 'Admin access required' });

      await expect(
        client.getAdminUsage({ startDate: '2024-01-01', endDate: '2024-12-31' })
      ).rejects.toThrow('Authentication failed');
    });
  });
});
