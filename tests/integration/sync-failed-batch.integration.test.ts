/**
 * Integration tests for what a partially failed translate leaves in the target.
 *
 * `translateBatch` chunks at 50 texts and keeps going when one chunk's request
 * fails, returning empty slots for that chunk's texts. Those slots used to fall
 * into a bare `failed++` with no carry-forward, and because `reconstruct` treats
 * the entry list as the complete desired key set, the keys of the failed chunk
 * were deleted from the target file — translations that had already shipped,
 * erased by a run that touched them only to re-translate them. The lockfile must
 * still record them `failed` so the next run retries.
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
import type { SyncLockFile } from '../../src/sync/types';

/** 60 keys: two chunks of 50 + 10 at the 50-text batch size. */
const KEY_COUNT = 60;
const FIRST_CHUNK = 50;

function keyName(i: number): string {
  return `k${String(i + 1).padStart(2, '0')}`;
}

function sourceObject(revision: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < KEY_COUNT; i++) {
    out[keyName(i)] = `${revision} text ${i + 1}`;
  }
  return out;
}

/** Echo `[ES] <text>`, recording the texts of every request. */
function replyEchoing(): nock.Scope {
  return nock(DEEPL_FREE_API_URL)
    .persist()
    .post('/v2/translate')
    .reply(200, (_uri, body) => {
      const texts = new URLSearchParams(body as string).getAll('text');
      return {
        translations: texts.map((t) => ({
          text: `[ES] ${t}`,
          detected_source_language: 'EN',
          billed_characters: t.length,
        })),
      };
    });
}

describe('sync with one translate batch failing', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  const sourcePath = () => path.join(tmpDir, 'locales', 'en.json');
  const targetPath = () => path.join(tmpDir, 'locales', 'es.json');
  const readTarget = (): Record<string, string> =>
    JSON.parse(fs.readFileSync(targetPath(), 'utf-8')) as Record<
      string,
      string
    >;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-failed-batch-'));
    harness = createSyncHarness({ parsers: ['json'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: { json: { include: ['locales/en.json'] } },
    });
    fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
    fs.writeFileSync(
      sourcePath(),
      JSON.stringify(sourceObject('v1'), null, 2),
      'utf-8'
    );
  });

  /** A project whose 60 keys are all translated and recorded in the lockfile. */
  async function establishProject(): Promise<void> {
    replyEchoing();
    const first = await harness.syncService.sync(await loadSyncConfig(tmpDir));
    expect(first.success).toBe(true);
    expect(Object.keys(readTarget())).toHaveLength(KEY_COUNT);
    nock.cleanAll();
  }

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  /** Every source value changes, so all 60 keys are stale and re-translated. */
  function bumpSourceAndFailSecondChunk(): void {
    fs.writeFileSync(
      sourcePath(),
      JSON.stringify(sourceObject('v2'), null, 2),
      'utf-8'
    );
    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(200, (_uri, body) => {
        const texts = new URLSearchParams(body as string).getAll('text');
        return {
          translations: texts.map((t) => ({
            text: `[ES] ${t}`,
            detected_source_language: 'EN',
            billed_characters: t.length,
          })),
        };
      });
    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(500, { message: 'Internal server error' });
  }

  it('keeps the failed chunk’s existing translations in the target', async () => {
    await establishProject();
    bumpSourceAndFailSecondChunk();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const written = readTarget();
    expect(Object.keys(written)).toHaveLength(KEY_COUNT);

    // The chunk that succeeded holds fresh translations of the new source.
    expect(written[keyName(0)]).toBe('[ES] v2 text 1');
    // The chunk that failed keeps what it already had, rather than vanishing.
    for (let i = FIRST_CHUNK; i < KEY_COUNT; i++) {
      expect(written[keyName(i)]).toBe(`[ES] v1 text ${i + 1}`);
    }

    expect(result.fileResults.map((r) => r.failed)).toEqual([
      KEY_COUNT - FIRST_CHUNK,
    ]);
  });

  it('records the failed chunk as failed so the next run retries it', async () => {
    await establishProject();
    bumpSourceAndFailSecondChunk();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const lock = JSON.parse(
      fs.readFileSync(path.join(tmpDir, LOCK_FILE_NAME), 'utf-8')
    ) as SyncLockFile;
    const entries = lock.entries['locales/en.json']!;
    expect(entries[keyName(0)]!.translations['es']!.status).toBe('translated');
    expect(entries[keyName(FIRST_CHUNK)]!.translations['es']!.status).toBe(
      'failed'
    );

    // The retry: with the engine healthy again, the carried keys translate.
    nock.cleanAll();
    replyEchoing();
    const retry = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(retry.success).toBe(true);
    const written = readTarget();
    for (let i = FIRST_CHUNK; i < KEY_COUNT; i++) {
      expect(written[keyName(i)]).toBe(`[ES] v2 text ${i + 1}`);
    }
  });
});
