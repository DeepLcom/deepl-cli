/**
 * E2E tests for `deepl sync init` no-i18n-files-detected branch.
 *
 * When the detector finds zero i18n files the command must:
 *   - exit 7 (ConfigError) — not 0
 *   - print a remediation hint naming all four required flags
 *   - in --format json mode emit the canonical error envelope to stderr
 *
 * Regression guard: successful interactive-equivalent path (all four flags
 * supplied, stdin not a TTY) must still exit 0.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { assertErrorEnvelope, createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

describe('deepl sync init — no i18n files detected', () => {
  const testConfig = createTestConfigDir('e2e-sync-init-nofiles');
  const testFiles = createTestDir('e2e-sync-init-nofiles-files');

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

  function runCli(args: string[], cwd: string = testFiles.path): Run {
    const result = spawnSync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      cwd,
      env: buildEnv(),
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
    const syncCfg = path.join(testFiles.path, '.deepl-sync.yaml');
    if (fs.existsSync(syncCfg)) fs.unlinkSync(syncCfg);
  });

  afterAll(() => {
    testConfig.cleanup();
    testFiles.cleanup();
  });

  it('exits 7 (ConfigError) with remediation hint when no i18n files are detected', () => {
    const run = runCli(['sync', 'init']);

    expect(run.status).toBe(7);
    const combined = run.stdout + run.stderr;
    expect(combined).toMatch(/No i18n files detected/);
    expect(combined).toMatch(/--source-locale/);
    expect(combined).toMatch(/--target-locales/);
    expect(combined).toMatch(/--file-format/);
    expect(combined).toMatch(/--path/);
    expect(combined).toMatch(/No config created/);

    const configPath = path.join(testFiles.path, '.deepl-sync.yaml');
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('exits 7 and emits JSON error envelope when --format json and no i18n files detected', () => {
    const run = runCli(['sync', 'init', '--format', 'json']);

    expect(run.status).toBe(7);
    const envelope = assertErrorEnvelope(run.stderr, 'ConfigError', 7);
    expect(envelope.error.message).toMatch(/No i18n files detected/);

    const configPath = path.join(testFiles.path, '.deepl-sync.yaml');
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('still exits 0 when all four flags are supplied (regression guard)', () => {
    const localesDir = path.join(testFiles.path, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });
    fs.writeFileSync(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n',
    );

    const run = runCli([
      'sync', 'init',
      '--source-locale', 'en',
      '--target-locales', 'de',
      '--file-format', 'json',
      '--path', 'locales/en.json',
    ]);

    expect(run.status).toBe(0);
    const configPath = path.join(testFiles.path, '.deepl-sync.yaml');
    expect(fs.existsSync(configPath)).toBe(true);

    fs.rmSync(localesDir, { recursive: true, force: true });
  });
});
