/**
 * Tests for ConfigService
 * Following TDD approach - these tests should fail initially
 */

import { ConfigService } from '../../src/storage/config';

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockConfigPath: string;

  beforeEach(() => {
    // Use a temporary config path for testing
    mockConfigPath = '/tmp/deepl-cli-test-config.json';
    configService = new ConfigService(mockConfigPath);
  });

  afterEach(() => {
    // Clean up test config file
    configService.clear();
  });

  describe('initialization', () => {
    it('should create a new ConfigService instance', () => {
      expect(configService).toBeInstanceOf(ConfigService);
    });

    it('should return default config when no config file exists', () => {
      const config = configService.get();
      expect(config).toBeDefined();
      expect(config.defaults.targetLangs).toEqual([]);
      expect(config.cache.enabled).toBe(true);
    });

    it('should create config directory if it does not exist', () => {
      const newPath = '/tmp/nonexistent-dir/config.json';
      const service = new ConfigService(newPath);
      expect(() => service.get()).not.toThrow();
    });
  });

  describe('get()', () => {
    it('should return the entire config object', () => {
      const config = configService.get();
      expect(config).toHaveProperty('auth');
      expect(config).toHaveProperty('defaults');
      expect(config).toHaveProperty('cache');
      expect(config).toHaveProperty('output');
      expect(config).toHaveProperty('watch');
      expect(config).toHaveProperty('team');
    });

    it('should return readonly reference (mutations affect original)', () => {
      // get() now returns Readonly<DeepLConfig> for performance
      // TypeScript prevents mutations at compile time
      const config1 = configService.get();

      // This would be a TypeScript error: Cannot assign to 'targetLangs' because it is a read-only property
      // But in JavaScript runtime, the object is still mutable
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config1 as any).defaults.targetLangs.push('es');

      const config2 = configService.get();
      // Since we return a reference now, mutations affect the original
      expect(config2.defaults.targetLangs).toEqual(['es']);

      // Clean up for other tests
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config2 as any).defaults.targetLangs.pop();
    });
  });

  describe('set()', () => {
    it('should set a top-level config value', () => {
      configService.set('auth.apiKey', 'test-api-key');
      const config = configService.get();
      expect(config.auth.apiKey).toBe('test-api-key');
    });

    it('should set a nested config value', () => {
      configService.set('cache.enabled', false);
      const config = configService.get();
      expect(config.cache.enabled).toBe(false);
    });

    it('should set array values', () => {
      configService.set('defaults.targetLangs', ['es', 'fr', 'de']);
      const config = configService.get();
      expect(config.defaults.targetLangs).toEqual(['es', 'fr', 'de']);
    });

    it('should throw error for invalid path', () => {
      expect(() => {
        configService.set('invalid.path.key', 'value');
      }).toThrow();
    });

    it('should persist changes to disk', () => {
      configService.set('auth.apiKey', 'persistent-key');
      const newService = new ConfigService(mockConfigPath);
      const config = newService.get();
      expect(config.auth.apiKey).toBe('persistent-key');
    });
  });

  describe('getValue()', () => {
    beforeEach(() => {
      configService.set('auth.apiKey', 'test-key');
      configService.set('defaults.targetLangs', ['es', 'fr']);
    });

    it('should get a specific config value by path', () => {
      const apiKey = configService.getValue('auth.apiKey');
      expect(apiKey).toBe('test-key');
    });

    it('should get nested values', () => {
      const targetLangs = configService.getValue('defaults.targetLangs');
      expect(targetLangs).toEqual(['es', 'fr']);
    });

    it('should return undefined for non-existent path', () => {
      const value = configService.getValue('nonexistent.key');
      expect(value).toBeUndefined();
    });

    it('should return default value if provided', () => {
      const value = configService.getValue('nonexistent.key', 'default');
      expect(value).toBe('default');
    });
  });

  describe('has()', () => {
    beforeEach(() => {
      configService.set('auth.apiKey', 'test-key');
    });

    it('should return true if key exists', () => {
      expect(configService.has('auth.apiKey')).toBe(true);
    });

    it('should return false if key does not exist', () => {
      expect(configService.has('auth.nonexistent')).toBe(false);
    });

    it('should return true for top-level keys', () => {
      expect(configService.has('auth')).toBe(true);
    });
  });

  describe('delete()', () => {
    beforeEach(() => {
      configService.set('auth.apiKey', 'test-key');
      configService.set('team.org', 'test-org');
    });

    it('should delete a specific config value', () => {
      configService.delete('auth.apiKey');
      expect(configService.has('auth.apiKey')).toBe(false);
    });

    it('should not affect other config values', () => {
      configService.delete('auth.apiKey');
      expect(configService.getValue('team.org')).toBe('test-org');
    });

    it('should persist deletion to disk', () => {
      configService.delete('auth.apiKey');
      const newService = new ConfigService(mockConfigPath);
      expect(newService.has('auth.apiKey')).toBe(false);
    });
  });

  describe('clear()', () => {
    beforeEach(() => {
      configService.set('auth.apiKey', 'test-key');
      configService.set('defaults.targetLangs', ['es', 'fr']);
    });

    it('should reset config to defaults', () => {
      configService.clear();
      const config = configService.get();
      expect(config.auth.apiKey).toBeUndefined();
      expect(config.defaults.targetLangs).toEqual([]);
    });

    it('should remove config file from disk', () => {
      configService.clear();
      const newService = new ConfigService(mockConfigPath);
      const config = newService.get();
      expect(config.auth.apiKey).toBeUndefined();
    });
  });

  describe('getDefaults()', () => {
    it('should return default configuration', () => {
      const defaults = ConfigService.getDefaults();
      expect(defaults).toBeDefined();
      expect(defaults.auth).toBeDefined();
      expect(defaults.defaults).toBeDefined();
      expect(defaults.cache).toBeDefined();
    });

    it('should return same defaults each time', () => {
      const defaults1 = ConfigService.getDefaults();
      const defaults2 = ConfigService.getDefaults();
      expect(defaults1).toEqual(defaults2);
    });

    it('should have sensible default values', () => {
      const defaults = ConfigService.getDefaults();
      expect(defaults.cache.enabled).toBe(true);
      expect(defaults.cache.maxSize).toBeGreaterThan(0);
      expect(defaults.output.format).toBe('text');
      expect(defaults.defaults.formality).toBe('default');
    });
  });

  describe('validation', () => {
    it('should validate language codes', () => {
      expect(() => {
        configService.set('defaults.sourceLang', 'invalid');
      }).toThrow('Invalid language code');
    });

    it('should accept valid language codes', () => {
      expect(() => {
        configService.set('defaults.sourceLang', 'en');
      }).not.toThrow();
    });

    it('should validate formality values', () => {
      expect(() => {
        configService.set('defaults.formality', 'invalid');
      }).toThrow('Invalid formality');
    });

    it('should validate output format', () => {
      expect(() => {
        configService.set('output.format', 'invalid');
      }).toThrow('Invalid output format');
    });

    it('should validate cache size is positive', () => {
      expect(() => {
        configService.set('cache.maxSize', -1);
      }).toThrow('Cache size must be positive');
    });

    it('should validate boolean values', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configService.set('cache.enabled', 'yes' as any);
      }).toThrow('Expected boolean');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string values', () => {
      configService.set('team.org', '');
      expect(configService.getValue('team.org')).toBe('');
    });

    it('should handle null values', () => {
      configService.set('auth.apiKey', undefined);
      expect(configService.getValue('auth.apiKey')).toBeUndefined();
    });

    it('should handle concurrent writes', async () => {
      const promises = [
        configService.set('auth.apiKey', 'key1'),
        configService.set('team.org', 'org1'),
        configService.set('defaults.sourceLang', 'en'),
      ];
      await Promise.all(promises);
      expect(configService.getValue('auth.apiKey')).toBe('key1');
      expect(configService.getValue('team.org')).toBe('org1');
      expect(configService.getValue('defaults.sourceLang')).toBe('en');
    });

    it('should handle very long values', () => {
      const longValue = 'a'.repeat(10000);
      configService.set('team.org', longValue);
      expect(configService.getValue('team.org')).toBe(longValue);
    });
  });

  describe('type safety', () => {
    it('should maintain type integrity for nested objects', () => {
      const config = configService.get();
      expect(typeof config.cache.enabled).toBe('boolean');
      expect(typeof config.cache.maxSize).toBe('number');
      expect(Array.isArray(config.defaults.targetLangs)).toBe(true);
    });

    it('should preserve array types', () => {
      configService.set('defaults.targetLangs', ['es', 'fr']);
      const langs = configService.getValue('defaults.targetLangs');
      expect(Array.isArray(langs)).toBe(true);
    });
  });
});
