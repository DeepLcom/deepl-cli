/**
 * E2E Tests for Style Rules Command
 * Tests `deepl style-rules` help text and argument validation
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Style Rules Command E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  let testConfigDir: string;

  beforeAll(() => {
    testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-style-rules-${Date.now()}`);
    fs.mkdirSync(testConfigDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  const runCLI = (args: string): string => {
    return execSync(`node ${CLI_PATH} ${args}`, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
    });
  };

  describe('style-rules --help', () => {
    it('should show help with available subcommands', () => {
      const output = runCLI('style-rules --help');
      expect(output).toContain('Manage DeepL style rules');
      expect(output).toContain('list');
      expect(output).toContain('Pro API only');
    });

    it('should show examples in help text', () => {
      const output = runCLI('style-rules --help');
      expect(output).toContain('deepl style-rules list');
      expect(output).toContain('--detailed');
      expect(output).toContain('--format json');
    });
  });

  describe('style-rules list --help', () => {
    it('should show list subcommand options', () => {
      const output = runCLI('style-rules list --help');
      expect(output).toContain('--detailed');
      expect(output).toContain('--page');
      expect(output).toContain('--page-size');
      expect(output).toContain('--format');
    });
  });

  describe('style-rules list without API key', () => {
    it('should fail with authentication error when no API key configured', () => {
      const emptyConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-nokey-${Date.now()}`);
      fs.mkdirSync(emptyConfigDir, { recursive: true });
      try {
        execSync(`node ${CLI_PATH} style-rules list 2>&1`, {
          encoding: 'utf-8',
          env: {
            ...process.env,
            DEEPL_CONFIG_DIR: emptyConfigDir,
            DEEPL_API_KEY: '',
          },
          shell: '/bin/sh',
        });
        fail('Should have thrown');
      } catch (error: unknown) {
        const execError = error as { status: number; stdout: string; stderr: string };
        expect(execError.status).toBeGreaterThan(0);
      } finally {
        fs.rmSync(emptyConfigDir, { recursive: true, force: true });
      }
    });
  });
});
