/**
 * E2E Tests for Languages Command
 * Tests the `deepl languages` command end-to-end
 *
 * Note: These tests focus on CLI behavior, argument parsing, and error handling.
 * Full API integration is tested separately in integration tests.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Languages Command E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  let testConfigDir: string;

  beforeAll(() => {
    // Create isolated test config directory
    testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-languages-${Date.now()}`);
    fs.mkdirSync(testConfigDir, { recursive: true });
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  const runCLI = (command: string): string => {
    return execSync(`node ${CLI_PATH} ${command}`, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfigDir,
      },
    });
  };

  const runCLIExpectError = (command: string, apiKey?: string): { status: number; output: string } => {
    try {
      const output = execSync(`node ${CLI_PATH} ${command}`, {
        encoding: 'utf-8',
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: testConfigDir,
          ...(apiKey !== undefined && { DEEPL_API_KEY: apiKey }),
        },
      });
      return { status: 0, output };
    } catch (error: any) {
      return {
        status: error.status || 1,
        output: error.stderr?.toString() || error.stdout?.toString() || '',
      };
    }
  };

  describe('languages --help', () => {
    it('should display help text', () => {
      const output = runCLI('languages --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('languages');
      expect(output).toContain('Options:');
    });

    it('should show source and target options', () => {
      const output = runCLI('languages --help');

      expect(output).toContain('--source');
      expect(output).toContain('--target');
      expect(output).toContain('source languages');
      expect(output).toContain('target languages');
    });

    it('should display short flags', () => {
      const output = runCLI('languages --help');

      expect(output).toContain('-s,');
      expect(output).toContain('-t,');
    });
  });

  describe('languages error handling', () => {
    it('should require API key', () => {
      const result = runCLIExpectError('languages', ''); // Empty API key

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });

    it('should show error for invalid API key format', () => {
      const result = runCLIExpectError('languages', 'invalid-key');

      expect(result.status).toBeGreaterThan(0);
      // Should fail during API call or validation
      expect(result.output).toBeTruthy();
    });

    it('should handle --source flag without API key', () => {
      const result = runCLIExpectError('languages --source', '');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });

    it('should handle --target flag without API key', () => {
      const result = runCLIExpectError('languages --target', '');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });

    it('should reject invalid flags', () => {
      const result = runCLIExpectError('languages --invalid-flag', 'test-key');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/unknown option|error/i);
    });
  });

  describe('languages command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('languages');
      expect(helpOutput).toMatch(/list.*languages/i);
    });

    it('should support --quiet flag', () => {
      // Test that --quiet flag is accepted (even if command fails due to missing API key)
      const result = runCLIExpectError('languages --quiet', '');

      // Should fail due to API key, not due to invalid flag
      expect(result.output).not.toMatch(/unknown option.*quiet/i);
    });

    it('should support combining --source and --quiet', () => {
      const result = runCLIExpectError('languages --source --quiet', '');

      // Should fail due to API key, not due to invalid flags
      expect(result.output).not.toMatch(/unknown option/i);
    });

    it('should support combining --target and --quiet', () => {
      const result = runCLIExpectError('languages --target --quiet', '');

      // Should fail due to API key, not due to invalid flags
      expect(result.output).not.toMatch(/unknown option/i);
    });
  });

  describe('languages flag combinations', () => {
    it('should handle both --source and --target flags together', () => {
      // When both flags are specified, should show both (or handle appropriately)
      const result = runCLIExpectError('languages --source --target', 'test-key');

      // Should not fail due to flag conflict
      expect(result.status).toBeGreaterThan(0); // Fails due to invalid API key
      expect(result.output).not.toMatch(/cannot use both|conflicting options/i);
    });

    it('should accept short flags', () => {
      const result = runCLIExpectError('languages -s', '');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i); // Fails due to API key, not flag
    });

    it('should accept -t short flag', () => {
      const result = runCLIExpectError('languages -t', '');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });
  });
});
