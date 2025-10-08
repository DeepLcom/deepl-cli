/**
 * Tests for Auth Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { AuthCommand } from '../../src/cli/commands/auth';
import { ConfigService } from '../../src/storage/config';
import { DeepLClient } from '../../src/api/deepl-client';

// Mock dependencies
jest.mock('../../src/storage/config');
jest.mock('../../src/api/deepl-client');

describe('AuthCommand', () => {
  let mockConfigService: jest.Mocked<ConfigService>;
  let authCommand: AuthCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn().mockReturnValue({}),
      getValue: jest.fn().mockReturnValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      has: jest.fn().mockReturnValue(false),
      delete: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      getDefaults: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<ConfigService>;

    authCommand = new AuthCommand(mockConfigService);
  });

  describe('setKey()', () => {
    it('should store API key in config', async () => {
      // Mock DeepL client validation
      const mockGetUsage = jest.fn().mockResolvedValue({ character: { count: 0, limit: 500000 } });
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(() => ({
        getUsage: mockGetUsage,
      } as any));

      await authCommand.setKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx');

      expect(mockConfigService.set).toHaveBeenCalledWith('auth.apiKey', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx');
      expect(mockGetUsage).toHaveBeenCalled();
    });

    it('should throw error for empty API key', async () => {
      await expect(authCommand.setKey('')).rejects.toThrow('API key cannot be empty');
    });

    it('should validate API key with DeepL API', async () => {
      // Mock DeepL client validation
      const mockGetUsage = jest.fn().mockResolvedValue({ character: { count: 0, limit: 500000 } });
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(() => ({
        getUsage: mockGetUsage,
      } as any));

      await authCommand.setKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx');

      // Should validate by making a test request
      expect(mockGetUsage).toHaveBeenCalled();
      expect(mockConfigService.set).toHaveBeenCalled();
    });

    it('should handle config save errors', async () => {
      // Mock DeepL client validation to succeed
      const mockGetUsage = jest.fn().mockResolvedValue({ character: { count: 0, limit: 500000 } });
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(() => ({
        getUsage: mockGetUsage,
      } as any));

      (mockConfigService.set as jest.Mock).mockRejectedValueOnce(new Error('Failed to save config'));

      await expect(authCommand.setKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx')).rejects.toThrow('Failed to save config');
    });
  });

  describe('getKey()', () => {
    it('should retrieve API key from config', async () => {
      (mockConfigService.getValue as jest.Mock).mockReturnValueOnce('test-api-key-123');

      const key = await authCommand.getKey();

      expect(key).toBe('test-api-key-123');
      expect(mockConfigService.getValue).toHaveBeenCalledWith('auth.apiKey');
    });

    it('should return undefined when no key is set', async () => {
      const key = await authCommand.getKey();

      expect(key).toBeUndefined();
    });

    it('should check environment variable DEEPL_API_KEY', async () => {
      process.env['DEEPL_API_KEY'] = 'env-api-key';

      const key = await authCommand.getKey();

      expect(key).toBe('env-api-key');

      delete process.env['DEEPL_API_KEY'];
    });

    it('should prefer config over environment variable', async () => {
      process.env['DEEPL_API_KEY'] = 'env-api-key';
      (mockConfigService.getValue as jest.Mock).mockReturnValueOnce('config-api-key');

      const key = await authCommand.getKey();

      expect(key).toBe('config-api-key');

      delete process.env['DEEPL_API_KEY'];
    });
  });

  describe('clearKey()', () => {
    it('should remove API key from config', async () => {
      await authCommand.clearKey();

      expect(mockConfigService.delete).toHaveBeenCalledWith('auth.apiKey');
    });

    it('should handle config delete errors', async () => {
      (mockConfigService.delete as jest.Mock).mockRejectedValueOnce(new Error('Failed to delete'));

      await expect(authCommand.clearKey()).rejects.toThrow('Failed to delete');
    });
  });
});
