/**
 * Integration tests for a PO catalog whose entries are not separated by blank
 * lines. `msgfmt -c` exits 0 on such a catalog, so it is legal input, and both
 * hand-written and generated ones occur.
 *
 * Both halves of the parser used to treat a blank line as the only entry
 * terminator, which cost a whole sync: the reader saw one entry — so every key
 * but the last was missing from the source key set — and the writer put the one
 * translation it had into every `msgstr` it walked past, the header's included,
 * deleting the charset and `Plural-Forms` declarations with it.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';
import * as querystring from 'querystring';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import type { SyncLockFile } from '../../src/sync/types';

const HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
].join('\n');

// No blank line anywhere: not after the header, not between the messages.
const SOURCE = [
  HEADER,
  'msgid "Hello"',
  'msgstr ""',
  'msgid "Goodbye"',
  'msgstr ""',
  '',
].join('\n');

function textsOf(body: unknown): string[] {
  const parsed =
    typeof body === 'string'
      ? (querystring.parse(body) as Record<string, string | string[]>)
      : (body as Record<string, string | string[]>);
  const text = parsed['text'];
  return Array.isArray(text) ? text : text ? [text] : [];
}

/** Echoes every text back with an `[es]` marker, however they are batched. */
function replyWithMarkedTexts(): nock.Scope {
  return nock(DEEPL_FREE_API_URL)
    .post('/v2/translate')
    .times(4)
    .reply(200, (_uri, body) => ({
      translations: textsOf(body).map((t) => ({
        text: `[es]${t}`,
        detected_source_language: 'EN',
        billed_characters: t.length,
      })),
    }));
}

describe('sync over a PO catalog with no blank-line separators', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-po-nosep-'));
    harness = createSyncHarness({ parsers: ['po'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: { po: { include: ['locales/en/app.po'] } },
    });
    const sourcePath = path.join(tmpDir, 'locales', 'en', 'app.po');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, SOURCE, 'utf-8');
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  function targetPath(): string {
    return path.join(tmpDir, 'locales', 'es', 'app.po');
  }

  it('translates every key and keeps the header intact', async () => {
    replyWithMarkedTexts();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.success).toBe(true);
    expect(result.newKeys).toBe(2);

    const written = fs.readFileSync(targetPath(), 'utf-8');
    expect(written).toContain('"Content-Type: text/plain; charset=UTF-8\\n"');
    expect(written).toContain(
      '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"'
    );
    expect(written).toContain('msgid "Hello"\nmsgstr "[es]Hello"');
    expect(written).toContain('msgid "Goodbye"\nmsgstr "[es]Goodbye"');
    // The header's own msgstr is not a translation slot.
    expect(written).not.toContain('msgstr "[es]"');
    expect(written).toMatch(/^msgid ""\nmsgstr ""\n/);
  });

  it('records both keys in the lockfile', async () => {
    replyWithMarkedTexts();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const lock = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.deepl-sync.lock'), 'utf-8')
    ) as SyncLockFile;
    const fileEntries = Object.values(lock.entries)[0]!;
    expect(Object.keys(fileEntries).sort()).toEqual(['Goodbye', 'Hello']);
    expect(fileEntries['Hello']?.translations['es']?.status).toBe('translated');
    expect(fileEntries['Goodbye']?.translations['es']?.status).toBe(
      'translated'
    );
  });

  it('reads its own output back and re-bills nothing on the next run', async () => {
    replyWithMarkedTexts();
    await harness.syncService.sync(await loadSyncConfig(tmpDir));
    const first = fs.readFileSync(targetPath(), 'utf-8');

    const second = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(second.newKeys).toBe(0);
    expect(second.currentKeys).toBe(2);
    expect(second.totalCharactersBilled).toBe(0);
    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(first);
  });
});
