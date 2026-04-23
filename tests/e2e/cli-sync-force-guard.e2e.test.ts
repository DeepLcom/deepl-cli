/**
 * E2E tests for --force billing defense.
 *
 * Covers:
 *  - --watch --force is rejected at startup (ValidationError, exit 6)
 *  - --force in non-TTY (piped stdin) proceeds without prompt
 *  - --force --yes skips prompt and proceeds
 *  - CI=true --force without --yes exits 6
 *  - CI=true --force --yes proceeds
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

function makeTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-force-guard-'));
  const configDir = path.join(dir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      auth: { apiKey: 'test-key:fx' },
      api: { baseUrl: 'http://127.0.0.1:1', usePro: false },
      cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
      output: { format: 'text', verbose: false, color: false },
      watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
      defaults: { targetLangs: [], formality: 'default', preserveFormatting: true },
    }),
  );
  const localesDir = path.join(dir, 'locales');
  fs.mkdirSync(localesDir, { recursive: true });
  fs.writeFileSync(
    path.join(localesDir, 'en.json'),
    JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(dir, '.deepl-sync.yaml'),
    [
      'version: 1',
      'source_locale: en',
      'target_locales:',
      '  - de',
      'buckets:',
      '  json:',
      '    include:',
      '      - "locales/en.json"',
      '',
    ].join('\n'),
  );
  return dir;
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
  combined: string;
}

function run(
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; input?: string },
): RunResult {
  const result: SpawnSyncReturns<string> = spawnSync(
    'node',
    [CLI_PATH, 'sync', ...args],
    {
      encoding: 'utf-8',
      cwd: opts.cwd,
      env: opts.env ?? { ...process.env, NO_COLOR: '1' },
      input: opts.input,
      timeout: 15000,
    },
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status ?? 1,
    stdout,
    stderr,
    combined: stdout + stderr,
  };
}

describe('deepl sync --force billing defense', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpProject();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('--watch --force rejection', () => {
    it('exits non-zero with a ValidationError when --watch and --force are combined', () => {
      const result = run(['--watch', '--force'], {
        cwd: tmpDir,
        env: { ...process.env, DEEPL_CONFIG_DIR: path.join(tmpDir, 'config'), NO_COLOR: '1' },
      });

      expect(result.status).toBe(6);
      expect(result.combined.toLowerCase()).toMatch(/watch.*force|force.*watch/);
      expect(result.combined).toMatch(/billing loop|retranslate/i);
    });

    it('error message hints at --force once + --watch separately', () => {
      const result = run(['--watch', '--force'], {
        cwd: tmpDir,
        env: { ...process.env, DEEPL_CONFIG_DIR: path.join(tmpDir, 'config'), NO_COLOR: '1' },
      });

      expect(result.status).toBe(6);
      expect(result.combined).toMatch(/deepl sync --force/);
      expect(result.combined).toMatch(/deepl sync --watch/);
    });
  });

  describe('CI=true --force without --yes', () => {
    it('exits 6 with a clear error message', () => {
      const result = run(['--force'], {
        cwd: tmpDir,
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: path.join(tmpDir, 'config'),
          NO_COLOR: '1',
          CI: 'true',
        },
      });

      expect(result.status).toBe(6);
      expect(result.combined).toMatch(/CI.*--yes|--yes.*CI|--force.*CI/i);
    });
  });

  describe('--force --yes (non-interactive bypass)', () => {
    it('proceeds past the guard without a prompt (exits 0 or 1 on API fail, not 6)', () => {
      const result = run(['--force', '--yes', '--dry-run'], {
        cwd: tmpDir,
        env: { ...process.env, DEEPL_CONFIG_DIR: path.join(tmpDir, 'config'), NO_COLOR: '1' },
      });

      // The guard is bypassed; the process exits for API/config reasons (not ValidationError 6)
      expect(result.status).not.toBe(6);
    });
  });

  describe('CI=true --force --yes', () => {
    it('proceeds (exits 0 or non-6 on API fail, not the CI-guard error)', () => {
      const result = run(['--force', '--yes', '--dry-run'], {
        cwd: tmpDir,
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: path.join(tmpDir, 'config'),
          NO_COLOR: '1',
          CI: 'true',
        },
      });

      expect(result.status).not.toBe(6);
    });
  });

  describe('non-TTY stdin (piped) without --yes', () => {
    it('proceeds without prompting when stdin is not a TTY', () => {
      // spawnSync with input= sets stdin to a pipe, so isTTY is false.
      // CI is stripped so the CI-guard branch does not pre-empt the TTY branch
      // this test is designed to exercise (GitHub Actions / GitLab CI set CI=true).
      const { CI: _ci, ...baseEnv } = process.env;
      const result = run(['--force', '--dry-run'], {
        cwd: tmpDir,
        env: { ...baseEnv, DEEPL_CONFIG_DIR: path.join(tmpDir, 'config'), NO_COLOR: '1' },
        input: 'y\n',
      });

      // Piped stdin: no TTY, no prompt expected; proceeds to sync (may fail on API, not guard)
      expect(result.status).not.toBe(6);
    });
  });
});
