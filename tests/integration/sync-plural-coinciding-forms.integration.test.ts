/**
 * Integration tests for plural entries whose SOURCE forms coincide.
 *
 * English has invariant nouns (fish, sheep, series), and copy-pasted `<item>`s
 * are common, so two plural forms of one key often carry the same source text.
 * Both halves of the plural pipeline identified a form by value equality rather
 * than by quantity/index: `expandPlurals` skipped every form whose value equals
 * the entry's own, and the primary write-back picked the FIRST form matching by
 * value. With coinciding forms that left one form holding source-language text,
 * written to the target and recorded `translated`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';

/** Echo `[ES] <text>`, recording every text the engine was sent. */
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

describe('sync of a plural key whose source forms coincide', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  describe('Android <plurals>', () => {
    const sourcePath = () => path.join(tmpDir, 'res', 'values', 'strings.xml');
    const targetPath = () =>
      path.join(tmpDir, 'res', 'values-es', 'strings.xml');

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-plural-same-'));
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
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
    });

    it('translates every form when one and other share the source text', async () => {
      fs.writeFileSync(
        sourcePath(),
        [
          '<?xml version="1.0" encoding="utf-8"?>',
          '<resources>',
          '    <plurals name="fish_count">',
          '        <item quantity="one">%d fish</item>',
          '        <item quantity="other">%d fish</item>',
          '    </plurals>',
          '</resources>',
          '',
        ].join('\n'),
        'utf-8'
      );

      const sent: string[] = [];
      replyEchoing(sent);
      const result = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(result.success).toBe(true);

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('<item quantity="one">[ES] %d fish</item>');
      // The form that kept the English source: `other` is the primary the
      // extractor chose, but the value-equality find matched `one` first.
      expect(written).toContain('<item quantity="other">[ES] %d fish</item>');
    });

    it('still translates each form separately when the forms differ', async () => {
      fs.writeFileSync(
        sourcePath(),
        [
          '<?xml version="1.0" encoding="utf-8"?>',
          '<resources>',
          '    <plurals name="file_count">',
          '        <item quantity="one">One file</item>',
          '        <item quantity="other">%d files</item>',
          '    </plurals>',
          '</resources>',
          '',
        ].join('\n'),
        'utf-8'
      );

      const sent: string[] = [];
      replyEchoing(sent);
      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('<item quantity="one">[ES] One file</item>');
      expect(written).toContain('<item quantity="other">[ES] %d files</item>');
    });
  });

  describe('PO plural', () => {
    const sourcePath = () => path.join(tmpDir, 'locales', 'en', 'app.po');
    const targetPath = () => path.join(tmpDir, 'locales', 'es', 'app.po');

    const header = [
      'msgid ""',
      'msgstr ""',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
      '',
      '',
    ].join('\n');

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-plural-same-'));
      harness = createSyncHarness({ parsers: ['po'] });
      writeSyncConfig(tmpDir, {
        targetLocales: ['es'],
        buckets: { po: { include: ['locales/en/app.po'] } },
      });
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
    });

    it('translates msgstr[1] when msgid_plural equals msgid', async () => {
      fs.writeFileSync(
        sourcePath(),
        header +
          [
            'msgid "%d fish"',
            'msgid_plural "%d fish"',
            'msgstr[0] ""',
            'msgstr[1] ""',
            '',
          ].join('\n'),
        'utf-8'
      );

      const sent: string[] = [];
      replyEchoing(sent);
      const result = await harness.syncService.sync(
        await loadSyncConfig(tmpDir)
      );

      expect(result.success).toBe(true);

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr[0] "[ES] %d fish"');
      expect(written).toContain('msgstr[1] "[ES] %d fish"');
    });

    it('still translates both forms when msgid_plural differs from msgid', async () => {
      fs.writeFileSync(
        sourcePath(),
        header +
          [
            'msgid "One file"',
            'msgid_plural "%d files"',
            'msgstr[0] ""',
            'msgstr[1] ""',
            '',
          ].join('\n'),
        'utf-8'
      );

      const sent: string[] = [];
      replyEchoing(sent);
      await harness.syncService.sync(await loadSyncConfig(tmpDir));

      const written = fs.readFileSync(targetPath(), 'utf-8');
      expect(written).toContain('msgstr[0] "[ES] One file"');
      expect(written).toContain('msgstr[1] "[ES] %d files"');
    });
  });
});
