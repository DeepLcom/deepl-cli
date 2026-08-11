/**
 * Integration test for the window between the guarded pre-read of a target file
 * and the write-time re-read that produces the reconstruct template.
 *
 * The pre-read went through `readTargetFile`, which separates "nothing is there"
 * from "something is there that this run could not open" and refuses the locale
 * in the second case. The write-time re-read was a bare `fs.readFile` whose catch
 * fell back to the SOURCE as the template — so a file that became unreadable in
 * the window was reclassified as "no target": no backup was taken, and a
 * source-derived file was written over the very target the run could not read.
 * `deepl sync pull` gets this right with a single guarded read.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import { BACKUP_SUFFIX } from '../../src/sync/sync-bak-cleanup';

// A reviewed translation for `a` and no `b`, so the run has one key to translate
// -- which is what gets the engine called, and the engine reply is the only hook
// that runs between the pre-read and the write.
const HUMAN_DE = JSON.stringify({ a: 'HUMAN-A' }, null, 2) + '\n';

// Root ignores the permission bits, so the read the test needs to fail would
// succeed and the race could not be staged at all.
const describeIfNotRoot =
  typeof process.getuid === 'function' && process.getuid() === 0
    ? describe.skip
    : describe;

describeIfNotRoot('target file that becomes unreadable mid-run', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  const sourcePath = () => path.join(tmpDir, 'locales', 'en.json');
  const dePath = () => path.join(tmpDir, 'locales', 'de.json');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-toctou-'));
    harness = createSyncHarness({ parsers: ['json'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['de'],
      buckets: { json: { include: ['locales/en.json'] } },
    });
    fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
    fs.writeFileSync(
      sourcePath(),
      JSON.stringify({ a: 'Alpha', b: 'Beta' }, null, 2),
      'utf-8'
    );
    fs.writeFileSync(dePath(), HUMAN_DE, 'utf-8');
  });

  afterEach(() => {
    try {
      fs.chmodSync(dePath(), 0o644);
    } catch {
      /* already gone */
    }
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  /**
   * The engine reply is the one point that runs after the pre-read and before the
   * write, so it is where the file is made unreadable.
   */
  function replyAndRevokeRead(): void {
    nock(DEEPL_FREE_API_URL)
      .persist()
      .post('/v2/translate')
      .reply(200, (_uri, body) => {
        fs.chmodSync(dePath(), 0o000);
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

  it('refuses the locale instead of writing a source-derived file over it', async () => {
    // Guard the premise: the revocation must really make the read fail here.
    fs.chmodSync(dePath(), 0o000);
    let readable = true;
    try {
      fs.readFileSync(dePath(), 'utf-8');
    } catch {
      readable = false;
    }
    fs.chmodSync(dePath(), 0o644);
    if (readable) {
      // Filesystem does not enforce the bits; the race cannot be staged.
      return;
    }

    replyAndRevokeRead();
    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    fs.chmodSync(dePath(), 0o644);
    const after = fs.readFileSync(dePath(), 'utf-8');

    // Byte-identical: the file the run could not read is left exactly as it
    // stands, rather than rebuilt from a source-derived template.
    expect(after).toBe(HUMAN_DE);
    expect(after).not.toContain('[MT]');
    // Reported, not silent.
    expect(result.fileResults.every((r) => r.written)).toBe(false);
  });

  it('still writes normally when the target stays readable', async () => {
    nock(DEEPL_FREE_API_URL)
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

    // Give the run something to do: b is missing from the target.
    fs.writeFileSync(
      dePath(),
      JSON.stringify({ a: 'HUMAN-A' }, null, 2) + '\n',
      'utf-8'
    );

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.success).toBe(true);
    const after = fs.readFileSync(dePath(), 'utf-8');
    expect(after).toContain('HUMAN-A');
    expect(after).toContain('[MT] Beta');
    expect(fs.existsSync(dePath() + BACKUP_SUFFIX)).toBe(false);
  });
});
