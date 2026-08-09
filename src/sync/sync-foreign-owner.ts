import * as path from 'path';
import { safeReadFile } from '../utils/safe-read-file.js';
import { LOCK_FILE_NAME } from './types.js';

/** Another sync configuration's lockfile, and the keys it accounts for. */
export interface ForeignKeyOwner {
  /** Absolute path of the other configuration's lockfile. */
  lockPath: string;
  /** The queried keys that lockfile records for the locale, sorted. */
  keys: string[];
}

export interface FindForeignKeyOwnerParams {
  /** Absolute path of the target file holding the keys. */
  targetAbsPath: string;
  /** Absolute path of this run's own lockfile, which never counts as foreign. */
  ownLockPath: string;
  locale: string;
  /** Keys the target holds that this configuration does not account for. */
  keys: readonly string[];
}

/**
 * A lockfile is only read up to this size. A sync lockfile is JSON proportional
 * to the project's key count; anything larger than this is not one, and this
 * walk reads files outside the project root, which no other read here does.
 */
const MAX_LOCK_FILE_BYTES = 64 * 1024 * 1024;

function recordedKeysForLocale(parsed: unknown, locale: string): Set<string> {
  const found = new Set<string>();
  const entries = (parsed as { entries?: unknown }).entries;
  if (typeof entries !== 'object' || entries === null) return found;
  // Own enumerable properties only, at both levels: a lockfile is untrusted
  // input, and an indexed lookup would resolve `constructor` or `toString`
  // against Object.prototype and report them as recorded.
  for (const perFile of Object.values(entries)) {
    if (typeof perFile !== 'object' || perFile === null) continue;
    for (const [key, entry] of Object.entries(perFile)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const translations = (entry as { translations?: unknown }).translations;
      if (typeof translations !== 'object' || translations === null) continue;
      if (Object.hasOwn(translations, locale)) found.add(key);
    }
  }
  return found;
}

/**
 * Find another sync configuration that accounts for keys this run's target file
 * holds but its own source and lockfile do not.
 *
 * A configuration writes only inside its own project root, so one that also
 * writes this target must be rooted at one of the target's ancestor
 * directories — which makes the search a walk up from the file rather than a
 * scan of the tree. The walk continues above this run's own project root,
 * because the other configuration is as likely to be the outer one as the inner
 * one.
 *
 * The lockfile is the evidence, not the mere presence of another configuration:
 * a match requires that it record these exact keys for this locale. That keeps a
 * neighbouring configuration which happens to sit above the file from being
 * blamed for keys someone added by hand.
 */
export async function findForeignKeyOwner(
  params: FindForeignKeyOwnerParams
): Promise<ForeignKeyOwner | null> {
  if (params.keys.length === 0) return null;
  const wanted = new Set(params.keys);

  let dir = path.dirname(params.targetAbsPath);
  for (;;) {
    const lockPath = path.join(dir, LOCK_FILE_NAME);
    if (lockPath !== params.ownLockPath) {
      const recorded = await readRecordedKeys(lockPath, params.locale);
      const shared = [...wanted].filter((key) => recorded.has(key));
      if (shared.length > 0) {
        return { lockPath, keys: shared.sort() };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Why a target another configuration also writes was left alone.
 *
 * Phrased to follow the per-locale prefix its landing sites add, and to say what
 * the run did NOT do: the other configuration's translations are still on disk,
 * and nothing was recorded for this locale, so the next run retries it.
 */
export function sharedTargetMessage(
  targetRelPath: string,
  locale: string,
  owner: ForeignKeyOwner,
  retryCommand = 'deepl sync'
): string {
  const shown = owner.keys.slice(0, 3).map((key) => `"${key}"`);
  const more = owner.keys.length > shown.length ? ', …' : '';
  const one = owner.keys.length === 1;
  return (
    `${targetRelPath} is also written by another sync configuration: ` +
    `${owner.lockPath} records ${owner.keys.length} of the ${one ? 'key' : 'keys'} this file ` +
    `holds (${shown.join(', ')}${more}) for ${locale}. Rewriting it here emits only this ` +
    `configuration's keys, which would delete ${one ? 'that one' : 'those'} — and the other ` +
    "configuration's next run would delete this one's, so the two destroy each other's " +
    'translations and re-translate them on every run. The file was left as it stands and ' +
    'nothing was recorded for this locale. Give each configuration its own target file, or ' +
    `merge them into one configuration, then run \`${retryCommand}\` again. If that lockfile ` +
    'is left over from a configuration that no longer writes this file, remove it.'
  );
}

async function readRecordedKeys(
  lockPath: string,
  locale: string
): Promise<Set<string>> {
  let raw: string;
  try {
    // A lockfile that cannot be read, is a symlink, or is not the JSON this tool
    // writes is no evidence either way, and this walk must never be the thing
    // that fails a sync.
    raw = await safeReadFile(lockPath, 'utf-8');
  } catch {
    return new Set();
  }
  if (raw.length > MAX_LOCK_FILE_BYTES) return new Set();
  try {
    return recordedKeysForLocale(JSON.parse(raw), locale);
  } catch {
    return new Set();
  }
}
