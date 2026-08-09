import * as fs from 'fs';
import * as path from 'path';
import {
  FormatKeyCollisionError,
  type ExtractedEntry,
  type FormatRegistry,
} from '../formats/index.js';
import type { TmsClient } from './tms-client.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import {
  SyncLockManager,
  computeSourceHash,
  ensureFileEntries,
} from './sync-lock.js';
import { getOwnMember, setOwnMember } from '../utils/own-members.js';
import {
  resolveTargetPath,
  assertPathWithinRoot,
  mergePulledTranslations,
  hasPluralForms,
} from './sync-utils.js';
import { LOCK_FILE_NAME } from './types.js';
import { atomicWriteFile } from '../utils/atomic-write.js';
import { mapWithConcurrency, PUSH_CONCURRENCY } from '../utils/concurrency.js';
import {
  extractExistingTranslations,
  partitionEntries,
  walkBuckets,
} from './sync-bucket-walker.js';
import { Logger } from '../utils/logger.js';
import { sweepStaleBackups, resolveBakSweepAgeMs } from './sync-bak-cleanup.js';
import { readTargetFile } from './sync-target-read.js';

export interface SyncPushPullOptions {
  localeFilter?: string[];
  dryRun?: boolean;
}

export type SkipReason =
  | 'target_missing'
  | 'no_matches'
  | 'pipe_pluralization'
  | 'key_collision'
  | 'unusable_target'
  | 'untranslated'
  | 'needs_review'
  | 'plural_entry';

export interface SkippedRecord {
  file: string;
  locale: string;
  reason: SkipReason;
  key?: string;
}

export interface PushResult {
  pushed: number;
  skipped: SkippedRecord[];
}

export interface PullResult {
  pulled: number;
  replaced: number;
  skipped: SkippedRecord[];
}

const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  target_missing: 'target file not yet present',
  no_matches: 'no matching keys',
  pipe_pluralization: 'pipe-pluralization (never sent to TMS)',
  key_collision: 'target file keys collide (left untouched)',
  unusable_target: 'target file could not be read (left untouched)',
  untranslated: 'no translation in the target file',
  needs_review: 'translation marked as needing review (not pushed)',
  plural_entry:
    'plural entry (one exported string cannot fill its forms; left as it stands)',
};

/**
 * Format a `(N skipped: ...)` suffix for the push/pull CLI summary. Groups
 * records by `SkipReason` so each cause is called out with its own count.
 * Returns an empty string when there's nothing to skip.
 */
export function formatSkippedSummary(skipped: SkippedRecord[]): string {
  if (skipped.length === 0) return '';
  const counts = new Map<SkipReason, number>();
  for (const s of skipped)
    counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  const parts = Array.from(counts.entries()).map(
    ([reason, count]) => `${count} ${SKIP_REASON_LABELS[reason]}`
  );
  return ` (${skipped.length} skipped: ${parts.join(', ')})`;
}

export async function pushTranslations(
  config: ResolvedSyncConfig,
  client: TmsClient,
  registry: FormatRegistry,
  options?: SyncPushPullOptions
): Promise<PushResult> {
  let pushed = 0;
  const skipped: SkippedRecord[] = [];
  const pushConcurrency = config.tms?.push_concurrency ?? PUSH_CONCURRENCY;

  try {
    await sweepStaleBackups(
      config.projectRoot,
      resolveBakSweepAgeMs(config.sync?.bak_sweep_max_age_seconds),
      config.buckets
    );
  } catch {
    /* best-effort */
  }

  for await (const walked of walkBuckets(config, registry)) {
    const {
      bucketConfig,
      parser,
      relPath,
      content: sourceContent,
      isMultiLocale,
    } = walked;
    for (const locale of config.target_locales) {
      if (options?.localeFilter && !options.localeFilter.includes(locale))
        continue;
      try {
        let entries: ExtractedEntry[];
        let skippedEntries: ExtractedEntry[];
        let translations: Map<string, string>;
        /**
         * Keys whose translation the format's own toolchain will not ship — a
         * `#, fuzzy` msgstr is the case. Uploading one would make the TMS the
         * authority for a string a reviewer has marked as not ready.
         */
        let needsReview: Set<string>;
        if (isMultiLocale) {
          ({ entries, skippedEntries } = partitionEntries(
            parser.extract(sourceContent, locale)
          ));
          translations = extractExistingTranslations(
            parser,
            sourceContent,
            locale
          );
          needsReview =
            parser.extractNeedsReview?.(sourceContent, locale) ?? new Set();
        } else {
          const targetPath = resolveTargetPath(
            relPath,
            config.source_locale,
            locale,
            bucketConfig.target_path_pattern
          );
          const targetAbsPath = path.join(config.projectRoot, targetPath);
          assertPathWithinRoot(targetAbsPath, config.projectRoot);
          const content = fs.readFileSync(targetAbsPath, 'utf-8');
          ({ entries, skippedEntries } = partitionEntries(
            parser.extract(content)
          ));
          translations = extractExistingTranslations(parser, content);
          needsReview = parser.extractNeedsReview?.(content) ?? new Set();
        }
        for (const skippedEntry of skippedEntries) {
          skipped.push({
            file: relPath,
            locale,
            reason: 'pipe_pluralization',
            key: skippedEntry.key,
          });
        }
        // A bilingual target file lists every key the source has, translated or
        // not. Pushing such a key would upload its source text as the locale's
        // translation and make the TMS the authority for it.
        const pushable: Array<{ entry: ExtractedEntry; translation: string }> =
          [];
        for (const entry of entries) {
          const translation = translations.get(entry.key);
          if (translation === undefined) {
            skipped.push({
              file: relPath,
              locale,
              reason: 'untranslated',
              key: entry.key,
            });
            continue;
          }
          if (needsReview.has(entry.key)) {
            skipped.push({
              file: relPath,
              locale,
              reason: 'needs_review',
              key: entry.key,
            });
            continue;
          }
          pushable.push({ entry, translation });
        }
        await mapWithConcurrency(
          pushable,
          async ({ entry, translation }) => {
            await client.pushEntry(entry, locale, translation);
            pushed++;
          },
          pushConcurrency
        );
      } catch (err) {
        // Record and continue on "target file does not exist yet" (common on
        // first push before any translation has been written). Propagate
        // everything else so auth failures and parse errors surface.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        skipped.push({ file: relPath, locale, reason: 'target_missing' });
      }
    }
  }

  return { pushed, skipped };
}

export async function pullTranslations(
  config: ResolvedSyncConfig,
  client: TmsClient,
  registry: FormatRegistry,
  options?: SyncPushPullOptions
): Promise<PullResult> {
  const lockPath = path.join(config.projectRoot, LOCK_FILE_NAME);
  const lockManager = new SyncLockManager(lockPath);
  const lockFile = await lockManager.read();

  let pulled = 0;
  let replaced = 0;
  const skipped: SkippedRecord[] = [];

  try {
    await sweepStaleBackups(
      config.projectRoot,
      resolveBakSweepAgeMs(config.sync?.bak_sweep_max_age_seconds),
      config.buckets
    );
  } catch {
    /* best-effort */
  }

  // Fetch each target locale's full dictionary once per bucket. pullKeys
  // returns the full per-locale key set regardless of source file, so calling
  // it inside the per-file loop would issue F x L identical GETs.
  let currentBucket: string | null = null;
  let localeKeys = new Map<string, Record<string, string>>();

  for await (const walked of walkBuckets(config, registry)) {
    const {
      bucket,
      bucketConfig,
      parser,
      relPath,
      content: sourceContent,
      entries: sourceEntries,
      isMultiLocale,
    } = walked;

    if (bucket !== currentBucket) {
      currentBucket = bucket;
      localeKeys = new Map();
      for (const locale of config.target_locales) {
        if (options?.localeFilter && !options.localeFilter.includes(locale))
          continue;
        localeKeys.set(locale, await client.pullKeys(locale));
      }
    }

    for (const locale of config.target_locales) {
      if (options?.localeFilter && !options.localeFilter.includes(locale))
        continue;

      const keys = localeKeys.get(locale)!;
      const targetRelPath = isMultiLocale
        ? relPath
        : resolveTargetPath(
            relPath,
            config.source_locale,
            locale,
            bucketConfig.target_path_pattern
          );
      const targetAbsPath = path.join(config.projectRoot, targetRelPath);
      assertPathWithinRoot(targetAbsPath, config.projectRoot);

      // A target file that cannot be read or parsed must not fall through to the
      // source template, which would rebuild it from source text and discard
      // every local translation the export does not carry. Only a file that is
      // genuinely not there yet takes that fallback.
      const read = await readTargetFile(parser, targetAbsPath, locale);
      if (read.state === 'unusable') {
        Logger.warn(`Skipping ${targetRelPath}: ${read.reason}`);
        skipped.push({
          file: relPath,
          locale,
          reason:
            read.error instanceof FormatKeyCollisionError
              ? 'key_collision'
              : 'unusable_target',
        });
        continue;
      }
      const templateContent =
        read.state === 'usable' ? read.content : sourceContent;
      const existingTargetEntries =
        read.state === 'usable' ? read.translations : new Map<string, string>();

      // The export is one string per key, which cannot fill a plural entry's
      // forms — gettext's msgstr[N], Android's <plurals> items. Applying it
      // would replace the file's own forms with the source's, so such a key is
      // reported skipped and the entry is carried forward as it stands.
      const pluralEntries = sourceEntries.filter(
        (entry) =>
          keys[entry.key] !== undefined && hasPluralForms(entry.metadata)
      );
      // Preserve the null prototype `sanitizePullKeysResponse` gave `keys`: a
      // plain-object spread would re-expose Object.prototype, so a source key
      // named `toString`/`constructor` would read as an approved translation.
      const applicableKeys: Record<string, string> = Object.assign(
        Object.create(null) as Record<string, string>,
        keys
      );
      for (const entry of pluralEntries) {
        skipped.push({
          file: relPath,
          locale,
          reason: 'plural_entry',
          key: entry.key,
        });
        delete applicableKeys[entry.key];
      }

      const pulledEntries = sourceEntries
        .filter((entry) => applicableKeys[entry.key] !== undefined)
        .map((entry) => ({
          key: entry.key,
          value: entry.value,
          translation: applicableKeys[entry.key]!,
          metadata: entry.metadata,
        }));

      if (pulledEntries.length === 0) {
        if (pluralEntries.length === 0) {
          skipped.push({ file: relPath, locale, reason: 'no_matches' });
        }
        continue;
      }

      const translatedEntries = mergePulledTranslations(
        sourceEntries,
        applicableKeys,
        existingTargetEntries
      );

      for (const entry of pulledEntries) {
        const local = existingTargetEntries.get(entry.key);
        if (local === undefined || local === entry.translation) continue;
        replaced++;
        Logger.verbose(
          `[verbose] ${locale}: the TMS version of "${entry.key}" differs from the local translation in ${targetRelPath}`
        );
      }

      const reconstructed = isMultiLocale
        ? parser.reconstruct(templateContent, translatedEntries, locale)
        : parser.reconstruct(templateContent, translatedEntries);
      if (!options?.dryRun) {
        await fs.promises.mkdir(path.dirname(targetAbsPath), {
          recursive: true,
        });
        await atomicWriteFile(targetAbsPath, reconstructed, 'utf-8');
      }
      pulled += pulledEntries.length;

      const fileEntryMap = ensureFileEntries(lockFile, relPath);
      for (const entry of pulledEntries) {
        const existing = getOwnMember(fileEntryMap, entry.key);
        const existingTranslations = existing?.translations ?? {};
        const sourceHash = computeSourceHash(entry.value, entry.metadata);
        setOwnMember(fileEntryMap, entry.key, {
          source_hash: sourceHash,
          source_text: existing?.source_text ?? entry.value,
          translations: {
            ...existingTranslations,
            // No review_status: the export endpoint returns `{ key: value }`
            // and carries no per-entry review flag, so the pull has nothing to
            // base a claim of human review on. Leaving the field unset says
            // "unknown" rather than asserting a review nobody verified.
            [locale]: {
              hash: sourceHash,
              translated_at: new Date().toISOString(),
              status: 'translated' as const,
            },
          },
        });
      }
    }
  }

  if (pulled > 0 && !options?.dryRun) {
    await lockManager.write(lockFile);
  }

  return { pulled, replaced, skipped };
}
