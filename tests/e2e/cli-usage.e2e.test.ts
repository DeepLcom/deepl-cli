/**
 * E2E Tests for Usage Command
 * Tests the `deepl usage` command end-to-end
 *
 * Note: These tests focus on CLI behavior, argument parsing, and error handling.
 * Full API integration is tested separately in integration tests.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Usage Command E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  let testConfigDir: string;

  beforeAll(() => {
    // Create isolated test config directory
    testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-usage-${Date.now()}`);
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

  describe('usage --help', () => {
    it('should display help text', () => {
      const output = runCLI('usage --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('usage');
      expect(output).toContain('Options:');
    });

    it('should describe the command', () => {
      const output = runCLI('usage --help');

      expect(output).toMatch(/character|usage|statistics|limit/i);
    });

    it('should show available options', () => {
      const output = runCLI('usage --help');

      expect(output).toContain('help');
    });
  });

  describe('usage error handling', () => {
    it('should require API key', () => {
      const result = runCLIExpectError('usage', ''); // Empty API key

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });

    it('should show error for invalid API key format', () => {
      const result = runCLIExpectError('usage', 'invalid-key');

      expect(result.status).toBeGreaterThan(0);
      // Should fail during API call or validation
      expect(result.output).toBeTruthy();
    });

    it('should reject invalid flags', () => {
      const result = runCLIExpectError('usage --invalid-flag', 'test-key');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/unknown option|error/i);
    });

    it('should not accept unexpected arguments', () => {
      const result = runCLIExpectError('usage extra-arg', 'test-key');

      // Should either ignore extra args or fail
      expect(result.status).toBeGreaterThan(0);
    });
  });

  describe('usage command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('usage');
      expect(helpOutput).toMatch(/character|usage/i);
    });

    it('should support --quiet flag', () => {
      // Test that --quiet flag is accepted (even if command fails due to missing API key)
      const result = runCLIExpectError('usage --quiet', '');

      // Should fail due to API key, not due to invalid flag
      expect(result.output).not.toMatch(/unknown option.*quiet/i);
    });

    it('should handle authentication errors gracefully', () => {
      const result = runCLIExpectError('usage', 'invalid-api-key-format');

      expect(result.status).toBeGreaterThan(0);
      // Should show meaningful error message
      expect(result.output).toBeTruthy();
    });
  });

  describe('usage command behavior', () => {
    it('should exit with error when API key is missing', () => {
      const result = runCLIExpectError('usage', '');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });

    it('should accept valid API key format', () => {
      // Test with valid format but fake key (will fail at API call)
      const result = runCLIExpectError('usage', 'test-key-123:fx');

      expect(result.status).toBeGreaterThan(0);
      // Should fail at API call, not at validation
      expect(result.output).toMatch(/authentication|invalid.*key|403/i);
    });
  });
});
