/**
 * E2E regression for the TOML self-DoS a control character in a committed
 * target value causes.
 *
 * A contributor can commit a *valid* `locales/app.de.toml` holding
 * `greeting = "Hola[2J"` — TOML basic strings legally carry `\uXXXX`, and
 * smol-toml decodes it to a raw ESC. On the next sync the key is `current`, so
 * it is never translated and never validated: the locale translator carries the
 * existing target value forward and the writer used to put the byte back out
 * raw. smol-toml then refuses its own output — "control characters are not
 * allowed in strings" — so that file never syncs again, including from the
 * generated pre-commit hook.
 *
 * The file is only rewritten when something in it actually changes, so the run
 * that triggers this is one where a *sibling* key is new.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const ESC = String.fromCharCode(0x1b);

describe('CLI sync control-character containment', () => {
  const testConfig = createTestConfigDir('e2e-sync-control-chars');
  const testFiles = createTestDir('e2e-sync-control-chars-files');
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

  function runSync(): { status: number | null; output: string } {
    const { CI: _ci, DEEPL_API_KEY: _key, ...rest } = process.env;
    const result = spawnSync('node', [CLI_PATH, 'sync', '--yes'], {
      encoding: 'utf-8',
      cwd: testFiles.path,
      env: { ...rest, DEEPL_CONFIG_DIR: testConfig.path, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    return {
      status: result.status,
      output: (result.stdout ?? '') + (result.stderr ?? ''),
    };
  }

  const sourcePath = () => path.join(testFiles.path, 'locales', 'app.en.toml');
  const targetPath = () => path.join(testFiles.path, 'locales', 'app.de.toml');

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
        '  - de',
        'buckets:',
        '  toml:',
        '    include:',
        '      - "locales/*.en.toml"',
        '',
      ].join('\n')
    );
    fs.mkdirSync(path.join(testFiles.path, 'locales'), { recursive: true });
    fs.writeFileSync(sourcePath(), 'greeting = "Hello"\n');
  }, 30000);

  afterAll(() => {
    if (mockServer) mockServer.kill('SIGTERM');
    testConfig.cleanup();
    testFiles.cleanup();
  });

  it('keeps the file parseable across the run that re-emits a hostile value', () => {
    // Run 1: establish the lockfile so `greeting` becomes a `current` key.
    expect(runSync().status).toBe(0);

    // A contributor commits a valid TOML file whose escape decodes to a raw ESC,
    // and adds a sibling key so the file must be rewritten next run.
    fs.writeFileSync(targetPath(), 'greeting = "Hola\\u001B[2J"\n');
    fs.appendFileSync(sourcePath(), 'added = "Translate me"\n');

    const second = runSync();
    expect(second.status).toBe(0);

    const written = fs.readFileSync(targetPath(), 'utf-8');
    expect(written).not.toContain(ESC);
    expect(written).toContain('\\u001b');
    expect(written).toContain('Traduceme');

    // The whole point: the file still syncs. A raw ESC makes smol-toml reject
    // it, so a third run would report a parse failure instead of `current`.
    const third = runSync();
    expect(third.status).toBe(0);
    expect(third.output).not.toContain('control characters');
    expect(fs.readFileSync(targetPath(), 'utf-8')).not.toContain(ESC);
  }, 90000);
});
