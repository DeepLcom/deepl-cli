/**
 * E2E tests for recovery from a `deepl sync` pidfile whose holder cannot be
 * disproved.
 *
 * Two escapes exist and both are exercised through the real CLI: a holder this
 * user cannot signal ages out of credibility, and `--break-lock` removes any
 * pidfile on the operator's word. Every command that takes the lock —
 * `sync`, `sync resolve`, `sync pull` — must offer the flag.
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const PIDFILE_NAME = '.deepl-sync.lock.pidfile';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when this user cannot signal PID 1, which is the case the ageing rule
 * exists for. A test process running as root can signal it and would see a
 * genuinely live holder instead.
 */
const CANNOT_SIGNAL_INIT = ((): boolean => {
  try {
    process.kill(1, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
})();

function makeTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-break-lock-'));
  const configDir = path.join(dir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      auth: { apiKey: 'test-key:fx' },
      api: { baseUrl: 'http://127.0.0.1:1', usePro: false },
      cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
      output: { format: 'text', verbose: false, color: false },
      defaults: {
        targetLangs: [],
        formality: 'default',
        preserveFormatting: true,
      },
    }),
    { mode: 0o600 }
  );
  const localesDir = path.join(dir, 'locales');
  fs.mkdirSync(localesDir, { recursive: true });
  fs.writeFileSync(
    path.join(localesDir, 'en.json'),
    JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n'
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
      'tms:',
      '  enabled: true',
      '  server: http://127.0.0.1:1',
      '  project_id: proj-test',
      '',
    ].join('\n')
  );
  return dir;
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
  combined: string;
}

function run(args: string[], cwd: string): RunResult {
  const result: SpawnSyncReturns<string> = spawnSync(
    'node',
    [CLI_PATH, ...args],
    {
      encoding: 'utf-8',
      cwd,
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: path.join(cwd, 'config'),
        DEEPL_API_KEY: 'test-key:fx',
        TMS_API_KEY: 'tms-test-key',
        NO_COLOR: '1',
      },
      timeout: 20000,
    }
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

describe('deepl sync lock recovery', () => {
  let tmpDir: string;
  let pidFile: string;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    pidFile = path.join(tmpDir, PIDFILE_NAME);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir))
      fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function plantHolder(pid: number, ageMs: number): void {
    fs.writeFileSync(
      pidFile,
      JSON.stringify({
        pid,
        startedAt: new Date(Date.now() - ageMs).toISOString(),
      })
    );
  }

  describe('a holder that is genuinely running', () => {
    it('refuses the sync and names --break-lock as the way out', () => {
      plantHolder(process.pid, 60_000);

      const result = run(['sync', '--dry-run'], tmpDir);

      expect(result.status).toBe(7);
      expect(result.combined).toContain(`PID=${process.pid}`);
      expect(result.combined).toContain('--break-lock');
      expect(fs.existsSync(pidFile)).toBe(true);
    });

    it('proceeds with --break-lock, reporting the holder it removed', () => {
      plantHolder(process.pid, 60_000);

      const result = run(['sync', '--dry-run', '--break-lock'], tmpDir);

      expect(result.status).toBe(0);
      expect(result.combined).toContain('--break-lock');
      expect(result.combined).toContain(`PID=${process.pid}`);
      expect(fs.existsSync(pidFile)).toBe(false);
    });

    it('offers --break-lock on sync resolve, which takes the same lock', () => {
      plantHolder(process.pid, 60_000);

      const refused = run(['sync', 'resolve'], tmpDir);
      expect(refused.status).toBe(7);

      const broken = run(['sync', 'resolve', '--break-lock'], tmpDir);
      expect(broken.status).toBe(0);
      expect(broken.combined).toMatch(/No merge conflicts/i);
    });

    it('offers --break-lock on sync pull, which takes the same lock', () => {
      plantHolder(process.pid, 60_000);

      const refused = run(['sync', 'pull'], tmpDir);
      expect(refused.status).toBe(7);
      expect(refused.combined).toMatch(/Another `deepl sync` process/);

      // The pull then stops at the TMS destination-trust gate, which is the
      // next guard in its path and not the lock's business; what matters here
      // is that the lock is gone and the run got past it.
      const broken = run(['sync', 'pull', '--break-lock'], tmpDir);
      expect(broken.combined).toContain('--break-lock: removed');
      expect(broken.combined).not.toMatch(/Another `deepl sync` process/);
      expect(fs.existsSync(pidFile)).toBe(false);
    });
  });

  // Skipped wholesale rather than asserted loosely when this process can
  // signal PID 1: as root the holder is genuinely alive, which is a different
  // case with a different correct answer.
  (CANNOT_SIGNAL_INIT ? describe : describe.skip)(
    'a holder this user cannot signal',
    () => {
      it('reclaims the lock once the recorded start time is too old for a sync', () => {
        plantHolder(1, 30 * DAY_MS);

        const result = run(['sync', '--dry-run'], tmpDir);

        expect(result.status).toBe(0);
        expect(result.combined).toMatch(/stale/i);
        expect(result.combined).toContain('PID=1');
      });

      it('still refuses one that started moments ago', () => {
        plantHolder(1, 60_000);

        const result = run(['sync', '--dry-run'], tmpDir);

        expect(result.status).toBe(7);
        expect(fs.existsSync(pidFile)).toBe(true);
      });
    }
  );
});
