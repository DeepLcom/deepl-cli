/**
 * E2E cover for the translations `deepl sync` reads back out of a bilingual
 * target file.
 *
 * PO and XLIFF carry both the source and the translation in one file, and their
 * `extract().value` is the source, not the translation. A run that rewrites the
 * file because a sibling key is new must therefore not take its "translations
 * the target already has" map from that value: doing so carries the msgid
 * forward into its own msgstr, replacing a reviewed translation with English at
 * exit 0 while the lockfile still calls the key translated.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

const PO_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
  '',
].join('\n');

describe('CLI sync with a bilingual target file', () => {
  const testConfig = createTestConfigDir('e2e-sync-bilingual');
  const testFiles = createTestDir('e2e-sync-bilingual-files');
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
        '  po:',
        '    include:',
        '      - "locales/en/app.po"',
        '  xliff:',
        '    include:',
        '      - "locales/en/app.xlf"',
        '',
      ].join('\n')
    );
    fs.mkdirSync(path.join(testFiles.path, 'locales', 'en'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(testFiles.path, 'locales', 'en', 'app.po'),
      PO_HEADER + 'msgid "Hello"\nmsgstr ""\n'
    );
    fs.writeFileSync(
      path.join(testFiles.path, 'locales', 'en', 'app.xlf'),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<xliff version="1.2">',
        '  <file source-language="en" datatype="plaintext" original="app">',
        '    <body>',
        '      <trans-unit id="greeting">',
        '        <source>Hello</source>',
        '      </trans-unit>',
        '    </body>',
        '  </file>',
        '</xliff>',
        '',
      ].join('\n')
    );
  }, 30000);

  afterAll(() => {
    if (mockServer) mockServer.kill('SIGTERM');
    testConfig.cleanup();
    testFiles.cleanup();
  });

  const poTarget = () => path.join(testFiles.path, 'locales', 'es', 'app.po');
  const xlfTarget = () => path.join(testFiles.path, 'locales', 'es', 'app.xlf');

  it('keeps a reviewed translation when a sibling key forces a rewrite', () => {
    // Run 1 establishes the lockfile, so `Hello` / `greeting` become `current`.
    expect(runSync().status).toBe(0);
    expect(fs.readFileSync(poTarget(), 'utf-8')).toContain('msgstr "Hola"');
    expect(fs.readFileSync(xlfTarget(), 'utf-8')).toContain('<target>Hola<');

    // A reviewer improves both machine translations by hand.
    fs.writeFileSync(
      poTarget(),
      fs
        .readFileSync(poTarget(), 'utf-8')
        .replace('msgstr "Hola"', 'msgstr "REVIEWED-PO"')
    );
    fs.writeFileSync(
      xlfTarget(),
      fs
        .readFileSync(xlfTarget(), 'utf-8')
        .replace('<target>Hola</target>', '<target>REVIEWED-XLF</target>')
    );

    // A contributor adds a sibling key, so both target files are rewritten.
    fs.appendFileSync(
      path.join(testFiles.path, 'locales', 'en', 'app.po'),
      '\nmsgid "Translate me"\nmsgstr ""\n'
    );
    const xlfSource = path.join(testFiles.path, 'locales', 'en', 'app.xlf');
    fs.writeFileSync(
      xlfSource,
      fs
        .readFileSync(xlfSource, 'utf-8')
        .replace(
          '    </body>',
          [
            '      <trans-unit id="added">',
            '        <source>Translate me</source>',
            '      </trans-unit>',
            '    </body>',
          ].join('\n')
        )
    );

    const second = runSync();
    expect(second.status).toBe(0);

    const po = fs.readFileSync(poTarget(), 'utf-8');
    expect(po).toContain('msgstr "REVIEWED-PO"');
    expect(po).not.toContain('msgstr "Hello"');
    expect(po).toContain('msgstr "Traduceme"');

    const xlf = fs.readFileSync(xlfTarget(), 'utf-8');
    expect(xlf).toContain('<target>REVIEWED-XLF</target>');
    expect(xlf).not.toContain('<target>Hello</target>');
  }, 120000);

  it('reports a fuzzy msgstr as needing review rather than as complete', () => {
    // Runs after the test above, so the lockfile calls both PO keys translated.
    fs.writeFileSync(
      poTarget(),
      fs
        .readFileSync(poTarget(), 'utf-8')
        .replace('msgid "Translate me"', '#, fuzzy\nmsgid "Translate me"')
    );

    const { CI: _ci, DEEPL_API_KEY: _key, ...rest } = process.env;
    const status = spawnSync(
      'node',
      [CLI_PATH, 'sync', 'status', '--format', 'json'],
      {
        encoding: 'utf-8',
        cwd: testFiles.path,
        env: { ...rest, DEEPL_CONFIG_DIR: testConfig.path, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      }
    );

    expect(status.status).toBe(0);
    const parsed = JSON.parse(status.stdout) as {
      locales: { locale: string; needsReview: number; coverage: number }[];
    };
    const es = parsed.locales.find((l) => l.locale === 'es')!;
    expect(es.needsReview).toBe(1);
    expect(es.coverage).toBeLessThan(100);

    const text = spawnSync('node', [CLI_PATH, 'sync', 'status'], {
      encoding: 'utf-8',
      cwd: testFiles.path,
      env: { ...rest, DEEPL_CONFIG_DIR: testConfig.path, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    const output = (text.stdout ?? '') + (text.stderr ?? '');
    expect(output).toContain('1 needs review');
    expect(output).toContain('msgfmt');
  }, 120000);

  it('reports an XLIFF needs-review state as needing review too', () => {
    // Runs after the two tests above, so the PO key is still flagged fuzzy and
    // the lockfile calls every key translated.
    fs.writeFileSync(
      xlfTarget(),
      fs
        .readFileSync(xlfTarget(), 'utf-8')
        .replace('<target>', '<target state="needs-review-translation">')
    );

    const { CI: _ci, DEEPL_API_KEY: _key, ...rest } = process.env;
    const run = (args: string[]): { stdout: string; combined: string } => {
      const result = spawnSync('node', [CLI_PATH, ...args], {
        encoding: 'utf-8',
        cwd: testFiles.path,
        env: { ...rest, DEEPL_CONFIG_DIR: testConfig.path, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      });
      expect(result.status).toBe(0);
      const stdout = result.stdout ?? '';
      return { stdout, combined: stdout + (result.stderr ?? '') };
    };

    // `--format json` is a stdout-only contract; a diagnostic can share stderr
    // (a config-mode-tightening notice, a node:sqlite ExperimentalWarning), so
    // parse stdout alone rather than the merged streams.
    const parsed = JSON.parse(
      run(['sync', 'status', '--format', 'json']).stdout
    ) as {
      locales: { locale: string; needsReview: number }[];
    };
    // The flagged PO key plus the flagged XLIFF unit.
    expect(parsed.locales.find((l) => l.locale === 'es')!.needsReview).toBe(2);

    const text = run(['sync', 'status']).combined;
    expect(text).toContain('2 needs review');
    expect(text).toContain('needs-review-translation');
  }, 120000);
});
