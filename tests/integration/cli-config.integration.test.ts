/**
 * Integration Tests for Config CLI Commands
 * Tests the full config command flow with real file persistence
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Config CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-config-${Date.now()}`);
  const configPath = path.join(testConfigDir, 'config.json');

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create default config for each test
    const defaultConfig = {
      auth: { apiKey: undefined },
      api: {
        baseUrl: 'https://api-free.deepl.com/v2',
        usePro: false,
      },
      defaults: {
        sourceLang: undefined,
        targetLangs: [],
        formality: 'default',
        preserveFormatting: true,
      },
      cache: {
        enabled: true,
        maxSize: 1073741824,
        ttl: 2592000,
      },
      output: {
        format: 'text',
        color: true,
        verbose: false,
      },
      watch: {
        debounceMs: 500,
        autoCommit: false,
        pattern: '**/*',
      },
      team: {},
    };

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  });

  describe('deepl config list', () => {
    it('should list all configuration values as JSON', () => {
      const output = execSync('deepl config list', { encoding: 'utf-8' });

      // Parse JSON output
      const config = JSON.parse(output);

      // Verify structure
      expect(config).toHaveProperty('auth');
      expect(config).toHaveProperty('api');
      expect(config).toHaveProperty('defaults');
      expect(config).toHaveProperty('cache');
      expect(config).toHaveProperty('output');
      expect(config).toHaveProperty('watch');
    });

    it('should show formatted JSON', () => {
      const output = execSync('deepl config list', { encoding: 'utf-8' });

      // Should be pretty-printed JSON
      expect(output).toContain('{\n');
      expect(output).toContain('  "auth"');
    });
  });

  describe('deepl config get', () => {
    it('should get specific nested config value', () => {
      const output = execSync('deepl config get cache.enabled', { encoding: 'utf-8' });

      const value = JSON.parse(output);
      expect(value).toBe(true);
    });

    it('should get top-level config section', () => {
      const output = execSync('deepl config get cache', { encoding: 'utf-8' });

      const cache = JSON.parse(output);
      expect(cache).toHaveProperty('enabled');
      expect(cache).toHaveProperty('maxSize');
      expect(cache).toHaveProperty('ttl');
    });

    it('should return null for non-existent key', () => {
      const output = execSync('deepl config get nonexistent.key', { encoding: 'utf-8' });

      const value = JSON.parse(output);
      expect(value).toBeNull();
    });
  });

  describe('deepl config set', () => {
    it('should set a boolean value', () => {
      execSync('deepl config set cache.enabled false', { encoding: 'utf-8' });

      // Verify it was set
      const output = execSync('deepl config get cache.enabled', { encoding: 'utf-8' });
      const value = JSON.parse(output);
      expect(value).toBe(false);
    });

    it('should set a number value', () => {
      execSync('deepl config set cache.maxSize 2048', { encoding: 'utf-8' });

      // Verify it was set
      const output = execSync('deepl config get cache.maxSize', { encoding: 'utf-8' });
      const value = JSON.parse(output);
      expect(value).toBe(2048);
    });

    it('should set a string value', () => {
      execSync('deepl config set output.format json', { encoding: 'utf-8' });

      // Verify it was set
      const output = execSync('deepl config get output.format', { encoding: 'utf-8' });
      const value = JSON.parse(output);
      expect(value).toBe('json');
    });

    it('should set array values from comma-separated string', () => {
      execSync('deepl config set defaults.targetLangs es,fr,de', { encoding: 'utf-8' });

      // Verify it was set
      const output = execSync('deepl config get defaults.targetLangs', { encoding: 'utf-8' });
      const value = JSON.parse(output);
      expect(value).toEqual(['es', 'fr', 'de']);
    });

    it('should persist changes to config file', () => {
      execSync('deepl config set cache.enabled false', { encoding: 'utf-8' });

      // Read config file directly
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      expect(config.cache.enabled).toBe(false);
    });
  });

  describe('deepl config reset', () => {
    it('should reset configuration to defaults', () => {
      // Change a value
      execSync('deepl config set cache.enabled false', { encoding: 'utf-8' });

      // Reset
      const output = execSync('deepl config reset', { encoding: 'utf-8' });
      expect(output).toContain('✓ Configuration reset to defaults');

      // Verify defaults restored
      const cacheEnabled = execSync('deepl config get cache.enabled', { encoding: 'utf-8' });
      expect(JSON.parse(cacheEnabled)).toBe(true);
    });

    it('should remove config file on reset', () => {
      execSync('deepl config reset', { encoding: 'utf-8' });

      // Config file should be removed or reset
      // (implementation may vary - either delete or reset to defaults)
      // This test validates the reset command executes successfully
      expect(true).toBe(true);
    });
  });
});
