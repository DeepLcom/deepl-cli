/**
 * E2E for a `deepl sync` run whose target file cannot be read.
 *
 * The pre-read of each locale's file swallowed every failure as "no existing
 * translations", so a target file that was on disk but unparseable had its whole
 * locale re-translated, re-billed and then overwritten with the result, at exit
 * 0 and without naming the file. The lock file records hashes rather than
 * translated text, so that file was the only copy of what it replaced.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

describe('CLI sync over an unreadable target file', () => {
  const testConfig = createTestConfigDir('e2e-sync-unusable-target');
  const testFiles = createTestDir('e2e-sync-unusable-target-files');
  let mockServer: ChildProcess;

  function startMockServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'node',
        [path.join(__dirname, 'mock-deepl-server.cjs')],
        { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } }
      );
      mockServer = child;
      let output = '';
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const match = /PORT=(\d+)/.exec(output);
        if (match) resolve(parseInt(match[1]!, 10));
      });
      child.on('error', reject);
      setTimeout(
        () => reject(new Error('Mock server did not start within 15s')),
        15000
      );
    });
  }

  function runCli(args: string[]): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    const { CI: _ci, DEEPL_API_KEY: _key, ...rest } = process.env;
    const result = spawnSync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      cwd: testFiles.path,
      env: { ...rest, DEEPL_CONFIG_DIR: testConfig.path, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  const sourcePath = (): string =>
    path.join(testFiles.path, 'locales', 'en.json');
  const targetPath = (): string =>
    path.join(testFiles.path, 'locales', 'es.json');

  /** Parses, but `menu.save` names both the flat key and the nested path. */
  const DAMAGED =
    JSON.stringify(
      {
        greeting: 'REVIEWED Hola',
        'menu.save': 'FLAT',
        menu: { save: 'NESTED' },
      },
      null,
      2
    ) + '\n';

  beforeAll(async () => {
    const port = await startMockServer();
    fs.writeFileSync(
      path.join(testConfig.path, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'mock-api-key-for-testing:fx' },
        api: { baseUrl: `http://127.0.0.1:${port}`, usePro: false },
        defaults: {
          targetLangs: [],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
      })
    );
    fs.writeFileSync(
      path.join(testFiles.path, '.deepl-sync.yaml'),
      [
        'version: 1',
        'source_locale: en',
        'target_locales:',
        '  - es',
        'buckets:',
        '  json:',
        '    include:',
        '      - "locales/en.json"',
        '',
      ].join('\n')
    );
    fs.mkdirSync(path.join(testFiles.path, 'locales'), { recursive: true });
    fs.writeFileSync(
      sourcePath(),
      JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n'
    );

    // A first, healthy sync so the lock file records `greeting` as translated.
    const first = runCli(['sync', '--yes']);
    if (first.status !== 0 || !fs.existsSync(targetPath())) {
      throw new Error(
        `setup sync failed (${first.status}): ${first.stdout}${first.stderr}`
      );
    }

    fs.writeFileSync(targetPath(), DAMAGED, 'utf-8');
  });

  afterAll(() => {
    if (mockServer) mockServer.kill();
    testConfig.cleanup();
    testFiles.cleanup();
  });

  it('exits 12, names the file and the reason, and leaves the file alone', () => {
    const result = runCli(['sync', '--yes']);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(12);
    expect(output).toContain('locales/es.json');
    expect(output).toContain("'menu.save' is the key of two different strings");
    expect(output).toContain('left as it stands');
    expect(output).toContain('✗ es: 0/1 keys');
    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(DAMAGED);
  });

  it('says the file could not be read rather than that its keys are missing', () => {
    const result = runCli(['sync', 'status']);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(0);
    expect(output).toContain('1 unwritten');
    expect(output).toContain('could not be read');
    expect(output).toContain('will not overwrite it');
    expect(output).not.toContain('translate it again');
  });

  it('carries the reason in --format json', () => {
    const result = runCli(['sync', 'status', '--format', 'json']);
    const parsed = JSON.parse(result.stdout) as {
      unwrittenByLocale: { locale: string; file: string; unusable?: string }[];
    };

    const es = parsed.unwrittenByLocale.find((u) => u.locale === 'es')!;
    expect(es.file).toBe('locales/es.json');
    expect(es.unusable).toContain('two different strings');
  });

  it('is drift for --frozen, which points at status rather than at a re-run', () => {
    const result = runCli(['sync', '--frozen']);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(10);
    expect(output).toContain('1 unwritten');
    expect(output).toContain('deepl sync status');
    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(DAMAGED);
  });
});
