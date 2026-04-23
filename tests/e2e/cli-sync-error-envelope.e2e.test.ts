/**
 * E2E tests for the shared JSON error envelope across every `deepl sync`
 * subcommand. When --format json is set and a command fails, every
 * subcommand must emit the canonical envelope to stderr:
 *
 *   { ok: false, error: { code, message, suggestion? }, exitCode }
 *
 * The AJV-backed assertErrorEnvelope helper guards the shape. A new
 * subcommand that forgets to honor --format json will fail this test.
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  assertErrorEnvelope,
  assertInitSuccessEnvelope,
  createTestConfigDir,
  createTestDir,
} from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

describe('CLI sync --format json error envelope', () => {
  const testConfig = createTestConfigDir('e2e-sync-envelope');
  const testFiles = createTestDir('e2e-sync-envelope-files');

  function writeConfig(configDir: string): void {
    const config = {
      auth: { apiKey: 'mock-api-key-for-testing:fx' },
      api: { baseUrl: 'http://127.0.0.1:1/', usePro: false },
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

  function writeSyncConfig(projectDir: string, opts?: { enableTms?: boolean }): void {
    const yaml: string[] = [
      'version: 1',
      'source_locale: en',
      'target_locales:',
      '  - de',
      'buckets:',
      '  json:',
      '    include:',
      '      - "locales/en.json"',
    ];
    if (opts?.enableTms) {
      yaml.push('tms:');
      yaml.push('  enabled: true');
      yaml.push('  base_url: "http://127.0.0.1:1/"');
      yaml.push('  project_id: "test-project"');
      yaml.push('  auth: "api_key_env"');
      yaml.push('  api_key_env: "TMS_API_KEY"');
    }
    fs.writeFileSync(path.join(projectDir, '.deepl-sync.yaml'), yaml.join('\n') + '\n');
  }

  function writeSourceFile(projectDir: string): void {
    const dir = path.join(projectDir, 'locales');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'en.json'),
      JSON.stringify({ greeting: 'Hello', farewell: 'Goodbye' }, null, 2) + '\n',
    );
  }

  function buildEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
    return {
      ...process.env,
      DEEPL_CONFIG_DIR: testConfig.path,
      NO_COLOR: '1',
      ...extra,
    };
  }

  interface Run {
    status: number;
    stdout: string;
    stderr: string;
  }

  function runCli(args: string[], env: Record<string, string | undefined> = {}): Run {
    const result: SpawnSyncReturns<string> = spawnSync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      cwd: testFiles.path,
      env: buildEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  beforeAll(() => {
    writeConfig(testConfig.path);
  });

  beforeEach(() => {
    const localesDir = path.join(testFiles.path, 'locales');
    if (fs.existsSync(localesDir)) fs.rmSync(localesDir, { recursive: true, force: true });
    const lock = path.join(testFiles.path, '.deepl-sync.lock');
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
    const syncCfg = path.join(testFiles.path, '.deepl-sync.yaml');
    if (fs.existsSync(syncCfg)) fs.unlinkSync(syncCfg);
  });

  afterAll(() => {
    testConfig.cleanup();
    testFiles.cleanup();
  });

  describe('error envelope on missing .deepl-sync.yaml (ConfigError, exit 7)', () => {
    // Every subcommand that loads the sync config should emit an envelope
    // with code=ConfigError and exitCode=7 when the file is absent.
    for (const sub of ['push', 'pull', 'export', 'validate', 'audit']) {
      it(`deepl sync ${sub} --format json → envelope ConfigError/7`, () => {
        const run = runCli(['sync', sub, '--format', 'json']);
        expect(run.status).toBe(7);
        assertErrorEnvelope(run.stderr, 'ConfigError', 7);
      });
    }
  });

  describe('push/pull envelope when TMS is not enabled (ConfigError, exit 7)', () => {
    it('deepl sync push --format json → envelope ConfigError/7', () => {
      writeSyncConfig(testFiles.path); // no tms block
      writeSourceFile(testFiles.path);

      const run = runCli(['sync', 'push', '--format', 'json']);
      expect(run.status).toBe(7);
      const envelope = assertErrorEnvelope(run.stderr, 'ConfigError', 7);
      expect(envelope.error.message).toMatch(/TMS integration not configured/);
      expect(envelope.error.suggestion).toMatch(/tms:/);
    });

    it('deepl sync pull --format json → envelope ConfigError/7', () => {
      writeSyncConfig(testFiles.path);
      writeSourceFile(testFiles.path);

      const run = runCli(['sync', 'pull', '--format', 'json']);
      expect(run.status).toBe(7);
      assertErrorEnvelope(run.stderr, 'ConfigError', 7);
    });
  });

  describe('init envelope on non-TTY without all four flags (ValidationError, exit 6)', () => {
    it('deepl sync init --format json → envelope ValidationError/6', () => {
      writeSourceFile(testFiles.path);
      const run = runCli(['sync', 'init', '--format', 'json', '--source-locale', 'en']);
      expect(run.status).toBe(6);
      const envelope = assertErrorEnvelope(run.stderr, 'ValidationError', 6);
      expect(envelope.error.message).toMatch(/All four flags/);
    });
  });

  describe('init success envelope on --format json', () => {
    it('emits ok:true envelope with created block on stdout', () => {
      writeSourceFile(testFiles.path);

      const run = runCli([
        'sync',
        'init',
        '--format', 'json',
        '--source-locale', 'en',
        '--target-locales', 'de,fr',
        '--file-format', 'json',
        '--path', 'locales/en.json',
      ]);

      expect(run.status).toBe(0);
      const envelope = assertInitSuccessEnvelope(run.stdout);
      expect(envelope.created.sourceLocale).toBe('en');
      expect(envelope.created.targetLocales).toEqual(['de', 'fr']);
      expect(envelope.created.configPath).toMatch(/\.deepl-sync\.yaml$/);

      const configPath = path.join(testFiles.path, '.deepl-sync.yaml');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('init --format json on existing config emits non-ok envelope (exit 7)', () => {
      writeSyncConfig(testFiles.path);
      writeSourceFile(testFiles.path);

      const run = runCli([
        'sync',
        'init',
        '--format', 'json',
        '--source-locale', 'en',
        '--target-locales', 'de',
        '--file-format', 'json',
        '--path', 'locales/en.json',
      ]);

      expect(run.status).toBe(7);
      const envelope = assertErrorEnvelope(run.stderr, 'ConfigError', 7);
      expect(envelope.error.message).toMatch(/already exists/);
    });
  });

  describe('resolve envelope on unresolvable conflict (SyncConflict, exit 11)', () => {
    it('deepl sync resolve --format json on unresolvable conflict → envelope SyncConflict/11', () => {
      writeSyncConfig(testFiles.path);
      writeSourceFile(testFiles.path);

      // Conflict region that neither side parses: ours leaves an unclosed
      // string. After the length-heuristic fallback, final JSON.parse fails.
      const conflictedLock = [
        '{',
        '  "version": 1,',
        '  "generated_at": "2026-04-20T12:00:00Z",',
        '  "source_locale": "en",',
        '  "entries": {',
        '    "locales/en.json": {',
        '<<<<<<< HEAD',
        '      "greeting": { "source_hash": "abc", "source_text": "Hello',
        '=======',
        '      "greeting": { "source_hash": "def", "source_text": "Hi",',
        '>>>>>>> feature/other',
        '    }',
        '  },',
        '  "stats": { "total_keys": 1, "total_translations": 1, "last_sync": "2026-04-20T12:00:00Z" }',
        '}',
      ].join('\n');
      fs.writeFileSync(path.join(testFiles.path, '.deepl-sync.lock'), conflictedLock);

      const run = runCli(['sync', 'resolve', '--format', 'json']);
      expect(run.status).toBe(11);
      const envelope = assertErrorEnvelope(run.stderr, 'SyncConflict', 11);
      expect(envelope.error.suggestion).toMatch(/conflict markers manually/);
    });
  });

  describe('envelope has no control chars in message', () => {
    // Error messages from user-supplied content (config keys, YAML lines)
    // are sanitized before emission so a malicious input cannot corrupt a
    // downstream terminal that renders the envelope.
    it('ConfigError envelope does not contain raw control chars in message', () => {
      const run = runCli(['sync', 'export', '--format', 'json']);
      expect(run.status).toBe(7);
      const envelope = assertErrorEnvelope(run.stderr, 'ConfigError', 7);
      // eslint-disable-next-line no-control-regex -- intentional: assert sanitation
      expect(envelope.error.message).not.toMatch(/[\u0000-\u001F]/);
    });
  });
});
