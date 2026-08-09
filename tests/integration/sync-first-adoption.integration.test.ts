/**
 * Integration tests for the first sync over an already-translated catalog.
 *
 * With no lockfile every key is `new`, and the `new`-key path used to translate
 * and write unconditionally — so adopting the tool on a human-translated
 * project (or a CI checkout with a gitignored `.deepl-sync.lock`) replaced every
 * reviewer translation with machine output and dropped the review markers, at
 * exit 0. The carry-forward the `current`-key path performs has to hold here
 * too. What must NOT be carried is a target that merely copies the source: that
 * is untranslated text, and recording it as translated would freeze the source
 * language into the locale file.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import { LOCK_FILE_NAME } from '../../src/sync/types';

const PO_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
  '',
].join('\n');

const PO_SOURCE =
  PO_HEADER +
  ['msgid "Hello"', 'msgstr ""', '', 'msgid "Goodbye"', 'msgstr ""', ''].join(
    '\n'
  );

/** A human-translated catalog, one entry flagged for review. */
const PO_REVIEWED =
  PO_HEADER +
  [
    'msgid "Hello"',
    'msgstr "Hola"',
    '',
    '#, fuzzy',
    'msgid "Goodbye"',
    'msgstr "Adios"',
    '',
  ].join('\n');

/** A target that is a byte copy of the source: nothing is translated yet. */
const PO_UNTRANSLATED_COPY =
  PO_HEADER +
  [
    'msgid "Hello"',
    'msgstr "Hello"',
    '',
    'msgid "Goodbye"',
    'msgstr "Goodbye"',
    '',
  ].join('\n');

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

describe('first sync over an already-translated catalog', () => {
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
    const sourcePath = () => path.join(tmpDir, 'locales', 'en', 'app.po');
    const targetPath = () => path.join(tmpDir, 'locales', 'es', 'app.po');

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-first-adopt-'));
      harness = createSyncHarness({ parsers: ['po'] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.mkdirSync(path.dirname(targetPath()), { recursive: true });
      fs.writeFileSync(sourcePath(), PO_SOURCE, 'utf-8');
    });

    it('carries the reviewer translations forward instead of re-translating them', async () => {
      fs.writeFileSync(targetPath(), PO_REVIEWED, 'utf-8');
      expect(fs.existsSync(path.join(tmpDir, LOCK_FILE_NAME))).toBe(false);

      const sent: string[] = [];
      replyEchoing(sent);
      const result = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(result.success).toBe(true);
      expect(sent).toEqual([]);

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr "Hola"');
      expect(written).toContain('msgstr "Adios"');
      expect(written).toContain('#, fuzzy');
      expect(written).not.toContain('[ES]');
    });

    it('still translates a target whose msgstr merely copies the msgid', async () => {
      fs.writeFileSync(targetPath(), PO_UNTRANSLATED_COPY, 'utf-8');

      const sent: string[] = [];
      replyEchoing(sent);
      const result = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(result.success).toBe(true);
      expect(sent.sort()).toEqual(['Goodbye', 'Hello']);

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr "[ES] Hello"');
      expect(written).toContain('msgstr "[ES] Goodbye"');
    });

    it('re-translates under --force even when the target holds translations', async () => {
      fs.writeFileSync(targetPath(), PO_REVIEWED, 'utf-8');

      const sent: string[] = [];
      replyEchoing(sent);
      const result = await harness.syncService.sync(
        await loadSyncConfig(tmpDir),
        { force: true }
      );

      expect(result.success).toBe(true);
      expect(sent.sort()).toEqual(['Goodbye', 'Hello']);

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr "[ES] Hello"');
    });
  });

  describe('JSON', () => {
    const sourcePath = () => path.join(tmpDir, 'locales', 'en.json');
    const targetPath = () => path.join(tmpDir, 'locales', 'es.json');

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-first-adopt-'));
      harness = createSyncHarness({ parsers: ['json'] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { json: { include: ['locales/en.json'] } },
      });
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.writeFileSync(
        sourcePath(),
        JSON.stringify({ hello: 'Hello', bye: 'Goodbye' }, null, 2),
        'utf-8'
      );
    });

    it('carries existing translations forward and translates only the gaps', async () => {
      fs.writeFileSync(
        targetPath(),
        JSON.stringify({ hello: 'Hola' }, null, 2),
        'utf-8'
      );

      const sent: string[] = [];
      replyEchoing(sent);
      const result = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(result.success).toBe(true);
      expect(sent).toEqual(['Goodbye']);

      const written = JSON.parse(
        fs.readFileSync(targetPath(), 'utf-8')
      ) as Record<string, string>;
      expect(written['hello']).toBe('Hola');
      expect(written['bye']).toBe('[ES] Goodbye');
    });
  });
});
