import * as path from 'path';
import type { FormatRegistry } from '../formats/index.js';
import { SyncLockManager } from './sync-lock.js';
import { getOwnMember } from '../utils/own-members.js';
import { computeDiff } from './sync-differ.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import { LOCK_FILE_NAME } from './types.js';
import { walkBuckets } from './sync-bucket-walker.js';
import { findTargetGaps } from './sync-target-audit.js';
import { findNeedsReview } from './sync-review-flags.js';
import { resolveTargetPath } from './sync-utils.js';

export interface LocaleStatus {
  locale: string;
  complete: number;
  missing: number;
  outdated: number;
  /**
   * Keys the lockfile records as translated for this locale that the locale's
   * target file does not hold. Counted separately from `missing` (absent from
   * the lockfile) and `outdated` (recorded against an older source), and never
   * counted as `complete`.
   */
  unwritten: number;
  /**
   * Keys whose target translation is present but marked as needing review, so
   * the format's own toolchain will not ship it — a gettext `#, fuzzy` msgstr,
   * which `msgfmt` leaves out of the compiled catalog. Never counted as
   * `complete`, and never re-translated: the value is a reviewer's, not this
   * tool's, so a run carries it forward untouched and reports it instead.
   */
  needsReview: number;
  coverage: number;
}

export interface SyncStatusResult {
  sourceLocale: string;
  totalKeys: number;
  /**
   * Keys whose parser tagged them with `metadata.skipped` — e.g., Laravel
   * pipe-pluralization values. Not sent for translation; round-trip
   * byte-verbatim. Included in `totalKeys`.
   */
  skippedKeys: number;
  locales: LocaleStatus[];
  /**
   * Per target file and locale, the keys behind each locale's `unwritten`
   * count, so the report can name the file and the keys rather than only
   * counting them.
   */
  unwrittenByLocale: UnwrittenTargetKeys[];
}

export interface UnwrittenTargetKeys {
  locale: string;
  file: string;
  keys: string[];
  /**
   * Set when the file itself could not be read or parsed, in which case the keys
   * are what the lockfile claims rather than what the file was shown to lack.
   */
  unusable?: string;
}

export async function computeSyncStatus(
  config: ResolvedSyncConfig,
  formatRegistry: FormatRegistry
): Promise<SyncStatusResult> {
  const lockManager = new SyncLockManager(
    path.join(config.projectRoot, LOCK_FILE_NAME)
  );
  const lockFile = await lockManager.read();
  let totalKeys = 0;
  let skippedKeys = 0;
  const unwrittenByLocale: UnwrittenTargetKeys[] = [];
  const localeStats = new Map<
    string,
    {
      complete: number;
      missing: number;
      outdated: number;
      unwritten: number;
      needsReview: number;
    }
  >();

  for (const locale of config.target_locales) {
    localeStats.set(locale, {
      complete: 0,
      missing: 0,
      outdated: 0,
      unwritten: 0,
      needsReview: 0,
    });
  }

  for await (const walked of walkBuckets(config, formatRegistry)) {
    const { relPath, entries, skippedEntries } = walked;
    totalKeys += entries.length + skippedEntries.length;
    skippedKeys += skippedEntries.length;

    const fileLockEntries = getOwnMember(lockFile.entries, relPath) ?? {};
    const diffs = computeDiff(fileLockEntries, entries);
    // The lockfile alone cannot answer "is this locale complete": it records
    // what a run intended, not what its target file ended up holding.
    const gaps = await findTargetGaps(
      config,
      walked,
      fileLockEntries,
      config.target_locales
    );
    // Keys whose target translation the format's own toolchain will not ship.
    // Only asked of a parser that has the concept, so the nine monolingual
    // formats cost nothing and no extra file is opened for them.
    const needsReviewByLocale = await findNeedsReview(
      config,
      walked,
      config.target_locales
    );

    for (const [locale, gap] of gaps) {
      unwrittenByLocale.push({
        locale,
        file: resolveTargetPath(
          relPath,
          config.source_locale,
          locale,
          walked.bucketConfig.target_path_pattern
        ),
        keys: [...gap.keys],
        ...(gap.unusable && { unusable: gap.unusable }),
      });
    }

    for (const locale of config.target_locales) {
      const stats = localeStats.get(locale);
      if (!stats) continue;

      for (const diff of diffs) {
        if (diff.status === 'deleted') continue;
        const lockEntry = getOwnMember(fileLockEntries, diff.key);
        const translation = lockEntry?.translations[locale];
        const hasTranslation = translation !== undefined;
        // Judge staleness for THIS locale rather than inheriting the shared
        // source-level status: a locale whose stored hash lags behind, or whose
        // last attempt failed, is outdated even when the source is unchanged.
        const localeOutdated =
          lockEntry !== undefined &&
          translation !== undefined &&
          (translation.status === 'failed' ||
            translation.hash !== lockEntry.source_hash);

        if (diff.status === 'new' || !hasTranslation) {
          stats.missing++;
        } else if (diff.status === 'stale' || localeOutdated) {
          stats.outdated++;
        } else if (gaps.get(locale)?.keys.has(diff.key)) {
          stats.unwritten++;
        } else if (needsReviewByLocale.get(locale)?.has(diff.key)) {
          stats.needsReview++;
        } else {
          stats.complete++;
        }
      }
    }
  }

  const locales: LocaleStatus[] = config.target_locales.map((locale) => {
    const stats = localeStats.get(locale) ?? {
      complete: 0,
      missing: 0,
      outdated: 0,
      unwritten: 0,
      needsReview: 0,
    };
    const total =
      stats.complete +
      stats.missing +
      stats.outdated +
      stats.unwritten +
      stats.needsReview;
    const coverage = total > 0 ? Math.round((stats.complete / total) * 100) : 0;
    return { locale, ...stats, coverage };
  });

  return {
    sourceLocale: config.source_locale,
    totalKeys,
    skippedKeys,
    locales,
    unwrittenByLocale,
  };
}
