/**
 * Integration tests for two sync configurations in nested project roots whose
 * buckets resolve to one target file.
 *
 * Two source files inside ONE bucket that claim one target are refused by the
 * bucket walker. Across two configurations nothing saw it: each has its own project root, its
 * own `.deepl-sync.lock` and — because the process lock is keyed on the project
 * root — its own pidfile, so the two neither exclude nor notice each other.
 * Measured through the CLI before this guard: the file ends up holding whichever
 * configuration wrote last, each later run deletes the other's keys and re-bills
 * them, and every run reports success at exit 0.
 *
 * A run that would delete keys another configuration's lockfile accounts for now
 * leaves that target alone and fails the locale instead.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { pullTranslations } from '../../src/sync/sync-tms';
import { createTmsClient } from '../../src/sync/tms-client';
import {
  expectTmsPull,
  tmsConfig,
  approvedTmsTrust,
} from '../helpers/tms-nock';
import {
  createSyncHarness,
  writeSyncConfig,
  seedLockFile,
} from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import { LOCK_FILE_NAME } from '../../src/sync/types';
import type { SyncLockEntry } from '../../src/sync/types';

function replyEchoing(sent: string[]): nock.Scope {
  return nock(DEEPL_FREE_API_URL)
    .persist()
    .post('/v2/translate')
    .reply(200, (_uri, body) => {
      const texts = new URLSearchParams(body as string).getAll('text');
      sent.push(...texts);
      return {
        translations: texts.map((t) => ({
          text: `[DE] ${t}`,
          detected_source_language: 'EN',
          billed_characters: t.length,
        })),
      };
    });
}

function translatedEntry(sourceText: string, locale: string): SyncLockEntry {
  return {
    source_hash: `hash-of-${sourceText}`,
    source_text: sourceText,
    translations: {
      [locale]: {
        hash: `hash-of-${sourceText}`,
        translated_at: '2026-08-01T00:00:00.000Z',
        status: 'translated',
        review_status: 'machine_translated',
      },
    },
  };
}

describe('two sync configurations writing one target file', () => {
  let base: string;
  let pkg: string;
  let sharedTarget: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    base = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-two-configs-'))
    );
    pkg = path.join(base, 'pkg');
    fs.mkdirSync(path.join(pkg, 'locales'), { recursive: true });
    fs.mkdirSync(path.join(pkg, 'strings'), { recursive: true });
    sharedTarget = path.join(pkg, 'locales', 'de.json');

    // The outer configuration, rooted at `base`, translates pkg/locales/en.json
    // to its `de` sibling — pkg/locales/de.json.
    fs.writeFileSync(
      path.join(pkg, 'locales', 'en.json'),
      JSON.stringify({ 'outer.one': 'Outer one', 'outer.two': 'Outer two' }),
      'utf-8'
    );
    writeSyncConfig(base, {
      targetLocales: ['de'],
      buckets: { json: { include: ['pkg/locales/en.json'] } },
    });

    // The inner configuration, rooted at `pkg`, translates strings/en.json into
    // the same file via its target_path_pattern.
    fs.writeFileSync(
      path.join(pkg, 'strings', 'en.json'),
      JSON.stringify({ 'inner.one': 'Inner one', 'inner.two': 'Inner two' }),
      'utf-8'
    );
    writeSyncConfig(pkg, {
      targetLocales: ['de'],
      buckets: {
        json: {
          include: ['strings/en.json'],
          target_path_pattern: 'locales/{locale}.json',
        },
      },
    });

    harness = createSyncHarness({ parsers: ['json'] });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    harness.cleanup();
    if (fs.existsSync(base)) fs.rmSync(base, { recursive: true, force: true });
    nock.cleanAll();
  });

  function diagnostics(): string {
    return [...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .map((args: unknown[]) => args.map((a) => String(a)).join(' '))
      .join('\n');
  }

  /** The inner configuration has already run: its keys are in the shared file. */
  function seedInnerRun(): void {
    fs.writeFileSync(
      sharedTarget,
      JSON.stringify(
        { 'inner.one': '[DE] Inner one', 'inner.two': '[DE] Inner two' },
        null,
        2
      ) + '\n',
      'utf-8'
    );
    seedLockFile(pkg, {
      entries: {
        'strings/en.json': {
          'inner.one': translatedEntry('Inner one', 'de'),
          'inner.two': translatedEntry('Inner two', 'de'),
        },
      },
    });
  }

  /** The outer configuration has already run: its keys are in the shared file. */
  function seedOuterRun(): void {
    fs.writeFileSync(
      sharedTarget,
      JSON.stringify(
        { 'outer.one': '[DE] Outer one', 'outer.two': '[DE] Outer two' },
        null,
        2
      ) + '\n',
      'utf-8'
    );
    seedLockFile(base, {
      entries: {
        'pkg/locales/en.json': {
          'outer.one': translatedEntry('Outer one', 'de'),
          'outer.two': translatedEntry('Outer two', 'de'),
        },
      },
    });
  }

  it('leaves the other configuration translations in place rather than deleting them', async () => {
    seedInnerRun();
    const before = fs.readFileSync(sharedTarget, 'utf-8');
    const sent: string[] = [];
    replyEchoing(sent);

    const result = await harness.syncService.sync(await loadSyncConfig(base));

    expect(result.success).toBe(false);
    expect(fs.readFileSync(sharedTarget, 'utf-8')).toBe(before);
  });

  it('spends nothing on a locale it is going to refuse', async () => {
    seedInnerRun();
    const sent: string[] = [];
    replyEchoing(sent);

    const result = await harness.syncService.sync(await loadSyncConfig(base));

    expect(sent).toEqual([]);
    expect(result.totalCharactersBilled).toBe(0);
  });

  it('names the other lockfile, the keys and a remedy', async () => {
    seedInnerRun();
    replyEchoing([]);

    await harness.syncService.sync(await loadSyncConfig(base));

    const output = diagnostics();
    expect(output).toContain(path.join(pkg, LOCK_FILE_NAME));
    expect(output).toContain('inner.one');
    expect(output).toContain('inner.two');
    expect(output).toMatch(/own target file|separate/i);
  });

  it('refuses in the other direction too, where the outer configuration wrote first', async () => {
    seedOuterRun();
    const before = fs.readFileSync(sharedTarget, 'utf-8');
    const sent: string[] = [];
    replyEchoing(sent);

    const result = await harness.syncService.sync(await loadSyncConfig(pkg));

    expect(result.success).toBe(false);
    expect(sent).toEqual([]);
    expect(fs.readFileSync(sharedTarget, 'utf-8')).toBe(before);
    expect(diagnostics()).toContain(path.join(base, LOCK_FILE_NAME));
  });

  it('records the refused locale as failed, never as translated, so the next run retries it', async () => {
    seedInnerRun();
    replyEchoing([]);

    await harness.syncService.sync(await loadSyncConfig(base));

    const lock = JSON.parse(
      fs.readFileSync(path.join(base, LOCK_FILE_NAME), 'utf-8')
    ) as {
      entries: Record<
        string,
        Record<string, { translations: Record<string, { status: string }> }>
      >;
    };
    const statuses = Object.values(lock.entries)
      .flatMap((perFile) => Object.values(perFile))
      .map((entry) => entry.translations['de']?.status);
    expect(statuses).toEqual(['failed', 'failed']);
  });

  describe('healthy cases the guard must not touch', () => {
    it('still prunes hand-added keys no other configuration accounts for', async () => {
      fs.writeFileSync(
        sharedTarget,
        JSON.stringify({ 'hand.added': 'Von Hand' }, null, 2) + '\n',
        'utf-8'
      );
      const sent: string[] = [];
      replyEchoing(sent);

      const result = await harness.syncService.sync(await loadSyncConfig(base));

      expect(result.success).toBe(true);
      const written = JSON.parse(
        fs.readFileSync(sharedTarget, 'utf-8')
      ) as Record<string, string>;
      expect(Object.keys(written).sort()).toEqual(['outer.one', 'outer.two']);
      expect(diagnostics()).toContain('hand.added');
    });

    it('proceeds when the other lockfile accounts for those keys in another locale only', async () => {
      fs.writeFileSync(
        sharedTarget,
        JSON.stringify({ 'inner.one': '[DE] Inner one' }, null, 2) + '\n',
        'utf-8'
      );
      seedLockFile(pkg, {
        entries: {
          'strings/en.json': {
            'inner.one': translatedEntry('Inner one', 'fr'),
          },
        },
      });
      replyEchoing([]);

      const result = await harness.syncService.sync(await loadSyncConfig(base));

      expect(result.success).toBe(true);
    });

    it('syncs both configurations once each has its own target file', async () => {
      // The remedy the refusal names.
      writeSyncConfig(pkg, {
        targetLocales: ['de'],
        buckets: {
          json: {
            include: ['strings/en.json'],
            target_path_pattern: 'strings/{locale}.json',
          },
        },
      });
      const sent: string[] = [];
      replyEchoing(sent);

      const outer = await harness.syncService.sync(await loadSyncConfig(base));
      const inner = await harness.syncService.sync(await loadSyncConfig(pkg));

      expect(outer.success).toBe(true);
      expect(inner.success).toBe(true);
      expect(sent.sort()).toEqual([
        'Inner one',
        'Inner two',
        'Outer one',
        'Outer two',
      ]);
      const outerTarget = JSON.parse(
        fs.readFileSync(sharedTarget, 'utf-8')
      ) as Record<string, string>;
      const innerTarget = JSON.parse(
        fs.readFileSync(path.join(pkg, 'strings', 'de.json'), 'utf-8')
      ) as Record<string, string>;
      expect(Object.keys(outerTarget).sort()).toEqual([
        'outer.one',
        'outer.two',
      ]);
      expect(Object.keys(innerTarget).sort()).toEqual([
        'inner.one',
        'inner.two',
      ]);
    });
  });
  /**
   * `deepl sync pull` rebuilds the same target from its own source key set, so it
   * deletes another configuration's keys exactly as `deepl sync` did.
   */
  describe('sync pull over the same shared target', () => {
    beforeEach(() => {
      writeSyncConfig(base, {
        targetLocales: ['de'],
        buckets: { json: { include: ['pkg/locales/en.json'] } },
        tms: tmsConfig(),
      });
      process.env['TMS_API_KEY'] = 'env-key';
    });

    afterEach(() => {
      delete process.env['TMS_API_KEY'];
    });

    it('leaves the other configuration keys alone and reports the file skipped', async () => {
      seedInnerRun();
      const before = fs.readFileSync(sharedTarget, 'utf-8');
      expectTmsPull(
        'de',
        { 'outer.one': 'Von der TMS', 'outer.two': 'Auch von der TMS' },
        { auth: { apiKey: 'env-key' } }
      );

      const config = await loadSyncConfig(base);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);
      const result = await pullTranslations(config, client, harness.registry);

      expect(fs.readFileSync(sharedTarget, 'utf-8')).toBe(before);
      expect(result.pulled).toBe(0);
      expect(result.skipped).toEqual([
        { file: 'pkg/locales/en.json', locale: 'de', reason: 'shared_target' },
      ]);
      expect(diagnostics()).toContain(path.join(pkg, LOCK_FILE_NAME));
    });

    it('still pulls into a target no other configuration accounts for', async () => {
      fs.writeFileSync(
        sharedTarget,
        JSON.stringify({ 'outer.one': 'Alt' }, null, 2) + '\n',
        'utf-8'
      );
      expectTmsPull(
        'de',
        { 'outer.one': 'Neu' },
        { auth: { apiKey: 'env-key' } }
      );

      const config = await loadSyncConfig(base);
      const client = await createTmsClient(config.tms!, approvedTmsTrust);
      const result = await pullTranslations(config, client, harness.registry);

      expect(result.pulled).toBe(1);
      expect(result.skipped).toEqual([]);
      const written = JSON.parse(
        fs.readFileSync(sharedTarget, 'utf-8')
      ) as Record<string, string>;
      expect(written['outer.one']).toBe('Neu');
    });
  });
});
