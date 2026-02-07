/**
 * Integration Tests for --dry-run flag across CLI commands
 * Tests that --dry-run prevents actual operations and shows descriptive messages
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('--dry-run CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-dryrun-${Date.now()}`);
  const testDir = path.join(os.tmpdir(), `.deepl-cli-dryrun-files-${Date.now()}`);

  const runCLI = (command: string): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
    });
  };

  beforeAll(() => {
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('deepl translate --dry-run', () => {
    it('should show --dry-run in help output', () => {
      const output = runCLI('deepl translate --help');
      expect(output).toContain('--dry-run');
    });

    it('should show dry-run output for file translation', () => {
      const testFile = path.join(testDir, 'dryrun-translate.txt');
      fs.writeFileSync(testFile, 'Hello world');

      const output = runCLI(
        `deepl translate "${testFile}" --to es --output "${testDir}/out.txt" --dry-run`
      );

      expect(output).toContain('[dry-run]');
      expect(output).toContain('No translations will be performed');
      expect(output).toContain(testFile);
      expect(output).toContain('es');
    });

    it('should show dry-run output for directory translation', () => {
      const dirPath = path.join(testDir, 'dryrun-dir');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(path.join(dirPath, 'a.txt'), 'hello');

      const output = runCLI(
        `deepl translate "${dirPath}" --to de,fr --output "${testDir}/out-dir" --dry-run`
      );

      expect(output).toContain('[dry-run]');
      expect(output).toContain('Would translate directory');
      expect(output).toContain('de');
      expect(output).toContain('fr');
    });

    it('should not make API calls during dry-run (no API key error)', () => {
      const testFile = path.join(testDir, 'dryrun-noapi.txt');
      fs.writeFileSync(testFile, 'Test content');

      // Even without API key, dry-run should succeed for file mode
      const output = runCLI(
        `deepl translate "${testFile}" --to ja --output "${testDir}/out-ja.txt" --dry-run`
      );

      expect(output).toContain('[dry-run]');
      expect(output).not.toContain('API key');
    });

    it('should include source language in dry-run output', () => {
      const testFile = path.join(testDir, 'dryrun-from.txt');
      fs.writeFileSync(testFile, 'Bonjour');

      const output = runCLI(
        `deepl translate "${testFile}" --to en --from fr --output "${testDir}/out-en.txt" --dry-run`
      );

      expect(output).toContain('Source language: fr');
    });

    it('should include formality in dry-run output', () => {
      const testFile = path.join(testDir, 'dryrun-formal.txt');
      fs.writeFileSync(testFile, 'Hello');

      const output = runCLI(
        `deepl translate "${testFile}" --to de --output "${testDir}/out-formal.txt" --formality more --dry-run`
      );

      expect(output).toContain('Formality: more');
    });
  });

  describe('deepl glossary delete --dry-run', () => {
    it('should show --dry-run in glossary delete help', () => {
      const output = runCLI('deepl glossary delete --help');
      expect(output).toContain('--dry-run');
    });

    it('should show dry-run output without requiring API key', () => {
      const output = runCLI('deepl glossary delete my-glossary --dry-run');

      expect(output).toContain('[dry-run]');
      expect(output).toContain('No deletions will be performed');
      expect(output).toContain('my-glossary');
    });

    it('should not require --yes flag with --dry-run', () => {
      const output = runCLI('deepl glossary delete test-glossary --dry-run');

      expect(output).toContain('[dry-run]');
      expect(output).not.toContain('Aborted');
    });
  });

  describe('deepl cache clear --dry-run', () => {
    it('should show --dry-run in cache clear help', () => {
      const output = runCLI('deepl cache clear --help');
      expect(output).toContain('--dry-run');
    });

    it('should show cache stats in dry-run output', () => {
      const output = runCLI('deepl cache clear --dry-run');

      expect(output).toContain('[dry-run]');
      expect(output).toContain('No cache entries will be cleared');
      expect(output).toContain('cached entries');
    });

    it('should not require --yes flag with --dry-run', () => {
      const output = runCLI('deepl cache clear --dry-run');

      expect(output).toContain('[dry-run]');
      expect(output).not.toContain('Aborted');
    });

    it('should not actually clear the cache', () => {
      // First, check stats
      const statsBefore = runCLI('deepl cache stats');

      // Run dry-run clear
      runCLI('deepl cache clear --dry-run');

      // Stats should be unchanged
      const statsAfter = runCLI('deepl cache stats');
      expect(statsAfter).toEqual(statsBefore);
    });
  });

  describe('deepl watch --dry-run', () => {
    it('should show --dry-run in watch help', () => {
      const output = runCLI('deepl watch --help');
      expect(output).toContain('--dry-run');
    });

    it('should show dry-run output for directory watch', () => {
      const watchDir = path.join(testDir, 'dryrun-watch');
      if (!fs.existsSync(watchDir)) {
        fs.mkdirSync(watchDir, { recursive: true });
      }

      const output = runCLI(
        `deepl watch "${watchDir}" --targets es,fr --dry-run`
      );

      expect(output).toContain('[dry-run]');
      expect(output).toContain('Watch mode will not be started');
      expect(output).toContain(watchDir);
      expect(output).toContain('es');
      expect(output).toContain('fr');
    });

    it('should show pattern in dry-run output', () => {
      const watchDir = path.join(testDir, 'dryrun-watch-pattern');
      if (!fs.existsSync(watchDir)) {
        fs.mkdirSync(watchDir, { recursive: true });
      }

      const output = runCLI(
        `deepl watch "${watchDir}" --targets de --pattern "*.md" --dry-run`
      );

      expect(output).toContain('*.md');
    });

    it('should exit immediately (not block like normal watch)', () => {
      const watchDir = path.join(testDir, 'dryrun-watch-exit');
      if (!fs.existsSync(watchDir)) {
        fs.mkdirSync(watchDir, { recursive: true });
      }

      // This should complete quickly, not hang indefinitely
      const startTime = Date.now();
      runCLI(`deepl watch "${watchDir}" --targets es --dry-run`);
      const elapsed = Date.now() - startTime;

      // Should complete in under 5 seconds (normal watch would hang forever)
      expect(elapsed).toBeLessThan(5000);
    });

    it('should not require API key for dry-run', () => {
      const watchDir = path.join(testDir, 'dryrun-watch-noapi');
      if (!fs.existsSync(watchDir)) {
        fs.mkdirSync(watchDir, { recursive: true });
      }

      const output = runCLI(
        `deepl watch "${watchDir}" --targets ja --dry-run`
      );

      expect(output).toContain('[dry-run]');
      expect(output).not.toContain('API key');
    });
  });
});
