/**
 * Tests for Admin Command
 */

import { AdminCommand } from '../../src/cli/commands/admin';
import { DeepLClient } from '../../src/api/deepl-client';
import { AdminApiKey, AdminUsageEntry } from '../../src/types/api';

jest.mock('../../src/api/deepl-client');

describe('AdminCommand', () => {
  let mockClient: jest.Mocked<DeepLClient>;
  let command: AdminCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      listApiKeys: jest.fn().mockResolvedValue([]),
      createApiKey: jest.fn().mockResolvedValue({
        keyId: 'key-1',
        label: 'Test Key',
        creationTime: '2024-01-01T00:00:00Z',
        isDeactivated: false,
      }),
      deactivateApiKey: jest.fn().mockResolvedValue(undefined),
      renameApiKey: jest.fn().mockResolvedValue(undefined),
      setApiKeyLimit: jest.fn().mockResolvedValue(undefined),
      getAdminUsage: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DeepLClient>;

    command = new AdminCommand(mockClient);
  });

  describe('listKeys', () => {
    it('should call listApiKeys on client', async () => {
      await command.listKeys();
      expect(mockClient.listApiKeys).toHaveBeenCalled();
    });

    it('should return keys from client', async () => {
      const keys: AdminApiKey[] = [
        {
          keyId: 'key-1',
          label: 'My Key',
          creationTime: '2024-01-01T00:00:00Z',
          isDeactivated: false,
        },
      ];
      mockClient.listApiKeys.mockResolvedValue(keys);

      const result = await command.listKeys();
      expect(result).toEqual(keys);
    });
  });

  describe('createKey', () => {
    it('should call createApiKey with label', async () => {
      await command.createKey('My Key');
      expect(mockClient.createApiKey).toHaveBeenCalledWith('My Key');
    });

    it('should call createApiKey without label', async () => {
      await command.createKey();
      expect(mockClient.createApiKey).toHaveBeenCalledWith(undefined);
    });
  });

  describe('deactivateKey', () => {
    it('should call deactivateApiKey', async () => {
      await command.deactivateKey('key-1');
      expect(mockClient.deactivateApiKey).toHaveBeenCalledWith('key-1');
    });
  });

  describe('renameKey', () => {
    it('should call renameApiKey', async () => {
      await command.renameKey('key-1', 'New Label');
      expect(mockClient.renameApiKey).toHaveBeenCalledWith('key-1', 'New Label');
    });
  });

  describe('setKeyLimit', () => {
    it('should call setApiKeyLimit with number', async () => {
      await command.setKeyLimit('key-1', 1000000);
      expect(mockClient.setApiKeyLimit).toHaveBeenCalledWith('key-1', 1000000);
    });

    it('should call setApiKeyLimit with null for unlimited', async () => {
      await command.setKeyLimit('key-1', null);
      expect(mockClient.setApiKeyLimit).toHaveBeenCalledWith('key-1', null);
    });
  });

  describe('getUsage', () => {
    it('should call getAdminUsage with options', async () => {
      await command.getUsage({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        groupBy: 'key',
      });
      expect(mockClient.getAdminUsage).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        groupBy: 'key',
      });
    });
  });

  describe('formatKeyList', () => {
    it('should format empty list', () => {
      expect(command.formatKeyList([])).toBe('No API keys found.');
    });

    it('should format key list', () => {
      const keys: AdminApiKey[] = [
        {
          keyId: 'key-1',
          label: 'Production',
          creationTime: '2024-01-01T00:00:00Z',
          isDeactivated: false,
          usageLimits: { characters: 1000000 },
        },
        {
          keyId: 'key-2',
          label: 'Test',
          creationTime: '2024-01-02T00:00:00Z',
          isDeactivated: true,
        },
      ];

      const result = command.formatKeyList(keys);
      expect(result).toContain('Found 2 API key(s)');
      expect(result).toContain('Production');
      expect(result).toContain('(active)');
      expect(result).toContain('(deactivated)');
      expect(result).toContain('1,000,000');
    });

    it('should handle keys without labels', () => {
      const keys: AdminApiKey[] = [
        {
          keyId: 'key-1',
          label: '',
          creationTime: '2024-01-01T00:00:00Z',
          isDeactivated: false,
        },
      ];

      const result = command.formatKeyList(keys);
      expect(result).toContain('(no label)');
    });
  });

  describe('formatUsage', () => {
    it('should format empty usage', () => {
      expect(command.formatUsage([])).toBe('No usage data found for the specified period.');
    });

    it('should format usage entries', () => {
      const entries: AdminUsageEntry[] = [
        {
          keyId: 'key-1',
          date: '2024-01-01',
          charactersTranslated: 5000,
          charactersBilled: 5000,
        },
      ];

      const result = command.formatUsage(entries);
      expect(result).toContain('1 entries');
      expect(result).toContain('key-1');
      expect(result).toContain('5,000');
    });
  });

  describe('formatJson', () => {
    it('should format data as JSON', () => {
      const data = [{ keyId: 'test' }];
      const result = command.formatJson(data);
      expect(JSON.parse(result)).toEqual(data);
    });
  });
});
