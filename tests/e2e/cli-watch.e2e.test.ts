/**
 * E2E Tests for Watch Command
 * Tests `deepl watch` help text, argument validation, and --dry-run behavior
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Watch Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-watch');
  const { runCLI, runCLIAll } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('watch --help', () => {
    it('should show --git-staged option without "not yet implemented"', () => {
      const output = runCLI('watch --help');
      expect(output).toContain('--git-staged');
      expect(output).toContain('snapshot at startup');
      expect(output).not.toContain('not yet implemented');
    });

    it('should show all core options', () => {
      const output = runCLI('watch --help');
      expect(output).toContain('--to');
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
      expect(output).toContain('--to');
    });
  });

  describe('watch --dry-run --git-staged', () => {
    it('should show git-staged info in dry-run output', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-e2e-'));
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'Hello');

      try {
        const output = runCLI(`watch ${tmpDir} --to es --dry-run --git-staged`);
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
        const output = runCLI(`watch ${tmpDir} --to de --dry-run`);
        expect(output).toContain('[dry-run]');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should accept --targets as a hidden alias for --to', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-e2e-'));
      fs.writeFileSync(path.join(tmpDir, 'readme.md'), 'Hello world');

      try {
        const output = runCLI(`watch ${tmpDir} --targets es --dry-run`);
        expect(output).toContain('[dry-run]');
        expect(output).toContain('es');
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
