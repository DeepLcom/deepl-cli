/**
 * Integration tests for --config flag
 * Tests using custom configuration files
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI --config flag integration', () => {
  const testDir = path.join(os.tmpdir(), `.deepl-cli-config-test-${Date.now()}`);
  const customConfigPath = path.join(testDir, 'custom-config.json');
  const defaultConfigDir = path.join(testDir, '.deepl-cli-default');
  const defaultConfigPath = path.join(defaultConfigDir, 'config.json');

  const runCLI = (command: string, env: Record<string, string> = {}) => {
    return execSync(command, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: defaultConfigDir,
        ...env
      },
    });
  };

  // Helper that captures both stdout and stderr (for messages via Logger.info/success)
  const runCLIAll = (command: string, env: Record<string, string> = {}) => {
    return execSync(`${command} 2>&1`, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: defaultConfigDir,
        ...env
      },
      shell: '/bin/sh',
    });
  };

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create default config directory
    if (!fs.existsSync(defaultConfigDir)) {
      fs.mkdirSync(defaultConfigDir, { recursive: true });
    }

    // Set up default config with a test API key
    const defaultConfig = {
      auth: { apiKey: 'default-test-key' },
      api: { baseUrl: 'https://api.deepl.com', usePro: true },
      defaults: { sourceLang: undefined, targetLangs: [], formality: 'default', preserveFormatting: true },
      cache: { enabled: true, maxSize: 1073741824, ttl: 2592000 },
      output: { format: 'text', verbose: false, color: true },
      watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
      team: { org: undefined, workspace: undefined },
    };
    fs.writeFileSync(defaultConfigPath, JSON.stringify(defaultConfig, null, 2));

    // Set up custom config with different API key
    const customConfig = {
      auth: { apiKey: 'custom-test-key' },
      api: { baseUrl: 'https://api-free.deepl.com', usePro: false },
      defaults: { sourceLang: 'en', targetLangs: ['es', 'fr'], formality: 'more', preserveFormatting: false },
      cache: { enabled: false, maxSize: 104857600, ttl: 86400 },
      output: { format: 'json', verbose: true, color: false },
      watch: { debounceMs: 1000, autoCommit: true, pattern: '*.txt' },
      team: { org: 'test-org', workspace: 'test-workspace' },
    };
    fs.writeFileSync(customConfigPath, JSON.stringify(customConfig, null, 2));
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('config get command', () => {
    it('should use default config when --config is not specified', () => {
      const output = runCLI('deepl config get auth.apiKey');
      expect(output.trim()).toBe('"defa...-key"');
    });

    it('should use custom config when --config is specified', () => {
      const output = runCLI(`deepl --config "${customConfigPath}" config get auth.apiKey`);
      expect(output.trim()).toBe('"cust...-key"');
    });

    it('should read nested config values from custom config', () => {
      const output = runCLI(`deepl --config "${customConfigPath}" config get api.usePro`);
      expect(output.trim()).toBe('false');
    });

    it('should read array values from custom config', () => {
      const output = runCLI(`deepl --config "${customConfigPath}" config get defaults.targetLangs`);
      const parsed = JSON.parse(output.trim());
      expect(parsed).toEqual(['es', 'fr']);
    });
  });

  describe('config set command', () => {
    it('should write to default config when --config is not specified', () => {
      runCLI('deepl config set api.baseUrl https://custom.api.com');

      const config = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));
      expect(config.api.baseUrl).toBe('https://custom.api.com');
    });

    it('should write to custom config when --config is specified', () => {
      runCLI(`deepl --config "${customConfigPath}" config set api.baseUrl https://custom.api.com`);

      const config = JSON.parse(fs.readFileSync(customConfigPath, 'utf-8'));
      expect(config.api.baseUrl).toBe('https://custom.api.com');

      // Verify default config is unchanged
      const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));
      expect(defaultConfig.api.baseUrl).toBe('https://api.deepl.com');
    });
  });

  describe('config list command', () => {
    it('should list default config when --config is not specified', () => {
      const output = runCLI('deepl config list');
      const config = JSON.parse(output.trim());
      // API keys are masked in list output
      expect(config.auth.apiKey).toBe('defa...-key');
      expect(config.api.usePro).toBe(true);
    });

    it('should list custom config when --config is specified', () => {
      const output = runCLI(`deepl --config "${customConfigPath}" config list`);
      const config = JSON.parse(output.trim());
      // API keys are masked in list output
      expect(config.auth.apiKey).toBe('cust...-key');
      expect(config.api.usePro).toBe(false);
      expect(config.defaults.formality).toBe('more');
    });
  });

  describe('auth command', () => {
    it('should set API key in custom config file', () => {
      // Use config set instead of auth set-key to bypass validation
      runCLI(`deepl --config "${customConfigPath}" config set auth.apiKey new-custom-key`);

      const config = JSON.parse(fs.readFileSync(customConfigPath, 'utf-8'));
      expect(config.auth.apiKey).toBe('new-custom-key');
    });
  });

  describe('error handling', () => {
    it('should load defaults if config file does not exist', () => {
      const nonExistentPath = path.join(testDir, 'nonexistent.json');

      // Config file doesn't exist, so it should load defaults (apiKey is undefined)
      const output = runCLI(`deepl --config "${nonExistentPath}" config get auth.apiKey`);
      expect(output.trim()).toBe('null'); // undefined becomes null in JSON output
    });

    it('should fail if --config value is not provided', () => {
      expect.assertions(1);
      try {
        runCLI('deepl --config config get auth.apiKey');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('integration with other commands', () => {
    it('should use custom config API key for auth show', () => {
      const output = runCLIAll(`deepl --config "${customConfigPath}" auth show`);
      expect(output).toContain('cust');
      expect(output).toContain('-key'); // Masked key
    });

    it('should create new config file if it does not exist', () => {
      const newConfigPath = path.join(testDir, 'new-config.json');
      expect(fs.existsSync(newConfigPath)).toBe(false);

      // Use config set instead of auth set-key to bypass validation
      runCLI(`deepl --config "${newConfigPath}" config set auth.apiKey brand-new-key`);

      expect(fs.existsSync(newConfigPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(newConfigPath, 'utf-8'));
      expect(config.auth.apiKey).toBe('brand-new-key');
    });
  });

  describe('config path security validation', () => {
    it('should reject --config path without .json extension', () => {
      const txtPath = path.join(testDir, 'config.txt');
      fs.writeFileSync(txtPath, '{}');

      expect.assertions(2);
      try {
        runCLI(`deepl --config "${txtPath}" config get auth.apiKey`);
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
        expect(error.stderr || error.stdout).toContain('.json extension');
      }
    });

    it('should reject --config path with no extension', () => {
      const noExtPath = path.join(testDir, 'myconfig');
      fs.writeFileSync(noExtPath, '{}');

      expect.assertions(1);
      try {
        runCLI(`deepl --config "${noExtPath}" config get auth.apiKey`);
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should reject --config path that is a symlink', () => {
      const realConfig = path.join(testDir, 'real-config.json');
      const symlinkConfig = path.join(testDir, 'link-config.json');
      fs.writeFileSync(realConfig, JSON.stringify({ auth: {} }));
      fs.symlinkSync(realConfig, symlinkConfig);

      expect.assertions(2);
      try {
        runCLI(`deepl --config "${symlinkConfig}" config get auth.apiKey`);
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
        expect(error.stderr || error.stdout).toContain('symlink');
      }
    });

    it('should accept --config path with .json extension (case-insensitive)', () => {
      const upperCasePath = path.join(testDir, 'config.JSON');
      fs.writeFileSync(upperCasePath, JSON.stringify({
        auth: { apiKey: 'upper-case-key' },
        api: { baseUrl: 'https://api.deepl.com', usePro: true },
        defaults: { targetLangs: [], formality: 'default', preserveFormatting: true },
        cache: { enabled: true, maxSize: 1073741824, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: true },
        watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
        team: {},
      }, null, 2));

      const output = runCLI(`deepl --config "${upperCasePath}" config get auth.apiKey`);
      expect(output.trim()).toContain('uppe');
    });

    it('should allow non-existent --config path with .json extension', () => {
      const newPath = path.join(testDir, 'brand-new.json');
      expect(fs.existsSync(newPath)).toBe(false);

      const output = runCLI(`deepl --config "${newPath}" config get auth.apiKey`);
      expect(output.trim()).toBe('null');
    });
  });

  describe('precedence and isolation', () => {
    it('should not affect default config when using custom config', () => {
      const originalDefault = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));

      // Modify custom config
      runCLI(`deepl --config "${customConfigPath}" config set api.baseUrl https://changed.com`);

      // Check default config is unchanged
      const currentDefault = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));
      expect(currentDefault).toEqual(originalDefault);
    });

    it('should handle relative paths for --config', () => {
      const relativeConfigPath = path.relative(process.cwd(), customConfigPath);
      const output = runCLI(`deepl --config "${relativeConfigPath}" config get auth.apiKey`);
      expect(output.trim()).toBe('"cust...-key"');
    });
  });
});
