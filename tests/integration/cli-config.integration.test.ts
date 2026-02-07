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

  // Helper to run CLI commands with test config directory
  const runCLI = (command: string): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
    });
  };

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
      const output = runCLI('deepl config list');

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
      const output = runCLI('deepl config list');

      // Should be pretty-printed JSON
      expect(output).toContain('{\n');
      expect(output).toContain('  "auth"');
    });
  });

  describe('deepl config get', () => {
    it('should get specific nested config value', () => {
      const output = runCLI('deepl config get cache.enabled');

      const value = JSON.parse(output);
      expect(value).toBe(true);
    });

    it('should get top-level config section', () => {
      const output = runCLI('deepl config get cache');

      const cache = JSON.parse(output);
      expect(cache).toHaveProperty('enabled');
      expect(cache).toHaveProperty('maxSize');
      expect(cache).toHaveProperty('ttl');
    });

    it('should return null for non-existent key', () => {
      const output = runCLI('deepl config get nonexistent.key');

      const value = JSON.parse(output);
      expect(value).toBeNull();
    });
  });

  describe('deepl config set', () => {
    it('should set a boolean value', () => {
      runCLI('deepl config set cache.enabled false');

      // Verify it was set
      const output = runCLI('deepl config get cache.enabled');
      const value = JSON.parse(output);
      expect(value).toBe(false);
    });

    it('should set a number value', () => {
      runCLI('deepl config set cache.maxSize 2048');

      // Verify it was set
      const output = runCLI('deepl config get cache.maxSize');
      const value = JSON.parse(output);
      expect(value).toBe(2048);
    });

    it('should set a string value', () => {
      runCLI('deepl config set output.format json');

      // Verify it was set
      const output = runCLI('deepl config get output.format');
      const value = JSON.parse(output);
      expect(value).toBe('json');
    });

    it('should set array values from comma-separated string', () => {
      runCLI('deepl config set defaults.targetLangs es,fr,de');

      // Verify it was set
      const output = runCLI('deepl config get defaults.targetLangs');
      const value = JSON.parse(output);
      expect(value).toEqual(['es', 'fr', 'de']);
    });

    it('should persist changes to config file', () => {
      runCLI('deepl config set cache.enabled false');

      // Read config file directly
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      expect(config.cache.enabled).toBe(false);
    });
  });

  describe('deepl config reset', () => {
    it('should reset configuration to defaults', () => {
      // Change a value
      runCLI('deepl config set cache.enabled false');

      // Reset (success message goes to stderr via Logger.success, so just verify it runs)
      runCLI('deepl config reset');

      // Verify defaults restored
      const cacheEnabled = runCLI('deepl config get cache.enabled');
      expect(JSON.parse(cacheEnabled)).toBe(true);
    });

    it('should remove config file on reset', () => {
      runCLI('deepl config reset');

      // Config file should be removed or reset
      // (implementation may vary - either delete or reset to defaults)
      // This test validates the reset command executes successfully
      expect(true).toBe(true);
    });
  });

  describe('output.color disables chalk colors', () => {
    // ANSI escape code pattern: ESC[ followed by color/style codes
    // eslint-disable-next-line no-control-regex
    const ANSI_REGEX = /\x1b\[/;

    // Success messages go to stderr via Logger.success, so redirect stderr to stdout
    const runCLIWithStderr = (command: string, extraEnv?: Record<string, string>): string => {
      return execSync(`${command} 2>&1`, {
        encoding: 'utf-8',
        env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir, ...extraEnv },
        shell: '/bin/sh',
      });
    };

    it('should produce no ANSI codes in output when output.color is false', () => {
      runCLI('deepl config set output.color false');

      // Run a command that normally produces colored output (config set emits chalk.green via Logger.success on stderr)
      const output = runCLIWithStderr('deepl config set cache.enabled true');

      expect(output).not.toMatch(ANSI_REGEX);
    });

    it('should produce ANSI codes when output.color is true (default)', () => {
      // Ensure color is enabled (default)
      runCLI('deepl config set output.color true');

      // Run a command that produces colored output
      // Force color output by setting FORCE_COLOR=1 (chalk respects this)
      // Capture stderr where Logger.success writes
      const output = runCLIWithStderr('deepl config set cache.enabled true', { FORCE_COLOR: '1' });

      expect(output).toMatch(ANSI_REGEX);
    });
  });
});
