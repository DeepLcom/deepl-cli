/**
 * E2E Tests for Languages Command
 * Tests the `deepl languages` command end-to-end
 *
 * Note: These tests focus on CLI behavior, argument parsing, and error handling.
 * Full API integration is tested separately in integration tests.
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Languages Command E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  const testConfig = createTestConfigDir('e2e-languages');
  const { runCLI } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  const runCLIWithEnv = (command: string, env: Record<string, string> = {}): { status: number; stdout: string; stderr: string } => {
    const result = spawnSync('node', [CLI_PATH, ...command.split(' ')], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfig.path,
        ...env,
      },
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
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

  describe('languages without API key (graceful degradation)', () => {
    it('should show languages from registry without API key', () => {
      const result = runCLIWithEnv('languages', { DEEPL_API_KEY: '' });

      // Should succeed (not crash) and show registry data
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Source Languages:');
      expect(result.stdout).toContain('Target Languages:');
    });

    it('should show extended languages section without API key', () => {
      const result = runCLIWithEnv('languages', { DEEPL_API_KEY: '' });

      expect(result.stdout).toContain('Extended Languages');
      expect(result.stdout).toContain('quality_optimized only');
    });

    it('should show core languages without API key', () => {
      const result = runCLIWithEnv('languages --source', { DEEPL_API_KEY: '' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('English');
      expect(result.stdout).toContain('German');
      expect(result.stdout).toContain('French');
    });

    it('should show regional variants in target without API key', () => {
      const result = runCLIWithEnv('languages --target', { DEEPL_API_KEY: '' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('English (British)');
      expect(result.stdout).toContain('English (American)');
    });

    it('should warn about missing API key', () => {
      const result = runCLIWithEnv('languages', { DEEPL_API_KEY: '' });

      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/no api key|local.*registry/i);
    });
  });

  describe('languages command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('languages');
      expect(helpOutput).toMatch(/list.*languages/i);
    });

    it('should support --quiet flag', () => {
      const result = runCLIWithEnv('languages --quiet', { DEEPL_API_KEY: '' });

      // Should not fail due to invalid flag
      expect(result.stdout + result.stderr).not.toMatch(/unknown option.*quiet/i);
    });

    it('should support combining --source and --quiet', () => {
      const result = runCLIWithEnv('languages --source --quiet', { DEEPL_API_KEY: '' });

      expect(result.stdout + result.stderr).not.toMatch(/unknown option/i);
    });

    it('should support combining --target and --quiet', () => {
      const result = runCLIWithEnv('languages --target --quiet', { DEEPL_API_KEY: '' });

      expect(result.stdout + result.stderr).not.toMatch(/unknown option/i);
    });
  });

  describe('languages flag combinations', () => {
    it('should handle both --source and --target flags together', () => {
      const result = runCLIWithEnv('languages --source --target', { DEEPL_API_KEY: '' });

      // Should show both (or handle appropriately), not fail due to flag conflict
      expect(result.stdout + result.stderr).not.toMatch(/cannot use both|conflicting options/i);
    });

    it('should accept short flags', () => {
      const result = runCLIWithEnv('languages -s', { DEEPL_API_KEY: '' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Source Languages:');
    });

    it('should accept -t short flag', () => {
      const result = runCLIWithEnv('languages -t', { DEEPL_API_KEY: '' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Target Languages:');
    });
  });
});
