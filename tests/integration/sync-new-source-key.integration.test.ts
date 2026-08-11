/**
 * Integration tests for a key added to a source file after the first sync.
 *
 * From the second run onwards the target file is the reconstruct template —
 * that is how the translations it already holds survive — so a key added to the
 * source since has no slot in it. Five of the eleven parsers used to drop such
 * an entry, and nothing downstream could tell: the key was translated, billed,
 * and recorded in the lockfile as `translated` while never reaching the file, so
 * `status` reported the locale complete and no later run revisited the string.
 *
 * The run that matters is therefore the second one, against a target that
 * already exists.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import type { SupportedParser } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import type { SyncLockFile } from '../../src/sync/types';

interface FormatCase {
  label: string;
  parser: SupportedParser;
  file: string;
  /** Source holding `greeting` only. */
  v1: string;
  /** The same source with `added` appended. */
  v2: string;
}

const CASES: FormatCase[] = [
  {
    label: 'Java Properties',
    parser: 'properties',
    file: 'app.properties',
    v1: 'greeting=Hello\n',
    v2: 'greeting=Hello\nadded=Translate me\n',
  },
  {
    label: 'iOS .strings',
    parser: 'ios_strings',
    file: 'app.strings',
    v1: '"greeting" = "Hello";\n',
    v2: '"greeting" = "Hello";\n"added" = "Translate me";\n',
  },
  {
    label: 'Laravel PHP',
    parser: 'laravel_php',
    file: 'app.php',
    v1: "<?php\n\nreturn [\n    'greeting' => 'Hello',\n];\n",
    v2: "<?php\n\nreturn [\n    'greeting' => 'Hello',\n    'added' => 'Translate me',\n];\n",
  },
  {
    label: 'Android XML',
    parser: 'android_xml',
    file: 'strings.xml',
    v1: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="greeting">Hello</string>\n</resources>\n',
    v2: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="greeting">Hello</string>\n    <string name="added">Translate me</string>\n</resources>\n',
  },
  {
    label: 'XLIFF 1.2',
    parser: 'xliff',
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
  {
    label: 'JSON',
    parser: 'json',
    file: 'app.json',
    v1: '{\n  "greeting": "Hello"\n}\n',
    v2: '{\n  "greeting": "Hello",\n  "added": "Translate me"\n}\n',
  },
];

/** A key whose containing element the target file does not have. */
interface UnwritableCase {
  label: string;
  parser: SupportedParser;
  file: string;
  key: string;
  v1: string;
  v2: string;
}

const UNWRITABLE_CASES: UnwritableCase[] = [
  {
    label: 'a new <string-array> item',
    parser: 'android_xml',
    file: 'strings.xml',
    key: 'colours.1',
    v1: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string-array name="colours">\n        <item>Hello</item>\n    </string-array>\n</resources>\n',
    v2: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string-array name="colours">\n        <item>Hello</item>\n        <item>Translate me</item>\n    </string-array>\n</resources>\n',
  },
  {
    label: 'a Laravel key whose parent array is absent',
    parser: 'laravel_php',
    file: 'app.php',
    key: 'grp.deep',
    v1: "<?php\n\nreturn [\n    'greeting' => 'Hello',\n];\n",
    v2: "<?php\n\nreturn [\n    'greeting' => 'Hello',\n    'grp' => [\n        'deep' => 'Translate me',\n    ],\n];\n",
  },
];

function replyWith(text: string): nock.Scope {
  return nock(DEEPL_FREE_API_URL)
    .post('/v2/translate')
    .reply(200, {
      translations: [
        {
          text,
          detected_source_language: 'EN',
          billed_characters: text.length,
        },
      ],
    });
}

describe('sync with a key added to the source after the first run', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  describe.each(CASES)('$label', ({ parser, file, v1, v2 }) => {
    it('writes the new key into the existing target file', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-newkey-'));
      harness = createSyncHarness({ parsers: [parser] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { [parser]: { include: [`locales/en/${file}`] } },
      });
      const sourcePath = path.join(tmpDir, 'locales', 'en', file);
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });

      fs.writeFileSync(sourcePath, v1, 'utf-8');
      replyWith('Hola');
      const first = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );
      expect(first.success).toBe(true);

      const targetPath = path.join(tmpDir, 'locales', 'es', file);
      expect(fs.readFileSync(targetPath, 'utf-8')).toContain('Hola');

      fs.writeFileSync(sourcePath, v2, 'utf-8');
      replyWith('Traduceme');
      const second = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(second.success).toBe(true);
      expect(second.newKeys).toBe(1);

      const written = fs.readFileSync(targetPath, 'utf-8');
      const translations = harness.registry
        .getParserByFormatKey(parser)!
        .extract(written);
      const keys = translations.map((e) => e.key);
      expect(keys).toContain('added');
      expect(keys).toContain('greeting');

      // The reviewed translation the file already held is untouched.
      expect(written).toContain('Hola');
      expect(written).toContain('Traduceme');
    });

    it('records the new key as translated only because it was written', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-newkey-'));
      harness = createSyncHarness({ parsers: [parser] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { [parser]: { include: [`locales/en/${file}`] } },
      });
      const sourcePath = path.join(tmpDir, 'locales', 'en', file);
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });

      fs.writeFileSync(sourcePath, v1, 'utf-8');
      replyWith('Hola');
      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      fs.writeFileSync(sourcePath, v2, 'utf-8');
      replyWith('Traduceme');
      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      const lock = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.deepl-sync.lock'), 'utf-8')
      ) as SyncLockFile;
      const fileEntries = Object.values(lock.entries)[0]!;
      expect(fileEntries['added']?.translations['es']?.status).toBe(
        'translated'
      );

      const written = fs.readFileSync(
        path.join(tmpDir, 'locales', 'es', file),
        'utf-8'
      );
      const holds = harness.registry
        .getParserByFormatKey(parser)!
        .extract(written)
        .map((e) => e.key);
      expect(holds).toContain('added');
    });
  });

  /**
   * Two shapes are deliberately not written, because placing them would mean
   * inventing structure the source file already defines. Those must be recorded
   * as failed rather than translated: a lockfile that claims a key the file does
   * not hold is what makes `status` and `--frozen` report the locale complete.
   */
  describe.each(UNWRITABLE_CASES)('$label', ({ parser, file, key, v1, v2 }) => {
    it('is recorded as failed, not translated', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-newkey-'));
      harness = createSyncHarness({ parsers: [parser] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { [parser]: { include: [`locales/en/${file}`] } },
      });
      const sourcePath = path.join(tmpDir, 'locales', 'en', file);
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });

      fs.writeFileSync(sourcePath, v1, 'utf-8');
      replyWith('Hola');
      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      fs.writeFileSync(sourcePath, v2, 'utf-8');
      replyWith('Traduceme');
      const second = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      const written = fs.readFileSync(
        path.join(tmpDir, 'locales', 'es', file),
        'utf-8'
      );
      expect(written).not.toContain('Traduceme');

      const lock = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.deepl-sync.lock'), 'utf-8')
      ) as SyncLockFile;
      const fileEntries = Object.values(lock.entries)[0]!;
      expect(fileEntries[key]?.translations['es']?.status).toBe('failed');
      expect(second.fileResults.map((r) => r.failed)).toEqual([1]);
      expect(second.fileResults.map((r) => r.translated)).toEqual([0]);
    });
  });
});
