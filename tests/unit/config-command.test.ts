/**
 * Tests for Config Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { ConfigCommand } from '../../src/cli/commands/config';
import { ConfigService } from '../../src/storage/config';

// Mock dependencies
jest.mock('../../src/storage/config');

describe('ConfigCommand', () => {
  let mockConfigService: jest.Mocked<ConfigService>;
  let configCommand: ConfigCommand;

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

    configCommand = new ConfigCommand(mockConfigService);
  });

  describe('get()', () => {
    it('should get specific config value', async () => {
      mockConfigService.getValue.mockReturnValue('es');

      const value = await configCommand.get('defaults.sourceLang');

      expect(value).toBe('es');
      expect(mockConfigService.getValue).toHaveBeenCalledWith('defaults.sourceLang');
    });

    it('should return undefined for non-existent key', async () => {
      mockConfigService.getValue.mockReturnValue(undefined);

      const value = await configCommand.get('nonexistent.key');

      expect(value).toBeUndefined();
    });

    it('should get entire config when no key specified', async () => {
      mockConfigService.get.mockReturnValue({
        auth: { apiKey: 'test-key' },
        api: { baseUrl: 'https://api.deepl.com/v2', usePro: true },
        defaults: {
          sourceLang: undefined,
          targetLangs: ['es', 'fr'],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: { enabled: true, maxSize: 1024, ttl: 2592000 },
        output: { format: 'text', color: true, verbose: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '**/*' },
        team: {},
      });

      const config = await configCommand.get();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('auth');
      expect(config).toHaveProperty('defaults');
    });
  });

  describe('set()', () => {
    it('should set config value', async () => {
      mockConfigService.set.mockResolvedValue(undefined);

      await configCommand.set('defaults.sourceLang', 'en');

      expect(mockConfigService.set).toHaveBeenCalledWith('defaults.sourceLang', 'en');
    });

    it('should set array values', async () => {
      mockConfigService.set.mockResolvedValue(undefined);

      await configCommand.set('defaults.targetLangs', 'es,fr,de');

      expect(mockConfigService.set).toHaveBeenCalledWith('defaults.targetLangs', ['es', 'fr', 'de']);
    });

    it('should set boolean values', async () => {
      mockConfigService.set.mockResolvedValue(undefined);

      await configCommand.set('cache.enabled', 'false');

      expect(mockConfigService.set).toHaveBeenCalledWith('cache.enabled', false);
    });

    it('should set number values', async () => {
      mockConfigService.set.mockResolvedValue(undefined);

      await configCommand.set('cache.maxSize', '2048');

      expect(mockConfigService.set).toHaveBeenCalledWith('cache.maxSize', 2048);
    });

    it('should throw error for invalid key', async () => {
      mockConfigService.set.mockRejectedValue(new Error('Invalid config key'));

      await expect(
        configCommand.set('invalid.key', 'value')
      ).rejects.toThrow('Invalid config key');
    });

    it('should throw error for invalid value', async () => {
      mockConfigService.set.mockRejectedValue(new Error('Invalid language code'));

      await expect(
        configCommand.set('defaults.sourceLang', 'invalid')
      ).rejects.toThrow('Invalid language code');
    });
  });

  describe('list()', () => {
    it('should list all config values', async () => {
      mockConfigService.get.mockReturnValue({
        auth: { apiKey: 'test-key' },
        api: { baseUrl: 'https://api.deepl.com/v2', usePro: true },
        defaults: {
          sourceLang: 'en',
          targetLangs: ['es', 'fr'],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: { enabled: true, maxSize: 1024, ttl: 2592000 },
        output: { format: 'text', color: true, verbose: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '**/*' },
        team: {},
      });

      const config = await configCommand.list();

      expect(config).toHaveProperty('auth');
      expect(config).toHaveProperty('defaults');
      expect(config).toHaveProperty('cache');
    });

    it('should format config as readable key-value pairs', async () => {
      mockConfigService.get.mockReturnValue({
        auth: { apiKey: 'test-key' },
        api: { baseUrl: 'https://api.deepl.com/v2', usePro: true },
        defaults: {
          sourceLang: 'en',
          targetLangs: ['es', 'fr'],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: { enabled: true, maxSize: 1024, ttl: 2592000 },
        output: { format: 'text', color: true, verbose: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '**/*' },
        team: {},
      });

      const config = await configCommand.list();

      expect(config).toBeDefined();
    });

    it('should hide sensitive values like API keys', async () => {
      mockConfigService.get.mockReturnValue({
        auth: { apiKey: 'super-secret-key-123' },
        api: { baseUrl: 'https://api.deepl.com/v2', usePro: true },
        defaults: {
          sourceLang: undefined,
          targetLangs: [],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: { enabled: true, maxSize: 1024, ttl: 2592000 },
        output: { format: 'text', color: true, verbose: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '**/*' },
        team: {},
      });

      const config = await configCommand.list();

      // Should mask API key
      expect(JSON.stringify(config)).not.toContain('super-secret-key-123');
    });
  });

  describe('reset()', () => {
    it('should reset config to defaults', async () => {
      mockConfigService.clear.mockResolvedValue(undefined);

      await configCommand.reset();

      expect(mockConfigService.clear).toHaveBeenCalled();
    });

    it('should handle reset errors', async () => {
      mockConfigService.clear.mockRejectedValue(new Error('Failed to reset'));

      await expect(configCommand.reset()).rejects.toThrow('Failed to reset');
    });
  });
});
