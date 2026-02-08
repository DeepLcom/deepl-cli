/**
 * E2E Tests for Watch Command
 * Tests `deepl watch` help text, argument validation, and --dry-run behavior
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Watch Command E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  let testConfigDir: string;

  beforeAll(() => {
    testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-watch-${Date.now()}`);
    fs.mkdirSync(testConfigDir, { recursive: true });
  });

  afterAll(() => {
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

  const runCLIAll = (command: string): string => {
    return execSync(`node ${CLI_PATH} ${command} 2>&1`, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfigDir,
      },
      shell: '/bin/sh',
    });
  };

  describe('watch --help', () => {
    it('should show --git-staged option without "not yet implemented"', () => {
      const output = runCLI('watch --help');
      expect(output).toContain('--git-staged');
      expect(output).toContain('snapshot at startup');
      expect(output).not.toContain('not yet implemented');
    });

    it('should show all core options', () => {
      const output = runCLI('watch --help');
      expect(output).toContain('--targets');
      expect(output).toContain('--from');
      expect(output).toContain('--output');
    });

    it('should show watch behavior options', () => {
      const output = runCLI('watch --help');
      expect(output).toContain('--pattern');
      expect(output).toContain('--debounce');
      expect(output).toContain('--dry-run');
      expect(output).toContain('--auto-commit');
    });

    it('should show translation quality options', () => {
      const output = runCLI('watch --help');
      expect(output).toContain('--formality');
      expect(output).toContain('--glossary');
      expect(output).toContain('--preserve-code');
    });

    it('should show usage examples', () => {
      const output = runCLI('watch --help');
      expect(output).toContain('deepl watch');
      expect(output).toContain('--targets');
    });
  });

  describe('watch --dry-run --git-staged', () => {
    it('should show git-staged info in dry-run output', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-e2e-'));
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'Hello');

      try {
        const output = runCLI(`watch ${tmpDir} --targets es --dry-run --git-staged`);
        expect(output).toContain('[dry-run]');
        expect(output).toContain('Git-staged');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('watch --dry-run', () => {
    it('should show configuration summary without starting watcher', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-e2e-'));
      fs.writeFileSync(path.join(tmpDir, 'readme.md'), 'Hello world');

      try {
        const output = runCLI(`watch ${tmpDir} --targets de --dry-run`);
        expect(output).toContain('[dry-run]');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('watch without required arguments', () => {
    it('should fail when no path is provided', () => {
      try {
        runCLIAll('watch');
        fail('Should have thrown');
      } catch (error: unknown) {
        const execError = error as { status: number };
        expect(execError.status).toBeGreaterThan(0);
      }
    });
  });
});
