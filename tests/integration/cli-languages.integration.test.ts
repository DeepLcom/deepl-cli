/**
 * Integration Tests for Languages CLI Command
 * Tests the languages command CLI behavior and output formatting
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Languages CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-languages-${Date.now()}`);

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

  describe('deepl languages --help', () => {
    it('should display help for languages command', () => {
      const output = runCLI('deepl languages --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('deepl languages');
      expect(output).toContain('List supported source and target languages');
      expect(output).toContain('--source');
      expect(output).toContain('--target');
    });
  });

  describe('deepl languages without API key (graceful degradation)', () => {
    it('should show registry-only output with warning when no API key', () => {
      // Ensure no API key is set
      try {
        runCLI('deepl auth clear', { stdio: 'pipe' });
      } catch {
        // Ignore if already cleared
      }

      // Remove DEEPL_API_KEY from env for this test
      const output = execSync('deepl languages', {
        encoding: 'utf-8',
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: testConfigDir,
          DEEPL_API_KEY: '',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Should show languages from registry even without API key
      expect(output).toContain('Source Languages:');
      expect(output).toContain('Target Languages:');
    });

    it('should show extended languages without API key', () => {
      const output = execSync('deepl languages --source', {
        encoding: 'utf-8',
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: testConfigDir,
          DEEPL_API_KEY: '',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      expect(output).toContain('Source Languages:');
      expect(output).toContain('Extended Languages');
    });
  });

  describe('deepl languages command structure', () => {
    it('should be available as a command', () => {
      const helpOutput = runCLI('deepl --help');

      // Languages command should be listed in main help
      expect(helpOutput).toContain('languages');
      expect(helpOutput).toContain('List supported source and target languages');
    });

    it('should support --source flag', () => {
      const output = runCLI('deepl languages --help');

      // Should have --source flag
      expect(output).toContain('--source');
      expect(output).toContain('-s');
      expect(output).toContain('Show only source languages');
    });

    it('should support --target flag', () => {
      const output = runCLI('deepl languages --help');

      // Should have --target flag
      expect(output).toContain('--target');
      expect(output).toContain('-t');
      expect(output).toContain('Show only target languages');
    });

    it('should not require any arguments', () => {
      const output = runCLI('deepl languages --help');

      // Should be simple command with no required parameters
      expect(output).toContain('Usage: deepl languages');
      expect(output).not.toContain('<required');
    });

    it('should accept optional flags', () => {
      const output = runCLI('deepl languages --help');

      // Flags should be marked as optional
      expect(output).toContain('[options]');
    });
  });
});
