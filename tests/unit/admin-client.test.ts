/**
 * Tests for AdminClient
 * Verifies that createApiKey preserves the secret key from the API response.
 */

import nock from 'nock';
import { AdminClient } from '../../src/api/admin-client';

describe('AdminClient', () => {
  let client: AdminClient;
  const apiKey = 'test-admin-key';
  const baseUrl = 'https://api-free.deepl.com';

  beforeAll(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  beforeEach(() => {
    client = new AdminClient(apiKey);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  describe('createApiKey', () => {
    it('should preserve the secret key from the API response', async () => {
      nock(baseUrl)
        .post('/v2/admin/developer-keys')
        .reply(200, {
          key_id: 'new-key-id',
          key: 'dl-api-secret-abc123',
          label: 'CI Key',
          creation_time: '2024-06-01T12:00:00Z',
          is_deactivated: false,
          usage_limits: { characters: null },
        });

      const result = await client.createApiKey('CI Key');
      expect(result.key).toBe('dl-api-secret-abc123');
      expect(result.keyId).toBe('new-key-id');
      expect(result.label).toBe('CI Key');
    });

    it('should handle response without a key field', async () => {
      nock(baseUrl)
        .post('/v2/admin/developer-keys')
        .reply(200, {
          key_id: 'existing-key-id',
          label: 'Some Key',
          creation_time: '2024-06-01T12:00:00Z',
          is_deactivated: false,
        });

      const result = await client.createApiKey('Some Key');
      expect(result.key).toBeUndefined();
      expect(result.keyId).toBe('existing-key-id');
    });
  });

  describe('listApiKeys', () => {
    it('should not include key field for listed keys', async () => {
      nock(baseUrl)
        .get('/v2/admin/developer-keys')
        .reply(200, [
          {
            key_id: 'key-1',
            label: 'Prod Key',
            creation_time: '2024-01-01T00:00:00Z',
            is_deactivated: false,
          },
        ]);

      const result = await client.listApiKeys();
      expect(result).toHaveLength(1);
      const first = result[0]!;
      expect(first.key).toBeUndefined();
      expect(first.keyId).toBe('key-1');
    });
  });
});
