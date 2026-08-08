/**
 * E2E regression for in-band key separators in a repo-supplied source catalog.
 *
 * PO joins msgctxt and msgid with U+0004, which prints as nothing: a source
 * msgid holding one reviews as an ordinary string, yet reconstruct splits
 * it back apart and writes `msgctxt "menu" / msgid "Save"` — attacker-chosen
 * text under a key the source catalog never had — into every target locale, at
 * exit 0. JSON's separator is '.', so a flat `"a.b"` beside a nested `a: { b }`
 * resolves to one key and one translation lands in both slots.
 *
 * Both files must be skipped with a warning while the rest of the bucket still
 * translates: one hostile file must not end a run whose other files are already
 * billed.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const CONTEXT_SEPARATOR = '\u0004';

describe('CLI sync key-collision containment', () => {
  const testConfig = createTestConfigDir('e2e-sync-key-collision');
  const testFiles = createTestDir('e2e-sync-key-collision-files');
  let mockServer: ChildProcess;
  let baseUrl: string;

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

  beforeAll(async () => {
    const port = await startMockServer();
    baseUrl = `http://127.0.0.1:${port}`;

    fs.writeFileSync(
      path.join(testConfig.path, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'mock-api-key-for-testing:fx' },
        api: { baseUrl, usePro: false },
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
        '  po:',
        '    include:',
        '      - "locales/en/*.po"',
        '  json:',
        '    include:',
        '      - "locales/*.en.json"',
        '',
      ].join('\n')
    );

    const poDir = path.join(testFiles.path, 'locales', 'en');
    fs.mkdirSync(poDir, { recursive: true });
    const header = [
      'msgid ""',
      'msgstr ""',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '',
    ];
    fs.writeFileSync(
      path.join(poDir, 'hostile.po'),
      [...header, `msgid "menu${CONTEXT_SEPARATOR}Save"`, 'msgstr ""', ''].join(
        '\n'
      )
    );
    fs.writeFileSync(
      path.join(poDir, 'clean.po'),
      [...header, 'msgid "Hello"', 'msgstr ""', ''].join('\n')
    );

    fs.writeFileSync(
      path.join(testFiles.path, 'locales', 'shadowed.en.json'),
      JSON.stringify({ 'a.b': 'Hello', a: { b: 'Good morning' } }, null, 2) +
        '\n'
    );
    fs.writeFileSync(
      path.join(testFiles.path, 'locales', 'plain.en.json'),
      JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n'
    );
  }, 30000);

  afterAll(() => {
    if (mockServer) mockServer.kill('SIGTERM');
    testConfig.cleanup();
    testFiles.cleanup();
  });

  it('translates the clean files and skips only the colliding ones', () => {
    const result = runCli(['sync', '--yes']);
    const merged = result.stdout + result.stderr;

    expect(result.status).toBe(0);
    expect(merged).toContain('Skipping locales/en/hostile.po');
    expect(merged).toContain('Skipping locales/shadowed.en.json');
    expect(merged).toContain('U+0004');

    expect(
      fs.existsSync(path.join(testFiles.path, 'locales', 'de', 'clean.po'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testFiles.path, 'locales', 'plain.de.json'))
    ).toBe(true);
  }, 60000);

  it('writes no forged msgctxt entry into the target catalog', () => {
    const deDir = path.join(testFiles.path, 'locales', 'de');
    const written = fs
      .readdirSync(deDir)
      .map((f) => fs.readFileSync(path.join(deDir, f), 'utf-8'))
      .join('\n');

    expect(written).not.toContain('msgctxt');
    expect(written).not.toContain(CONTEXT_SEPARATOR);
    expect(fs.existsSync(path.join(deDir, 'hostile.po'))).toBe(false);
    // The clean sibling really was translated, so the skip is selective and not
    // a bucket that failed before reaching the API.
    expect(written).toContain('msgstr "Hola"');
  });

  it('writes no target file for the shadowed JSON source', () => {
    expect(
      fs.existsSync(path.join(testFiles.path, 'locales', 'shadowed.de.json'))
    ).toBe(false);
  });
});
