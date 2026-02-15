/**
 * E2E Tests for Config Command
 * Tests the `deepl config` command end-to-end
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Config Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-config');
  const { runCLI, runCLIAll, runCLIExpectError } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('config --help', () => {
    it('should display help text', () => {
      const output = runCLI('config --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('config');
      expect(output).toContain('Options:');
    });

    it('should describe the command', () => {
      const output = runCLI('config --help');

      expect(output).toMatch(/config|settings|manage/i);
    });

    it('should list subcommands', () => {
      const output = runCLI('config --help');

      expect(output).toContain('Commands:');
    });
  });

  describe('config list', () => {
    it('should display configuration as JSON', () => {
      const output = runCLI('config list');

      const config = JSON.parse(output);
      expect(config).toHaveProperty('cache');
      expect(config).toHaveProperty('output');
    });

    it('should exit successfully', () => {
      const result = runCLIExpectError('config list');
      expect(result.status).toBe(0);
    });
  });

  describe('config get', () => {
    it('should get a config value', () => {
      const output = runCLI('config get cache.enabled');
      const value = JSON.parse(output);
      expect(typeof value).toBe('boolean');
    });

    it('should return null for non-existent key', () => {
      const output = runCLI('config get nonexistent.key');
      const value = JSON.parse(output);
      expect(value).toBeNull();
    });
  });

  describe('config set and get workflow', () => {
    it('should set and retrieve a boolean value', () => {
      runCLI('config set cache.enabled false');

      const output = runCLI('config get cache.enabled');
      const value = JSON.parse(output);
      expect(value).toBe(false);

      // Restore default
      runCLI('config set cache.enabled true');
    });

    it('should set and retrieve a string value', () => {
      runCLI('config set output.format json');

      const output = runCLI('config get output.format');
      const value = JSON.parse(output);
      expect(value).toBe('json');

      // Restore default
      runCLI('config set output.format text');
    });
  });

  describe('config reset', () => {
    it('should abort without --yes in non-TTY mode', () => {
      const output = runCLIAll('config reset');
      expect(output).toContain('Aborted');
    });

    it('should reset with --yes flag', () => {
      // Change a value
      runCLI('config set cache.enabled false');

      // Reset
      runCLI('config reset --yes');

      // Verify defaults restored
      const output = runCLI('config get cache.enabled');
      expect(JSON.parse(output)).toBe(true);
    });
  });

  describe('config command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('config');
    });

    it('should show config in main help with description', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toMatch(/config/i);
    });
  });
});
