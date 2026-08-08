import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  sweepStaleBackups,
  bucketSweepRoots,
  BACKUP_SUFFIX,
  DEFAULT_BAK_SWEEP_MAX_AGE_SECONDS,
} from '../../../src/sync/sync-bak-cleanup';
import { Logger } from '../../../src/utils/logger';

// ──────────────────────────────────────────────────────────────────────────────
// bucketSweepRoots()
// ──────────────────────────────────────────────────────────────────────────────

describe('bucketSweepRoots()', () => {
  const root = '/project';

  it('returns the literal directory prefix for a simple glob', () => {
    const result = bucketSweepRoots(root, {
      json: { include: ['locales/**/*.json'] },
    });
    expect(result).toEqual([path.resolve(root, 'locales')]);
  });

  // A glob whose first character is a wildcard has no literal prefix at all,
  // so the old `path.dirname('')` fallback yielded '.' — the entire project
  // root, walked recursively. Scoping the sweep is the whole point of deriving
  // roots from includes, so such a glob contributes no root rather than the
  // widest possible one.
  it.each([
    ['a bare wildcard', '*.json'],
    ['a globstar', '**/en.json'],
    ['a leading brace group', '{en,de}/*.json'],
    ['a leading character class', '[a-z]*/messages.json'],
  ])('contributes no sweep root for %s', (_label, glob) => {
    expect(bucketSweepRoots(root, { json: { include: [glob] } })).toEqual([]);
  });

  it('keeps the literal roots of sibling globs when one has no prefix', () => {
    const result = bucketSweepRoots(root, {
      json: { include: ['**/en.json', 'locales/**/*.json'] },
    });
    expect(result).toEqual([path.resolve(root, 'locales')]);
  });

  it('still returns the project root for a literal file at the root', () => {
    const result = bucketSweepRoots(root, { json: { include: ['en.json'] } });
    expect(result).toEqual([root]);
  });

  it('handles a trailing-slash prefix (directory glob)', () => {
    const result = bucketSweepRoots(root, {
      json: { include: ['src/locales/'] },
    });
    expect(result).toContain(path.resolve(root, 'src/locales'));
  });

  it('deduplicates roots across multiple buckets', () => {
    const result = bucketSweepRoots(root, {
      a: { include: ['locales/**/*.json'] },
      b: { include: ['locales/**/*.yaml'] },
    });
    expect(result).toEqual([path.resolve(root, 'locales')]);
  });

  it('returns distinct roots for different literal prefixes', () => {
    const result = bucketSweepRoots(root, {
      a: { include: ['src/locales/**/*.json'] },
      b: { include: ['resources/**/*.json'] },
    });
    expect(result).toHaveLength(2);
    expect(result).toContain(path.resolve(root, 'src/locales'));
    expect(result).toContain(path.resolve(root, 'resources'));
  });

  it('handles a glob with a {brace} wildcard', () => {
    const result = bucketSweepRoots(root, {
      json: { include: ['src/{en,de}/**/*.json'] },
    });
    expect(result).toEqual([path.resolve(root, 'src')]);
  });

  it('handles a glob with a ? wildcard', () => {
    const result = bucketSweepRoots(root, {
      json: { include: ['loc?les/**/*.json'] },
    });
    expect(result).toEqual([root]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// sweepStaleBackups() — scoped to bucket dirs
// ──────────────────────────────────────────────────────────────────────────────

describe('sweepStaleBackups() with bucket config', () => {
  let tmpDir: string;
  let readdirSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-bak-sweep-'));
    readdirSpy = jest.spyOn(fs.promises, 'readdir');
  });

  afterEach(() => {
    readdirSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('only calls readdir inside bucket-include directories, not outside', async () => {
    const localesDir = path.join(tmpDir, 'locales');
    const outsideDir = path.join(tmpDir, 'node_src');
    fs.mkdirSync(localesDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // Place a stale .deepl.bak in locales (should be swept). Its target holds
    // the same bytes, which is what makes the backup redundant and sweepable.
    const staleBak = path.join(localesDir, 'de.json.deepl.bak');
    fs.writeFileSync(staleBak, 'stale', 'utf-8');
    fs.writeFileSync(path.join(localesDir, 'de.json'), 'stale', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(staleBak, tenMinAgo, tenMinAgo);

    // Place a .deepl.bak outside the bucket dir (should NOT be touched by a scoped sweep)
    const outsideBak = path.join(outsideDir, 'other.json.deepl.bak');
    fs.writeFileSync(outsideBak, 'outside', 'utf-8');
    fs.utimesSync(outsideBak, tenMinAgo, tenMinAgo);

    const buckets = { json: { include: ['locales/**/*.json'] } };
    await sweepStaleBackups(tmpDir, 5 * 60_000, buckets);

    // The stale .deepl.bak inside the bucket dir must be removed
    expect(fs.existsSync(staleBak)).toBe(false);

    // No readdir call should have touched outsideDir
    const readdirCalls: string[] = readdirSpy.mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    expect(readdirCalls.some((p) => p.startsWith(outsideDir))).toBe(false);
  });

  it('removes a stale .deepl.bak file within bucket dirs', async () => {
    const localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const staleBak = path.join(localesDir, 'fr.json.deepl.bak');
    fs.writeFileSync(staleBak, 'stale', 'utf-8');
    fs.writeFileSync(path.join(localesDir, 'fr.json'), 'stale', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(staleBak, tenMinAgo, tenMinAgo);

    await sweepStaleBackups(tmpDir, 5 * 60_000, {
      json: { include: ['locales/**/*.json'] },
    });
    expect(fs.existsSync(staleBak)).toBe(false);
  });

  it('leaves a fresh .deepl.bak file alone', async () => {
    const localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const freshBak = path.join(localesDir, 'en.json.deepl.bak');
    fs.writeFileSync(freshBak, 'fresh', 'utf-8');

    await sweepStaleBackups(tmpDir, 5 * 60_000, {
      json: { include: ['locales/**/*.json'] },
    });
    expect(fs.existsSync(freshBak)).toBe(true);
  });

  it('leaves user-owned *.bak files completely untouched, even when stale', async () => {
    const localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const userBak = path.join(localesDir, 'my-important-notes.bak');
    fs.writeFileSync(userBak, 'user data', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(userBak, tenMinAgo, tenMinAgo);
    const sibling = path.join(localesDir, 'my-important-notes');

    await sweepStaleBackups(tmpDir, 5 * 60_000, {
      json: { include: ['locales/**/*.json'] },
    });

    expect(fs.existsSync(userBak)).toBe(true);
    expect(fs.readFileSync(userBak, 'utf-8')).toBe('user data');
    expect(fs.existsSync(sibling)).toBe(false);
  });

  it('does not resurrect a sibling that does not exist', async () => {
    const localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const sibling = path.join(localesDir, 'de.json');
    const bakFile = `${sibling}.deepl.bak`;
    fs.writeFileSync(bakFile, '{"key":"value"}', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(bakFile, tenMinAgo, tenMinAgo);
    // sibling does not exist

    await sweepStaleBackups(tmpDir, 5 * 60_000, {
      json: { include: ['locales/**/*.json'] },
    });

    expect(fs.existsSync(sibling)).toBe(false);
    // With no target to compare against, the backup is the only copy of its
    // content, so it is kept rather than swept.
    expect(fs.existsSync(bakFile)).toBe(true);
  });

  // The sweep used to overwrite any zero-length file from its `.deepl.bak`
  // sibling, with no check that the sibling was a translation target or that
  // the backup came from this tool. `atomicWriteFile` renames a fully-written
  // temp file into place and so can never leave a zero-length target, which
  // left the restore branch with no legitimate trigger and made it a way for a
  // hostile checkout to write chosen bytes into an empty tracked file.
  it('leaves a zero-length sibling alone rather than restoring it from the .deepl.bak', async () => {
    const localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const sibling = path.join(localesDir, 'de.json');
    const bakFile = `${sibling}.deepl.bak`;
    fs.writeFileSync(sibling, '', 'utf-8');
    fs.writeFileSync(bakFile, '{"key":"value"}', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(bakFile, tenMinAgo, tenMinAgo);

    await sweepStaleBackups(tmpDir, 5 * 60_000, {
      json: { include: ['locales/**/*.json'] },
    });

    expect(fs.readFileSync(sibling, 'utf-8')).toBe('');
    expect(fs.existsSync(bakFile)).toBe(true);
  });

  it('does not write attacker bytes into an unrelated empty source file', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    fs.mkdirSync(pkgDir, { recursive: true });

    const victim = path.join(pkgDir, '__init__.py');
    const bakFile = `${victim}.deepl.bak`;
    fs.writeFileSync(victim, '', 'utf-8');
    fs.writeFileSync(bakFile, 'import os; os.system("id")\n', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(bakFile, tenMinAgo, tenMinAgo);

    await sweepStaleBackups(tmpDir, 5 * 60_000, {
      json: { include: ['pkg/**/*.json'] },
    });

    expect(fs.readFileSync(victim, 'utf-8')).toBe('');
  });

  it('does not sweep the whole project for a glob with no literal prefix', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    fs.mkdirSync(pkgDir, { recursive: true });

    const victim = path.join(pkgDir, '__init__.py');
    const bakFile = `${victim}.deepl.bak`;
    fs.writeFileSync(victim, '', 'utf-8');
    fs.writeFileSync(bakFile, 'attacker content\n', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(bakFile, tenMinAgo, tenMinAgo);

    await sweepStaleBackups(tmpDir, 5 * 60_000, {
      json: { include: ['**/en.json'] },
    });

    expect(fs.readFileSync(victim, 'utf-8')).toBe('');
    expect(fs.existsSync(bakFile)).toBe(true);
    const readdirCalls: string[] = readdirSpy.mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    expect(readdirCalls).toHaveLength(0);
  });

  it('leaves a non-empty sibling untouched when it differs from the stale .deepl.bak', async () => {
    const localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const sibling = path.join(localesDir, 'de.json');
    const bakFile = `${sibling}.deepl.bak`;
    fs.writeFileSync(sibling, '{"current":"content"}', 'utf-8');
    fs.writeFileSync(bakFile, '{"old":"content"}', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(bakFile, tenMinAgo, tenMinAgo);

    await sweepStaleBackups(tmpDir, 5 * 60_000, {
      json: { include: ['locales/**/*.json'] },
    });

    expect(fs.readFileSync(sibling, 'utf-8')).toBe('{"current":"content"}');
    expect(fs.existsSync(bakFile)).toBe(true);
  });

  it('readdir call count is O(bucket dirs), not O(project)', async () => {
    // Create 5 dirs outside the bucket scope
    for (let i = 0; i < 5; i++) {
      fs.mkdirSync(path.join(tmpDir, `other${i}`), { recursive: true });
    }
    const localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const buckets = { json: { include: ['locales/**/*.json'] } };
    await sweepStaleBackups(tmpDir, 5 * 60_000, buckets);

    const readdirCalls: string[] = readdirSpy.mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    // Only locales (and any of its subdirs) should be visited — not the 5 other* dirs
    for (let i = 0; i < 5; i++) {
      expect(readdirCalls.some((p) => p.includes(`other${i}`))).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// sweepStaleBackups() — no bucket config (fallback)
// ──────────────────────────────────────────────────────────────────────────────

describe('sweepStaleBackups() without bucket config (fallback)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-bak-sweep-fb-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('still removes stale .deepl.bak files anywhere under projectRoot', async () => {
    const nested = path.join(tmpDir, 'a', 'b');
    fs.mkdirSync(nested, { recursive: true });

    const staleBak = path.join(nested, 'x.json.deepl.bak');
    fs.writeFileSync(staleBak, 'stale', 'utf-8');
    fs.writeFileSync(path.join(nested, 'x.json'), 'stale', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(staleBak, tenMinAgo, tenMinAgo);

    await sweepStaleBackups(tmpDir, 5 * 60_000);
    expect(fs.existsSync(staleBak)).toBe(false);
  });

  it('leaves fresh .deepl.bak files alone when no bucket config given', async () => {
    const nested = path.join(tmpDir, 'a');
    fs.mkdirSync(nested, { recursive: true });

    const freshBak = path.join(nested, 'y.json.deepl.bak');
    fs.writeFileSync(freshBak, 'fresh', 'utf-8');

    await sweepStaleBackups(tmpDir, 5 * 60_000);
    expect(fs.existsSync(freshBak)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// sweepStaleBackups() — retention of content the target no longer holds
// ──────────────────────────────────────────────────────────────────────────────

describe('sweepStaleBackups() retention', () => {
  let tmpDir: string;
  let localesDir: string;
  const buckets = { json: { include: ['locales/**/*.json'] } };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-bak-keep-'));
    localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeStaleBak(name: string, content: string): string {
    const bakPath = path.join(localesDir, `${name}${BACKUP_SUFFIX}`);
    fs.writeFileSync(bakPath, content, 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(bakPath, tenMinAgo, tenMinAgo);
    return bakPath;
  }

  it('keeps a stale backup whose target holds different content', async () => {
    const bakPath = writeStaleBak('de.json', '{"greeting":"Guten Tag"}');
    fs.writeFileSync(
      path.join(localesDir, 'de.json'),
      '{"greeting":"machine output"}',
      'utf-8'
    );

    await sweepStaleBackups(tmpDir, 5 * 60_000, buckets);

    expect(fs.existsSync(bakPath)).toBe(true);
    expect(fs.readFileSync(bakPath, 'utf-8')).toBe('{"greeting":"Guten Tag"}');
  });

  it('keeps a stale backup whose target is the same size but different bytes', async () => {
    const bakPath = writeStaleBak('fr.json', '{"a":"Bonjour!"}');
    fs.writeFileSync(
      path.join(localesDir, 'fr.json'),
      '{"a":"Salut!!!"}'.padEnd('{"a":"Bonjour!"}'.length, ' '),
      'utf-8'
    );

    await sweepStaleBackups(tmpDir, 5 * 60_000, buckets);

    expect(fs.existsSync(bakPath)).toBe(true);
  });

  it('keeps a stale backup whose target no longer exists', async () => {
    const bakPath = writeStaleBak('it.json', '{"greeting":"Buongiorno"}');

    await sweepStaleBackups(tmpDir, 5 * 60_000, buckets);

    expect(fs.existsSync(bakPath)).toBe(true);
  });

  it('names each kept backup and says what to do about it', async () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    writeStaleBak('de.json', '{"greeting":"Guten Tag"}');
    fs.writeFileSync(path.join(localesDir, 'de.json'), 'other', 'utf-8');

    await sweepStaleBackups(tmpDir, 5 * 60_000, buckets);

    const messages = warn.mock.calls.map((c) => String(c[0]));
    const kept = messages.find((m) => m.includes(`de.json${BACKUP_SUFFIX}`));
    expect(kept).toBeDefined();
    expect(kept).toMatch(/did not finish/);
    expect(kept).toMatch(/only copy/);
    expect(kept).toMatch(/before removing it/);
  });

  // Over-rejection guards: a backup the target already holds is litter, and
  // sweeping it is the reason this function exists.
  it('removes a stale backup whose target holds identical content', async () => {
    const bakPath = writeStaleBak('es.json', '{"greeting":"Hola"}');
    fs.writeFileSync(
      path.join(localesDir, 'es.json'),
      '{"greeting":"Hola"}',
      'utf-8'
    );

    await sweepStaleBackups(tmpDir, 5 * 60_000, buckets);

    expect(fs.existsSync(bakPath)).toBe(false);
    expect(fs.readFileSync(path.join(localesDir, 'es.json'), 'utf-8')).toBe(
      '{"greeting":"Hola"}'
    );
  });

  it('says nothing when every stale backup was redundant', async () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    writeStaleBak('es.json', 'same');
    fs.writeFileSync(path.join(localesDir, 'es.json'), 'same', 'utf-8');

    await sweepStaleBackups(tmpDir, 5 * 60_000, buckets);

    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes(BACKUP_SUFFIX))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveBakSweepAgeMs / DEFAULT_BAK_SWEEP_MAX_AGE_SECONDS
// ──────────────────────────────────────────────────────────────────────────────

describe('DEFAULT_BAK_SWEEP_MAX_AGE_SECONDS', () => {
  it('equals 300', () => {
    expect(DEFAULT_BAK_SWEEP_MAX_AGE_SECONDS).toBe(300);
  });
});
