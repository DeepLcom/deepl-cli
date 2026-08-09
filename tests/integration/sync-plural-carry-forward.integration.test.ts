/**
 * Integration tests for plural entries a sync run carries forward.
 *
 * A carried-forward entry's `TranslatedEntry` is built from the SOURCE diff's
 * metadata, and the plural payloads in that metadata are the source file's
 * own — empty `msgstr[N]` for gettext, source-language `<item>`s for Android.
 * `reconstruct` rebuilds plural content from exactly that metadata, so a run
 * with any other work to do emptied a PO plural entry's forms, or reverted an
 * Android `<plurals>` entry to source text, at exit 0. The forms a target file
 * already holds must survive every path that rewrites the file for a sibling
 * key: translate, validation withholding, and TMS pull.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { pullTranslations } from '../../src/sync/sync-tms';
import { createTmsClient } from '../../src/sync/tms-client';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import {
  TMS_BASE,
  TMS_PROJECT,
  tmsConfig,
  approvedTmsTrust,
} from '../helpers/tms-nock';
import type { SyncLockFile } from '../../src/sync/types';

const PO_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
  '',
].join('\n');

const PO_V1 =
  PO_HEADER +
  [
    'msgid "Hello"',
    'msgstr ""',
    '',
    'msgid "One %d file"',
    'msgid_plural "%d files"',
    'msgstr[0] ""',
    'msgstr[1] ""',
    '',
  ].join('\n');

const PO_V2 = PO_V1 + ['msgid "Bye"', 'msgstr ""', ''].join('\n');

const ANDROID_V1 = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources>',
  '    <string name="greeting">Hello</string>',
  '    <plurals name="file_count">',
  '        <item quantity="one">One %d file</item>',
  '        <item quantity="other">Many files</item>',
  '    </plurals>',
  '</resources>',
  '',
].join('\n');

const ANDROID_V2 = ANDROID_V1.replace(
  '</resources>',
  '    <string name="bye">Bye</string>\n</resources>'
);

/** Echo `[ES] <text>` per text, recording every text the engine was sent. */
function replyEchoing(sent: string[]): nock.Scope {
  return nock(DEEPL_FREE_API_URL)
    .persist()
    .post('/v2/translate')
    .reply(200, (_uri, body) => {
      const texts = new URLSearchParams(body as string).getAll('text');
      sent.push(...texts);
      return {
        translations: texts.map((t) => ({
          text: `[ES] ${t}`,
          detected_source_language: 'EN',
          billed_characters: t.length,
        })),
      };
    });
}

describe('sync with a plural entry carried forward', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  describe('PO', () => {
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-plural-'));
      harness = createSyncHarness({ parsers: ['po'] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
    });

    const sourcePath = () => path.join(tmpDir, 'locales', 'en', 'app.po');
    const targetPath = () => path.join(tmpDir, 'locales', 'es', 'app.po');

    async function establishProject(): Promise<void> {
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.writeFileSync(sourcePath(), PO_V1, 'utf-8');
      const sent: string[] = [];
      replyEchoing(sent);
      const first = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );
      expect(first.success).toBe(true);
      nock.cleanAll();

      const reviewed = fs
        .readFileSync(targetPath(), 'utf-8')
        .replace('msgstr[0] "[ES] One %d file"', 'msgstr[0] "Un archivo"')
        .replace('msgstr[1] "[ES] %d files"', 'msgstr[1] "%d archivos"');
      expect(reviewed).toContain('msgstr[0] "Un archivo"');
      expect(reviewed).toContain('msgstr[1] "%d archivos"');
      fs.writeFileSync(targetPath(), reviewed, 'utf-8');
    }

    it('keeps the reviewed msgstr[N] while translating a new sibling key', async () => {
      await establishProject();

      fs.writeFileSync(sourcePath(), PO_V2, 'utf-8');
      const sent: string[] = [];
      replyEchoing(sent);
      const second = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(second.success).toBe(true);
      expect(second.newKeys).toBe(1);
      expect(second.unwrittenKeys).toBe(0);
      expect(second.fileResults.map((r) => r.failed)).toEqual([0]);
      // The plural entry is carried, not re-translated: only the new key bills.
      expect(sent).toEqual(['Bye']);

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr[0] "Un archivo"');
      expect(written).toContain('msgstr[1] "%d archivos"');
      expect(written).toContain('msgstr "[ES] Bye"');
    });

    it('still rewrites the forms when the plural source itself changed', async () => {
      await establishProject();

      fs.writeFileSync(
        sourcePath(),
        PO_V1.replace('msgid_plural "%d files"', 'msgid_plural "%d documents"'),
        'utf-8'
      );
      const sent: string[] = [];
      replyEchoing(sent);
      const second = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(second.success).toBe(true);
      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr[0] "[ES] One %d file"');
      expect(written).toContain('msgstr[1] "[ES] %d documents"');
      expect(written).not.toContain('Un archivo');
    });

    it('keeps the reviewed msgstr[N] when a re-translation is withheld', async () => {
      await establishProject();

      // The plural source gains a placeholder-carrying text and the engine
      // starts dropping the substituted tokens, so the fresh translation is
      // withheld and the entry falls back to what the target already holds.
      fs.writeFileSync(
        sourcePath(),
        PO_V1.replace('msgid_plural "%d files"', 'msgid_plural "%d file(s)"'),
        'utf-8'
      );
      nock(DEEPL_FREE_API_URL)
        .persist()
        .post('/v2/translate')
        .reply(200, (_uri, body) => {
          const texts = new URLSearchParams(body as string).getAll('text');
          return {
            translations: texts.map((t) => ({
              text: `[ES] ${t.replace(/__VAR_\d+__/g, '').trim()}`,
              detected_source_language: 'EN',
              billed_characters: t.length,
            })),
          };
        });
      const second = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(second.fileResults.map((r) => r.failed)).toEqual([1]);
      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr[0] "Un archivo"');
      expect(written).toContain('msgstr[1] "%d archivos"');
    });
  });

  describe('Android XML', () => {
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-plural-'));
      harness = createSyncHarness({ parsers: ['android_xml'] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: {
          android_xml: {
            include: ['res/values/strings.xml'],
            target_path_pattern: 'res/values-{locale}/strings.xml',
          },
        },
      });
    });

    const sourcePath = () => path.join(tmpDir, 'res', 'values', 'strings.xml');
    const targetPath = () =>
      path.join(tmpDir, 'res', 'values-es', 'strings.xml');

    async function establishProject(): Promise<void> {
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.writeFileSync(sourcePath(), ANDROID_V1, 'utf-8');
      const sent: string[] = [];
      replyEchoing(sent);
      const first = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );
      expect(first.success).toBe(true);
      nock.cleanAll();

      const reviewed = fs
        .readFileSync(targetPath(), 'utf-8')
        .replace('[ES] One %d file', 'Un archivo')
        .replace('[ES] Many files', 'Muchos archivos');
      expect(reviewed).toContain('Un archivo');
      fs.writeFileSync(targetPath(), reviewed, 'utf-8');
    }

    it('keeps the reviewed <plurals> items while translating a new sibling key', async () => {
      await establishProject();

      fs.writeFileSync(sourcePath(), ANDROID_V2, 'utf-8');
      const sent: string[] = [];
      replyEchoing(sent);
      const second = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(second.success).toBe(true);
      expect(second.newKeys).toBe(1);
      expect(sent).toEqual(['Bye']);

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('<item quantity="one">Un archivo</item>');
      expect(written).toContain(
        '<item quantity="other">Muchos archivos</item>'
      );
      expect(written).not.toContain('One %d file');
      expect(written).toContain('[ES] Bye');
    });

    it('still rewrites the items when the plural source itself changed', async () => {
      await establishProject();

      fs.writeFileSync(
        sourcePath(),
        ANDROID_V1.replace('Many files', 'Many documents'),
        'utf-8'
      );
      const sent: string[] = [];
      replyEchoing(sent);
      const second = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(second.success).toBe(true);
      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('<item quantity="one">[ES] One %d file</item>');
      expect(written).toContain(
        '<item quantity="other">[ES] Many documents</item>'
      );
      expect(written).not.toContain('Un archivo');
    });
  });

  describe('TMS pull', () => {
    let envSnapshot: NodeJS.ProcessEnv;

    beforeEach(() => {
      envSnapshot = { ...process.env };
      process.env['TMS_API_KEY'] = 'env-key';
      delete process.env['TMS_TOKEN'];
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-plural-'));
      harness = createSyncHarness({ parsers: ['po'] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        tms: tmsConfig(),
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
    });

    afterEach(() => {
      process.env = envSnapshot;
    });

    const sourcePath = () => path.join(tmpDir, 'locales', 'en', 'app.po');
    const targetPath = () => path.join(tmpDir, 'locales', 'es', 'app.po');

    function establishFiles(): void {
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.writeFileSync(sourcePath(), PO_V1, 'utf-8');
      fs.mkdirSync(path.dirname(targetPath()), { recursive: true });
      fs.writeFileSync(
        targetPath(),
        PO_HEADER +
          [
            'msgid "Hello"',
            'msgstr "Hola"',
            '',
            'msgid "One %d file"',
            'msgid_plural "%d files"',
            'msgstr[0] "Un archivo"',
            'msgstr[1] "%d archivos"',
            '',
          ].join('\n'),
        'utf-8'
      );
    }

    function mockExport(keys: Record<string, string>): void {
      nock(TMS_BASE)
        .get(new RegExp(`/api/projects/${TMS_PROJECT}/keys/export`))
        .query(true)
        .reply(200, keys);
    }

    it('keeps the msgstr[N] of a plural entry the export does not carry', async () => {
      establishFiles();
      mockExport({ Hello: 'Hola TMS' });

      const config = await loadSyncConfig(tmpDir);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);
      const result = await pullTranslations(config, client, harness.registry);

      expect(result.pulled).toBe(1);
      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr "Hola TMS"');
      expect(written).toContain('msgstr[0] "Un archivo"');
      expect(written).toContain('msgstr[1] "%d archivos"');
    });

    it('skips a plural entry the export does carry, with a per-key reason', async () => {
      establishFiles();
      mockExport({ Hello: 'Hola TMS', 'One %d file': 'Un archivo TMS' });

      const config = await loadSyncConfig(tmpDir);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);
      const result = await pullTranslations(config, client, harness.registry);

      // A TMS export carries one string per key, which cannot fill a plural
      // entry's forms — the file keeps its own and the key is reported skipped,
      // not counted as pulled or replaced.
      expect(result.pulled).toBe(1);
      expect(result.replaced).toBe(1);
      expect(result.skipped).toEqual([
        {
          file: 'locales/en/app.po',
          locale: 'es',
          reason: 'plural_entry',
          key: 'One %d file',
        },
      ]);

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr[0] "Un archivo"');
      expect(written).toContain('msgstr[1] "%d archivos"');
      expect(written).not.toContain('Un archivo TMS');

      // The lockfile records only what was applied: no pulled entry for the
      // plural key.
      const lock = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.deepl-sync.lock'), 'utf-8')
      ) as SyncLockFile;
      const fileEntries = lock.entries['locales/en/app.po'] ?? {};
      expect(fileEntries['One %d file']).toBeUndefined();
      expect(fileEntries['Hello']?.translations['es']?.status).toBe(
        'translated'
      );
    });

    it('does not treat a source key named toString as pulled when the export omits it', async () => {
      // A source key named after an Object.prototype member, an export that
      // does not carry it, and a reviewed local translation. The membership
      // test must be own-key only, or `toString` resolves to the inherited
      // function and the reviewed value is destroyed.
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.writeFileSync(
        sourcePath(),
        PO_HEADER +
          [
            'msgid "Hello"',
            'msgstr ""',
            '',
            'msgid "toString"',
            'msgstr ""',
          ].join('\n'),
        'utf-8'
      );
      fs.mkdirSync(path.dirname(targetPath()), { recursive: true });
      fs.writeFileSync(
        targetPath(),
        PO_HEADER +
          [
            'msgid "Hello"',
            'msgstr "Hola"',
            '',
            'msgid "toString"',
            'msgstr "Convertir en texto"',
          ].join('\n'),
        'utf-8'
      );
      mockExport({ Hello: 'Hola TMS' });

      const config = await loadSyncConfig(tmpDir);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);
      const result = await pullTranslations(config, client, harness.registry);

      // Only Hello is applied; toString is neither pulled nor replaced, and the
      // reviewed local msgstr survives.
      expect(result.pulled).toBe(1);
      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr "Hola TMS"');
      expect(written).toContain('msgstr "Convertir en texto"');
      expect(written).not.toMatch(/function toString/);
    });
  });
});
