/**
 * Tests for Admin Command
 */

import { AdminCommand } from '../../src/cli/commands/admin';
import { DeepLClient } from '../../src/api/deepl-client';
import { AdminApiKey, AdminUsageReport } from '../../src/types/api';

jest.mock('../../src/api/deepl-client');

const emptyReport: AdminUsageReport = {
  totalUsage: {
    totalCharacters: 0,
    textTranslationCharacters: 0,
    documentTranslationCharacters: 0,
    textImprovementCharacters: 0,
    speechToTextMilliseconds: 0,
  },
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  entries: [],
};

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
      getAdminUsage: jest.fn().mockResolvedValue(emptyReport),
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

    it('should preserve the secret key from the response', async () => {
      mockClient.createApiKey.mockResolvedValue({
        keyId: 'key-new',
        key: 'dl-api-secret-12345',
        label: 'New Key',
        creationTime: '2024-06-01T00:00:00Z',
        isDeactivated: false,
      });

      const result = await command.createKey('New Key');
      expect(result.key).toBe('dl-api-secret-12345');
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

    it('should show unlimited for key with null character limit', () => {
      const keys: AdminApiKey[] = [
        {
          keyId: 'key-1',
          label: 'Unlimited Key',
          creationTime: '2024-01-01T00:00:00Z',
          isDeactivated: false,
          usageLimits: { characters: null },
        },
      ];

      const result = command.formatKeyList(keys);
      expect(result).toContain('unlimited characters');
    });

    it('should not show limit line when usageLimits is absent', () => {
      const keys: AdminApiKey[] = [
        {
          keyId: 'key-1',
          label: 'No Limits',
          creationTime: '2024-01-01T00:00:00Z',
          isDeactivated: false,
        },
      ];

      const result = command.formatKeyList(keys);
      expect(result).not.toContain('Limit:');
    });
  });

  describe('formatKeyInfo', () => {
    it('should format active key with label', () => {
      const key: AdminApiKey = {
        keyId: 'key-1',
        label: 'Production',
        creationTime: '2024-06-15T10:00:00Z',
        isDeactivated: false,
      };

      const result = command.formatKeyInfo(key);
      expect(result).toContain('Key: Production');
      expect(result).toContain('ID:      key-1');
      expect(result).toContain('Status:  active');
      expect(result).toContain('Created: 2024-06-15T10:00:00Z');
      expect(result).not.toContain('Limit:');
    });

    it('should format deactivated key', () => {
      const key: AdminApiKey = {
        keyId: 'key-2',
        label: 'Old Key',
        creationTime: '2024-01-01T00:00:00Z',
        isDeactivated: true,
      };

      const result = command.formatKeyInfo(key);
      expect(result).toContain('Status:  deactivated');
    });

    it('should show (no label) for key without label', () => {
      const key: AdminApiKey = {
        keyId: 'key-3',
        label: '',
        creationTime: '2024-01-01T00:00:00Z',
        isDeactivated: false,
      };

      const result = command.formatKeyInfo(key);
      expect(result).toContain('Key: (no label)');
    });

    it('should show numeric character limit', () => {
      const key: AdminApiKey = {
        keyId: 'key-4',
        label: 'Limited',
        creationTime: '2024-01-01T00:00:00Z',
        isDeactivated: false,
        usageLimits: { characters: 500000 },
      };

      const result = command.formatKeyInfo(key);
      expect(result).toContain('Limit:   500,000 characters');
    });

    it('should show unlimited for null character limit', () => {
      const key: AdminApiKey = {
        keyId: 'key-5',
        label: 'Unlimited',
        creationTime: '2024-01-01T00:00:00Z',
        isDeactivated: false,
        usageLimits: { characters: null },
      };

      const result = command.formatKeyInfo(key);
      expect(result).toContain('Limit:   unlimited characters');
    });

    it('should not show limit when usageLimits is absent', () => {
      const key: AdminApiKey = {
        keyId: 'key-6',
        label: 'No Limits',
        creationTime: '2024-01-01T00:00:00Z',
        isDeactivated: false,
      };

      const result = command.formatKeyInfo(key);
      expect(result).not.toContain('Limit:');
    });

    it('should display the secret key when present', () => {
      const key: AdminApiKey = {
        keyId: 'key-7',
        key: 'dl-api-secret-67890',
        label: 'New Key',
        creationTime: '2024-06-01T00:00:00Z',
        isDeactivated: false,
      };

      const result = command.formatKeyInfo(key);
      expect(result).toContain('Secret:  dl-api-secret-67890');
    });

    it('should not display secret line when key is absent', () => {
      const key: AdminApiKey = {
        keyId: 'key-8',
        label: 'Existing Key',
        creationTime: '2024-01-01T00:00:00Z',
        isDeactivated: false,
      };

      const result = command.formatKeyInfo(key);
      expect(result).not.toContain('Secret:');
    });
  });

  describe('formatUsage', () => {
    it('should format report with total usage and per-product breakdown', () => {
      const report: AdminUsageReport = {
        totalUsage: {
          totalCharacters: 10000,
          textTranslationCharacters: 7000,
          documentTranslationCharacters: 2000,
          textImprovementCharacters: 1000,
          speechToTextMilliseconds: 60000,
        },
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        entries: [],
      };

      const result = command.formatUsage(report);
      expect(result).toContain('2024-01-01');
      expect(result).toContain('2024-01-31');
      expect(result).toContain('Total Usage:');
      expect(result).toContain('10,000');
      expect(result).toContain('Translation: 7,000');
      expect(result).toContain('Documents:   2,000');
      expect(result).toContain('Write:       1,000');
      expect(result).toContain('Voice:       1m 0s');
    });

    it('should format report with per-key entries', () => {
      const report: AdminUsageReport = {
        totalUsage: {
          totalCharacters: 5000,
          textTranslationCharacters: 5000,
          documentTranslationCharacters: 0,
          textImprovementCharacters: 0,
          speechToTextMilliseconds: 0,
        },
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        entries: [
          {
            apiKey: 'dc88****3a2c',
            apiKeyLabel: 'Staging Key',
            usage: {
              totalCharacters: 5000,
              textTranslationCharacters: 5000,
              documentTranslationCharacters: 0,
              textImprovementCharacters: 0,
              speechToTextMilliseconds: 0,
            },
          },
        ],
      };

      const result = command.formatUsage(report);
      expect(result).toContain('Per-Key Usage (1 entries)');
      expect(result).toContain('Staging Key');
      expect(result).toContain('5,000');
    });

    it('should format report with per-key-and-day entries', () => {
      const report: AdminUsageReport = {
        totalUsage: {
          totalCharacters: 3000,
          textTranslationCharacters: 2000,
          documentTranslationCharacters: 500,
          textImprovementCharacters: 500,
          speechToTextMilliseconds: 0,
        },
        startDate: '2024-01-01',
        endDate: '2024-01-02',
        entries: [
          {
            apiKey: 'dc88****3a2c',
            apiKeyLabel: 'Staging Key',
            usageDate: '2024-01-01T00:00:00Z',
            usage: {
              totalCharacters: 3000,
              textTranslationCharacters: 2000,
              documentTranslationCharacters: 500,
              textImprovementCharacters: 500,
          speechToTextMilliseconds: 0,
            },
          },
        ],
      };

      const result = command.formatUsage(report);
      expect(result).toContain('Staging Key');
      expect(result).toContain('2024-01-01T00:00:00Z');
    });

    it('should show totals-only when no per-key entries', () => {
      const result = command.formatUsage(emptyReport);
      expect(result).toContain('Total Usage:');
      expect(result).not.toContain('Per-Key Usage');
    });

    it('should fall back to apiKey when apiKeyLabel is absent', () => {
      const report: AdminUsageReport = {
        totalUsage: {
          totalCharacters: 1000,
          textTranslationCharacters: 1000,
          documentTranslationCharacters: 0,
          textImprovementCharacters: 0,
          speechToTextMilliseconds: 0,
        },
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        entries: [
          {
            apiKey: 'ab12****ef34',
            usage: {
              totalCharacters: 1000,
              textTranslationCharacters: 1000,
              documentTranslationCharacters: 0,
              textImprovementCharacters: 0,
              speechToTextMilliseconds: 0,
            },
          },
        ],
      };

      const result = command.formatUsage(report);
      expect(result).toContain('ab12****ef34');
    });

    it('should fall back to unknown when both apiKeyLabel and apiKey are absent', () => {
      const report: AdminUsageReport = {
        totalUsage: {
          totalCharacters: 500,
          textTranslationCharacters: 500,
          documentTranslationCharacters: 0,
          textImprovementCharacters: 0,
          speechToTextMilliseconds: 0,
        },
        startDate: '2024-02-01',
        endDate: '2024-02-28',
        entries: [
          {
            usage: {
              totalCharacters: 500,
              textTranslationCharacters: 500,
              documentTranslationCharacters: 0,
              textImprovementCharacters: 0,
              speechToTextMilliseconds: 0,
            },
          },
        ],
      };

      const result = command.formatUsage(report);
      expect(result).toContain('unknown');
    });

    it('should not show date part when usageDate is absent', () => {
      const report: AdminUsageReport = {
        totalUsage: {
          totalCharacters: 2000,
          textTranslationCharacters: 2000,
          documentTranslationCharacters: 0,
          textImprovementCharacters: 0,
          speechToTextMilliseconds: 0,
        },
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        entries: [
          {
            apiKeyLabel: 'Dev Key',
            usage: {
              totalCharacters: 2000,
              textTranslationCharacters: 2000,
              documentTranslationCharacters: 0,
              textImprovementCharacters: 0,
              speechToTextMilliseconds: 0,
            },
          },
        ],
      };

      const result = command.formatUsage(report);
      expect(result).toContain('Dev Key');
      expect(result).not.toMatch(/Dev Key\s*\(/);
    });
  });

  describe('formatJson', () => {
    it('should format data as JSON', () => {
      const data = [{ keyId: 'test' }];
      const result = command.formatJson(data);
      expect(JSON.parse(result)).toEqual(data);
    });

    it('should pretty-print with 2-space indent', () => {
      const data = { a: 1 };
      const result = command.formatJson(data);
      expect(result).toBe('{\n  "a": 1\n}');
    });

    it('should handle nested objects', () => {
      const data = { key: { nested: { deep: true } } };
      const result = command.formatJson(data);
      expect(JSON.parse(result)).toEqual(data);
      expect(result).toContain('    "nested"');
    });

    it('should handle null and empty inputs', () => {
      expect(command.formatJson(null)).toBe('null');
      expect(command.formatJson([])).toBe('[]');
      expect(command.formatJson({})).toBe('{}');
    });
  });

  describe('error propagation', () => {
    it('should propagate listKeys errors from client', async () => {
      mockClient.listApiKeys.mockRejectedValue(new Error('Forbidden'));
      await expect(command.listKeys()).rejects.toThrow('Forbidden');
    });

    it('should propagate createKey errors from client', async () => {
      mockClient.createApiKey.mockRejectedValue(new Error('Rate limited'));
      await expect(command.createKey('label')).rejects.toThrow('Rate limited');
    });

    it('should propagate deactivateKey errors from client', async () => {
      mockClient.deactivateApiKey.mockRejectedValue(new Error('Not found'));
      await expect(command.deactivateKey('key-x')).rejects.toThrow('Not found');
    });

    it('should propagate renameKey errors from client', async () => {
      mockClient.renameApiKey.mockRejectedValue(new Error('Unauthorized'));
      await expect(command.renameKey('key-x', 'name')).rejects.toThrow('Unauthorized');
    });

    it('should propagate setKeyLimit errors from client', async () => {
      mockClient.setApiKeyLimit.mockRejectedValue(new Error('Bad request'));
      await expect(command.setKeyLimit('key-x', 100)).rejects.toThrow('Bad request');
    });

    it('should propagate getUsage errors from client', async () => {
      mockClient.getAdminUsage.mockRejectedValue(new Error('Server error'));
      await expect(command.getUsage({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })).rejects.toThrow('Server error');
    });
  });

  describe('getUsage options', () => {
    it('should pass options without groupBy', async () => {
      await command.getUsage({
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });
      expect(mockClient.getAdminUsage).toHaveBeenCalledWith({
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });
    });

    it('should pass key_and_day groupBy', async () => {
      await command.getUsage({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        groupBy: 'key_and_day',
      });
      expect(mockClient.getAdminUsage).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        groupBy: 'key_and_day',
      });
    });
  });
});
