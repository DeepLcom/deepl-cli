/**
 * Integration test for keys that exist only in a target file.
 *
 * `reconstruct` is handed the complete desired key set, so any run that rewrites
 * a locale drops whatever the target holds that is not in that set. For a key
 * the lockfile records, that is the intended prune of a key the source no longer
 * has. For a key the lockfile has NEVER recorded — one a translator added by
 * hand — it is someone else's data being deleted, and it happened with no
 * mention in the run output, `sync status` or `sync validate`, with the backup
 * unlinked on success. The prune stays; the silence does not.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import {
  createSyncHarness,
  writeSyncConfig,
  seedLockFile,
} from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import { computeSourceHash } from '../../src/sync/sync-lock';
import { Logger } from '../../src/utils/logger';

function replyEchoing(): nock.Scope {
  return nock(DEEPL_FREE_API_URL)
    .persist()
    .post('/v2/translate')
    .reply(200, (_uri, body) => {
      const texts = new URLSearchParams(body as string).getAll('text');
      return {
        translations: texts.map((t) => ({
          text: `[MT] ${t}`,
          detected_source_language: 'EN',
          billed_characters: t.length,
        })),
      };
    });
}

describe('a key present only in the target file', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let warnings: string[];
  let warnSpy: jest.SpyInstance;

  const sourcePath = () => path.join(tmpDir, 'locales', 'en.json');
  const dePath = () => path.join(tmpDir, 'locales', 'de.json');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-target-only-'));
    harness = createSyncHarness({ parsers: ['json'] });
    warnings = [];
    warnSpy = jest
      .spyOn(Logger, 'warn')
      .mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(' '));
      });

    writeSyncConfig(tmpDir, {
      targetLocales: ['de'],
      buckets: { json: { include: ['locales/en.json'] } },
    });
    fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
    fs.writeFileSync(
      sourcePath(),
      JSON.stringify({ greeting: 'Hello v2' }, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      dePath(),
      JSON.stringify(
        { greeting: 'Hallo', handAdded: 'VON HAND', pruned: 'ALT' },
        null,
        2
      ),
      'utf-8'
    );

    // The lockfile knows `greeting` (against an older source, so the run has
    // work) and `pruned` (a key the source has since dropped). It has never
    // heard of `handAdded`.
    seedLockFile(tmpDir, {
      entries: {
        'locales/en.json': {
          greeting: {
            source_hash: computeSourceHash('Hello', undefined),
            source_text: 'Hello',
            translations: {
              de: {
                hash: computeSourceHash('Hello', undefined),
                translated_at: new Date(0).toISOString(),
                status: 'translated',
              },
            },
          },
          pruned: {
            source_hash: computeSourceHash('Old', undefined),
            source_text: 'Old',
            translations: {
              de: {
                hash: computeSourceHash('Old', undefined),
                translated_at: new Date(0).toISOString(),
                status: 'translated',
              },
            },
          },
        },
      },
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  it('warns, naming the key the lockfile never recorded', async () => {
    replyEchoing();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));
    expect(result.success).toBe(true);

    const about = warnings.filter((w) => w.includes('handAdded'));
    expect(about).toHaveLength(1);
    expect(about[0]).toContain('locales/de.json');
    expect(about[0]).toMatch(/de:/);
  });

  it('does not warn about a key the lockfile recorded and the source dropped', async () => {
    replyEchoing();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    // `pruned` is this tool's own key, removed because the source no longer has
    // it — the documented prune, not a surprise.
    expect(warnings.filter((w) => w.includes('pruned'))).toEqual([]);
  });

  it('says nothing when the target holds no key of its own', async () => {
    fs.writeFileSync(
      dePath(),
      JSON.stringify({ greeting: 'Hallo' }, null, 2),
      'utf-8'
    );
    replyEchoing();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(warnings.filter((w) => /only in|hand/i.test(w))).toEqual([]);
  });
});
