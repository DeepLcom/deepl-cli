import * as fs from 'fs';
import * as path from 'path';
import type { ResolvedSyncConfig } from './sync-config.js';
import type { SyncLockEntry } from './types.js';
import { getOwnMember } from '../utils/own-members.js';
import { resolveTargetPath, assertPathWithinRoot } from './sync-utils.js';
import {
  extractExistingTranslations,
  type WalkedBucketFile,
} from './sync-bucket-walker.js';

/**
 * Keys the lockfile records as translated for a locale that the locale's target
 * file does not hold, keyed by locale. A locale with nothing missing is absent
 * from the map.
 */
export type TargetGaps = Map<string, Set<string>>;

/**
 * Which keys a locale would be reported complete for on the strength of the
 * lockfile alone: source unchanged since the recorded translation, and that
 * translation recorded as succeeded.
 *
 * A key whose source value is empty is left out. An empty source can only
 * produce an empty translation, and PO and XLIFF read an empty translation side
 * as "not translated yet" on purpose, so such a key is legitimately absent from
 * a bilingual target and must not be reported as a gap. This mirrors the
 * write-verification guard in sync-locale-translator, which exempts an entry
 * whose translation is the empty string.
 */
function claimedKeys(
  walked: WalkedBucketFile,
  fileLockEntries: Record<string, SyncLockEntry>,
  locale: string
): string[] {
  const claimed: string[] = [];
  for (const entry of walked.entries) {
    if (entry.value === '') continue;
    const lockEntry = getOwnMember(fileLockEntries, entry.key);
    const translation = lockEntry?.translations[locale];
    if (lockEntry === undefined || translation === undefined) continue;
    if (translation.status !== 'translated') continue;
    if (translation.hash !== lockEntry.source_hash) continue;
    claimed.push(entry.key);
  }
  return claimed;
}

/**
 * Compare a target file against what the lockfile claims about it.
 *
 * Nothing used to: `sync status` and `sync --frozen` both diffed the source
 * file against `.deepl-sync.lock` and never opened the target, so a locale
 * whose file had lost translations the lockfile calls translated — by an
 * earlier version of this tool dropping them, a bad merge, a partial checkout,
 * a hand deletion — reported 100% complete at exit 0 indefinitely, and `sync`
 * itself returned early without repairing it.
 *
 * A file that cannot be read or cannot be parsed yields every claimed key: a
 * file whose contents are unavailable cannot be shown to hold anything.
 *
 * The read is skipped entirely for a locale with no claimed keys, so a project
 * mid-first-sync costs nothing.
 */
export async function findTargetGaps(
  config: ResolvedSyncConfig,
  walked: WalkedBucketFile,
  fileLockEntries: Record<string, SyncLockEntry>,
  locales: readonly string[]
): Promise<TargetGaps> {
  const gaps: TargetGaps = new Map();

  for (const locale of locales) {
    const claimed = claimedKeys(walked, fileLockEntries, locale);
    if (claimed.length === 0) continue;

    let held: Map<string, string> | undefined;
    if (walked.isMultiLocale) {
      try {
        held = extractExistingTranslations(
          walked.parser,
          walked.content,
          locale
        );
      } catch {
        held = undefined;
      }
    } else {
      const targetRelPath = resolveTargetPath(
        walked.relPath,
        config.source_locale,
        locale,
        walked.bucketConfig.target_path_pattern
      );
      const targetAbsPath = path.join(config.projectRoot, targetRelPath);
      assertPathWithinRoot(targetAbsPath, config.projectRoot);
      try {
        const targetContent = await fs.promises.readFile(
          targetAbsPath,
          'utf-8'
        );
        held = extractExistingTranslations(walked.parser, targetContent);
      } catch {
        held = undefined;
      }
    }

    const missing =
      held === undefined
        ? new Set(claimed)
        : new Set(claimed.filter((key) => !held.has(key)));
    if (missing.size > 0) {
      gaps.set(locale, missing);
    }
  }

  return gaps;
}

/**
 * One line naming what the lockfile claims and the files do not hold, so the
 * count in `sync status` is actionable rather than a number to puzzle over.
 */
export function targetGapsWarning(
  entries: readonly { locale: string; file: string; keys: readonly string[] }[]
): string {
  const total = entries.reduce((sum, e) => sum + e.keys.length, 0);
  const one = total === 1;
  const shown = entries.slice(0, 3).map(
    (e) =>
      `${e.locale}: ${e.file} (${e.keys
        .slice(0, 3)
        .map((k) => `"${k}"`)
        .join(', ')}${e.keys.length > 3 ? ', …' : ''})`
  );
  const more = entries.length > shown.length ? ', …' : '';
  return (
    `${total} ${one ? 'key is' : 'keys are'} recorded as translated in the lock file but ` +
    `${one ? 'is' : 'are'} not in the target file — ${shown.join('; ')}${more}. ` +
    `Run \`deepl sync\` to translate ${one ? 'it' : 'them'} again.`
  );
}
