/**
 * Integration Tests for Usage CLI Command
 * Tests the usage command CLI behavior and output formatting
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Usage CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-usage-${Date.now()}`);

  // Helper to run CLI commands with isolated config directory
  const runCLI = (command: string, options: { stdio?: any } = {}): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      ...options,
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

  describe('deepl usage --help', () => {
    it('should display help for usage command', () => {
      const output = runCLI('deepl usage --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('deepl usage');
      expect(output).toContain('Show API usage statistics');
    });
  });

  describe('deepl usage without API key', () => {
    it('should require API key to be configured', () => {
      // Ensure no API key is set
      try {
        runCLI('deepl auth clear', { stdio: 'pipe' });
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl usage', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should indicate API key is required
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });
  });

  describe('deepl usage command structure', () => {
    it('should be available as a command', () => {
      const helpOutput = runCLI('deepl --help');

      // Usage command should be listed in main help
      expect(helpOutput).toContain('usage');
      expect(helpOutput).toContain('Show API usage statistics');
    });

    it('should not require any arguments', () => {
      // Help should show no required arguments
      const output = runCLI('deepl usage --help');

      // Should be simple command with no required parameters
      expect(output).toContain('Usage: deepl usage');
      expect(output).not.toContain('<required');
      expect(output).not.toContain('[arguments]');
    });
  });
});
