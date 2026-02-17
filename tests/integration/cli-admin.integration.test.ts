/**
 * Integration Tests for Admin CLI Command
 * Tests the admin command CLI behavior, argument validation, and error handling
 */

import { createTestConfigDir, makeRunCLI } from '../helpers';

describe('Admin CLI Integration', () => {
  const testConfig = createTestConfigDir('admin');
  const { runCLI, runCLIAll } = makeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
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

      expect.assertions(1);
      try {
        runCLI('deepl admin keys list', { excludeApiKey: true });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });
  });

  describe('deepl admin usage without required flags', () => {
    it('should require --start flag', () => {
      expect.assertions(1);
      try {
        runCLI('deepl admin usage --end 2024-01-31', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/required|start/i);
      }
    });

    it('should require --end flag', () => {
      expect.assertions(1);
      try {
        runCLI('deepl admin usage --start 2024-01-01', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/required|end/i);
      }
    });
  });

  describe('deepl admin keys deactivate', () => {
    it('should require key-id argument', () => {
      expect.assertions(1);
      try {
        runCLI('deepl admin keys deactivate', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/key-id|argument|missing/i);
      }
    });

    it('should abort without --yes in non-TTY mode', () => {
      const output = runCLIAll('deepl admin keys deactivate test-key-id');
      expect(output).toContain('Aborted');
    });

    it('should show --yes option in help', () => {
      const output = runCLI('deepl admin keys deactivate --help');
      expect(output).toContain('--yes');
      expect(output).toContain('-y');
    });
  });

  describe('deepl admin keys rename without arguments', () => {
    it('should require key-id and label arguments', () => {
      expect.assertions(1);
      try {
        runCLI('deepl admin keys rename', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/key-id|argument|missing/i);
      }
    });
  });

  describe('deepl admin keys set-limit without arguments', () => {
    it('should require key-id and characters arguments', () => {
      expect.assertions(1);
      try {
        runCLI('deepl admin keys set-limit', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/key-id|argument|missing/i);
      }
    });
  });
});
