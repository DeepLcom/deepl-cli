/**
 * Integration Tests for Cache CLI Commands
 * Tests cache management with real database operations
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Cache CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-cache-${Date.now()}`);

  // Helper to run CLI commands with isolated config directory (captures stdout only)
  const runCLI = (command: string): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
    });
  };

  // Helper that captures both stdout and stderr (for success messages via Logger.success)
  const runCLIAll = (command: string): string => {
    return execSync(`${command} 2>&1`, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      shell: '/bin/sh',
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

  describe('deepl cache stats', () => {
    it('should show cache statistics', () => {
      const output = runCLI('deepl cache stats');

      // Should contain key metrics
      expect(output).toContain('Cache Status:');
      expect(output).toContain('Entries:');
      expect(output).toContain('Size:');
    });

    it('should show if cache is enabled or disabled', () => {
      const output = runCLI('deepl cache stats');

      // Should show status
      expect(output).toMatch(/Cache Status: (enabled|disabled)/);
    });

    it('should show size in MB and percentage', () => {
      const output = runCLI('deepl cache stats');

      // Should show size format
      expect(output).toMatch(/Size: [\d.]+ MB/);
      expect(output).toMatch(/[\d.]+% used/);
    });
  });

  describe('deepl cache enable', () => {
    it('should enable cache successfully', () => {
      const output = runCLIAll('deepl cache enable');

      expect(output).toContain('Cache enabled');
    });

    it('should not error if cache already enabled', () => {
      // Enable twice
      runCLI('deepl cache enable');
      const output = runCLIAll('deepl cache enable');

      expect(output).toContain('Cache enabled');
    });
  });

  describe('deepl cache disable', () => {
    it('should disable cache successfully', () => {
      const output = runCLIAll('deepl cache disable');

      expect(output).toContain('Cache disabled');
    });

    it('should not error if cache already disabled', () => {
      // Disable twice
      runCLI('deepl cache disable');
      const output = runCLIAll('deepl cache disable');

      expect(output).toContain('Cache disabled');
    });
  });

  describe('deepl cache clear', () => {
    it('should clear cache successfully with --yes flag', () => {
      const output = runCLIAll('deepl cache clear --yes');

      expect(output).toContain('Cache cleared successfully');
    });

    it('should not error when cache is empty', () => {
      // Clear twice
      runCLI('deepl cache clear --yes');
      const output = runCLIAll('deepl cache clear --yes');

      expect(output).toContain('Cache cleared successfully');
    });

    it('should abort without --yes in non-TTY mode', () => {
      const output = runCLIAll('deepl cache clear');

      expect(output).toContain('Aborted');
    });

    it('should accept -y short flag', () => {
      const output = runCLIAll('deepl cache clear -y');

      expect(output).toContain('Cache cleared successfully');
    });
  });

  describe('cache workflow', () => {
    it('should handle enable -> clear -> disable workflow', () => {
      // Enable
      const enableOutput = runCLIAll('deepl cache enable');
      expect(enableOutput).toContain('Cache enabled');

      // Clear
      const clearOutput = runCLIAll('deepl cache clear --yes');
      expect(clearOutput).toContain('Cache cleared successfully');

      // Stats should show 0 entries
      const statsOutput = runCLI('deepl cache stats');
      expect(statsOutput).toContain('Entries: 0');

      // Disable
      const disableOutput = runCLIAll('deepl cache disable');
      expect(disableOutput).toContain('Cache disabled');
    });
  });
});
