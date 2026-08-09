import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

/**
 * Suffix appended to target files when the sync engine writes a backup.
 * Distinctive on purpose: the startup sweep only ever deletes files with
 * this exact suffix, so user-owned `*.bak` files are never touched.
 */
export const BACKUP_SUFFIX = '.deepl.bak';

/**
 * Default age (seconds) above which a leftover backup sibling is considered
 * orphaned and safe to sweep at sync startup. Matches the watch-mode
 * precedent (5 minutes) and is overridable via `sync.bak_sweep_max_age_seconds`
 * in `.deepl-sync.yaml`.
 */
export const DEFAULT_BAK_SWEEP_MAX_AGE_SECONDS = 300;

let _warnedNoScope = false;

/**
 * Derive the set of concrete directory roots to sweep from bucket `include`
 * globs. Returns unique absolute paths that are the longest literal prefixes
 * of each glob (i.e. everything before the first `*`, `?`, `{`, or `[`).
 *
 * A glob that starts with a wildcard has no literal prefix and contributes no
 * root, because falling back to `projectRoot` there would hand the sweep the
 * entire project tree to walk recursively. The cost is that such a bucket gets
 * no stale-backup cleanup, which leaves inert `.deepl.bak` files on disk.
 */
export function bucketSweepRoots(
  projectRoot: string,
  buckets: Record<string, { include: string[] }>
): string[] {
  const roots = new Set<string>();
  const rootPrefix = path.resolve(projectRoot) + path.sep;
  for (const bucket of Object.values(buckets)) {
    for (const glob of bucket.include) {
      const specialIdx = glob.search(/[*?{[]/);
      const literal = specialIdx === -1 ? glob : glob.slice(0, specialIdx);
      if (literal === '') {
        Logger.verbose(
          `Skipping stale-backup sweep for "${glob}": the pattern has no literal directory prefix to scope the sweep to.`
        );
        continue;
      }
      const dir = literal.endsWith('/')
        ? literal.slice(0, -1)
        : path.dirname(literal);
      const abs = path.resolve(projectRoot, dir);
      // Defence in depth. validateSyncConfig rejects traversing includes, but
      // this sweep deletes and re-creates files, so it must never accept a
      // root outside the project even if it is reached another way.
      if (
        abs !== path.resolve(projectRoot) &&
        !(abs + path.sep).startsWith(rootPrefix)
      ) {
        Logger.warn(
          `Ignoring stale-backup sweep root outside the project: ${abs}`
        );
        continue;
      }
      roots.add(abs);
    }
  }
  return Array.from(roots);
}

/**
 * Walk `projectRoot` breadth-first and remove `.deepl.bak` files whose mtime
 * is older than `maxAgeMs` **and** whose content the file beside them already
 * holds. Nothing is ever written: the sweep only unlinks, and files with any
 * other suffix (including plain `.bak`) are left untouched.
 *
 * Age alone is not a safe test. A run that reaches its end unlinks its own
 * backups, so a backup still on disk is from a run that did not — and there it
 * holds the only surviving copy of whatever that run had already overwritten.
 * Deleting it on age alone would let the natural recovery action (re-run
 * `deepl sync`) destroy those translations at exit 0, because the recovery
 * run's `COPYFILE_EXCL` guard has nothing left to collide with. A backup whose
 * target holds the same bytes is the litter this sweep exists for; one whose
 * target does not is kept indefinitely and reported. Retention is bounded at
 * one file per target, since the backup name is derived from the target's.
 *
 * There is deliberately no step that restores a zero-length sibling from its
 * backup: every target write goes through `atomicWriteFile`, which renames a
 * fully-written temp file into place, so a crash cannot leave a zero-length
 * target, and such a branch would let a hostile checkout write chosen bytes
 * into any empty file within a sweep root.
 *
 * When `buckets` is provided the sweep is scoped to the directories implied by
 * each bucket's `include` globs instead of the entire project tree, keeping
 * cold-start cost proportional to bucket size rather than project size.
 *
 * Symlink loops are avoided by tracking each visited realpath. `node_modules`
 * and `.git` are skipped.
 */
export async function sweepStaleBackups(
  projectRoot: string,
  maxAgeMs: number,
  buckets?: Record<string, { include: string[] }>
): Promise<void> {
  const threshold = Date.now() - maxAgeMs;
  const visited = new Set<string>();
  let roots: string[];
  if (buckets && Object.keys(buckets).length > 0) {
    roots = bucketSweepRoots(projectRoot, buckets);
  } else {
    if (!_warnedNoScope) {
      Logger.warn(
        'sweepStaleBackups: no bucket config provided, falling back to full project tree sweep.'
      );
      _warnedNoScope = true;
    }
    roots = [projectRoot];
  }
  const kept: string[] = [];
  for (const root of roots) {
    await sweepDir(root, visited, threshold, kept);
  }
  if (kept.length > 0) {
    Logger.warn(keptBackupsWarning(projectRoot, kept));
  }
}

function keptBackupsWarning(projectRoot: string, kept: string[]): string {
  const rel = kept.map((p) => path.relative(projectRoot, p)).sort();
  const shown = rel.slice(0, 3);
  const more = rel.length > shown.length ? ', …' : '';
  const one = rel.length === 1;
  return (
    `Keeping ${rel.length} leftover backup ${one ? 'file' : 'files'} whose content is not in the ` +
    `${one ? 'file' : 'files'} beside ${one ? 'it' : 'them'}: ${shown.join(', ')}${more}. ` +
    `${one ? 'It is' : 'They are'} from a run that did not finish, so ${one ? 'it' : 'they'} may hold ` +
    `the only ${one ? 'copy' : 'copies'} of translations that run overwrote. Compare ` +
    `${one ? 'it' : 'each'} with the file it backs up before removing it; ` +
    `${one ? 'it is' : 'they are'} not swept while the two differ.`
  );
}

/**
 * True when a backup holds bytes its target no longer has, which makes it the
 * last copy of that content. Errors count as unique: a target that cannot be
 * read cannot be shown to hold the backup's content.
 */
async function holdsUnsavedContent(
  bakPath: string,
  bakSize: number
): Promise<boolean> {
  const targetPath = bakPath.slice(0, -BACKUP_SUFFIX.length);
  try {
    const targetStat = await fs.promises.stat(targetPath);
    if (!targetStat.isFile() || targetStat.size !== bakSize) return true;
    const [bakContent, targetContent] = await Promise.all([
      fs.promises.readFile(bakPath),
      fs.promises.readFile(targetPath),
    ]);
    return !bakContent.equals(targetContent);
  } catch {
    return true;
  }
}

async function sweepDir(
  dir: string,
  visited: Set<string>,
  threshold: number,
  kept: string[]
): Promise<void> {
  const real = (() => {
    try {
      return fs.realpathSync(dir);
    } catch {
      return dir;
    }
  })();
  if (visited.has(real)) return;
  visited.add(real);
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await sweepDir(full, visited, threshold, kept);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(BACKUP_SUFFIX)) continue;
    try {
      const stat = await fs.promises.stat(full);
      if (stat.mtimeMs >= threshold) continue;
      if (await holdsUnsavedContent(full, stat.size)) {
        kept.push(full);
        continue;
      }
      try {
        await fs.promises.unlink(full);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Resolve the configured sweep age (seconds) into milliseconds, applying the
 * documented default. Callers that accept a user-configurable override should
 * route through this so the guard against non-positive values stays in one
 * place.
 */
export function resolveBakSweepAgeMs(
  configuredSeconds: number | undefined
): number {
  if (configuredSeconds === undefined || configuredSeconds <= 0) {
    return DEFAULT_BAK_SWEEP_MAX_AGE_SECONDS * 1000;
  }
  return configuredSeconds * 1000;
}
