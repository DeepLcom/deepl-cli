/**
 * Integration tests for staleness being judged per locale.
 *
 * A lockfile records a status per target locale. Judging a key's staleness from
 * the whole entry — "some locale failed" — makes one locale's failure speak for
 * every locale: `sync --locale de` re-translated, re-billed and overwrote de's
 * reviewed keys because *es* had failed, `sync status` reported a complete locale
 * as outdated, and `--frozen` failed a locale that was up to date.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { computeSyncStatus } from '../../src/sync/sync-status';
import type { LocaleStatus } from '../../src/sync/sync-status';
import {
  createSyncHarness,
  writeSyncConfig,
  seedLockFile,
} from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import { computeSourceHash } from '../../src/sync/sync-lock';

function replyEchoing(sent: string[]): nock.Scope {
  return nock(DEEPL_FREE_API_URL)
    .persist()
    .post('/v2/translate')
    .reply(200, (_uri, body) => {
      const texts = new URLSearchParams(body as string).getAll('text');
      sent.push(...texts);
      return {
        translations: texts.map((t) => ({
          text: `[MT] ${t}`,
          detected_source_language: 'EN',
          billed_characters: t.length,
        })),
      };
    });
}

describe('staleness when one locale has failed', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  const sourcePath = () => path.join(tmpDir, 'locales', 'en.json');
  const dePath = () => path.join(tmpDir, 'locales', 'de.json');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-cross-locale-'));
    harness = createSyncHarness({ parsers: ['json'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['de', 'es'],
      buckets: { json: { include: ['locales/en.json'] } },
    });
    fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
    fs.writeFileSync(
      sourcePath(),
      JSON.stringify({ greeting: 'Hello' }, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      dePath(),
      JSON.stringify({ greeting: 'REVIEWED-DE' }, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'locales', 'es.json'),
      JSON.stringify({}, null, 2),
      'utf-8'
    );

    // de is translated against the current source; es failed.
    const hash = computeSourceHash('Hello', undefined);
    seedLockFile(tmpDir, {
      entries: {
        'locales/en.json': {
          greeting: {
            source_hash: hash,
            source_text: 'Hello',
            translations: {
              de: {
                hash,
                translated_at: new Date(0).toISOString(),
                status: 'translated',
              },
              es: {
                hash,
                translated_at: new Date(0).toISOString(),
                status: 'failed',
              },
            },
          },
        },
      },
    });
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  it('does not re-translate de because es failed', async () => {
    const sent: string[] = [];
    replyEchoing(sent);

    const result = await harness.syncService.sync(
      await loadSyncConfig(tmpDir),
      { localeFilter: ['de'] }
    );

    expect(result.success).toBe(true);
    expect(sent).toEqual([]);
    expect(
      (
        JSON.parse(fs.readFileSync(dePath(), 'utf-8')) as Record<string, string>
      )['greeting']
    ).toBe('REVIEWED-DE');
  });

  it('does not report de as outdated in sync status', async () => {
    const status = await computeSyncStatus(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const de = status.locales.find((l: LocaleStatus) => l.locale === 'de')!;
    expect(de.outdated).toBe(0);
    expect(de.complete).toBe(1);
  });

  it('still re-translates es, which is the locale that failed', async () => {
    const sent: string[] = [];
    replyEchoing(sent);

    const result = await harness.syncService.sync(
      await loadSyncConfig(tmpDir),
      { localeFilter: ['es'] }
    );

    expect(result.success).toBe(true);
    expect(sent).toEqual(['Hello']);
  });

  it('still reports es as needing work in sync status', async () => {
    const status = await computeSyncStatus(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const es = status.locales.find((l: LocaleStatus) => l.locale === 'es')!;
    expect(es.complete).toBe(0);
  });
});
