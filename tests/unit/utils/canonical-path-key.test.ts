/**
 * Unit tests for `canonicalPathKey`, the comparison key that decides whether two
 * spellings of a path denote the same file.
 *
 * `fs.realpathSync` does not case-fold on a case-insensitive volume — APFS
 * returns `Docs` for `Docs` even when the directory is stored as `docs` — and
 * does not unify NFC with NFD. Two spellings reaching the same inode still have
 * to produce one key, or `watch --git-staged` translates nothing when git
 * spells a directory differently from the watcher: silently, at exit 0.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { canonicalPathKey } from '../../../src/utils/paths';

describe('canonicalPathKey', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-key-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Whether this filesystem reaches one file through two casings. */
  function sameFileThroughBothCasings(a: string, b: string): boolean {
    try {
      const sa = fs.lstatSync(a);
      const sb = fs.lstatSync(b);
      return sa.ino === sb.ino && sa.dev === sb.dev;
    } catch {
      return false;
    }
  }

  it('gives one key to two casings that reach the same file', () => {
    fs.mkdirSync(path.join(root, 'docs'));
    const lower = path.join(root, 'docs', 'en.md');
    fs.writeFileSync(lower, 'hi');
    const upper = path.join(root, 'Docs', 'en.md');

    if (!sameFileThroughBothCasings(lower, upper)) {
      // Case-sensitive volume: the two really are different paths, and the keys
      // below are supposed to differ. Nothing to assert.
      return;
    }
    expect(canonicalPathKey(lower)).toBe(canonicalPathKey(upper));
  });

  it('gives one key to the NFC and NFD spellings of a name', () => {
    fs.mkdirSync(path.join(root, 'docs'));
    const nfc = path.join(root, 'docs', 'café.md');
    const nfd = path.join(root, 'docs', 'café.md');
    fs.writeFileSync(nfc, 'hi');

    if (!sameFileThroughBothCasings(nfc, nfd)) {
      return;
    }
    expect(canonicalPathKey(nfc)).toBe(canonicalPathKey(nfd));
  });

  it('keeps different files apart', () => {
    const a = path.join(root, 'a.md');
    const b = path.join(root, 'b.md');
    fs.writeFileSync(a, 'a');
    fs.writeFileSync(b, 'b');

    expect(canonicalPathKey(a)).not.toBe(canonicalPathKey(b));
  });

  it('keeps two files with identical content apart', () => {
    const a = path.join(root, 'a.md');
    const b = path.join(root, 'b.md');
    fs.writeFileSync(a, 'same');
    fs.writeFileSync(b, 'same');

    expect(canonicalPathKey(a)).not.toBe(canonicalPathKey(b));
  });

  it('treats a symlink as a different file from its target', () => {
    const target = path.join(root, 'target.md');
    const link = path.join(root, 'link.md');
    fs.writeFileSync(target, 'hi');
    fs.symlinkSync(target, link);

    expect(canonicalPathKey(link)).not.toBe(canonicalPathKey(target));
  });

  it('resolves a symlinked ancestor so both routes to a file agree', () => {
    const real = path.join(root, 'real');
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, 'en.md'), 'hi');
    const linkDir = path.join(root, 'via');
    fs.symlinkSync(real, linkDir);

    expect(canonicalPathKey(path.join(linkDir, 'en.md'))).toBe(
      canonicalPathKey(path.join(real, 'en.md'))
    );
  });

  it('is stable for a path that does not exist yet', () => {
    const missing = path.join(root, 'not-written-yet.md');
    expect(canonicalPathKey(missing)).toBe(canonicalPathKey(missing));
  });

  it('separates two paths that do not exist yet', () => {
    expect(canonicalPathKey(path.join(root, 'x.md'))).not.toBe(
      canonicalPathKey(path.join(root, 'y.md'))
    );
  });

  it('agrees with itself across a relative and an absolute spelling', () => {
    const file = path.join(root, 'en.md');
    fs.writeFileSync(file, 'hi');
    const cwd = process.cwd();
    try {
      process.chdir(root);
      expect(canonicalPathKey('en.md')).toBe(canonicalPathKey(file));
    } finally {
      process.chdir(cwd);
    }
  });
});
