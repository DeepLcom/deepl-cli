/**
 * E2E regression for the brace-expansion bomb in a repo-supplied
 * `.deepl-sync.yaml`. fast-glob expands brace groups through `braces`, which
 * bounds only its input length: a 1KB include pattern of 200 `{a,b}` groups
 * used to end the process with a V8 out-of-memory abort (SIGABRT, exit 134).
 * An abort is not a catchable exception, so no try/catch inside sync could
 * contain it — the guard has to reject the pattern before fast-glob sees it.
 * A 107-byte pattern of 20 groups wedged the run too, there as a stack
 * overflow rather than an OOM.
 *
 * The child runs with a small heap so that a regression aborts quickly and
 * deterministically instead of timing out the test.
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const CONFIG_EXIT_CODE = 7;

describe('CLI sync glob bomb containment', () => {
  const testConfig = createTestConfigDir('e2e-sync-glob-bomb');
  const testFiles = createTestDir('e2e-sync-glob-bomb-files');

  interface Run {
    status: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
  }

  function runCli(args: string[]): Run {
    const result: SpawnSyncReturns<string> = spawnSync(
      'node',
      [CLI_PATH, ...args],
      {
        encoding: 'utf-8',
        cwd: testFiles.path,
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: testConfig.path,
          NO_COLOR: '1',
          NODE_OPTIONS: '--max-old-space-size=512',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      }
    );
    return {
      status: result.status,
      signal: result.signal,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  function writeSyncConfig(includeGlob: string): void {
    fs.writeFileSync(
      path.join(testFiles.path, '.deepl-sync.yaml'),
      [
        'version: 1',
        'source_locale: en',
        'target_locales:',
        '  - de',
        'buckets:',
        '  json:',
        '    include:',
        `      - '${includeGlob}'`,
        '    target_path_pattern: "locales/{locale}.json"',
        '',
      ].join('\n')
    );
  }

  beforeAll(() => {
    fs.writeFileSync(
      path.join(testConfig.path, 'config.json'),
      JSON.stringify(
        {
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
        },
        null,
        2
      )
    );
    const localesDir = path.join(testFiles.path, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });
    fs.writeFileSync(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n'
    );
  });

  afterEach(() => {
    const configPath = path.join(testFiles.path, '.deepl-sync.yaml');
    if (fs.existsSync(configPath)) fs.rmSync(configPath);
  });

  it('should reject the 1KB brace bomb instead of aborting the process', () => {
    writeSyncConfig(`${'{a,b}'.repeat(200)}/*.json`);
    const result = runCli(['sync', 'validate']);

    expect(result.signal).toBeNull();
    expect(result.status).toBe(CONFIG_EXIT_CODE);
    expect(result.stderr).not.toMatch(/FATAL ERROR|heap out of memory/i);
    expect(result.stderr).toMatch(/expands to more than/i);
  });

  it('should name the offending field in the error', () => {
    writeSyncConfig(`${'{a,b}'.repeat(200)}/*.json`);
    const result = runCli(['sync', 'validate']);

    expect(result.stderr).toMatch(/buckets\.json\.include/);
  });

  it('should reject a 107-byte brace bomb', () => {
    writeSyncConfig(`${'{a,b}'.repeat(20)}/*.json`);
    const result = runCli(['sync', 'validate']);

    expect(result.signal).toBeNull();
    expect(result.status).toBe(CONFIG_EXIT_CODE);
  });

  it('should emit the JSON error envelope rather than aborting', () => {
    writeSyncConfig(`${'{a,b}'.repeat(200)}/*.json`);
    const result = runCli(['sync', 'validate', '--format', 'json']);

    expect(result.signal).toBeNull();
    expect(result.status).toBe(CONFIG_EXIT_CODE);
    const envelope = JSON.parse(result.stderr) as {
      ok: boolean;
      error: { message: string };
    };
    expect(envelope.ok).toBe(false);
    expect(envelope.error.message).toMatch(/expands to more than/i);
  });

  it('should still accept a realistic brace glob', () => {
    writeSyncConfig('locales/{en,de}.json');
    const result = runCli(['sync', 'validate']);

    expect(result.signal).toBeNull();
    expect(result.status).not.toBe(CONFIG_EXIT_CODE);
  });
});
