import * as fs from 'fs';
import * as path from 'path';
import type { ExtractedEntry, FormatRegistry } from '../formats/index.js';
import type { TmsClient } from './tms-client.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import { SyncLockManager, computeSourceHash } from './sync-lock.js';
import { resolveTargetPath, assertPathWithinRoot, mergePulledTranslations } from './sync-utils.js';
import { LOCK_FILE_NAME } from './types.js';
import { atomicWriteFile } from '../utils/atomic-write.js';
import { mapWithConcurrency, PUSH_CONCURRENCY } from '../utils/concurrency.js';
import { partitionEntries, walkBuckets } from './sync-bucket-walker.js';
import { sweepStaleBackups, resolveBakSweepAgeMs } from './sync-bak-cleanup.js';

export interface SyncPushPullOptions {
  localeFilter?: string[];
}

export type SkipReason = 'target_missing' | 'no_matches' | 'pipe_pluralization';

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
  skipped: SkippedRecord[];
}

const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  target_missing: 'target file not yet present',
  no_matches: 'no matching keys',
  pipe_pluralization: 'pipe-pluralization (never sent to TMS)',
};

/**
 * Format a `(N skipped: ...)` suffix for the push/pull CLI summary. Groups
 * records by `SkipReason` so each cause is called out with its own count.
 * Returns an empty string when there's nothing to skip.
 */
export function formatSkippedSummary(skipped: SkippedRecord[]): string {
  if (skipped.length === 0) return '';
  const counts = new Map<SkipReason, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  const parts = Array.from(counts.entries()).map(
    ([reason, count]) => `${count} ${SKIP_REASON_LABELS[reason]}`,
  );
  return ` (${skipped.length} skipped: ${parts.join(', ')})`;
}

export async function pushTranslations(
  config: ResolvedSyncConfig,
  client: TmsClient,
  registry: FormatRegistry,
  options?: SyncPushPullOptions,
): Promise<PushResult> {
  let pushed = 0;
  const skipped: SkippedRecord[] = [];
  const pushConcurrency = config.tms?.push_concurrency ?? PUSH_CONCURRENCY;

  try {
    await sweepStaleBackups(
      config.projectRoot,
      resolveBakSweepAgeMs(config.sync?.bak_sweep_max_age_seconds),
      config.buckets,
    );
  } catch {
    /* best-effort */
  }

  for await (const walked of walkBuckets(config, registry)) {
    const { bucketConfig, parser, relPath, content: sourceContent, isMultiLocale } = walked;
    for (const locale of config.target_locales) {
      if (options?.localeFilter && !options.localeFilter.includes(locale)) continue;
      try {
        let entries: ExtractedEntry[];
        let skippedEntries: ExtractedEntry[];
        if (isMultiLocale) {
          ({ entries, skippedEntries } = partitionEntries(parser.extract(sourceContent, locale)));
        } else {
          const targetPath = resolveTargetPath(relPath, config.source_locale, locale, bucketConfig.target_path_pattern);
          const targetAbsPath = path.join(config.projectRoot, targetPath);
          assertPathWithinRoot(targetAbsPath, config.projectRoot);
          const content = fs.readFileSync(targetAbsPath, 'utf-8');
          ({ entries, skippedEntries } = partitionEntries(parser.extract(content)));
        }
        for (const skippedEntry of skippedEntries) {
          skipped.push({
            file: relPath,
            locale,
            reason: 'pipe_pluralization',
            key: skippedEntry.key,
          });
        }
        await mapWithConcurrency(
          entries,
          async (entry) => {
            await client.pushEntry(entry, locale);
            pushed++;
          },
          pushConcurrency,
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
  options?: SyncPushPullOptions,
): Promise<PullResult> {
  const lockPath = path.join(config.projectRoot, LOCK_FILE_NAME);
  const lockManager = new SyncLockManager(lockPath);
  const lockFile = await lockManager.read();

  let pulled = 0;
  const skipped: SkippedRecord[] = [];

  try {
    await sweepStaleBackups(
      config.projectRoot,
      resolveBakSweepAgeMs(config.sync?.bak_sweep_max_age_seconds),
      config.buckets,
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
    const { bucket, bucketConfig, parser, relPath, content: sourceContent, entries: sourceEntries, isMultiLocale } = walked;

    if (bucket !== currentBucket) {
      currentBucket = bucket;
      localeKeys = new Map();
      for (const locale of config.target_locales) {
        if (options?.localeFilter && !options.localeFilter.includes(locale)) continue;
        localeKeys.set(locale, await client.pullKeys(locale));
      }
    }

    for (const locale of config.target_locales) {
      if (options?.localeFilter && !options.localeFilter.includes(locale)) continue;

      const keys = localeKeys.get(locale)!;
      const targetRelPath = isMultiLocale ? relPath : resolveTargetPath(relPath, config.source_locale, locale, bucketConfig.target_path_pattern);
      const targetAbsPath = path.join(config.projectRoot, targetRelPath);
      assertPathWithinRoot(targetAbsPath, config.projectRoot);

      let templateContent: string;
      let existingTargetEntries = new Map<string, string>();
      try {
        templateContent = await fs.promises.readFile(targetAbsPath, 'utf-8');
        const { entries: existingEntries } = isMultiLocale
          ? partitionEntries(parser.extract(templateContent, locale))
          : partitionEntries(parser.extract(templateContent));
        existingTargetEntries = new Map(existingEntries.map((entry) => [entry.key, entry.value]));
      } catch {
        templateContent = sourceContent;
      }

      const pulledEntries = sourceEntries
        .filter(entry => keys[entry.key] !== undefined)
        .map(entry => ({
          key: entry.key,
          value: entry.value,
          translation: keys[entry.key]!,
          metadata: entry.metadata,
        }));

      if (pulledEntries.length === 0) {
        skipped.push({ file: relPath, locale, reason: 'no_matches' });
        continue;
      }

      const translatedEntries = mergePulledTranslations(
        sourceEntries,
        keys,
        existingTargetEntries,
      );

      const reconstructed = isMultiLocale
        ? parser.reconstruct(templateContent, translatedEntries, locale)
        : parser.reconstruct(templateContent, translatedEntries);
      await fs.promises.mkdir(path.dirname(targetAbsPath), { recursive: true });
      await atomicWriteFile(targetAbsPath, reconstructed, 'utf-8');
      pulled += pulledEntries.length;

      const fileEntryMap = lockFile.entries[relPath] ??= {};
      for (const entry of pulledEntries) {
        const existing = fileEntryMap[entry.key];
        const existingTranslations = existing?.translations ?? {};
        const sourceHash = computeSourceHash(entry.value, entry.metadata);
        fileEntryMap[entry.key] = {
          source_hash: sourceHash,
          source_text: existing?.source_text ?? entry.value,
          translations: {
            ...existingTranslations,
            [locale]: {
              hash: sourceHash,
              translated_at: new Date().toISOString(),
              status: 'translated' as const,
              review_status: 'human_reviewed' as const,
            },
          },
        };
      }
    }
  }

  if (pulled > 0) {
    await lockManager.write(lockFile);
  }

  return { pulled, skipped };
}
