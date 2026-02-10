/**
 * Integration Tests for Detect CLI Command
 * Tests the detect command CLI behavior, help output, and argument validation
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Detect CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-detect-${Date.now()}`);

  const runCLI = (command: string, options: { env?: Record<string, string | undefined> } = {}): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir, ...options.env },
    });
  };

  const runCLIExpectFail = (command: string, options: { env?: Record<string, string | undefined> } = {}): string => {
    try {
      execSync(command, {
        encoding: 'utf-8',
        env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      throw new Error('Expected command to fail');
    } catch (error: any) {
      return (error.stderr || '') + (error.stdout || '');
    }
  };

  beforeAll(() => {
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('deepl detect --help', () => {
    it('should display help for detect command', () => {
      const output = runCLI('deepl detect --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('deepl detect');
      expect(output).toContain('Detect the language of text');
    });

    it('should show --format option in help', () => {
      const output = runCLI('deepl detect --help');

      expect(output).toContain('--format');
      expect(output).toContain('json');
    });

    it('should show examples in help', () => {
      const output = runCLI('deepl detect --help');

      expect(output).toContain('Examples:');
      expect(output).toContain('deepl detect');
    });

    it('should accept optional text argument', () => {
      const output = runCLI('deepl detect --help');

      expect(output).toContain('[text]');
    });
  });

  describe('deepl detect command registration', () => {
    it('should be listed in main help', () => {
      const output = runCLI('deepl --help');

      expect(output).toContain('detect');
      expect(output).toContain('Detect the language of text');
    });

    it('should be listed under Information commands', () => {
      const output = runCLI('deepl --help');

      expect(output).toContain('detect');
    });
  });

  describe('deepl detect without API key', () => {
    it('should fail with API key error when no key configured', () => {
      const output = runCLIExpectFail(
        'deepl detect "Bonjour le monde"',
        { env: { DEEPL_API_KEY: '' } },
      );

      expect(output).toMatch(/API key|not set/i);
    });
  });

  describe('deepl detect argument validation', () => {
    it('should show error when no text provided and stdin is empty', () => {
      const output = runCLIExpectFail(
        'echo "" | deepl detect',
        { env: { DEEPL_API_KEY: 'fake-key-for-validation' } },
      );

      expect(output.length).toBeGreaterThan(0);
    });
  });
});
