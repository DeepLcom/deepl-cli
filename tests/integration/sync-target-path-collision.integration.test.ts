/**
 * Integration tests for two source files in one bucket that resolve to the same
 * target path.
 *
 * `target_path_pattern` need not contain `{basename}`, so `out/{locale}.json`
 * makes every source file in a bucket claim one target. Each file's
 * `reconstruct` is handed only its own keys and treats that list as the complete
 * key set, so the files delete each other's translations — and `unwrittenKeys`
 * inspects only the string the current file just produced, so the loser is still
 * recorded `translated`. Every later run then re-translates, re-bills and
 * re-loses the same keys against a target that can never be complete.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';
import { ValidationError } from '../../src/utils/errors';

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

describe('sync with two source files resolving to one target path', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-target-collide-'));
    harness = createSyncHarness({ parsers: ['json'] });
    for (const mod of ['modA', 'modB']) {
      fs.mkdirSync(path.join(tmpDir, mod), { recursive: true });
    }
    fs.writeFileSync(
      path.join(tmpDir, 'modA', 'en.json'),
      JSON.stringify({ a1: 'Alpha one', a2: 'Alpha two' }, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'modB', 'en.json'),
      JSON.stringify({ b1: 'Beta one', b2: 'Beta two' }, null, 2),
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

  /** A pattern with no `{basename}`: both source files claim `out/es.json`. */
  function writeCollidingConfig(): void {
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: {
        json: {
          include: ['mod*/en.json'],
          target_path_pattern: 'out/{locale}.json',
        },
      },
    });
  }

  it('refuses the bucket instead of letting the files overwrite each other', async () => {
    writeCollidingConfig();
    const sent: string[] = [];
    replyEchoing(sent);

    await expect(
      harness.syncService.sync(await loadSyncConfig(tmpDir))
    ).rejects.toThrow(ValidationError);

    // Refused before any translation is requested, so nothing is billed and no
    // half-written target is left behind.
    expect(sent).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, 'out', 'es.json'))).toBe(false);
  });

  it('names both files, the shared target and a remedy that works', async () => {
    expect.assertions(5);
    writeCollidingConfig();
    replyEchoing([]);

    try {
      await harness.syncService.sync(await loadSyncConfig(tmpDir));
    } catch (err) {
      const error = err as ValidationError;
      expect(error.message).toContain('modA/en.json');
      expect(error.message).toContain('modB/en.json');
      expect(error.message).toContain('out/es.json');
      expect(error.suggestion).toMatch(/target_path_pattern/);
      // {basename} is the source filename, so it does NOT separate two files
      // called en.json in different directories — the message must not offer it
      // as the fix.
      expect(error.suggestion).toMatch(/does not separate/);
    }
  });

  it('accepts the same sources with no pattern, where each keeps its own path', async () => {
    // The remedy the error names: locale substitution is per file, so
    // modA/en.json -> modA/es.json and modB/en.json -> modB/es.json.
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: { json: { include: ['mod*/en.json'] } },
    });
    const sent: string[] = [];
    replyEchoing(sent);

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.success).toBe(true);
    expect(sent.sort()).toEqual([
      'Alpha one',
      'Alpha two',
      'Beta one',
      'Beta two',
    ]);

    const a = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'modA', 'es.json'), 'utf-8')
    ) as Record<string, string>;
    const b = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'modB', 'es.json'), 'utf-8')
    ) as Record<string, string>;
    expect(Object.keys(a).sort()).toEqual(['a1', 'a2']);
    expect(Object.keys(b).sort()).toEqual(['b1', 'b2']);
  });

  it('accepts a pattern where {basename} really does separate the targets', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'a.en.json'),
      JSON.stringify({ a1: 'Alpha one' }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'b.en.json'),
      JSON.stringify({ b1: 'Beta one' }),
      'utf-8'
    );
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: {
        json: {
          include: ['src/*.en.json'],
          target_path_pattern: 'out/{locale}/{basename}',
        },
      },
    });
    replyEchoing([]);

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'out', 'es', 'a.en.json'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(tmpDir, 'out', 'es', 'b.en.json'))).toBe(
      true
    );
  });

  it('accepts a single-file bucket whose pattern has no {basename}', async () => {
    fs.rmSync(path.join(tmpDir, 'modB'), { recursive: true, force: true });
    writeCollidingConfig();
    const sent: string[] = [];
    replyEchoing(sent);

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.success).toBe(true);
    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'out', 'es.json'), 'utf-8')
    ) as Record<string, string>;
    expect(Object.keys(written).sort()).toEqual(['a1', 'a2']);
  });
});
