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
import { computeSyncStatus } from '../../src/sync/sync-status';
import { loadSyncConfig } from '../../src/sync/sync-config';

import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
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

    it('skips a fuzzy translation rather than uploading it as approved', async () => {
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
          'msgid "Hello"\nmsgstr "Hola"\n\n#, fuzzy\nmsgid "Bye"\nmsgstr "Adios"\n'
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
          reason: 'needs_review',
          key: 'Bye',
        },
      ]);
    });

    it('still pushes a translation whose only flag is not fuzzy', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        tms: tmsConfig(),
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER + 'msgid "Hi %s"\nmsgstr ""\n'
      );
      write(
        tmpDir,
        'locales/es/app.po',
        PO_HEADER + '#, python-format\nmsgid "Hi %s"\nmsgstr "Hola %s"\n'
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
      expect(sent['Hi %s']).toBe('Hola %s');
      expect(result.skipped).toEqual([]);
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

  describe('status', () => {
    /** A synced project, then one entry marked fuzzy with the source unchanged. */
    async function syncedThenFlagged(): Promise<void> {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER + 'msgid "Hello"\nmsgstr ""\n\nmsgid "Bye"\nmsgstr ""\n'
      );
      nock(DEEPL_FREE_API_URL)
        .post('/v2/translate')
        .times(4)
        .reply(200, (_uri, body) => {
          const parsed = new URLSearchParams(body as string);
          return {
            translations: parsed.getAll('text').map((t) => ({
              text: `[es]${t}`,
              detected_source_language: 'EN',
              billed_characters: t.length,
            })),
          };
        });
      await harness.syncService.sync(await loadSyncConfig(tmpDir));
      const target = path.join(tmpDir, 'locales/es/app.po');
      fs.writeFileSync(
        target,
        fs
          .readFileSync(target, 'utf-8')
          .replace('msgid "Bye"', '#, fuzzy\nmsgid "Bye"'),
        'utf-8'
      );
    }

    it('does not count a fuzzy msgstr as complete, the way msgfmt does not', async () => {
      await syncedThenFlagged();

      const status = await computeSyncStatus(
        await loadSyncConfig(tmpDir),
        harness.registry
      );

      const es = status.locales.find((l) => l.locale === 'es')!;
      expect(es.needsReview).toBe(1);
      expect(es.complete).toBe(1);
      expect(es.coverage).toBe(50);
      expect(es.missing).toBe(0);
      expect(es.unwritten).toBe(0);
    });

    it('leaves the reviewer draft on disk and bills nothing to report it', async () => {
      await syncedThenFlagged();
      const before = fs.readFileSync(
        path.join(tmpDir, 'locales/es/app.po'),
        'utf-8'
      );

      const result = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(result.totalCharactersBilled).toBe(0);
      expect(
        fs.readFileSync(path.join(tmpDir, 'locales/es/app.po'), 'utf-8')
      ).toBe(before);
    });

    it('keeps the reviewer flag on a carried-forward key while translating a new one', async () => {
      await syncedThenFlagged();
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER +
          'msgid "Hello"\nmsgstr ""\n\nmsgid "Bye"\nmsgstr ""\n\nmsgid "Welcome"\nmsgstr ""\n'
      );
      nock(DEEPL_FREE_API_URL)
        .post('/v2/translate')
        .times(2)
        .reply(200, (_uri, body) => {
          const parsed = new URLSearchParams(body as string);
          return {
            translations: parsed.getAll('text').map((t) => ({
              text: `[es]${t}`,
              detected_source_language: 'EN',
              billed_characters: t.length,
            })),
          };
        });

      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      const written = fs.readFileSync(
        path.join(tmpDir, 'locales/es/app.po'),
        'utf-8'
      );
      expect(written).toContain('#, fuzzy\nmsgid "Bye"');
      expect(written).toContain('msgstr "[es]Welcome"');

      const status = await computeSyncStatus(
        await loadSyncConfig(tmpDir),
        harness.registry
      );
      expect(status.locales.find((l) => l.locale === 'es')!.needsReview).toBe(
        1
      );
    });

    it('reports a project with no flags exactly as before', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      write(
        tmpDir,
        'locales/en/app.po',
        PO_HEADER + 'msgid "Hello"\nmsgstr ""\n\nmsgid "Bye"\nmsgstr ""\n'
      );
      nock(DEEPL_FREE_API_URL)
        .post('/v2/translate')
        .times(4)
        .reply(200, (_uri, body) => {
          const parsed = new URLSearchParams(body as string);
          return {
            translations: parsed.getAll('text').map((t) => ({
              text: `[es]${t}`,
              detected_source_language: 'EN',
              billed_characters: t.length,
            })),
          };
        });
      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      const status = await computeSyncStatus(
        await loadSyncConfig(tmpDir),
        harness.registry
      );

      const es = status.locales.find((l) => l.locale === 'es')!;
      expect(es.needsReview).toBe(0);
      expect(es.complete).toBe(2);
      expect(es.coverage).toBe(100);
    });
  });

  describe('XLIFF review states', () => {
    const XLIFF_SOURCE = (units: string): string =>
      [
        '<?xml version="1.0"?>',
        '<xliff version="1.2"><file source-language="en" target-language="es" datatype="plaintext" original="app">',
        '<body>',
        units,
        '</body></file></xliff>',
        '',
      ].join('\n');

    const unit = (id: string, source: string): string =>
      `<trans-unit id="${id}"><source>${source}</source></trans-unit>`;

    const TWO_UNITS = XLIFF_SOURCE(
      [unit('greeting', 'Hello'), unit('farewell', 'Bye')].join('\n')
    );

    function mockTranslate(times: number): void {
      nock(DEEPL_FREE_API_URL)
        .post('/v2/translate')
        .times(times)
        .reply(200, (_uri, body) => {
          const parsed = new URLSearchParams(body as string);
          return {
            translations: parsed.getAll('text').map((t) => ({
              text: `[es]${t}`,
              detected_source_language: 'EN',
              billed_characters: t.length,
            })),
          };
        });
    }

    /** A synced project, then one unit marked needs-review with the source unchanged. */
    async function syncedThenFlagged(): Promise<string> {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        tms: tmsConfig(),
        buckets: { xliff: { include: ['locales/en/app.xlf'] } },
      });
      write(tmpDir, 'locales/en/app.xlf', TWO_UNITS);
      mockTranslate(4);
      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      const target = path.join(tmpDir, 'locales/es/app.xlf');
      fs.writeFileSync(
        target,
        fs
          .readFileSync(target, 'utf-8')
          .replace('<target>', '<target state="needs-review-translation">'),
        'utf-8'
      );
      return target;
    }

    it('does not count a needs-review target as complete', async () => {
      await syncedThenFlagged();

      const status = await computeSyncStatus(
        await loadSyncConfig(tmpDir),
        harness.registry
      );

      const es = status.locales.find((l) => l.locale === 'es')!;
      expect(es.needsReview).toBe(1);
      expect(es.complete).toBe(1);
      expect(es.coverage).toBe(50);
      expect(es.missing).toBe(0);
      expect(es.unwritten).toBe(0);
    });

    it('skips a needs-review target rather than pushing it as approved', async () => {
      await syncedThenFlagged();

      const config = await loadSyncConfig(tmpDir);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);

      const sent: string[] = [];
      nock(TMS_BASE)
        .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
        .times(2)
        .reply(200, function reply(uri: string) {
          sent.push(decodeURIComponent(uri.split('/keys/')[1]!));
          return {};
        });

      const result = await pushTranslations(config, client, harness.registry);

      expect(sent).toEqual(['farewell']);
      expect(result.pushed).toBe(1);
      expect(result.skipped).toEqual([
        {
          file: 'locales/en/app.xlf',
          locale: 'es',
          reason: 'needs_review',
          key: 'greeting',
        },
      ]);
    });

    it('leaves the reviewer state on disk and bills nothing to report it', async () => {
      const target = await syncedThenFlagged();
      const before = fs.readFileSync(target, 'utf-8');

      const result = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(result.totalCharactersBilled).toBe(0);
      expect(fs.readFileSync(target, 'utf-8')).toBe(before);
    });

    it('keeps the reviewer state on a carried-forward key while translating a new one', async () => {
      const target = await syncedThenFlagged();
      write(
        tmpDir,
        'locales/en/app.xlf',
        XLIFF_SOURCE(
          [
            unit('greeting', 'Hello'),
            unit('farewell', 'Bye'),
            unit('welcome', 'Welcome'),
          ].join('\n')
        )
      );
      mockTranslate(2);

      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      const written = fs.readFileSync(target, 'utf-8');
      expect(written).toContain('state="needs-review-translation"');
      expect(written).toContain('[es]Welcome');

      const status = await computeSyncStatus(
        await loadSyncConfig(tmpDir),
        harness.registry
      );
      expect(status.locales.find((l) => l.locale === 'es')!.needsReview).toBe(
        1
      );
    });

    it('reports a project with no state attributes exactly as before', async () => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { xliff: { include: ['locales/en/app.xlf'] } },
      });
      write(tmpDir, 'locales/en/app.xlf', TWO_UNITS);
      mockTranslate(4);
      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      const status = await computeSyncStatus(
        await loadSyncConfig(tmpDir),
        harness.registry
      );

      const es = status.locales.find((l) => l.locale === 'es')!;
      expect(es.needsReview).toBe(0);
      expect(es.complete).toBe(2);
      expect(es.coverage).toBe(100);
      expect(
        fs.readFileSync(path.join(tmpDir, 'locales/es/app.xlf'), 'utf-8')
      ).not.toContain('state=');
    });
  });
});
