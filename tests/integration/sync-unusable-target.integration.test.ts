/**
 * Integration tests for a `deepl sync` run over a target file it cannot read.
 *
 * The pre-read of each locale's file used to swallow every failure as "this
 * locale has no existing translations", which cannot tell a locale that has
 * never been synced from one whose file is on disk and unreadable. For the
 * second case the run re-translated and re-billed every key and then wrote the
 * result over the file — and the lockfile stores hashes rather than translated
 * text, so that file was the only copy of the translations it replaced.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { Logger } from '../../src/utils/logger';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';

const SOURCE =
  JSON.stringify({ greeting: 'Hello', added: 'Translate me' }, null, 2) + '\n';

/** Parses as JSON, but `menu.save` names both the flat key and the nested path. */
const COLLIDING_TARGET =
  JSON.stringify(
    {
      greeting: 'REVIEWED Hola',
      added: 'REVIEWED Traduceme',
      'menu.save': 'FLAT',
      menu: { save: 'NESTED' },
    },
    null,
    2
  ) + '\n';

describe('sync over a target file that cannot be read', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let errors: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-unusable-'));
    harness = createSyncHarness({ parsers: ['json'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: { json: { include: ['locales/en.json'] } },
    });
    const sourcePath = path.join(tmpDir, 'locales', 'en.json');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, SOURCE, 'utf-8');
    errors = [];
    jest.spyOn(Logger, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  function targetPath(): string {
    return path.join(tmpDir, 'locales', 'es.json');
  }

  function replyTranslating(times = 4): nock.Scope {
    return nock(DEEPL_FREE_API_URL)
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

  /** A healthy project, then the target replaced by one the parser refuses. */
  async function damage(content = COLLIDING_TARGET): Promise<void> {
    replyTranslating();
    await harness.syncService.sync(await loadSyncConfig(tmpDir));
    fs.writeFileSync(targetPath(), content, 'utf-8');
  }

  it('leaves the file byte-identical instead of rebuilding it', async () => {
    await damage();
    replyTranslating();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(COLLIDING_TARGET);
  });

  it('bills nothing for a locale whose translations it cannot read', async () => {
    await damage();
    const scope = replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.totalCharactersBilled).toBe(0);
    expect(scope.isDone()).toBe(false);
  });

  it('fails the locale and names the file and the reason', async () => {
    await damage();
    replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const es = result.fileResults.find((r) => r.locale === 'es')!;
    expect(es.translated).toBe(0);
    expect(es.failed).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('locales/es.json');
    expect(errors.join('\n')).toContain(
      "'menu.save' is the key of two different strings"
    );
  });

  it('records a key the source has just gained as failed, not translated', async () => {
    await damage();
    fs.writeFileSync(
      path.join(tmpDir, 'locales', 'en.json'),
      JSON.stringify(
        { greeting: 'Hello', added: 'Translate me', fresh: 'Good morning' },
        null,
        2
      ) + '\n',
      'utf-8'
    );
    replyTranslating();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const lock = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.deepl-sync.lock'), 'utf-8')
    ) as {
      entries: Record<
        string,
        Record<string, { translations: Record<string, { status: string }> }>
      >;
    };
    expect(
      lock.entries['locales/en.json']!['fresh']!.translations['es']!.status
    ).toBe('failed');
    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(COLLIDING_TARGET);
  });

  it('leaves a target file that is on disk but unreadable alone', async () => {
    await damage(SOURCE);
    fs.chmodSync(targetPath(), 0o000);
    const scope = replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    fs.chmodSync(targetPath(), 0o644);
    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(SOURCE);
    expect(result.totalCharactersBilled).toBe(0);
    expect(scope.isDone()).toBe(false);
  });

  // Over-rejection guards: absent is not unusable, and a file that reads fine is
  // still repaired.
  it('still writes a locale that has never been synced', async () => {
    replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.totalCharactersBilled).toBeGreaterThan(0);
    expect(JSON.parse(fs.readFileSync(targetPath(), 'utf-8'))).toEqual({
      greeting: '[es]Hello',
      added: '[es]Translate me',
    });
  });

  it('still repairs a readable target that lost a key', async () => {
    await damage(JSON.stringify({ greeting: '[es]Hello' }, null, 2) + '\n');
    replyTranslating();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(JSON.parse(fs.readFileSync(targetPath(), 'utf-8'))).toEqual({
      greeting: '[es]Hello',
      added: '[es]Translate me',
    });
  });
});
