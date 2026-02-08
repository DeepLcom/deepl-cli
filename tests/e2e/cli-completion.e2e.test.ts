/**
 * E2E Tests for Shell Completion Command
 * Tests `deepl completion` generation for bash, zsh, and fish shells
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Completion Command E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  let testConfigDir: string;

  beforeAll(() => {
    testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-completion-${Date.now()}`);
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

  const runCLIAll = (args: string): string => {
    return execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      shell: '/bin/sh',
    });
  };

  describe('completion --help', () => {
    it('should show help text with supported shells', () => {
      const output = runCLI('completion --help');
      expect(output).toContain('bash');
      expect(output).toContain('zsh');
      expect(output).toContain('fish');
      expect(output).toContain('Generate shell completion scripts');
    });
  });

  describe('completion bash', () => {
    it('should generate bash completion script', () => {
      const output = runCLI('completion bash');
      expect(output).toContain('complete');
      expect(output).toContain('deepl');
    });
  });

  describe('completion zsh', () => {
    it('should generate zsh completion script', () => {
      const output = runCLI('completion zsh');
      expect(output).toContain('deepl');
      expect(output).toContain('compdef');
    });
  });

  describe('completion fish', () => {
    it('should generate fish completion script', () => {
      const output = runCLI('completion fish');
      expect(output).toContain('deepl');
      expect(output).toContain('complete');
    });
  });

  describe('completion with unsupported shell', () => {
    it('should exit with non-zero code for unknown shell', () => {
      expect(() => runCLIAll('completion powershell')).toThrow();
    });
  });

  describe('completion without argument', () => {
    it('should exit with error when no shell is specified', () => {
      expect(() => runCLIAll('completion')).toThrow();
    });
  });
});
