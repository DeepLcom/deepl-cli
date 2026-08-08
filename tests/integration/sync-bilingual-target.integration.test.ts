/**
 * Integration tests for the PO/XLIFF target-file read.
 *
 * Every sync path that needs "the translation this target file already holds"
 * built its map as `key -> extract().value`. For a bilingual format that value
 * is the SOURCE text, so each path handed English back as though a translator
 * had written it:
 *
 *   push     uploads the msgid as the locale's translation, and the reviewed
 *            msgstr never leaves the machine.
 *   validate compares the source against itself — every entry is reported
 *            "identical to source" and a translation that drops a placeholder
 *            passes.
 *   pull     falls back to the msgid for a key the export does not carry,
 *            overwriting the reviewed msgstr with source text.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { createTmsClient } from '../../src/sync/tms-client';
import { pushTranslations, pullTranslations } from '../../src/sync/sync-tms';
import { validateTranslations } from '../../src/sync/sync-validate';
import { loadSyncConfig } from '../../src/sync/sync-config';

import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import {
  TMS_BASE,
  TMS_PROJECT,
  tmsConfig,
  approvedTmsTrust,
} from '../helpers/tms-nock';

const PO_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
  '',
].join('\n');

function write(dir: string, relPath: string, content: string): void {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

describe('sync paths that read a bilingual target file', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-bilingual-'));
    harness = createSyncHarness({ parsers: ['po', 'xliff'] });
    process.env['TMS_API_KEY'] = 'env-key';
    delete process.env['TMS_TOKEN'];
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
    process.env = envSnapshot;
  });

  describe('push', () => {
    it('sends the msgstr, never the msgid', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        tms: tmsConfig(),
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER + 'msgid "Hello"\nmsgstr ""\n'
      );
      write(
        tmpDir,
        'locales/es/app.po',
        PO_HEADER + 'msgid "Hello"\nmsgstr "Hola"\n'
      );

      const config = await loadSyncConfig(tmpDir);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);

      const sent: Record<string, string> = {};
      nock(TMS_BASE)
        .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
        .reply(200, function reply(uri: string, body: unknown) {
          sent[decodeURIComponent(uri.split('/keys/')[1]!)] = (
            body as { value: string }
          ).value;
          return {};
        });

      const result = await pushTranslations(config, client, harness.registry);

      expect(result.pushed).toBe(1);
      expect(sent['Hello']).toBe('Hola');
    });

    it('sends the <target>, never the <source>', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        tms: tmsConfig(),
        buckets: { xliff: { include: ['locales/en/app.xlf'] } },
      });
      const unit = (inner: string): string =>
        [
          '<?xml version="1.0"?>',
          '<xliff version="1.2"><file source-language="en" datatype="plaintext" original="app">',
          '<body>',
          `<trans-unit id="greeting">${inner}</trans-unit>`,
          '</body></file></xliff>',
          '',
        ].join('\n');
      write(tmpDir, 'locales/en/app.xlf', unit('<source>Hello</source>'));
      write(
        tmpDir,
        'locales/es/app.xlf',
        unit('<source>Hello</source><target>Hola</target>')
      );

      const config = await loadSyncConfig(tmpDir);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);

      const sent: Record<string, string> = {};
      nock(TMS_BASE)
        .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
        .reply(200, function reply(uri: string, body: unknown) {
          sent[decodeURIComponent(uri.split('/keys/')[1]!)] = (
            body as { value: string }
          ).value;
          return {};
        });

      const result = await pushTranslations(config, client, harness.registry);

      expect(result.pushed).toBe(1);
      expect(sent['greeting']).toBe('Hola');
    });

    it('skips an untranslated key rather than uploading its source text', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        tms: tmsConfig(),
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER + 'msgid "Hello"\nmsgstr ""\n\nmsgid "Bye"\nmsgstr ""\n'
      );
      write(
        tmpDir,
        'locales/es/app.po',
        PO_HEADER + 'msgid "Hello"\nmsgstr "Hola"\n\nmsgid "Bye"\nmsgstr ""\n'
      );

      const config = await loadSyncConfig(tmpDir);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);

      const sent: Record<string, string> = {};
      nock(TMS_BASE)
        .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
        .times(2)
        .reply(200, function reply(uri: string, body: unknown) {
          sent[decodeURIComponent(uri.split('/keys/')[1]!)] = (
            body as { value: string }
          ).value;
          return {};
        });

      const result = await pushTranslations(config, client, harness.registry);

      expect(Object.keys(sent)).toEqual(['Hello']);
      expect(result.pushed).toBe(1);
      expect(result.skipped).toEqual([
        {
          file: 'locales/en/app.po',
          locale: 'es',
          reason: 'untranslated',
          key: 'Bye',
        },
      ]);
    });
  });

  describe('validate', () => {
    it('checks the msgstr, so a translation that drops a placeholder is an issue', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER + 'msgid "Hello {name}"\nmsgstr ""\n'
      );
      write(
        tmpDir,
        'locales/es/app.po',
        PO_HEADER + 'msgid "Hello {name}"\nmsgstr "Hola amigo"\n'
      );

      const config = await loadSyncConfig(tmpDir);
      const result = await validateTranslations(config, harness.registry);

      expect(result.totalChecked).toBe(1);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.translation).toBe('Hola amigo');
      expect(result.issues[0]!.issues.map((i) => i.check)).toContain(
        'placeholders'
      );
    });

    it('does not report a correct translation as identical to its source', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER + 'msgid "Hello {name}"\nmsgstr ""\n'
      );
      write(
        tmpDir,
        'locales/es/app.po',
        PO_HEADER + 'msgid "Hello {name}"\nmsgstr "Hola {name}"\n'
      );

      const config = await loadSyncConfig(tmpDir);
      const result = await validateTranslations(config, harness.registry);

      expect(result.totalChecked).toBe(1);
      expect(result.issues).toEqual([]);
    });
  });

  describe('pull', () => {
    it('keeps the existing msgstr for a key the export does not carry', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        tms: tmsConfig(),
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER + 'msgid "Hello"\nmsgstr ""\n\nmsgid "Bye"\nmsgstr ""\n'
      );
      write(
        tmpDir,
        'locales/es/app.po',
        PO_HEADER +
          'msgid "Hello"\nmsgstr "REVIEWED"\n\nmsgid "Bye"\nmsgstr "Adios"\n'
      );

      const config = await loadSyncConfig(tmpDir);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);

      nock(TMS_BASE)
        .get(`/api/projects/${TMS_PROJECT}/keys/export`)
        .query(true)
        .reply(200, { Bye: 'Adios (from TMS)' });

      await pullTranslations(config, client, harness.registry);

      const written = fs.readFileSync(
        path.join(tmpDir, 'locales/es/app.po'),
        'utf-8'
      );
      expect(written).toContain('msgstr "REVIEWED"');
      expect(written).toContain('msgstr "Adios (from TMS)"');
      expect(written).not.toContain('msgstr "Hello"');
    });
  });
});
