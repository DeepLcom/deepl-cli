/**
 * Tests for Auth Command
 * Following TDD approach - these tests should fail initially
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { ConfigService } from '../../src/storage/config';

// Mock dependencies
jest.mock('../../src/storage/config');

describe('Auth Command', () => {
  let mockConfigService: jest.Mocked<ConfigService>;
  let authCommand: {
    setKey: (apiKey: string) => Promise<void>;
    getKey: () => Promise<string | undefined>;
    clearKey: () => Promise<void>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn(),
      getValue: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
  });

  describe('setKey()', () => {
    it('should store API key in config', async () => {
      mockConfigService.set.mockResolvedValue(undefined);

      await authCommand.setKey('test-api-key-123');

      expect(mockConfigService.set).toHaveBeenCalledWith('auth.apiKey', 'test-api-key-123');
    });

    it('should throw error for empty API key', async () => {
      await expect(authCommand.setKey('')).rejects.toThrow('API key cannot be empty');
    });

    it('should throw error for invalid API key format', async () => {
      await expect(authCommand.setKey('invalid-key')).rejects.toThrow('Invalid API key format');
    });

    it('should validate API key with DeepL API', async () => {
      mockConfigService.set.mockResolvedValue(undefined);

      await authCommand.setKey('test-api-key-123');

      // Should validate by making a test request
      expect(mockConfigService.set).toHaveBeenCalled();
    });

    it('should handle config save errors', async () => {
      mockConfigService.set.mockRejectedValue(new Error('Failed to save config'));

      await expect(authCommand.setKey('test-api-key-123')).rejects.toThrow('Failed to save config');
    });
  });

  describe('getKey()', () => {
    it('should retrieve API key from config', async () => {
      mockConfigService.getValue.mockReturnValue('test-api-key-123');

      const key = await authCommand.getKey();

      expect(key).toBe('test-api-key-123');
      expect(mockConfigService.getValue).toHaveBeenCalledWith('auth.apiKey');
    });

    it('should return undefined when no key is set', async () => {
      mockConfigService.getValue.mockReturnValue(undefined);

      const key = await authCommand.getKey();

      expect(key).toBeUndefined();
    });

    it('should check environment variable DEEPL_API_KEY', async () => {
      process.env.DEEPL_API_KEY = 'env-api-key';
      mockConfigService.getValue.mockReturnValue(undefined);

      const key = await authCommand.getKey();

      expect(key).toBe('env-api-key');

      delete process.env.DEEPL_API_KEY;
    });

    it('should prefer config over environment variable', async () => {
      process.env.DEEPL_API_KEY = 'env-api-key';
      mockConfigService.getValue.mockReturnValue('config-api-key');

      const key = await authCommand.getKey();

      expect(key).toBe('config-api-key');

      delete process.env.DEEPL_API_KEY;
    });
  });

  describe('clearKey()', () => {
    it('should remove API key from config', async () => {
      mockConfigService.delete.mockResolvedValue(undefined);

      await authCommand.clearKey();

      expect(mockConfigService.delete).toHaveBeenCalledWith('auth.apiKey');
    });

    it('should handle config delete errors', async () => {
      mockConfigService.delete.mockRejectedValue(new Error('Failed to delete'));

      await expect(authCommand.clearKey()).rejects.toThrow('Failed to delete');
    });
  });
});
