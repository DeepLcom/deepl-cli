import * as path from 'path';
import { resolveSyncLimits } from './types.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import { resolveTargetPath, assertPathWithinRoot } from './sync-utils.js';
import type { WalkedBucketFile } from './sync-bucket-walker.js';
import { readTargetFile } from './sync-target-read.js';

/**
 * Keys whose translation is present but marked as needing review, keyed by
 * locale. A locale with nothing flagged is absent from the map.
 */
export type NeedsReviewKeys = Map<string, Set<string>>;

/**
 * Ask each locale's target file which of its translations its own toolchain
 * would refuse to ship.
 *
 * Only bilingual formats carry the concept — gettext's `#, fuzzy`, which
 * `msgfmt` leaves out of the compiled catalog — so a parser without
 * `extractNeedsReview` short-circuits before any file is opened and the nine
 * monolingual formats cost nothing.
 *
 * A file that is absent or unreadable yields nothing rather than an error: the
 * caller already reports an unreadable target through `findTargetGaps`, and
 * reporting it twice under two names would say one file is two problems. The
 * read having succeeded is also why the extraction below cannot fail — it walks
 * the same entries `readTargetFile` has already parsed.
 */
export async function findNeedsReview(
  config: ResolvedSyncConfig,
  walked: WalkedBucketFile,
  locales: readonly string[]
): Promise<NeedsReviewKeys> {
  const flagged: NeedsReviewKeys = new Map();
  const extractNeedsReview = walked.parser.extractNeedsReview;
  if (extractNeedsReview === undefined) {
    return flagged;
  }

  for (const locale of locales) {
    const targetRelPath = resolveTargetPath(
      walked.relPath,
      config.source_locale,
      locale,
      walked.bucketConfig.target_path_pattern
    );
    const targetAbsPath = path.join(config.projectRoot, targetRelPath);
    assertPathWithinRoot(targetAbsPath, config.projectRoot);
    const read = await readTargetFile(
      walked.parser,
      targetAbsPath,
      locale,
      resolveSyncLimits(config).max_file_bytes
    );
    if (read.state !== 'usable') continue;

    const keys = extractNeedsReview.call(walked.parser, read.content, locale);
    if (keys.size > 0) {
      flagged.set(locale, keys);
    }
  }

  return flagged;
}
