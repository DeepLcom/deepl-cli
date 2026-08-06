/**
 * E2E regression for the `.github` / `.git` containment gap. A bucket that
 * omitted `target_path_pattern` reached the default locale-substitution path
 * with no forbidden-segment check, so
 *
 *   buckets.yaml.include: ['.github/workflows/en.yml']
 *
 * made `deepl sync` write `.github/workflows/de.yml` from whatever the
 * translation endpoint returned — CI workflow code under the attacker's
 * influence, at exit 0. The guard now sits on the resolved path, so the run
 * refuses at the source-file walk, before any translation request.
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const VALIDATION_EXIT_CODE = 6;

describe('CLI sync VCS directory containment', () => {
  const testConfig = createTestConfigDir('e2e-sync-vcs');
  const testFiles = createTestDir('e2e-sync-vcs-files');

  interface Run {
    status: number | null;
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
        },
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

  const workflowsDir = () => path.join(testFiles.path, '.github', 'workflows');

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
  });

  beforeEach(() => {
    fs.mkdirSync(workflowsDir(), { recursive: true });
    fs.writeFileSync(
      path.join(workflowsDir(), 'en.yml'),
      'name: ci\non: push\njobs:\n  build:\n    steps:\n      - run: echo hi\n'
    );
    fs.writeFileSync(
      path.join(testFiles.path, '.deepl-sync.yaml'),
      [
        'version: 1',
        'source_locale: en',
        'target_locales:',
        '  - de',
        'buckets:',
        '  yaml:',
        '    include:',
        '      - ".github/workflows/en.yml"',
        '',
      ].join('\n')
    );
  });

  afterEach(() => {
    fs.rmSync(path.join(testFiles.path, '.github'), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(testFiles.path, '.deepl-sync.yaml'), { force: true });
  });

  it.each([['sync'], ['sync status'], ['sync validate']])(
    'should refuse `deepl %s` for a bucket rooted in .github',
    (command) => {
      const result = runCli(command.split(' '));

      expect(result.status).toBe(VALIDATION_EXIT_CODE);
      expect(result.stderr).toMatch(/\.github/);
      expect(fs.existsSync(path.join(workflowsDir(), 'de.yml'))).toBe(false);
    }
  );

  it('should leave the source workflow byte-identical', () => {
    const before = fs.readFileSync(path.join(workflowsDir(), 'en.yml'));
    runCli(['sync']);
    const after = fs.readFileSync(path.join(workflowsDir(), 'en.yml'));

    expect(after.equals(before)).toBe(true);
  });

  it('should still refuse when a target_path_pattern points out of .github', () => {
    fs.writeFileSync(
      path.join(testFiles.path, '.deepl-sync.yaml'),
      [
        'version: 1',
        'source_locale: en',
        'target_locales:',
        '  - de',
        'buckets:',
        '  yaml:',
        '    include:',
        '      - ".github/workflows/en.yml"',
        '    target_path_pattern: "locales/{locale}.yml"',
        '',
      ].join('\n')
    );
    const result = runCli(['sync']);

    expect(result.status).toBe(VALIDATION_EXIT_CODE);
    expect(result.stderr).toMatch(/\.github/);
  });
});
