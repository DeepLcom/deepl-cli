import * as path from 'path';
import { LOCK_FILE_NAME, resolveSyncLimits } from './types.js';
import { computeDiff } from './sync-differ.js';
import {
  mapWithConcurrency,
  MULTI_TARGET_CONCURRENCY,
} from '../utils/concurrency.js';
import { ValidationError } from '../utils/errors.js';
import { resolveTargetPath, assertPathWithinRoot } from './sync-utils.js';
import { computeSourceHash, ensureFileEntries } from './sync-lock.js';
import {
  findForeignKeyOwner,
  sharedTargetMessage,
} from './sync-foreign-owner.js';
import { getOwnMember, setOwnMember } from '../utils/own-members.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import type { SyncLockFile, SyncLockTranslation } from './types.js';
import type { KeyContext } from './sync-context.js';
import { Logger } from '../utils/logger.js';
import {
  extractExistingTranslations,
  type WalkedBucketFile,
} from './sync-bucket-walker.js';
import { findTargetGaps, type TargetGaps } from './sync-target-audit.js';
import {
  readTargetFile,
  unusableTargetMessage,
  unusableTargetPreviewMessage,
} from './sync-target-read.js';
import type { LocaleTranslator } from './sync-locale-translator.js';
import type { SyncFileResult, SyncOptions } from './sync-service.js';

export interface ProcessBucketDeps {
  config: ResolvedSyncConfig;
  options: SyncOptions | undefined;
  // Mutated in place by processBucket — orchestrator-owned refs:
  lockFile: SyncLockFile;
  sourceEntryMap: Map<string, string>;
  targetEntryMap: Map<string, Map<string, string>>;
  allContextSentKeys: Set<string>;
  allInstructionSentKeys: Set<string>;
  allInstructionGroupTotals: Map<string, number>;
  // Read-only refs:
  keyContexts: Map<string, KeyContext>;
  localeTranslator: LocaleTranslator;
  /**
   * Glossary and translation-memory IDs for locales carrying a
   * `locale_overrides.<locale>` entry, resolved once by the orchestrator so a
   * reference that does not cover its locale fails before any file is touched.
   */
  localeGlossaryIds: Map<string, string>;
  localeTmIds: Map<string, string>;
  // For cost-cap check — orchestrator's cumulative as of this bucket:
  currentTotalCharsBilled: number;
}

export interface BucketContribution {
  totalKeysDelta: number;
  newKeysDelta: number;
  staleKeysDelta: number;
  deletedKeysDelta: number;
  currentKeysDelta: number;
  /** Keys the lockfile calls translated that the target file does not hold. */
  unwrittenKeysDelta: number;
  totalCharsBilledDelta: number;
  estimatedCharactersDelta: number;
  validationWarningsDelta: number;
  validationErrorsDelta: number;
  fileResults: SyncFileResult[];
  driftDetected: boolean;
  lockDirty: boolean;
}

const EMPTY: BucketContribution = {
  totalKeysDelta: 0,
  newKeysDelta: 0,
  staleKeysDelta: 0,
  deletedKeysDelta: 0,
  currentKeysDelta: 0,
  unwrittenKeysDelta: 0,
  totalCharsBilledDelta: 0,
  estimatedCharactersDelta: 0,
  validationWarningsDelta: 0,
  validationErrorsDelta: 0,
  fileResults: [],
  driftDetected: false,
  lockDirty: false,
};

export async function processBucket(
  walked: WalkedBucketFile,
  deps: ProcessBucketDeps
): Promise<BucketContribution> {
  const {
    config,
    options,
    lockFile,
    sourceEntryMap,
    targetEntryMap,
    allContextSentKeys,
    allInstructionSentKeys,
    allInstructionGroupTotals,
    keyContexts,
    localeTranslator,
    localeGlossaryIds,
    localeTmIds,
    currentTotalCharsBilled,
  } = deps;
  const { bucketConfig, parser, relPath, content, entries, isMultiLocale } =
    walked;

  const out: BucketContribution = { ...EMPTY, fileResults: [] };

  const fileLockEntries = getOwnMember(lockFile.entries, relPath) ?? {};
  /**
   * The locales this run will actually touch.
   *
   * Staleness is judged against these rather than against every configured
   * locale: a key that failed for es is not stale for de, so `sync --locale de`
   * must not re-translate, re-bill and overwrite de's reviewed keys because of a
   * locale the run was not even asked to look at.
   */
  const effectiveLocales = options?.localeFilter?.length
    ? config.target_locales.filter((l) => options.localeFilter!.includes(l))
    : config.target_locales;
  // Per-locale staleness: a key whose source is unchanged still needs work if a
  // locale in scope has a stale stored hash, or previously failed.
  let diffs = computeDiff(fileLockEntries, entries, effectiveLocales);

  if (options?.force) {
    diffs = diffs.map((d) => ({ ...d, status: 'new' as const }));
  }

  for (const d of diffs) {
    switch (d.status) {
      case 'new':
        if (d.value !== undefined) out.newKeysDelta++;
        else out.deletedKeysDelta++;
        break;
      case 'stale':
        out.staleKeysDelta++;
        break;
      case 'deleted':
        out.deletedKeysDelta++;
        break;
      case 'current':
        out.currentKeysDelta++;
        break;
    }
  }
  out.totalKeysDelta += entries.length;

  const toTranslate = diffs.filter(
    (d) => (d.status === 'new' || d.status === 'stale') && d.value !== undefined
  );
  const deletedDiffs = diffs.filter((d) => d.status === 'deleted');

  // Check if any target locale is missing translations for current keys
  const hasNewLocale = config.target_locales.some((locale) => {
    const localeFilter = options?.localeFilter;
    if (localeFilter?.length && !localeFilter.includes(locale)) return false;
    return diffs.some(
      (d) =>
        d.status === 'current' &&
        !getOwnMember(fileLockEntries, d.key)?.translations[locale]
    );
  });

  /**
   * Keys the lockfile calls translated that the target file does not hold.
   *
   * Computed lazily, and only where a decision would otherwise be made on the
   * lockfile alone: `--frozen`, whose whole purpose is catching a locale that is
   * not up to date, and the early return below, which would otherwise leave a
   * damaged target unrepaired for as long as no other key needed work. A run
   * that has translating to do reads every target file a few lines below anyway.
   */
  let gapsCache: TargetGaps | undefined;
  const targetGaps = async (): Promise<TargetGaps> => {
    gapsCache ??= await findTargetGaps(
      config,
      walked,
      fileLockEntries,
      effectiveLocales
    );
    return gapsCache;
  };

  const unwrittenTargetKeys = async (): Promise<number> => {
    const gaps = await targetGaps();
    let count = 0;
    for (const gap of gaps.values()) count += gap.keys.size;
    return count;
  };

  /**
   * Characters a real run would bill for this bucket, and the locales it would
   * refuse.
   *
   * Counted: new and stale keys for every locale that will be translated,
   * current keys for a locale that holds none of them yet, and keys the lockfile
   * calls translated that the target file does not hold — the run translates
   * those again. Not counted: a locale whose target file is on disk and
   * unreadable, which the run refuses in full and bills nothing for.
   *
   * `--dry-run` and the `max_characters` cap both quote from here, so the number
   * a preview shows is the number the cap enforces.
   */
  const estimateCharacters = async (
    candidateLocales: readonly string[]
  ): Promise<{
    chars: number;
    refused: ReadonlySet<string>;
    gaps: TargetGaps;
  }> => {
    const gaps = await targetGaps();
    const refused = new Set<string>();
    for (const [locale, gap] of gaps) {
      if (gap.unusable !== undefined) refused.add(locale);
    }
    const billable = candidateLocales.filter((locale) => !refused.has(locale));

    let chars =
      toTranslate.reduce((sum, d) => sum + (d.value?.length ?? 0), 0) *
      billable.length;

    if (hasNewLocale) {
      const currentChars = diffs
        .filter((d) => d.status === 'current')
        .reduce((sum, d) => sum + (d.value?.length ?? 0), 0);
      const newLocaleCount = billable.filter((locale) =>
        diffs.some(
          (d) =>
            d.status === 'current' &&
            !getOwnMember(fileLockEntries, d.key)?.translations[locale]
        )
      ).length;
      chars += currentChars * newLocaleCount;
    }

    // Under `--force` every key is already counted above.
    if (!options?.force) {
      const sourceValues = new Map(entries.map((e) => [e.key, e.value]));
      for (const locale of billable) {
        const gap = gaps.get(locale);
        if (gap === undefined) continue;
        for (const key of gap.keys) {
          chars += sourceValues.get(key)?.length ?? 0;
        }
      }
    }

    return { chars, refused, gaps };
  };

  if (options?.frozen) {
    const failMissing = config.validation?.fail_on_missing !== false;
    const failStale = config.validation?.fail_on_stale !== false;
    const hasNew = toTranslate.some((d) => d.status === 'new') || hasNewLocale;
    const hasStale = toTranslate.some((d) => d.status === 'stale');
    const unwritten = failMissing ? await unwrittenTargetKeys() : 0;
    if (
      (failMissing && (hasNew || deletedDiffs.length > 0)) ||
      (failStale && hasStale) ||
      unwritten > 0
    ) {
      // Promote current keys missing a target-locale translation into newKeysDelta
      // so the displayed count matches dry-run for the same input state.
      if (hasNewLocale) {
        const currentDiffs = diffs.filter((d) => d.status === 'current');
        out.newKeysDelta += currentDiffs.length;
      }
      out.unwrittenKeysDelta += unwritten;
      out.driftDetected = true;
      return out;
    }
  }

  if (options?.dryRun) {
    // The same target-file checks the real run makes, so the preview is of that
    // run rather than of the lockfile.
    const { chars, refused, gaps } = await estimateCharacters(effectiveLocales);
    out.estimatedCharactersDelta += chars;

    if (hasNewLocale) {
      out.newKeysDelta += diffs.filter((d) => d.status === 'current').length;
    }

    for (const gap of gaps.values()) out.unwrittenKeysDelta += gap.keys.size;

    for (const locale of refused) {
      const targetRelPath = walked.isMultiLocale
        ? relPath
        : resolveTargetPath(
            relPath,
            config.source_locale,
            locale,
            bucketConfig.target_path_pattern
          );
      Logger.warn(
        unusableTargetPreviewMessage(
          locale,
          targetRelPath,
          gaps.get(locale)!.unusable!
        )
      );
    }

    return out;
  }

  if (deletedDiffs.length > 0) {
    const fileEntryMap = ensureFileEntries(lockFile, relPath);
    for (const diff of deletedDiffs) {
      delete fileEntryMap[diff.key];
    }
    if (Object.keys(fileEntryMap).length === 0) {
      delete lockFile.entries[relPath];
    }
    out.lockDirty = true;
  }

  const hasDeleted = diffs.some((d) => d.status === 'deleted');

  if (
    toTranslate.length === 0 &&
    !hasDeleted &&
    !hasNewLocale &&
    (await unwrittenTargetKeys()) === 0
  ) {
    return out;
  }

  const locales = effectiveLocales;

  if (options?.localeFilter?.length && locales.length === 0) {
    Logger.warn(
      `No matching locales for filter [${options.localeFilter.join(', ')}]. Available: ${config.target_locales.join(', ')}`
    );
  }

  const concurrency = isMultiLocale
    ? 1
    : (options?.concurrency ??
      config.sync?.concurrency ??
      MULTI_TARGET_CONCURRENCY);

  if (config.sync?.max_characters !== undefined && !options?.force) {
    // Quoted from the same place `--dry-run` quotes, so a run the preview priced
    // above the cap is a run the cap refuses.
    const { chars: estimatedChars } = await estimateCharacters(locales);
    if (
      currentTotalCharsBilled + out.totalCharsBilledDelta + estimatedChars >
      config.sync.max_characters
    ) {
      throw new ValidationError(
        `Cost cap exceeded: this sync would use ~${(currentTotalCharsBilled + out.totalCharsBilledDelta + estimatedChars).toLocaleString()} characters ` +
          `(cap: ${config.sync.max_characters.toLocaleString()}). Use --force to override.`
      );
    }
  }

  // Pre-read existing target files to get current translations
  const existingTargetEntries = new Map<string, Map<string, string>>();
  /**
   * Locales whose target file is on disk and could not be read, with the reason.
   * Such a locale is not translated for this file: its translations exist only in
   * that file, so treating it as empty would re-bill every key and then write the
   * result over the copy nobody managed to read.
   */
  const unusableTargets = new Map<string, string>();
  /**
   * Locales whose target file holds keys another sync configuration's lockfile
   * accounts for, with the explanation. Rewriting such a file emits only this
   * configuration's keys, so the other configuration's translations would be
   * deleted — and its next run would delete this one's.
   *
   * Judged before anything is translated, so a refusal costs nothing. Only
   * single-locale targets can collide this way: a multi-locale (bilingual)
   * parser writes back to the source file, which is this configuration's own.
   */
  const sharedTargets = new Map<string, string>();
  const accountedKeys = new Set(diffs.map((diff) => diff.key));
  const ownLockPath = path.join(config.projectRoot, LOCK_FILE_NAME);
  for (const locale of locales) {
    if (isMultiLocale) {
      existingTargetEntries.set(
        locale,
        extractExistingTranslations(parser, content, locale)
      );
    } else {
      const targetRelPath = resolveTargetPath(
        relPath,
        config.source_locale,
        locale,
        bucketConfig.target_path_pattern
      );
      const targetAbsPath = path.join(config.projectRoot, targetRelPath);
      assertPathWithinRoot(targetAbsPath, config.projectRoot);
      const read = await readTargetFile(
        parser,
        targetAbsPath,
        undefined,
        resolveSyncLimits(config).max_file_bytes
      );
      if (read.state === 'unusable') {
        unusableTargets.set(
          locale,
          unusableTargetMessage(targetRelPath, read.reason)
        );
        continue;
      }
      existingTargetEntries.set(
        locale,
        read.state === 'usable' ? read.translations : new Map()
      );
      if (read.state === 'usable') {
        const unaccountedFor = [...read.translations.keys()].filter(
          (key) => !accountedKeys.has(key)
        );
        const owner = await findForeignKeyOwner({
          targetAbsPath,
          ownLockPath,
          locale,
          keys: unaccountedFor,
        });
        if (owner) {
          sharedTargets.set(
            locale,
            sharedTargetMessage(targetRelPath, locale, owner)
          );
        }
      }
    }
  }

  // Accumulate source entries for auto-glossary
  for (const entry of entries) {
    sourceEntryMap.set(entry.key, entry.value);
  }

  const localeSuccessMap = new Map<string, Set<string>>();
  const localeBilledMap = new Map<string, Map<string, number>>();
  const contextSentSet = new Set<string>();
  for (const diff of toTranslate) {
    localeSuccessMap.set(diff.key, new Set());
  }
  // Also seed for current keys that may need new-locale translation
  for (const diff of diffs) {
    if (diff.status === 'current' && !localeSuccessMap.has(diff.key)) {
      localeSuccessMap.set(diff.key, new Set());
    }
  }

  await mapWithConcurrency(
    locales,
    async (locale) => {
      if (options?.cancellationSignal?.cancelled) {
        return;
      }
      try {
        const unusable = unusableTargets.get(locale);
        if (unusable) throw new Error(unusable);
        const shared = sharedTargets.get(locale);
        if (shared) throw new Error(shared);
        const result = await localeTranslator.translate({
          locale,
          relPath,
          content,
          parser,
          diffs,
          toTranslate,
          fileLockEntries,
          existingTargetEntries,
          keyContexts,
          localeGlossaryIds,
          localeTmIds,
          bucketConfig,
          isMultiLocale,
        });

        out.totalCharsBilledDelta += result.charactersBilled;
        out.validationWarningsDelta += result.validationWarnings;
        out.validationErrorsDelta += result.validationErrors;
        out.fileResults.push(result.fileResult);

        for (const key of result.successfulKeys) {
          localeSuccessMap.get(key)?.add(locale);
        }
        for (const [key, chars] of result.billedPerKey) {
          const billedMap =
            localeBilledMap.get(key) ?? new Map<string, number>();
          billedMap.set(locale, chars);
          localeBilledMap.set(key, billedMap);
        }
        for (const key of result.contextSentKeys) {
          contextSentSet.add(key);
          allContextSentKeys.add(key);
        }
        for (const key of result.instructionSentKeys) {
          allInstructionSentKeys.add(key);
        }
        for (const [elemType, count] of result.instructionGroupCounts) {
          allInstructionGroupTotals.set(
            elemType,
            (allInstructionGroupTotals.get(elemType) ?? 0) + count
          );
        }

        const localeTargetEntries =
          targetEntryMap.get(locale) ?? new Map<string, string>();
        for (const [key, value] of result.targetEntries) {
          localeTargetEntries.set(key, value);
        }
        targetEntryMap.set(locale, localeTargetEntries);

        options?.onProgress?.({
          type: 'locale-complete',
          locale,
          file: relPath,
          translated: result.fileResult.translated,
          failed: result.fileResult.failed,
          totalKeys: result.fileResult.translated + result.fileResult.failed,
          charactersBilled: result.charactersBilled,
        });
      } catch (localeError) {
        const msg =
          localeError instanceof Error
            ? localeError.message
            : String(localeError);
        // Containment violations abort the whole sync instead of being retried per locale.
        if (
          msg.includes('Authentication') ||
          msg.includes('Forbidden') ||
          msg.includes('quota') ||
          (localeError instanceof ValidationError &&
            msg.includes('escapes project root'))
        ) {
          throw localeError;
        }
        Logger.error(
          `Sync failed for locale "${locale}" on "${relPath}": ${msg}`
        );
        out.fileResults.push({
          file: relPath,
          locale,
          translated: 0,
          skipped: 0,
          failed: diffs.length,
          written: false,
        });
        options?.onProgress?.({
          type: 'locale-complete',
          locale,
          file: relPath,
          translated: 0,
          failed: diffs.length,
          totalKeys: toTranslate.length,
          charactersBilled: 0,
        });
      }
    },
    concurrency
  );

  const fileEntryMap = ensureFileEntries(lockFile, relPath);
  for (const diff of toTranslate) {
    if (diff.value === undefined) continue;
    const existingEntry = getOwnMember(fileEntryMap, diff.key);
    const existingTranslations = existingEntry?.translations ?? {};

    const newTranslations: Record<string, SyncLockTranslation> = {
      ...existingTranslations,
    };
    for (const locale of locales) {
      const charCount = localeBilledMap.get(diff.key)?.get(locale);
      newTranslations[locale] = {
        hash: computeSourceHash(diff.value, diff.metadata),
        translated_at: new Date().toISOString(),
        status: localeSuccessMap.get(diff.key)?.has(locale)
          ? 'translated'
          : 'failed',
        ...(charCount !== undefined && { character_count: charCount }),
        ...(contextSentSet.has(diff.key) && { context_sent: true }),
        ...(options?.flagForReview && {
          review_status: 'machine_translated' as const,
        }),
      };
    }

    setOwnMember(fileEntryMap, diff.key, {
      source_hash: computeSourceHash(diff.value, diff.metadata),
      source_text: diff.value,
      translations: newTranslations,
    });
    out.lockDirty = true;
  }

  // Write lock entries for current keys that were translated for new locales
  for (const diff of diffs) {
    if (diff.status !== 'current' || diff.value === undefined) continue;
    const successSet = localeSuccessMap.get(diff.key);
    if (!successSet || successSet.size === 0) continue;
    const existingEntry = getOwnMember(fileEntryMap, diff.key);
    const existingTranslations = existingEntry?.translations ?? {};
    let updated = false;
    const newTranslations = { ...existingTranslations };
    for (const locale of locales) {
      if (successSet.has(locale) && !existingTranslations[locale]) {
        newTranslations[locale] = {
          hash: computeSourceHash(diff.value, diff.metadata),
          translated_at: new Date().toISOString(),
          status: 'translated' as const,
          ...(contextSentSet.has(diff.key) && { context_sent: true }),
          ...(options?.flagForReview && {
            review_status: 'machine_translated' as const,
          }),
        };
        updated = true;
      }
    }
    if (updated) {
      setOwnMember(fileEntryMap, diff.key, {
        source_hash: computeSourceHash(diff.value, diff.metadata),
        source_text: diff.value,
        translations: newTranslations,
      });
      out.lockDirty = true;
    }
  }

  // Clean up empty file entries after all updates
  if (Object.keys(fileEntryMap).length === 0) {
    delete lockFile.entries[relPath];
  }

  return out;
}
