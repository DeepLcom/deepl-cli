/**
 * E2E Tests for the sync --format json stdout/stderr split contract.
 *
 * Success JSON payloads must land on stdout so `deepl sync --format json > out.json`
 * produces a parseable file. Progress events and diagnostic logs remain on stderr.
 */

import { spawn, ChildProcess, spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import nock from 'nock';
import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

describe('CLI Sync --format json stdout contract', () => {
  const testConfig = createTestConfigDir('e2e-sync-json-contract');
  const testFiles = createTestDir('e2e-sync-json-contract-files');
  let mockServerProcess: ChildProcess;
  let baseUrl: string;

  function startMockServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const serverScript = path.join(__dirname, 'mock-deepl-server.cjs');
      const child = spawn('node', [serverScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      mockServerProcess = child;
      let output = '';

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const match = output.match(/PORT=(\d+)/);
        if (match) {
          resolve(parseInt(match[1]!, 10));
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const msg = data.toString();
        if (!msg.includes('ExperimentalWarning') && !msg.includes('--experimental')) {
          process.stderr.write(`[mock-server stderr] ${msg}`);
        }
      });

      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== null && code !== 0) {
          reject(new Error(`Mock server exited with code ${code}`));
        }
      });

      setTimeout(() => reject(new Error('Mock server did not start within 15s')), 15000);
    });
  }

  function writeConfig(configDir: string, apiUrl: string): void {
    const config = {
      auth: { apiKey: 'mock-api-key-for-testing:fx' },
      api: { baseUrl: apiUrl, usePro: false },
      defaults: {
        targetLangs: [],
        formality: 'default',
        preserveFormatting: true,
      },
      cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
      output: { format: 'text', verbose: false, color: false },
      watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2));
  }

  function writeSyncConfig(projectDir: string, locales: string[] = ['de']): void {
    const yaml = [
      'version: 1',
      'source_locale: en',
      'target_locales:',
      ...locales.map((l) => `  - ${l}`),
      'buckets:',
      '  json:',
      '    include:',
      '      - "locales/en.json"',
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(projectDir, '.deepl-sync.yaml'), yaml);
  }

  function writeSourceFile(projectDir: string): void {
    const dir = path.join(projectDir, 'locales');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify({
      greeting: 'Hello',
      farewell: 'Goodbye',
    }, null, 2) + '\n');
  }

  function buildEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      DEEPL_CONFIG_DIR: testConfig.path,
      NO_COLOR: '1',
    };
  }

  interface SyncRun {
    status: number;
    stdout: string;
    stderr: string;
  }

  function runSyncCapture(args: string[]): SyncRun {
    const result: SpawnSyncReturns<string> = spawnSync(
      'node',
      [CLI_PATH, 'sync', ...args],
      {
        encoding: 'utf-8',
        cwd: testFiles.path,
        env: buildEnv(),
        timeout: 15000,
      },
    );
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  beforeAll(async () => {
    nock.enableNetConnect('127.0.0.1');
    const port = await startMockServer();
    baseUrl = `http://127.0.0.1:${port}`;
    writeConfig(testConfig.path, baseUrl);
  }, 30000);

  beforeEach(() => {
    nock.enableNetConnect('127.0.0.1');
    const localesDir = path.join(testFiles.path, 'locales');
    if (fs.existsSync(localesDir)) {
      fs.rmSync(localesDir, { recursive: true, force: true });
    }
    const lockFile = path.join(testFiles.path, '.deepl-sync.lock');
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    const syncConfig = path.join(testFiles.path, '.deepl-sync.yaml');
    if (fs.existsSync(syncConfig)) fs.unlinkSync(syncConfig);
  });

  afterAll(() => {
    if (mockServerProcess) {
      mockServerProcess.kill('SIGTERM');
    }
    testConfig.cleanup();
    testFiles.cleanup();
  });

  function parseFinalJson(stdout: string): Record<string, unknown> {
    const trimmed = stdout.trim();
    if (trimmed.length === 0) {
      throw new Error('stdout is empty; success JSON payload not routed to stdout');
    }
    const match = trimmed.match(/\{[\s\S]*\}\s*$/);
    if (!match) {
      throw new Error(`no trailing JSON object in stdout: ${trimmed}`);
    }
    return JSON.parse(match[0]) as Record<string, unknown>;
  }

  describe('deepl sync --format json', () => {
    it('writes the success result payload to stdout, not stderr', () => {
      writeSyncConfig(testFiles.path, ['de']);
      writeSourceFile(testFiles.path);

      const run = runSyncCapture(['--format', 'json']);

      expect(run.status).toBe(0);
      const parsed = parseFinalJson(run.stdout);

      // The final payload must not also be duplicated on stderr.
      expect(run.stderr).not.toContain('"rateAssumption"');
      expect(run.stderr).not.toContain('"perLocale"');

      // All documented public fields must be present.
      const REQUIRED_FIELDS = [
        'ok',
        'totalKeys',
        'translated',
        'skipped',
        'failed',
        'targetLocaleCount',
        'estimatedCharacters',
        'rateAssumption',
        'dryRun',
        'perLocale',
      ] as const;
      for (const field of REQUIRED_FIELDS) {
        expect(parsed).toHaveProperty(field);
      }
      expect(parsed['rateAssumption']).toBe('pro');
      expect(Array.isArray(parsed['perLocale'])).toBe(true);

      // Strict whitelist — no internal fields may leak through.
      const ALLOWED_FIELDS = new Set([
        'ok',
        'totalKeys',
        'translated',
        'skipped',
        'failed',
        'targetLocaleCount',
        'estimatedCharacters',
        'estimatedCost',
        'rateAssumption',
        'dryRun',
        'perLocale',
      ]);
      for (const key of Object.keys(parsed)) {
        expect(ALLOWED_FIELDS).toContain(key);
      }
    });

    it('perLocale entries contain locale, translated, skipped, failed', () => {
      writeSyncConfig(testFiles.path, ['de', 'fr']);
      writeSourceFile(testFiles.path);

      const run = runSyncCapture(['--format', 'json']);

      expect(run.status).toBe(0);
      const parsed = parseFinalJson(run.stdout);
      const perLocale = parsed['perLocale'] as Array<Record<string, unknown>>;
      expect(perLocale.length).toBeGreaterThan(0);
      for (const entry of perLocale) {
        expect(entry).toHaveProperty('locale');
        expect(entry).toHaveProperty('translated');
        expect(entry).toHaveProperty('skipped');
        expect(entry).toHaveProperty('failed');
      }
    });
  });

  describe('deepl sync status --format json', () => {
    it('writes the status payload to stdout, not stderr', () => {
      writeSyncConfig(testFiles.path, ['de']);
      writeSourceFile(testFiles.path);
      // Seed the lockfile so status has something to report.
      runSyncCapture([]);

      const run = runSyncCapture(['status', '--format', 'json']);

      expect(run.status).toBe(0);
      const parsed = parseFinalJson(run.stdout);
      expect(parsed).toHaveProperty('sourceLocale');
      expect(parsed).toHaveProperty('totalKeys');
      expect(parsed).toHaveProperty('locales');

      expect(run.stderr).not.toContain('"sourceLocale"');
    });
  });

  describe('deepl sync validate --format json', () => {
    it('writes the validate payload to stdout, not stderr', () => {
      writeSyncConfig(testFiles.path, ['de']);
      writeSourceFile(testFiles.path);
      runSyncCapture([]);

      const run = runSyncCapture(['validate', '--format', 'json']);

      expect(run.status).toBe(0);
      const parsed = parseFinalJson(run.stdout);
      expect(parsed).toHaveProperty('totalChecked');
      expect(parsed).toHaveProperty('issues');

      expect(run.stderr).not.toContain('"totalChecked"');
    });
  });

  describe('deepl sync audit --format json', () => {
    it('writes the audit payload to stdout, not stderr', () => {
      writeSyncConfig(testFiles.path, ['de']);
      writeSourceFile(testFiles.path);
      runSyncCapture([]);

      const run = runSyncCapture(['audit', '--format', 'json']);

      expect(run.status).toBe(0);
      const parsed = parseFinalJson(run.stdout);
      expect(parsed).toHaveProperty('totalTerms');
      expect(parsed).toHaveProperty('inconsistencies');

      expect(run.stderr).not.toContain('"totalTerms"');
    });
  });

  describe('deepl sync glossary-report rejection', () => {
    it('exits non-zero and points the user at `audit`', () => {
      writeSyncConfig(testFiles.path, ['de']);
      writeSourceFile(testFiles.path);

      const run = runSyncCapture(['glossary-report']);

      expect(run.status).not.toBe(0);
      const combined = run.stdout + run.stderr;
      expect(combined).toMatch(/deepl sync audit/);
      expect(combined).toMatch(/renamed/i);
    });
  });
});
