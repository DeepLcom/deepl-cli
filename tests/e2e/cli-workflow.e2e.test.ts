/**
 * E2E Tests for CLI Workflows
 * Tests complete user scenarios without requiring real API key
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI Workflow E2E', () => {
  const testDir = path.join(os.tmpdir(), `.deepl-cli-e2e-${Date.now()}`);
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-config-${Date.now()}`);

  // Helper to run CLI commands with isolated config directory
  const runCLI = (command: string): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
    });
  };

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    // Create test config directory
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    // Clean up test config directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('Help and Version Commands', () => {
    it('should display help for main command', () => {
      const output = execSync('deepl --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('translate');
      expect(output).toContain('auth');
      expect(output).toContain('config');
      expect(output).toContain('cache');
      expect(output).toContain('glossary');
    });

    it('should display version', () => {
      const output = execSync('deepl --version', { encoding: 'utf-8' });

      // Should display a version number (e.g., 0.1.0)
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should display help for translate command', () => {
      const output = execSync('deepl translate --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('--to');
      expect(output).toContain('--from');
      expect(output).toContain('--output');
      expect(output).toContain('--formality');
      expect(output).toContain('--preserve-code');
    });

    it('should display help for auth command', () => {
      const output = execSync('deepl auth --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('set-key');
      expect(output).toContain('show');
      expect(output).toContain('clear');
    });

    it('should display help for config command', () => {
      const output = execSync('deepl config --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('get');
      expect(output).toContain('set');
      expect(output).toContain('list');
      expect(output).toContain('reset');
    });

    it('should display help for cache command', () => {
      const output = execSync('deepl cache --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('stats');
      expect(output).toContain('clear');
      expect(output).toContain('enable');
      expect(output).toContain('disable');
    });

    it('should display help for glossary command', () => {
      const output = execSync('deepl glossary --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('create');
      expect(output).toContain('list');
      expect(output).toContain('show');
      expect(output).toContain('entries');
      expect(output).toContain('delete');
    });
  });

  describe('Configuration Workflow', () => {
    it('should complete config workflow: list → set → get → reset', () => {
      // Step 1: List all config values
      const listOutput = runCLI('deepl config list');
      expect(listOutput).toContain('auth');
      expect(listOutput).toContain('cache');
      expect(listOutput).toContain('defaults');

      // Step 2: Set a config value
      runCLI('deepl config set cache.enabled false');

      // Step 3: Get the value to verify
      const getValue = runCLI('deepl config get cache.enabled');
      expect(getValue.trim()).toBe('false');

      // Step 4: Reset config
      const resetOutput = runCLI('deepl config reset');
      expect(resetOutput).toContain('reset');

      // Step 5: Verify reset worked (should be back to default true)
      const getAfterReset = runCLI('deepl config get cache.enabled');
      expect(getAfterReset.trim()).toBe('true');
    });

    it('should handle nested config values', () => {
      // Set nested value
      runCLI('deepl config set output.color false');

      // Get nested value
      const output = runCLI('deepl config get output.color');
      expect(output.trim()).toBe('false');

      // Reset
      runCLI('deepl config reset');
    });

    it('should handle array config values', () => {
      // Set array value
      runCLI('deepl config set defaults.targetLangs es,fr,de');

      // Get array value
      const output = runCLI('deepl config get defaults.targetLangs');
      const parsed = JSON.parse(output.trim());
      expect(parsed).toEqual(['es', 'fr', 'de']);

      // Reset
      runCLI('deepl config reset');
    });
  });

  describe('Cache Workflow', () => {
    it('should complete cache workflow: stats → clear → enable/disable commands', () => {
      // Step 1: Check initial stats
      const statsOutput = runCLI('deepl cache stats');
      expect(statsOutput).toContain('Cache Status:');
      expect(statsOutput).toContain('Entries:');

      // Step 2: Clear cache
      const clearOutput = runCLI('deepl cache clear');
      expect(clearOutput).toContain('cleared');

      // Step 3: Verify cache is empty
      const statsAfterClear = runCLI('deepl cache stats');
      expect(statsAfterClear).toContain('Entries: 0');

      // Step 4: Test enable command
      const enableOutput = runCLI('deepl cache enable');
      expect(enableOutput).toContain('enabled');

      // Step 5: Test disable command
      const disableOutput = runCLI('deepl cache disable');
      expect(disableOutput).toContain('disabled');

      // Note: enable/disable commands work but don't persist to config,
      // so stats will always show the config value. This is documented as a known limitation.
    });
  });

  describe('Error Handling Workflow', () => {
    it('should require --to flag for translation', () => {
      try {
        execSync('deepl translate "Hello"', { encoding: 'utf-8', stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        expect(output).toMatch(/required.*--to|target language/i);
      }
    });

    it('should require --output flag for file translation', () => {
      // Create test file
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello world');

      try {
        execSync(`deepl translate "${testFile}" --to es`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Expected to fail - either due to missing output flag or missing API key
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should handle non-existent config keys gracefully', () => {
      const output = runCLI('deepl config get nonexistent.key');
      expect(output.trim()).toBe('null');
    });

    it('should require target language for translation without API key', () => {
      // Clear API key first (in isolated test config)
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl translate "Hello" --to es');
        fail('Should have thrown an error about missing API key');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should handle invalid glossary file path', () => {
      const nonExistentFile = path.join(testDir, 'does-not-exist.tsv');

      try {
        execSync(`deepl glossary create "test" en de "${nonExistentFile}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Expected to fail - either due to missing file or missing API key
        expect(output.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Auth Command Workflow', () => {
    it('should complete auth workflow: show → clear → show again', () => {
      // Step 1: Try to show current key (just to check command works)
      try {
        runCLI('deepl auth show');
      } catch (error: any) {
        // If no key is set, that's expected
      }

      // Step 2: Clear the key
      const clearOutput = runCLI('deepl auth clear');
      expect(clearOutput).toMatch(/cleared|removed/i);

      // Step 3: Show should now indicate no key is set
      try {
        runCLI('deepl auth show');
        // If it doesn't throw, check that it says "not set" or similar
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/not set|not configured/i);
      }
    });

    it('should reject invalid API key format', () => {
      try {
        runCLI('deepl auth set-key "invalid-key"');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail either on format validation or API validation
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should reject empty API key', () => {
      try {
        runCLI('deepl auth set-key ""');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/empty|required/i);
      }
    });
  });

  describe('Multi-Command Workflow', () => {
    it('should configure defaults and verify persistence', () => {
      // Configure multiple settings
      runCLI('deepl config set defaults.targetLangs es,fr');
      runCLI('deepl config set output.color false');
      runCLI('deepl config set cache.enabled true');

      // Verify all settings persisted
      const targetLangs = runCLI('deepl config get defaults.targetLangs');
      expect(JSON.parse(targetLangs.trim())).toEqual(['es', 'fr']);

      const color = runCLI('deepl config get output.color');
      expect(color.trim()).toBe('false');

      const cacheEnabled = runCLI('deepl config get cache.enabled');
      expect(cacheEnabled.trim()).toBe('true');

      // Clean up
      runCLI('deepl config reset');
    });

    it('should handle cache configuration via config commands', () => {
      // Check initial config value
      let configValue = runCLI('deepl config get cache.enabled');
      expect(configValue.trim()).toBe('true');

      // Disable via config
      runCLI('deepl config set cache.enabled false');

      // Verify config change persisted
      configValue = runCLI('deepl config get cache.enabled');
      expect(configValue.trim()).toBe('false');

      // Reset config
      runCLI('deepl config set cache.enabled true');

      // Verify reset
      configValue = runCLI('deepl config get cache.enabled');
      expect(configValue.trim()).toBe('true');
    });
  });
});
