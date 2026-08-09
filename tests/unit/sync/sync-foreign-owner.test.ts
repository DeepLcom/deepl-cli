/**
 * Unit tests for locating another sync configuration that accounts for keys
 * this run's target file holds.
 *
 * A configuration can only write files inside its own project root, so any
 * configuration that also writes a given target must live in one of that
 * target's ancestor directories. Its lockfile is the evidence: if it records
 * the keys for the same locale, the file has two owners.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { findForeignKeyOwner } from '../../../src/sync/sync-foreign-owner';
import { LOCK_FILE_NAME } from '../../../src/sync/types';
import type { SyncLockEntry, SyncLockFile } from '../../../src/sync/types';

function lockFileWith(
  entries: Record<string, Record<string, string[]>>
): SyncLockFile {
  const built: SyncLockFile['entries'] = {};
  for (const [sourceFile, keys] of Object.entries(entries)) {
    const perFile: Record<string, SyncLockEntry> = {};
    built[sourceFile] = perFile;
    for (const [key, locales] of Object.entries(keys)) {
      perFile[key] = {
        source_hash: 'h',
        source_text: 'Source text',
        translations: Object.fromEntries(
          locales.map((l) => [
            l,
            {
              hash: 'h',
              translated_at: '2026-08-01T00:00:00.000Z',
              status: 'translated' as const,
            },
          ])
        ),
      };
    }
  }
  return {
    _comment: 'test',
    version: 1,
    generated_at: '2026-08-01T00:00:00.000Z',
    source_locale: 'en',
    entries: built,
    stats: { total_keys: 0, total_translations: 0, last_sync: '' },
  };
}

describe('findForeignKeyOwner', () => {
  let root: string;
  let ownRoot: string;
  let targetPath: string;
  let ownLockPath: string;

  beforeEach(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-foreign-owner-'))
    );
    ownRoot = path.join(root, 'pkg');
    fs.mkdirSync(path.join(ownRoot, 'locales'), { recursive: true });
    targetPath = path.join(ownRoot, 'locales', 'de.json');
    fs.writeFileSync(targetPath, '{}', 'utf-8');
    ownLockPath = path.join(ownRoot, LOCK_FILE_NAME);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeLock(dir: string, lock: unknown): string {
    const lockPath = path.join(dir, LOCK_FILE_NAME);
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2), 'utf-8');
    return lockPath;
  }

  const find = (keys: string[], locale = 'de') =>
    findForeignKeyOwner({
      targetAbsPath: targetPath,
      ownLockPath,
      locale,
      keys,
    });

  it('returns null when no other lockfile sits above the target', async () => {
    await expect(find(['outer.one'])).resolves.toBeNull();
  });

  it('returns null when the only lockfile above the target is this run own', async () => {
    writeLock(
      ownRoot,
      lockFileWith({ 'strings/en.json': { 'outer.one': ['de'] } })
    );

    await expect(find(['outer.one'])).resolves.toBeNull();
  });

  it('finds a lockfile in a directory above this run project root', async () => {
    const lockPath = writeLock(
      root,
      lockFileWith({ 'pkg/locales/en.json': { 'outer.one': ['de'] } })
    );

    await expect(find(['outer.one'])).resolves.toEqual({
      lockPath,
      keys: ['outer.one'],
    });
  });

  it('finds a lockfile sitting in the target own directory', async () => {
    const lockPath = writeLock(
      path.join(ownRoot, 'locales'),
      lockFileWith({ 'en.json': { 'outer.one': ['de'] } })
    );

    await expect(find(['outer.one'])).resolves.toMatchObject({ lockPath });
  });

  it('reports only the queried keys that lockfile accounts for', async () => {
    writeLock(
      root,
      lockFileWith({
        'pkg/locales/en.json': {
          'outer.one': ['de'],
          'outer.two': ['de'],
          'unrelated.key': ['de'],
        },
      })
    );

    const owner = await find(['outer.one', 'outer.two', 'hand.added']);

    expect(owner?.keys).toEqual(['outer.one', 'outer.two']);
  });

  it('returns null when the other lockfile records those keys for another locale only', async () => {
    writeLock(
      root,
      lockFileWith({ 'pkg/locales/en.json': { 'outer.one': ['fr'] } })
    );

    await expect(find(['outer.one'])).resolves.toBeNull();
  });

  it('returns null when the other lockfile records different keys', async () => {
    writeLock(
      root,
      lockFileWith({ 'pkg/locales/en.json': { 'something.else': ['de'] } })
    );

    await expect(find(['outer.one'])).resolves.toBeNull();
  });

  it('treats a lockfile it cannot parse as no evidence', async () => {
    fs.writeFileSync(path.join(root, LOCK_FILE_NAME), 'not json', 'utf-8');

    await expect(find(['outer.one'])).resolves.toBeNull();
  });

  it('treats a lockfile that is a symlink as no evidence', async () => {
    const real = path.join(root, 'real-lock.json');
    fs.writeFileSync(
      real,
      JSON.stringify(
        lockFileWith({ 'pkg/locales/en.json': { 'outer.one': ['de'] } })
      ),
      'utf-8'
    );
    fs.symlinkSync(real, path.join(root, LOCK_FILE_NAME));

    await expect(find(['outer.one'])).resolves.toBeNull();
  });

  it('does not read inherited object members as recorded translations', async () => {
    writeLock(
      root,
      lockFileWith({ 'pkg/locales/en.json': { 'outer.one': ['de'] } })
    );

    // `constructor` and `toString` resolve on Object.prototype for both the
    // entry map and the translations map, so a lookup that does not test own
    // membership would report them as owned keys.
    const owner = await find(['constructor', 'toString', 'outer.one']);

    expect(owner?.keys).toEqual(['outer.one']);
  });

  it('returns null when there are no keys to account for', async () => {
    writeLock(
      root,
      lockFileWith({ 'pkg/locales/en.json': { 'outer.one': ['de'] } })
    );

    await expect(find([])).resolves.toBeNull();
  });
});
