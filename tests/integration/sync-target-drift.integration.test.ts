/**
 * Integration tests for a target file that has lost translations the lockfile
 * records as translated.
 *
 * Nothing used to compare the two. `sync status` and `sync --frozen` diff the
 * SOURCE file against `.deepl-sync.lock` and never opened the target, and
 * `sync` itself returned early when the lockfile said there was nothing to do —
 * so a locale damaged by an earlier version of this tool, a bad merge, a
 * partial checkout or a hand deletion reported 100% complete at exit 0
 * indefinitely and was never repaired.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { computeSyncStatus } from '../../src/sync/sync-status';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';

describe('a target file missing translations the lockfile claims', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-drift-'));
    harness = createSyncHarness({ parsers: ['properties'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: { properties: { include: ['locales/en.properties'] } },
    });
    const sourcePath = path.join(tmpDir, 'locales', 'en.properties');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      'greeting=Hello\nadded=Translate me\n',
      'utf-8'
    );
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  function targetPath(): string {
    return path.join(tmpDir, 'locales', 'es.properties');
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

  /** A healthy project, then one key removed from the target by hand. */
  async function damage(): Promise<void> {
    replyTranslating();
    await harness.syncService.sync(await loadSyncConfig(tmpDir));
    const kept = fs
      .readFileSync(targetPath(), 'utf-8')
      .split('\n')
      .filter((line) => !line.startsWith('added='))
      .join('\n');
    fs.writeFileSync(targetPath(), kept, 'utf-8');
    expect(fs.readFileSync(targetPath(), 'utf-8')).not.toContain('added=');
  }

  it('is reported by sync status rather than counted complete', async () => {
    await damage();

    const status = await computeSyncStatus(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const es = status.locales.find((l) => l.locale === 'es')!;
    expect(es.unwritten).toBe(1);
    expect(es.complete).toBe(1);
    expect(es.coverage).toBe(50);
  });

  it('is drift as far as --frozen is concerned', async () => {
    await damage();

    const result = await harness.syncService.sync(
      await loadSyncConfig(tmpDir),
      { frozen: true }
    );

    expect(result.driftDetected).toBe(true);
  });

  it('is repaired by the next sync instead of being skipped', async () => {
    await damage();
    replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.success).toBe(true);
    expect(fs.readFileSync(targetPath(), 'utf-8')).toContain(
      'added=[es]Translate me'
    );
  });

  it('reports a target file that was deleted outright', async () => {
    await damage();
    fs.unlinkSync(targetPath());

    const status = await computeSyncStatus(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const es = status.locales.find((l) => l.locale === 'es')!;
    expect(es.unwritten).toBe(2);
    expect(es.complete).toBe(0);
    expect(es.coverage).toBe(0);
  });

  // Over-rejection guards: a healthy project must keep reporting complete, and
  // the check must not fire before there is anything to check.
  it('reports a healthy project complete', async () => {
    replyTranslating();
    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const status = await computeSyncStatus(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const es = status.locales.find((l) => l.locale === 'es')!;
    expect(es.unwritten).toBe(0);
    expect(es.complete).toBe(2);
    expect(es.coverage).toBe(100);
  });

  it('says nothing about a project that has never been synced', async () => {
    const status = await computeSyncStatus(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const es = status.locales.find((l) => l.locale === 'es')!;
    expect(es.unwritten).toBe(0);
    expect(es.missing).toBe(2);
    expect(es.coverage).toBe(0);
  });

  it('leaves a healthy project alone on --frozen', async () => {
    replyTranslating();
    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const result = await harness.syncService.sync(
      await loadSyncConfig(tmpDir),
      { frozen: true }
    );

    expect(result.driftDetected).toBe(false);
  });
});

/**
 * A target file that is on disk but cannot be read is a different report from one
 * that is missing keys: nobody has been shown what it holds, and `deepl sync`
 * refuses to rebuild it, so telling the user to re-run sync would loop them.
 */
describe('a target file that cannot be read at all', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-unusable-'));
    harness = createSyncHarness({ parsers: ['json'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: { json: { include: ['locales/en.json'] } },
    });
    const sourcePath = path.join(tmpDir, 'locales', 'en.json');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      JSON.stringify({ greeting: 'Hello', added: 'Translate me' }, null, 2),
      'utf-8'
    );
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  /** A healthy project, then a '.'-separator collision merged into the target. */
  async function damage(): Promise<void> {
    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
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
    fs.writeFileSync(
      path.join(tmpDir, 'locales', 'es.json'),
      JSON.stringify(
        {
          greeting: '[es]Hello',
          added: '[es]Translate me',
          'menu.save': 'FLAT',
          menu: { save: 'NESTED' },
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  it('is reported with the reason rather than as missing keys', async () => {
    await damage();

    const status = await computeSyncStatus(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const es = status.locales.find((l) => l.locale === 'es')!;
    expect(es.unwritten).toBe(2);
    const entry = status.unwrittenByLocale.find((u) => u.locale === 'es')!;
    expect(entry.file).toBe('locales/es.json');
    expect(entry.unusable).toContain(
      "'menu.save' is the key of two different strings"
    );
  });

  it('is drift as far as --frozen is concerned', async () => {
    await damage();

    const result = await harness.syncService.sync(
      await loadSyncConfig(tmpDir),
      { frozen: true }
    );

    expect(result.driftDetected).toBe(true);
    expect(result.unwrittenKeys).toBe(2);
  });

  // Over-rejection guard: a file that reads fine keeps the missing-keys report.
  it('reports a readable target that lacks a key as missing, not unreadable', async () => {
    await damage();
    fs.writeFileSync(
      path.join(tmpDir, 'locales', 'es.json'),
      JSON.stringify({ greeting: '[es]Hello' }, null, 2),
      'utf-8'
    );

    const status = await computeSyncStatus(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const entry = status.unwrittenByLocale.find((u) => u.locale === 'es')!;
    expect(entry.keys).toEqual(['added']);
    expect(entry.unusable).toBeUndefined();
  });
});
