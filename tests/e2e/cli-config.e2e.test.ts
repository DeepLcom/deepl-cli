/**
 * E2E Tests for Config Command
 *
 * Covers the value coercion `config set` applies, that writes reach the
 * config file on disk, and that `output.color` decides colouring even when
 * the environment asks for it.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

// ANSI escape introducer: ESC followed by '['.
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[/;

describe('Config Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-config');
  const configPath = path.join(testConfig.path, 'config.json');
  const { runCLI, runCLIAll, runCLIExpectError } = makeNodeRunCLI(
    testConfig.path
  );

  afterAll(() => {
    testConfig.cleanup();
  });

  // Every test starts from the shipped defaults rather than from whatever the
  // previous one left behind, so the expected values below are the CLI's own.
  beforeEach(() => {
    runCLI('config reset --yes');
  });

  describe('config --help', () => {
    it('should display help text', () => {
      const output = runCLI('config --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('config');
      expect(output).toContain('Options:');
    });

    it('should describe the command', () => {
      const output = runCLI('config --help');

      expect(output).toContain('Manage configuration');
    });

    it('should list subcommands', () => {
      const output = runCLI('config --help');

      expect(output).toContain('Commands:');
    });
  });

  describe('config list', () => {
    it('should display every configuration section as JSON', () => {
      const output = runCLI('config list');
      const config = JSON.parse(output) as Record<string, unknown>;

      expect(config).toHaveProperty('auth');
      expect(config).toHaveProperty('api');
      expect(config).toHaveProperty('defaults');
      expect(config).toHaveProperty('cache');
      expect(config).toHaveProperty('output');
      expect(config).toHaveProperty('watch');
    });

    it('should pretty-print rather than emit one line', () => {
      const output = runCLI('config list');

      expect(output).toContain('{\n');
      expect(output).toContain('  "auth"');
    });

    it('should exit successfully', () => {
      const result = runCLIExpectError('config list');

      expect(result.status).toBe(0);
    });
  });

  describe('config get', () => {
    it('should get a nested value', () => {
      expect(JSON.parse(runCLI('config get cache.enabled'))).toBe(true);
    });

    it('should get a whole section', () => {
      const cache = JSON.parse(runCLI('config get cache')) as Record<
        string,
        unknown
      >;

      expect(cache).toHaveProperty('enabled');
      expect(cache).toHaveProperty('maxSize');
      expect(cache).toHaveProperty('ttl');
    });

    it('should return null for an unknown key', () => {
      expect(JSON.parse(runCLI('config get nonexistent.key'))).toBeNull();
    });
  });

  describe('config set value coercion', () => {
    it('should store a boolean as a boolean', () => {
      runCLI('config set cache.enabled false');

      expect(JSON.parse(runCLI('config get cache.enabled'))).toBe(false);
    });

    it('should store a number as a number', () => {
      runCLI('config set cache.maxSize 2048');

      expect(JSON.parse(runCLI('config get cache.maxSize'))).toBe(2048);
    });

    it('should store a string as a string', () => {
      runCLI('config set output.format json');

      expect(JSON.parse(runCLI('config get output.format'))).toBe('json');
    });

    it('should split a comma-separated list into an array', () => {
      runCLI('config set defaults.targetLangs es,fr,de');

      expect(JSON.parse(runCLI('config get defaults.targetLangs'))).toEqual([
        'es',
        'fr',
        'de',
      ]);
    });

    it('should persist the change to the config file on disk', () => {
      runCLI('config set cache.enabled false');

      const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        cache: { enabled: boolean };
      };

      expect(onDisk.cache.enabled).toBe(false);
    });
  });

  describe('config reset', () => {
    it('should restore defaults with --yes', () => {
      runCLI('config set cache.enabled false');
      runCLI('config reset --yes');

      expect(JSON.parse(runCLI('config get cache.enabled'))).toBe(true);
    });

    it('should accept the -y short flag', () => {
      runCLI('config set cache.enabled false');
      runCLI('config reset -y');

      expect(JSON.parse(runCLI('config get cache.enabled'))).toBe(true);
    });

    it('should abort without --yes and leave values untouched', () => {
      runCLI('config set cache.enabled false');

      expect(runCLIAll('config reset')).toContain('Aborted');
      expect(JSON.parse(runCLI('config get cache.enabled'))).toBe(false);
    });
  });

  describe('output.color', () => {
    // FORCE_COLOR is set in both directions so the setting, not the absence of
    // a TTY, is what the assertion turns on.
    it('should suppress colour when output.color is false', () => {
      runCLI('config set output.color false');

      const output = runCLIAll('config set cache.enabled true', {
        env: { FORCE_COLOR: '1' },
      });

      expect(output).not.toMatch(ANSI_REGEX);
    });

    it('should emit colour when output.color is true', () => {
      runCLI('config set output.color true');

      const output = runCLIAll('config set cache.enabled true', {
        env: { FORCE_COLOR: '1' },
      });

      expect(output).toMatch(ANSI_REGEX);
    });
  });

  describe('config command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('config');
    });

    it('should show config in main help with description', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('Manage configuration');
    });
  });
});
