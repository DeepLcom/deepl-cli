/**
 * Integration Tests for Admin CLI Command
 * Tests the admin command CLI behavior, argument validation, and error handling
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Admin CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-admin-${Date.now()}`);

  const runCLI = (command: string, options: { stdio?: any } = {}): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      ...options,
    });
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

  describe('deepl admin --help', () => {
    it('should display help for admin command', () => {
      const output = runCLI('deepl admin --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('admin');
      expect(output).toContain('keys');
      expect(output).toContain('usage');
    });
  });

  describe('deepl admin keys --help', () => {
    it('should display help for admin keys subcommand', () => {
      const output = runCLI('deepl admin keys --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('list');
      expect(output).toContain('create');
      expect(output).toContain('deactivate');
      expect(output).toContain('rename');
      expect(output).toContain('set-limit');
    });
  });

  describe('deepl admin keys list --help', () => {
    it('should show format option in keys list help', () => {
      const output = runCLI('deepl admin keys list --help');

      expect(output).toContain('--format');
    });
  });

  describe('deepl admin keys create --help', () => {
    it('should show label option in keys create help', () => {
      const output = runCLI('deepl admin keys create --help');

      expect(output).toContain('--label');
      expect(output).toContain('--format');
    });
  });

  describe('deepl admin usage --help', () => {
    it('should display help for admin usage subcommand', () => {
      const output = runCLI('deepl admin usage --help');

      expect(output).toContain('--start');
      expect(output).toContain('--end');
      expect(output).toContain('--group-by');
      expect(output).toContain('--format');
    });
  });

  describe('deepl admin keys list without API key', () => {
    it('should require API key', () => {
      try {
        runCLI('deepl auth clear', { stdio: 'pipe' });
      } catch {
        // Ignore if already cleared
      }

      try {
        const env = { ...process.env, DEEPL_CONFIG_DIR: testConfigDir } as NodeJS.ProcessEnv;
        delete env['DEEPL_API_KEY'];
        execSync('deepl admin keys list', {
          encoding: 'utf-8',
          env,
          stdio: 'pipe',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });
  });

  describe('deepl admin usage without required flags', () => {
    it('should require --start flag', () => {
      try {
        runCLI('deepl admin usage --end 2024-01-31', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/required|start/i);
      }
    });

    it('should require --end flag', () => {
      try {
        runCLI('deepl admin usage --start 2024-01-01', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/required|end/i);
      }
    });
  });

  describe('deepl admin keys deactivate without argument', () => {
    it('should require key-id argument', () => {
      try {
        runCLI('deepl admin keys deactivate', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/key-id|argument|missing/i);
      }
    });
  });

  describe('deepl admin keys rename without arguments', () => {
    it('should require key-id and label arguments', () => {
      try {
        runCLI('deepl admin keys rename', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/key-id|argument|missing/i);
      }
    });
  });

  describe('deepl admin keys set-limit without arguments', () => {
    it('should require key-id and characters arguments', () => {
      try {
        runCLI('deepl admin keys set-limit', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/key-id|argument|missing/i);
      }
    });
  });
});
