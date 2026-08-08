/**
 * E2E regression for cli-8kr2.60.
 *
 * `deepl sync` uses an existing target file as the reconstruct template, so a
 * key added to the source after the first run has no slot in it. Five parsers
 * dropped such an entry, and every reporting surface then agreed the work was
 * done: the run exited 0 claiming the key translated, the lockfile recorded
 * `status: "translated"`, `sync status` reported the locale 100% complete with 0
 * missing, `sync --frozen` — the CI drift gate — exited 0, and `sync validate`
 * passed because it only sees keys the target file actually has. The characters
 * were billed and the string was permanently absent from the shipped locale.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

interface FormatCase {
  label: string;
  bucket: string;
  file: string;
  v1: string;
  v2: string;
}

const CASES: FormatCase[] = [
  {
    label: 'properties',
    bucket: 'properties',
    file: 'app.properties',
    v1: 'greeting=Hello\n',
    v2: 'greeting=Hello\nadded=Translate me\n',
  },
  {
    label: 'ios_strings',
    bucket: 'ios_strings',
    file: 'app.strings',
    v1: '"greeting" = "Hello";\n',
    v2: '"greeting" = "Hello";\n"added" = "Translate me";\n',
  },
  {
    label: 'laravel_php',
    bucket: 'laravel_php',
    file: 'app.php',
    v1: "<?php\n\nreturn [\n    'greeting' => 'Hello',\n];\n",
    v2: "<?php\n\nreturn [\n    'greeting' => 'Hello',\n    'added' => 'Translate me',\n];\n",
  },
  {
    label: 'android_xml',
    bucket: 'android_xml',
    file: 'strings.xml',
    v1: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="greeting">Hello</string>\n</resources>\n',
    v2: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="greeting">Hello</string>\n    <string name="added">Translate me</string>\n</resources>\n',
  },
  {
    label: 'xliff',
    bucket: 'xliff',
    file: 'app.xlf',
    v1: [
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
    ].join('\n'),
    v2: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<xliff version="1.2">',
      '  <file source-language="en" datatype="plaintext" original="app">',
      '    <body>',
      '      <trans-unit id="greeting">',
      '        <source>Hello</source>',
      '      </trans-unit>',
      '      <trans-unit id="added">',
      '        <source>Translate me</source>',
      '      </trans-unit>',
      '    </body>',
      '  </file>',
      '</xliff>',
      '',
    ].join('\n'),
  },
];

describe('CLI sync with a key added to the source after the first run', () => {
  const testConfig = createTestConfigDir('e2e-sync-newkey');
  const testFiles = createTestDir('e2e-sync-newkey-files');
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

  function run(
    cwd: string,
    args: string[]
  ): { status: number | null; output: string } {
    const { CI: _ci, DEEPL_API_KEY: _key, ...rest } = process.env;
    const result = spawnSync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      cwd,
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
  }, 30000);

  afterAll(() => {
    if (mockServer) mockServer.kill('SIGTERM');
    testConfig.cleanup();
    testFiles.cleanup();
  });

  describe.each(CASES)('$label', ({ bucket, file, v1, v2 }) => {
    it('writes the key, and every reporting surface agrees', () => {
      const projectRoot = path.join(testFiles.path, bucket);
      fs.mkdirSync(path.join(projectRoot, 'locales', 'en'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(projectRoot, '.deepl-sync.yaml'),
        [
          'version: 1',
          'source_locale: en',
          'target_locales:',
          '  - es',
          'buckets:',
          `  ${bucket}:`,
          '    include:',
          `      - "locales/en/${file}"`,
          '',
        ].join('\n')
      );
      const sourcePath = path.join(projectRoot, 'locales', 'en', file);
      const targetPath = path.join(projectRoot, 'locales', 'es', file);

      fs.writeFileSync(sourcePath, v1);
      expect(run(projectRoot, ['sync', '--yes']).status).toBe(0);
      expect(fs.readFileSync(targetPath, 'utf-8')).toContain('Hola');

      // A contributor adds a string to the source and syncs again.
      fs.writeFileSync(sourcePath, v2);
      const second = run(projectRoot, ['sync', '--yes']);
      expect(second.status).toBe(0);

      const written = fs.readFileSync(targetPath, 'utf-8');
      expect(written).toContain('Traduceme');
      expect(written).toContain('Hola');

      // The lockfile's `translated` claim now describes the file on disk, so
      // the gates that read it are telling the truth rather than agreeing with
      // a record of work that never landed.
      const status = run(projectRoot, ['sync', 'status']);
      expect(status.status).toBe(0);
      expect(status.output).toContain('100%');
      expect(status.output).toContain('0 missing');

      expect(run(projectRoot, ['sync', '--frozen']).status).toBe(0);

      const validate = run(projectRoot, ['sync', 'validate']);
      expect(validate.status).toBe(0);
      expect(validate.output).toContain('Checked 2 translations');
    }, 60000);
  });

  /**
   * The two shapes that are deliberately not written must stop the run claiming
   * them. Recording a key the file does not hold is what made every gate agree
   * the locale was complete.
   */
  describe.each([
    {
      label: 'a new <string-array> item',
      bucket: 'android_xml',
      file: 'strings.xml',
      v1: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string-array name="colours">\n        <item>Hello</item>\n    </string-array>\n</resources>\n',
      v2: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string-array name="colours">\n        <item>Hello</item>\n        <item>Translate me</item>\n    </string-array>\n</resources>\n',
    },
    {
      label: 'a Laravel key whose parent array is absent',
      bucket: 'laravel_php',
      file: 'app.php',
      v1: "<?php\n\nreturn [\n    'greeting' => 'Hello',\n];\n",
      v2: "<?php\n\nreturn [\n    'greeting' => 'Hello',\n    'grp' => [\n        'deep' => 'Translate me',\n    ],\n];\n",
    },
  ])('$label', ({ bucket, file, v1, v2 }) => {
    it('reports the key as failed rather than the locale as complete', () => {
      const projectRoot = path.join(testFiles.path, `unwritable-${bucket}`);
      fs.mkdirSync(path.join(projectRoot, 'locales', 'en'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(projectRoot, '.deepl-sync.yaml'),
        [
          'version: 1',
          'source_locale: en',
          'target_locales:',
          '  - es',
          'buckets:',
          `  ${bucket}:`,
          '    include:',
          `      - "locales/en/${file}"`,
          '',
        ].join('\n')
      );
      const sourcePath = path.join(projectRoot, 'locales', 'en', file);

      fs.writeFileSync(sourcePath, v1);
      expect(run(projectRoot, ['sync', '--yes']).status).toBe(0);

      fs.writeFileSync(sourcePath, v2);
      const second = run(projectRoot, ['sync', '--yes']);

      // Exit 12 is PartialFailure: the run says so rather than exiting 0.
      expect(second.status).toBe(12);
      expect(second.output).toContain('could not be given 1 translated key');
      expect(second.output).toContain('sync again');

      const target = path.join(projectRoot, 'locales', 'es', file);
      expect(fs.readFileSync(target, 'utf-8')).not.toContain('Traduceme');

      const status = run(projectRoot, ['sync', 'status']);
      expect(status.output).not.toContain('100%');

      // Exit 10 is the drift the CI gate exists to catch.
      expect(run(projectRoot, ['sync', '--frozen']).status).toBe(10);
    }, 60000);
  });
});
