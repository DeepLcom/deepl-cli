/**
 * E2E regression for the containment gap in `deepl sync audit`.
 *
 * Audit is the one sync read that walks `.deepl-sync.lock` keys rather than
 * globbed source files, and it joined `resolveTargetPath`'s output to the
 * project root and read it with a bare `fs.readFile` — no
 * `assertPathWithinRoot`. A committed lockfile key of `../secretplace/en.json`
 * therefore read a file outside the project root, and `--format json` printed
 * that file's string values in `inconsistencies[].translations`: a
 * content-exfiltration primitive driven by a file that arrives with a clone.
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createTestConfigDir } from '../helpers';
import { LOCK_FILE_VERSION, LOCK_FILE_COMMENT } from '../../src/sync/types';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const VALIDATION_EXIT_CODE = 6;
const SECRET = 'TOP-SECRET-EXFIL-abc123';

describe('CLI sync audit path containment', () => {
  const testConfig = createTestConfigDir('e2e-audit-traversal');
  let rootDir: string;
  let projectDir: string;

  interface Run {
    status: number | null;
    stdout: string;
    stderr: string;
  }

  function runCli(args: string[]): Run {
    const env: Record<string, string | undefined> = {
      ...process.env,
      DEEPL_CONFIG_DIR: testConfig.path,
      NO_COLOR: '1',
    };
    // A real key in the ambient environment would send this run at the live API.
    delete env['DEEPL_API_KEY'];
    const result: SpawnSyncReturns<string> = spawnSync(
      'node',
      [CLI_PATH, ...args],
      {
        encoding: 'utf-8',
        cwd: projectDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      }
    );
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  beforeAll(() => {
    fs.writeFileSync(
      path.join(testConfig.path, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'mock-api-key-for-testing:fx' },
        api: { baseUrl: 'http://127.0.0.1:1/', usePro: false },
        defaults: {
          targetLangs: [],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
        proxy: {},
      }),
      'utf-8'
    );
  });

  afterAll(() => {
    testConfig.cleanup();
  });

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-audit-traversal-'));
    projectDir = path.join(rootDir, 'project');
    const secretDir = path.join(rootDir, 'secretplace');
    fs.mkdirSync(path.join(projectDir, 'locales'), { recursive: true });
    fs.mkdirSync(secretDir, { recursive: true });

    // Outside the project root: the file the lockfile key reaches for.
    fs.writeFileSync(
      path.join(secretDir, 'de.json'),
      JSON.stringify({ greeting: SECRET }),
      'utf-8'
    );

    fs.writeFileSync(
      path.join(projectDir, '.deepl-sync.yaml'),
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
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'locales', 'en.json'),
      JSON.stringify({ greeting: 'Hello' }, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'locales', 'de.json'),
      JSON.stringify({ greeting: 'Hallo' }, null, 2),
      'utf-8'
    );

    // Two lockfile entries share one source_text, so a second, differing
    // translation lands in `inconsistencies[].translations` — the field that
    // carried the out-of-root file's content. The second key escapes the root.
    const entry = {
      source_hash: 'h1',
      source_text: 'Hello',
      translations: {
        de: {
          hash: 'h1',
          translated_at: new Date(0).toISOString(),
          status: 'translated' as const,
        },
      },
    };
    fs.writeFileSync(
      path.join(projectDir, '.deepl-sync.lock'),
      JSON.stringify(
        {
          _comment: LOCK_FILE_COMMENT,
          version: LOCK_FILE_VERSION,
          generated_at: new Date(0).toISOString(),
          source_locale: 'en',
          entries: {
            'locales/en.json': { greeting: entry },
            '../secretplace/en.json': { greeting: entry },
          },
          stats: {
            total_keys: 2,
            total_translations: 2,
            last_sync: new Date(0).toISOString(),
          },
        },
        null,
        2
      ) + '\n',
      'utf-8'
    );
  });

  afterEach(() => {
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('refuses a lockfile key that escapes the project root', () => {
    const run = runCli(['sync', 'audit', '--format', 'json']);

    expect(run.status).toBe(VALIDATION_EXIT_CODE);
    expect(run.stdout + run.stderr).toMatch(/escapes project root/i);
  });

  it('never prints content from outside the project root', () => {
    const run = runCli(['sync', 'audit', '--format', 'json']);

    expect(run.stdout).not.toContain(SECRET);
    expect(run.stderr).not.toContain(SECRET);
  });

  it('still audits a project whose lockfile keys are all inside the root', () => {
    const lockPath = path.join(projectDir, '.deepl-sync.lock');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as {
      entries: Record<string, unknown>;
    };
    delete lock.entries['../secretplace/en.json'];
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf-8');

    const run = runCli(['sync', 'audit', '--format', 'json']);

    expect(run.status).toBe(0);
    const report = JSON.parse(run.stdout) as {
      totalTerms: number;
      inconsistencies: unknown[];
    };
    expect(report.totalTerms).toBe(1);
    expect(report.inconsistencies).toEqual([]);
  });
});
