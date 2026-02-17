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

    it('should show actionable error when --to is missing and no config default', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-e2e-'));
      const { runCLIExpectError } = makeNodeRunCLI(testConfig.path);
      try {
        const { status, output } = runCLIExpectError(`watch ${tmpDir} --dry-run`);
        expect(status).toBeGreaterThan(0);
        expect(output).toContain('No target language specified.');
        expect(output).toContain('deepl init');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should use config default targetLangs when --to is not specified', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-e2e-'));
      const configWithDefaults = {
        auth: { apiKey: 'test-key:fx' },
        api: { baseUrl: 'https://api-free.deepl.com', usePro: false },
        defaults: { targetLangs: ['es', 'fr'], formality: 'default', preserveFormatting: true },
        cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
      };

      const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-config-'));
      fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(configWithDefaults, null, 2));
      fs.writeFileSync(path.join(tmpDir, 'test.md'), 'Hello');

      const { runCLI: runWithConfig } = makeNodeRunCLI(configDir);

      try {
        const output = runWithConfig(`watch ${tmpDir} --dry-run`);
        expect(output).toContain('[dry-run]');
        expect(output).toContain('es');
        expect(output).toContain('fr');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.rmSync(configDir, { recursive: true, force: true });
      }
    });
  });
});
