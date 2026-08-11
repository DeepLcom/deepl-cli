/**
 * Integration tests for the backups of a watch pass that does not finish.
 *
 * A pass that completes unlinks its own backups inside `SyncService.sync` and
 * clears the tracker, so anything still in the tracker afterwards belongs to a
 * pass that threw, was cancelled, or hit drift — none of which wrote a lockfile.
 * `WatchController` unlinked those anyway, so a loop pass that rewrote es.json
 * and then aborted on fr left es.json holding machine output that nothing
 * recorded, with the only pre-run copy deleted, at exit 0 — the exact state the
 * COPYFILE_EXCL guard and the stale-backup sweep exist to prevent. Plain
 * `deepl sync` restores in the same situation; watch has to as well.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { createWatchController } from '../../src/cli/commands/sync-command';
import { loadSyncConfig } from '../../src/sync/sync-config';
import { BACKUP_SUFFIX } from '../../src/sync/sync-bak-cleanup';
import { LOCK_FILE_NAME } from '../../src/sync/types';
import { createSyncHarness } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';

const SOURCE = JSON.stringify({ a: 'Alpha', b: 'Beta' }, null, 2) + '\n';
// A reviewed translation for `a`, and no `b`: the pass has real work to do, so
// it rewrites the file and takes a backup, while `a` shows what survived.
const HUMAN_ES = JSON.stringify({ a: 'HUMAN-ES-Alpha' }, null, 2) + '\n';
const HUMAN_FR = JSON.stringify({ a: 'HUMAN-FR-Alpha' }, null, 2) + '\n';

const CONFIG_YAML = [
  'version: 1',
  'source_locale: en',
  'target_locales:',
  '  - es',
  '  - fr',
  'sync:',
  '  concurrency: 1',
  'buckets:',
  '  json:',
  '    include:',
  '      - "locales/en.json"',
  '',
].join('\n');

function createStubWatcher(): { close: () => Promise<void> } {
  return { close: async () => {} };
}

describe('watch pass that aborts after rewriting a target', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  const esPath = () => path.join(tmpDir, 'locales', 'es.json');
  const frPath = () => path.join(tmpDir, 'locales', 'fr.json');
  const esBak = () => esPath() + BACKUP_SUFFIX;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-abort-'));
    harness = createSyncHarness({ parsers: ['json'] });
    fs.mkdirSync(path.join(tmpDir, 'locales'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.deepl-sync.yaml'),
      CONFIG_YAML,
      'utf-8'
    );
    fs.writeFileSync(path.join(tmpDir, 'locales', 'en.json'), SOURCE, 'utf-8');
    fs.writeFileSync(esPath(), HUMAN_ES, 'utf-8');
    fs.writeFileSync(frPath(), HUMAN_FR, 'utf-8');
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  /**
   * es translates, then fr is answered 403. An auth failure is rethrown out of
   * the per-locale handler, so `SyncService.sync` rejects and the pass is
   * abandoned with es.json already rewritten and no lockfile written.
   */
  function replyThenFailSecondLocale(): void {
    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(200, (_uri, body) => {
        const texts = new URLSearchParams(body as string).getAll('text');
        return {
          translations: texts.map((t) => ({
            text: `MT ${t}`,
            detected_source_language: 'EN',
          })),
        };
      });
    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(403, { message: 'Authorization failed' });
  }

  function makeController(): ReturnType<typeof createWatchController> {
    return createWatchController({
      watcher: createStubWatcher(),
      projectRoot: tmpDir,
      staleBackupAgeMs: 5 * 60_000,
      runSync: async (signal, backupTracker) => {
        await harness.syncService.sync(await loadSyncConfig(tmpDir), {
          cancellationSignal: signal,
          backupTracker,
        });
      },
    });
  }

  it('restores the already-rewritten target instead of deleting its backup', async () => {
    replyThenFailSecondLocale();

    await makeController().runOnce();

    // Nothing was recorded, so the machine output must not be left in place.
    expect(fs.existsSync(path.join(tmpDir, LOCK_FILE_NAME))).toBe(false);
    expect(fs.readFileSync(esPath(), 'utf-8')).toBe(HUMAN_ES);
    expect(fs.readFileSync(frPath(), 'utf-8')).toBe(HUMAN_FR);
  });

  it('does not leave the target holding unrecorded output with no backup', async () => {
    replyThenFailSecondLocale();

    await makeController().runOnce();

    const es = fs.readFileSync(esPath(), 'utf-8');
    const strandedOutput = es.includes('MT Beta') && !fs.existsSync(esBak());
    expect(strandedOutput).toBe(false);
  });

  it('still removes the backups of a pass that completes', async () => {
    nock(DEEPL_FREE_API_URL)
      .persist()
      .post('/v2/translate')
      .reply(200, (_uri, body) => {
        const texts = new URLSearchParams(body as string).getAll('text');
        return {
          translations: texts.map((t) => ({
            text: `MT ${t}`,
            detected_source_language: 'EN',
          })),
        };
      });

    await makeController().runOnce();

    expect(fs.existsSync(esBak())).toBe(false);
    expect(fs.existsSync(frPath() + BACKUP_SUFFIX)).toBe(false);
    const es = fs.readFileSync(esPath(), 'utf-8');
    expect(es).toContain('MT Beta');
    // The reviewed translation is carried, not overwritten.
    expect(es).toContain('HUMAN-ES-Alpha');
    expect(fs.existsSync(path.join(tmpDir, LOCK_FILE_NAME))).toBe(true);
  });
});
