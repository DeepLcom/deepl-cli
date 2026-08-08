/**
 * `deepl sync resolve` over conflicts produced by a real `git merge`.
 *
 * The resolver reads whatever git left in the working tree, so the shape that
 * reaches it is decided by the canonical serializer and by git's own region
 * boundaries. Hand-authoring a conflicted lockfile picks those boundaries by
 * guesswork and hides the regions git actually produces, so these fixtures are
 * built by committing serializer output on two branches and merging them.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.unmock('child_process');

import { serializeLockFile } from '../../src/sync/sync-lock';
import { resolveLockFile } from '../../src/sync/sync-resolve';
import type {
  ResolveDecision,
  ResolveResult,
} from '../../src/sync/sync-resolve';
import { LOCK_FILE_NAME } from '../../src/sync/types';
import type { SyncLockFile, SyncLockTranslation } from '../../src/sync/types';

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function translation(
  hash: string,
  stamp: string,
  review: SyncLockTranslation['review_status'] = 'machine_translated'
): SyncLockTranslation {
  return {
    hash,
    translated_at: stamp,
    status: 'translated',
    review_status: review,
    character_count: 11,
  };
}

const BASE_STAMP = '2026-08-01T00:00:00.000Z';

function lockFile(
  stamp: string,
  edits: Record<string, SyncLockTranslation> = {}
): SyncLockFile {
  const entry = (
    hash: string,
    text: string,
    key: string
  ): [string, SyncLockFile['entries'][string][string]] => [
    key,
    {
      source_hash: hash,
      source_text: text,
      translations: {
        de: edits[key] ?? translation(`base-${key}`, BASE_STAMP),
      },
    },
  ];

  return {
    _comment: 'DeepL sync lock file',
    version: 1,
    generated_at: stamp,
    source_locale: 'en',
    entries: {
      'locales/en.json': Object.fromEntries([
        entry('h-cancel', 'Cancel', 'button.cancel'),
        entry('h-delete', 'Delete', 'button.delete'),
        entry('h-save', 'Save', 'button.save'),
      ]),
    },
    stats: { total_keys: 3, total_translations: 3, last_sync: stamp },
  };
}

interface MergedFixture {
  lockPath: string;
  content: string;
}

/**
 * Commits `theirs` on a side branch and `ours` on main, then merges. Returns the
 * conflicted lockfile git produced.
 */
function mergeBranches(
  dir: string,
  ours: SyncLockFile,
  theirs: SyncLockFile
): MergedFixture {
  const lockPath = path.join(dir, LOCK_FILE_NAME);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test User']);
  git(dir, ['config', 'commit.gpgsign', 'false']);

  fs.writeFileSync(lockPath, serializeLockFile(lockFile(BASE_STAMP)), 'utf-8');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'base']);

  git(dir, ['checkout', '-q', '-b', 'other']);
  fs.writeFileSync(lockPath, serializeLockFile(theirs), 'utf-8');
  git(dir, ['commit', '-qam', 'theirs']);

  git(dir, ['checkout', '-q', 'main']);
  fs.writeFileSync(lockPath, serializeLockFile(ours), 'utf-8');
  git(dir, ['commit', '-qam', 'ours']);

  try {
    git(dir, ['merge', 'other']);
  } catch {
    // A conflicting merge exits non-zero; the conflicted tree is the fixture.
  }

  return { lockPath, content: fs.readFileSync(lockPath, 'utf-8') };
}

function translationsOf(
  lockPath: string
): Record<string, Record<string, unknown>> {
  const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as SyncLockFile;
  const entries = parsed.entries['locales/en.json']!;
  return Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [
      key,
      entry.translations['de'] as unknown as Record<string, unknown>,
    ])
  );
}

const describeGit = gitAvailable() ? describe : describe.skip;

describeGit('sync resolve over a real git merge', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'resolve-git-')
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('two branches translating different keys', () => {
    let fixture: MergedFixture;
    let result: ResolveResult;

    beforeEach(async () => {
      fixture = mergeBranches(
        dir,
        lockFile('2026-08-02T10:00:00.000Z', {
          'button.cancel': translation(
            'ours-cancel',
            '2026-08-02T10:00:00.000Z'
          ),
        }),
        lockFile('2026-08-03T15:00:00.000Z', {
          'button.save': translation('theirs-save', '2026-08-03T15:00:00.000Z'),
        })
      );
      result = await resolveLockFile(fixture.lockPath);
    });

    it('conflicts only outside the entries map', () => {
      const conflicted = fixture.content.split('\n');
      const markerAt = conflicted.findIndex((line) =>
        line.startsWith('<<<<<<<')
      );
      expect(markerAt).toBeGreaterThan(-1);
      expect(conflicted.slice(0, markerAt).join('\n')).toContain('ours-cancel');
      expect(conflicted.slice(0, markerAt).join('\n')).toContain('theirs-save');
    });

    it('resolves without falling back to the length heuristic', () => {
      const fallbacks = (result.decisions ?? []).filter(
        (d: ResolveDecision) => d.source === 'length-heuristic'
      );
      expect(fallbacks).toEqual([]);
    });

    it('keeps both branches translations', () => {
      const translations = translationsOf(fixture.lockPath);
      expect(translations['button.cancel']!['hash']).toBe('ours-cancel');
      expect(translations['button.save']!['hash']).toBe('theirs-save');
    });
  });

  describe('two branches translating the same key', () => {
    let fixture: MergedFixture;
    let result: ResolveResult;

    beforeEach(async () => {
      fixture = mergeBranches(
        dir,
        lockFile('2026-08-02T10:00:00.000Z', {
          'button.delete': translation(
            'ours-delete',
            '2026-08-02T10:00:00.000Z'
          ),
        }),
        lockFile('2026-08-03T15:00:00.000Z', {
          'button.delete': translation(
            'theirs-delete',
            '2026-08-03T15:00:00.000Z'
          ),
        })
      );
      result = await resolveLockFile(fixture.lockPath);
    });

    it('applies the translated_at tie-break to the newer side', () => {
      expect(translationsOf(fixture.lockPath)['button.delete']!['hash']).toBe(
        'theirs-delete'
      );
    });

    it('resolves without falling back to the length heuristic', () => {
      const fallbacks = (result.decisions ?? []).filter(
        (d: ResolveDecision) => d.source === 'length-heuristic'
      );
      expect(fallbacks).toEqual([]);
    });
  });
});
