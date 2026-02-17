/**
 * Integration Tests for Lazy CacheService Instantiation
 * Verifies that commands not needing cache (help, version, auth, config)
 * do not trigger SQLite database creation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { makeRunCLI } from '../helpers';

describe('Lazy CacheService Instantiation', () => {
  let testHomeDir: string;
  let testConfigDir: string;
  let expectedCachePath: string;
  let runCLI: (command: string, extraEnv?: Record<string, string | undefined>) => string;

  beforeEach(() => {
    testHomeDir = path.join(os.tmpdir(), `.deepl-cli-lazy-cache-home-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    testConfigDir = path.join(testHomeDir, '.deepl-cli');
    expectedCachePath = path.join(testConfigDir, 'cache.db');
    fs.mkdirSync(testHomeDir, { recursive: true });

    const helpers = makeRunCLI(testConfigDir);
    runCLI = (command: string, extraEnv: Record<string, string | undefined> = {}) => {
      return helpers.runCLI(command, { env: { HOME: testHomeDir, ...extraEnv } });
    };
  });

  afterEach(() => {
    if (fs.existsSync(testHomeDir)) {
      fs.rmSync(testHomeDir, { recursive: true, force: true });
    }
  });

  describe('commands that should NOT create cache.db', () => {
    it('should not create cache.db when running --help', () => {
      runCLI('deepl --help');
      expect(fs.existsSync(expectedCachePath)).toBe(false);
    });

    it('should not create cache.db when running --version', () => {
      runCLI('deepl --version');
      expect(fs.existsSync(expectedCachePath)).toBe(false);
    });

    it('should not create cache.db when running auth show', () => {
      runCLI('deepl auth show');
      expect(fs.existsSync(expectedCachePath)).toBe(false);
    });

    it('should not create cache.db when running config list', () => {
      runCLI('deepl config list');
      expect(fs.existsSync(expectedCachePath)).toBe(false);
    });

    it('should not create cache.db when running config get', () => {
      runCLI('deepl config get auth');
      expect(fs.existsSync(expectedCachePath)).toBe(false);
    });

    it('should not create cache.db when running translate --help', () => {
      runCLI('deepl translate --help');
      expect(fs.existsSync(expectedCachePath)).toBe(false);
    });

    it('should not create cache.db when running languages without API key', () => {
      runCLI('deepl languages', { DEEPL_API_KEY: '' });
      expect(fs.existsSync(expectedCachePath)).toBe(false);
    });
  });

  describe('commands that SHOULD create cache.db', () => {
    it('should create cache.db when running cache stats', () => {
      runCLI('deepl cache stats');
      expect(fs.existsSync(expectedCachePath)).toBe(true);
    });

    it('should create cache.db when running cache enable', () => {
      runCLI('deepl cache enable');
      expect(fs.existsSync(expectedCachePath)).toBe(true);
    });
  });
});
