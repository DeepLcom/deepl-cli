import * as fs from 'fs';
import * as path from 'path';
import type { FormatParser, TranslatedEntry } from '../formats/index.js';
import type { TranslationService } from '../services/translation.js';
import type { TranslationOptions } from '../types/api.js';
import type { TranslationResult } from '../api/translation-client.js';
import type { Language } from '../types/common.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import type { SyncBucketConfig, SyncDiff, SyncLockEntry } from './types.js';
import type { KeyContext } from './sync-context.js';
import { sectionContextKey, sectionToContext } from './sync-context.js';
import {
  supportsCustomInstructions,
  generateElementInstruction,
  mergeInstructions,
  generateLengthInstruction,
} from './sync-instructions.js';
import { getOwnMember } from '../utils/own-members.js';
import {
  validateBatch,
  type ValidationResult,
} from './translation-validator.js';
import { atomicWriteFile } from '../utils/atomic-write.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import {
  resolveTargetPath,
  assertPathWithinRoot,
  withoutPluralForms,
} from './sync-utils.js';
import { extractExistingTranslations } from './sync-bucket-walker.js';
import { primaryPluralItem } from '../formats/util/plurals.js';
import { BACKUP_SUFFIX } from './sync-bak-cleanup.js';
import { Logger } from '../utils/logger.js';
import {
  preserveVariables,
  restorePlaceholders,
} from '../utils/text-preservation.js';
import {
  expandPlurals,
  detectIcu,
  reassembleIcu,
  writebackPlurals,
} from './sync-message-preprocess.js';
import type { SyncProgressEvent, SyncFileResult } from './sync-service.js';

export interface LocaleTranslatorContext {
  locale: string;
  relPath: string;
  content: string;
  parser: FormatParser;
  diffs: SyncDiff[];
  toTranslate: SyncDiff[];
  fileLockEntries: Record<string, SyncLockEntry>;
  existingTargetEntries: Map<string, Map<string, string>>;
  keyContexts: Map<string, KeyContext>;
  localeGlossaryIds: Map<string, string>;
  localeTmIds: Map<string, string>;
  bucketConfig: SyncBucketConfig;
  isMultiLocale: boolean;
}

interface ScreenedTranslations {
  /** Entries safe to write. */
  accepted: TranslatedEntry[];
  /** Entries withheld because a check reported `error` severity. */
  withheld: ValidationResult[];
  warnings: number;
  errors: number;
}

/**
 * Split freshly translated entries into the ones that may be written and the
 * ones a validation check rejected.
 *
 * An entry with an `error`-severity issue has lost a placeholder or had its ICU
 * structure rewritten by the engine, so writing it would put machine
 * scaffolding into the user's locale file. The caller keeps whatever the target
 * file already held for a withheld key and counts it as failed, so the lockfile
 * records `failed` and the next sync retries it.
 */
function screenTranslations(
  entries: readonly TranslatedEntry[],
  config: ResolvedSyncConfig
): ScreenedTranslations {
  if (
    entries.length === 0 ||
    config.validation?.validate_after_sync === false ||
    config.validation?.check_placeholders === false
  ) {
    return { accepted: [...entries], withheld: [], warnings: 0, errors: 0 };
  }

  const results = validateBatch(
    entries.map((e) => ({
      key: e.key,
      source: e.value,
      translation: e.translation,
    }))
  );

  const accepted: TranslatedEntry[] = [];
  const withheld: ValidationResult[] = [];
  let warnings = 0;
  let errors = 0;

  for (let i = 0; i < entries.length; i++) {
    const result = results[i];
    for (const issue of result?.issues ?? []) {
      if (issue.severity === 'warn') warnings++;
      if (issue.severity === 'error') errors++;
    }
    if (result?.severity === 'error') {
      withheld.push(result);
    } else {
      accepted.push(entries[i]!);
    }
  }

  return { accepted, withheld, warnings, errors };
}

/**
 * The keys `reconstruct` did not put into the content it returned.
 *
 * A run records a key as translated on the strength of the translation call, so
 * without this a parser that cannot place an entry — one added to the source
 * since the target file was written, and so with no slot in the template — lost
 * the string at exit 0, with the lockfile calling it translated and every gate
 * reading that as complete. Verifying the write is what keeps the lockfile a
 * record of the file rather than of the API call.
 *
 * Presence is the test, not equality: whether a written value round-trips
 * byte-for-byte is the escaping contract, checked per parser. A translation that
 * is deliberately the empty string is exempt, because PO and XLIFF read an empty
 * translation side as untranslated and leave the key out of the map by design.
 */
function unwrittenKeys(
  parser: FormatParser,
  written: string,
  entries: readonly TranslatedEntry[],
  locale: string | undefined
): Set<string> {
  const expected = entries.filter((entry) => entry.translation !== '');
  if (expected.length === 0) return new Set();

  let held: Map<string, string>;
  try {
    held = extractExistingTranslations(parser, written, locale);
  } catch {
    // Content this parser just produced and cannot read back is not a file any
    // of these keys can be claimed to be in.
    return new Set(expected.map((entry) => entry.key));
  }
  return new Set(
    expected.filter((entry) => !held.has(entry.key)).map((entry) => entry.key)
  );
}

function unwrittenKeysWarning(
  locale: string,
  targetRelPath: string,
  unwritten: ReadonlySet<string>
): string {
  const keys = [...unwritten];
  const shown = keys.slice(0, 3).map((key) => `"${key}"`);
  const more = keys.length > shown.length ? ', …' : '';
  const one = keys.length === 1;
  return (
    `${locale}: ${targetRelPath} could not be given ${keys.length} translated ` +
    `${one ? 'key' : 'keys'}: ${shown.join(', ')}${more}. ` +
    `${one ? 'It is' : 'They are'} recorded as failed rather than translated, so ` +
    `${one ? 'it' : 'they'} will not be reported as complete and the next sync retries ` +
    `${one ? 'it' : 'them'}. This usually means the target file has no element to hold ` +
    `${one ? 'it' : 'them'} — add the containing array or group to ${targetRelPath} and sync again.`
  );
}

function withheldKeysWarning(
  locale: string,
  targetRelPath: string,
  withheld: readonly ValidationResult[]
): string {
  const shown = withheld.slice(0, 3).map((w) => {
    const first =
      w.issues.find((i) => i.severity === 'error')?.message ??
      'validation error';
    return `"${w.key}" (${first})`;
  });
  const more = withheld.length > shown.length ? ', …' : '';
  const one = withheld.length === 1;
  return (
    `${locale}: withheld ${withheld.length} ${one ? 'translation' : 'translations'} from ` +
    `${targetRelPath} that failed validation: ${shown.join(', ')}${more}. ` +
    `${one ? 'It was' : 'They were'} not written and ${one ? 'is' : 'are'} recorded as failed, ` +
    `so the next sync retries ${one ? 'it' : 'them'}. Set validation.check_placeholders: false ` +
    `to write ${one ? 'it' : 'them'} anyway.`
  );
}

/**
 * Keys the target file holds that this rewrite will not write back, and that
 * neither the source file nor the lockfile accounts for.
 *
 * `reconstruct` is handed the complete desired key set, so anything absent from
 * it is removed from the file. For a key the lockfile records, that is the
 * intended prune of a key the source no longer has. A key the lockfile has never
 * heard of was not put there by this tool — a translator added it by hand — so
 * deleting it is outside what the run was asked to do. The prune itself is left
 * alone; what was undefensible is that it happened with no mention in the run
 * output, `sync status` or `sync validate`, and with the backup unlinked on
 * success, so nothing was recoverable and nothing said anything was lost.
 */
function droppedTargetOnlyKeys(
  existingTranslations: ReadonlyMap<string, string>,
  written: readonly TranslatedEntry[],
  diffs: readonly SyncDiff[]
): string[] {
  const writtenKeys = new Set(written.map((entry) => entry.key));
  // A `deleted` diff is a key the lockfile recorded that the source no longer
  // has, so pruning it is the point. The lockfile itself cannot answer this:
  // processBucket removes those entries before the locale loop runs, which makes
  // them indistinguishable there from a key it never recorded.
  const prunedKeys = new Set(
    diffs.filter((diff) => diff.status === 'deleted').map((diff) => diff.key)
  );
  return [...existingTranslations.keys()].filter(
    (key) => !writtenKeys.has(key) && !prunedKeys.has(key)
  );
}

function droppedTargetOnlyWarning(
  locale: string,
  targetRelPath: string,
  dropped: readonly string[]
): string {
  const shown = dropped.slice(0, 3).map((key) => `"${key}"`);
  const more = dropped.length > shown.length ? ', …' : '';
  const one = dropped.length === 1;
  return (
    `${locale}: ${targetRelPath} holds ${dropped.length} ${one ? 'key' : 'keys'} that the source file ` +
    `and .deepl-sync.lock both lack: ${shown.join(', ')}${more}. ` +
    `${one ? 'It has' : 'They have'} been removed, because a rewrite emits exactly the keys the source defines. ` +
    `If ${one ? 'it was' : 'they were'} added to the locale file on purpose, add ${one ? 'it' : 'them'} to the source ` +
    `file as well — or recover ${one ? 'it' : 'them'} from ${targetRelPath}${BACKUP_SUFFIX} before the next run.`
  );
}

export interface TranslateLocaleResult {
  fileResult: SyncFileResult;
  successfulKeys: string[];
  charactersBilled: number;
  billedPerKey: Map<string, number>;
  contextSentKeys: Set<string>;
  instructionSentKeys: Set<string>;
  instructionGroupCounts: Map<string, number>;
  targetEntries: Map<string, string>;
  validationWarnings: number;
  validationErrors: number;
}

export class LocaleTranslator {
  // tmCache remains instance-level on SyncService. The orchestrator resolves
  // TM IDs before calling LocaleTranslator.translate and passes the resolved
  // per-locale Map through the context; LocaleTranslator itself does not
  // resolve TM IDs.
  constructor(
    private readonly translationService: TranslationService,
    private readonly backupPaths: Set<string>,
    private readonly config: ResolvedSyncConfig,
    private readonly resolvedGlossaryId: string | undefined,
    private readonly resolvedTmId: string | undefined,
    private readonly forceBatch: boolean | undefined,
    private readonly onProgress: ((e: SyncProgressEvent) => void) | undefined,
    // `--force`: every key arrives as `new`, and re-translation is the point, so
    // the carry-forward below does not apply.
    private readonly force: boolean | undefined
  ) {}

  async translate(
    ctx: LocaleTranslatorContext
  ): Promise<TranslateLocaleResult> {
    const {
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
    } = ctx;
    const config = this.config;
    const resolvedGlossaryId = this.resolvedGlossaryId;
    const resolvedTmId = this.resolvedTmId;
    const forceBatch = this.forceBatch;

    const localeOverrides = config.translation?.locale_overrides?.[locale];
    const baseTranslationOpts: TranslationOptions = {
      sourceLang: config.source_locale as Language,
      targetLang: locale as Language,
      formality: localeOverrides?.formality ?? config.translation?.formality,
      glossaryId: localeGlossaryIds.get(locale) ?? resolvedGlossaryId,
      translationMemoryId: localeTmIds.get(locale) ?? resolvedTmId,
      translationMemoryThreshold:
        localeOverrides?.translation_memory_threshold ??
        config.translation?.translation_memory_threshold,
      modelType: config.translation?.model_type,
      customInstructions:
        localeOverrides?.custom_instructions ??
        config.translation?.custom_instructions,
      styleId: localeOverrides?.style_id ?? config.translation?.style_id,
      showBilledCharacters: true,
    };

    const existingTranslations =
      existingTargetEntries.get(locale) ?? new Map<string, string>();

    // A `new` key the target file already holds a translation for is not new to
    // the translator, only to the lockfile: first adoption of the tool, or a CI
    // checkout whose `.deepl-sync.lock` is gitignored, presents every key of an
    // already-translated catalog as `new`. Translating those would replace the
    // reviewer's text with machine output and drop the review markers the
    // formats carry, so carry the existing value forward exactly as a `current`
    // key's is below.
    //
    // A target value equal to the source is NOT a translation — a locale file
    // copied from the source starts out that way — and neither is an empty one.
    // Carrying either forward would record untranslated text as `translated`,
    // which no later run would correct. `--force` asks for re-translation of
    // every key by definition, so it skips the carry entirely.
    const carriedForward: SyncDiff[] = [];
    const needsTranslation = toTranslate.filter((d) => {
      if (this.force || d.status !== 'new') return true;
      const existing = existingTranslations.get(d.key);
      if (existing === undefined || existing === '' || existing === d.value) {
        return true;
      }
      carriedForward.push(d);
      return false;
    });
    if (carriedForward.length > 0) {
      Logger.verbose(
        `[verbose] ${locale}: ${carriedForward.length} key(s) absent from the lockfile already have a translation in the target file — carrying it forward rather than re-translating`
      );
    }

    // Deep-clone metadata per locale to prevent concurrent mutation
    const localeDiffs = needsTranslation.map((d) => ({
      ...d,
      metadata: d.metadata
        ? (JSON.parse(JSON.stringify(d.metadata)) as Record<string, unknown>)
        : undefined,
    }));

    const textsToTranslate = localeDiffs
      .map((d) => d.value)
      .filter((v): v is string => v !== undefined);

    const { extendedTexts: pluralExpanded, pluralSlots } = expandPlurals(
      textsToTranslate,
      localeDiffs
    );
    const { extendedTexts, icuMappings } = detectIcu(pluralExpanded);

    const preservationMaps: Map<string, string>[] = [];
    const protectedTexts = extendedTexts.map((text) => {
      const preservationMap = new Map<string, string>();
      const protected_ = preserveVariables(text, preservationMap);
      preservationMaps.push(preservationMap);
      return protected_;
    });

    // Three-way translation: per-key context vs. element instruction batch vs. plain batch
    let results: (TranslationResult | null)[];
    // Counts keys that actually came back translated, so the progress stream
    // never claims a key succeeded that translateBatch left empty.
    let completed = 0;
    const contextSentKeys = new Set<string>();
    const instructionSentKeys = new Set<string>();
    const instructionGroupCounts = new Map<string, number>();

    if (forceBatch === true || localeDiffs.length <= 1) {
      // --batch mode or single key: use existing batch behavior
      const contextForSingle =
        localeDiffs.length === 1
          ? (config.context?.overrides?.[localeDiffs[0]?.key ?? ''] ??
            keyContexts.get(localeDiffs[0]?.key ?? '')?.context)
          : undefined;
      if (contextForSingle && !forceBatch) {
        contextSentKeys.add(localeDiffs[0]!.key);
      }
      const translationOpts: TranslationOptions = {
        ...baseTranslationOpts,
        context: contextForSingle,
      };
      results = await this.translationService.translateBatch(
        protectedTexts,
        translationOpts
      );
      for (let i = 0; i < localeDiffs.length; i++) {
        if (!results[i]) continue;
        completed++;
        this.onProgress?.({
          type: 'key-translated',
          locale,
          file: relPath,
          key: localeDiffs[i]!.key,
          translated: completed,
          totalKeys: localeDiffs.length,
        });
      }
    } else {
      // Three-way partitioning: context (per-key) vs. element instruction (batched) vs. plain batch
      const localeSupportsInstructions = supportsCustomInstructions(locale);
      const contextIndices: number[] = [];
      const instructionGroups = new Map<string, number[]>(); // elementType → indices
      const batchIndices: number[] = [];

      for (let i = 0; i < localeDiffs.length; i++) {
        const diff = localeDiffs[i]!;
        const keyContext =
          config.context?.overrides?.[diff.key] ??
          keyContexts.get(diff.key)?.context;
        if (keyContext) {
          // Path B: per-key context takes priority
          contextIndices.push(i);
        } else if (localeSupportsInstructions) {
          const elementType = keyContexts.get(diff.key)?.elementType;
          const instruction = generateElementInstruction(
            elementType,
            config.translation?.instruction_templates
          );
          if (instruction) {
            // Path C: batch by element type with shared instructions
            const group = instructionGroups.get(elementType!) ?? [];
            group.push(i);
            instructionGroups.set(elementType!, group);
          } else {
            batchIndices.push(i);
          }
        } else {
          batchIndices.push(i);
        }
      }

      results = new Array<TranslationResult | null>(protectedTexts.length).fill(
        null
      );

      // Path A: batch translation for keys without context or instructions
      if (batchIndices.length > 0) {
        const batchTexts: string[] = [];
        const batchPMapIndices: number[] = [];
        for (const idx of batchIndices) {
          batchTexts.push(protectedTexts[idx]!);
          batchPMapIndices.push(idx);
        }
        const batchSet = new Set(batchIndices);
        for (const slot of pluralSlots) {
          if (batchSet.has(slot.diffIndex)) {
            batchTexts.push(protectedTexts[slot.textIndex]!);
            batchPMapIndices.push(slot.textIndex);
          }
        }
        const batchOpts: TranslationOptions = {
          ...baseTranslationOpts,
          context: undefined,
        };
        const batchResults = await this.translationService.translateBatch(
          batchTexts,
          batchOpts
        );
        for (let bi = 0; bi < batchPMapIndices.length; bi++) {
          results[batchPMapIndices[bi]!] = batchResults[bi] ?? null;
        }
        for (const idx of batchIndices) {
          if (!results[idx]) continue;
          completed++;
          this.onProgress?.({
            type: 'key-translated',
            locale,
            file: relPath,
            key: localeDiffs[idx]!.key,
            translated: completed,
            totalKeys: localeDiffs.length,
          });
        }
      }

      // Path C: batch by element type with shared custom_instructions
      for (const [elementType, indices] of instructionGroups) {
        instructionGroupCounts.set(
          elementType,
          (instructionGroupCounts.get(elementType) ?? 0) + indices.length
        );
        for (const idx of indices) {
          instructionSentKeys.add(localeDiffs[idx]!.key);
        }
        const instruction = generateElementInstruction(
          elementType,
          config.translation?.instruction_templates
        )!;
        const groupInstructions = mergeInstructions(
          baseTranslationOpts.customInstructions,
          instruction
        );

        const groupTexts: string[] = [];
        const groupPMapIndices: number[] = [];
        for (const idx of indices) {
          groupTexts.push(protectedTexts[idx]!);
          groupPMapIndices.push(idx);
        }
        const indicesSet = new Set(indices);
        for (const slot of pluralSlots) {
          if (indicesSet.has(slot.diffIndex)) {
            groupTexts.push(protectedTexts[slot.textIndex]!);
            groupPMapIndices.push(slot.textIndex);
          }
        }

        const groupOpts: TranslationOptions = {
          ...baseTranslationOpts,
          context: undefined,
          customInstructions: groupInstructions,
        };
        const groupResults = await this.translationService.translateBatch(
          groupTexts,
          groupOpts
        );
        for (let gi = 0; gi < groupPMapIndices.length; gi++) {
          results[groupPMapIndices[gi]!] = groupResults[gi] ?? null;
        }
        for (const idx of indices) {
          if (!results[idx]) continue;
          completed++;
          this.onProgress?.({
            type: 'key-translated',
            locale,
            file: relPath,
            key: localeDiffs[idx]!.key,
            translated: completed,
            totalKeys: localeDiffs.length,
          });
        }
      }

      // Path B: context keys — batch by section where possible, per-key for overrides
      if (contextIndices.length > 0) {
        for (const idx of contextIndices) {
          contextSentKeys.add(localeDiffs[idx]!.key);
        }

        // --no-batch forces true per-key; default uses section batching for multi-segment keys
        const forcePerKey = forceBatch === false;
        const perKeyIndices: number[] = [];
        const sectionGroups = new Map<string, number[]>();
        for (const idx of contextIndices) {
          const diff = localeDiffs[idx]!;
          const section = sectionContextKey(diff.key);
          if (
            forcePerKey ||
            config.context?.overrides?.[diff.key] ||
            !section
          ) {
            perKeyIndices.push(idx);
          } else {
            const group = sectionGroups.get(section) ?? [];
            group.push(idx);
            sectionGroups.set(section, group);
          }
        }

        // Path B1: section-batched context translation
        for (const [section, indices] of sectionGroups) {
          const sectionCtx = sectionToContext(section);

          // Track element instructions for keys in this section batch
          for (const idx of indices) {
            const elementType = keyContexts.get(
              localeDiffs[idx]!.key
            )?.elementType;
            const autoInstruction = localeSupportsInstructions
              ? generateElementInstruction(
                  elementType,
                  config.translation?.instruction_templates
                )
              : undefined;
            if (autoInstruction && elementType) {
              instructionSentKeys.add(localeDiffs[idx]!.key);
              instructionGroupCounts.set(
                elementType,
                (instructionGroupCounts.get(elementType) ?? 0) + 1
              );
            }
          }

          const groupTexts: string[] = [];
          const groupPMapIndices: number[] = [];
          for (const idx of indices) {
            groupTexts.push(protectedTexts[idx]!);
            groupPMapIndices.push(idx);
          }
          const sectionIndicesSet = new Set(indices);
          for (const slot of pluralSlots) {
            if (sectionIndicesSet.has(slot.diffIndex)) {
              groupTexts.push(protectedTexts[slot.textIndex]!);
              groupPMapIndices.push(slot.textIndex);
            }
          }

          const groupOpts: TranslationOptions = {
            ...baseTranslationOpts,
            context: sectionCtx,
          };
          const groupResults = await this.translationService.translateBatch(
            groupTexts,
            groupOpts
          );
          for (let gi = 0; gi < groupPMapIndices.length; gi++) {
            results[groupPMapIndices[gi]!] = groupResults[gi] ?? null;
          }
          for (const idx of indices) {
            if (!results[idx]) continue;
            completed++;
            this.onProgress?.({
              type: 'key-translated',
              locale,
              file: relPath,
              key: localeDiffs[idx]!.key,
              translated: completed,
              totalKeys: localeDiffs.length,
            });
          }
        }

        // Path B2: per-key for override keys and single-segment keys
        if (perKeyIndices.length > 0) {
          const concurrency = config.sync?.concurrency ?? 5;
          await mapWithConcurrency(
            perKeyIndices,
            async (idx) => {
              const diff = localeDiffs[idx]!;
              const keyContext =
                config.context?.overrides?.[diff.key] ??
                keyContexts.get(diff.key)?.context ??
                '';

              const elementType = keyContexts.get(diff.key)?.elementType;
              const autoInstruction = localeSupportsInstructions
                ? generateElementInstruction(
                    elementType,
                    config.translation?.instruction_templates
                  )
                : undefined;
              if (autoInstruction && elementType) {
                instructionSentKeys.add(diff.key);
                instructionGroupCounts.set(
                  elementType,
                  (instructionGroupCounts.get(elementType) ?? 0) + 1
                );
              }
              const lengthInstruction =
                localeSupportsInstructions &&
                config.translation?.length_limits?.enabled
                  ? generateLengthInstruction(
                      diff.value ?? '',
                      elementType,
                      locale,
                      config.translation.length_limits
                    )
                  : undefined;
              let perKeyInstructions = mergeInstructions(
                baseTranslationOpts.customInstructions,
                autoInstruction
              );
              perKeyInstructions = mergeInstructions(
                perKeyInstructions,
                lengthInstruction
              );

              const keyOpts: TranslationOptions = {
                ...baseTranslationOpts,
                context: keyContext,
                customInstructions: perKeyInstructions,
              };

              const keyTexts = [protectedTexts[idx]!];
              const keyTextIndices = [idx];
              for (const slot of pluralSlots) {
                if (slot.diffIndex === idx) {
                  keyTexts.push(protectedTexts[slot.textIndex]!);
                  keyTextIndices.push(slot.textIndex);
                }
              }

              const keyResults = await this.translationService.translateBatch(
                keyTexts,
                keyOpts
              );
              for (let ki = 0; ki < keyTextIndices.length; ki++) {
                results[keyTextIndices[ki]!] = keyResults[ki] ?? null;
              }
              if (!results[idx]) return;
              completed++;
              this.onProgress?.({
                type: 'key-translated',
                locale,
                file: relPath,
                key: diff.key,
                translated: completed,
                totalKeys: localeDiffs.length,
              });
            },
            concurrency
          );
        }
      }
    }

    // Restore placeholders in all results, replacing each entry rather than
    // editing it, so a result this batch shares with another index keeps its
    // own placeholders.
    for (let ri = 0; ri < results.length; ri++) {
      const pMap = preservationMaps[ri];
      const result = results[ri];
      if (result && pMap && pMap.size > 0) {
        results[ri] = {
          ...result,
          text: restorePlaceholders(result.text, pMap),
        };
      }
    }

    await reassembleIcu(
      this.translationService,
      results,
      icuMappings,
      baseTranslationOpts
    );
    // Validate before the plural write-backs below, which mutate the metadata
    // the parser reconstructs from: a withheld entry has to leave those forms in
    // the state an untouched key's would be in. `result.text` is already final
    // here — the write-backs only copy it into metadata.
    const screened = screenTranslations(
      localeDiffs.flatMap((diff, i) => {
        const result = results[i];
        return result && diff.value !== undefined
          ? [
              {
                key: diff.key,
                value: diff.value,
                translation: result.text,
                metadata: diff.metadata,
              },
            ]
          : [];
      }),
      config
    );
    const withheld: ValidationResult[] = [...screened.withheld];
    const withheldKeys = new Set(screened.withheld.map((w) => w.key));
    let localeValidationWarnings = screened.warnings;
    let localeValidationErrors = screened.errors;

    const withheldDiffIndices = new Set(
      localeDiffs.flatMap((diff, i) => (withheldKeys.has(diff.key) ? [i] : []))
    );

    writebackPlurals(results, pluralSlots, localeDiffs, withheldDiffIndices);

    for (let i = 0; i < localeDiffs.length; i++) {
      const diff = localeDiffs[i]!;
      const result = results[i];
      if (!result || !diff.metadata || withheldDiffIndices.has(i)) continue;

      if (diff.metadata['msgid_plural'] !== undefined) {
        const forms =
          (diff.metadata['plural_forms'] as Record<string, string>) ?? {};
        forms['msgstr[0]'] = result.text;
        diff.metadata['plural_forms'] = forms;
      }

      const androidPlurals = diff.metadata['plurals'] as
        Array<{ quantity: string; value: string }> | undefined;
      if (androidPlurals) {
        const primary = primaryPluralItem(androidPlurals);
        if (primary) primary.value = result.text;
      }
    }

    const translatedEntries: TranslatedEntry[] = [];
    /**
     * Existing translations of keys this run could not translate.
     *
     * `translateBatch` chunks at 50 texts and carries on when one chunk's
     * request fails, so those texts come back as empty slots. The entry list is
     * the complete desired key set, so omitting such a key deletes the
     * translation the target already shipped — for a key the run touched only to
     * re-translate it. Kept out of `successfulKeys` on purpose: the lockfile has
     * to record `failed` so the next run retries.
     */
    const failedCarryEntries: TranslatedEntry[] = [];
    let translated = 0;
    let failed = 0;
    let localeBilled = 0;
    const billedPerKey = new Map<string, number>();

    for (let i = 0; i < localeDiffs.length; i++) {
      const diff = localeDiffs[i]!;
      const result = results[i];
      if (result && diff.value !== undefined) {
        // Billed whether or not the translation is usable, so the reported
        // spend and the lock entry both record what was actually charged.
        if (result.billedCharacters) {
          localeBilled += result.billedCharacters;
          billedPerKey.set(diff.key, result.billedCharacters);
        }
        if (withheldKeys.has(diff.key)) {
          failed++;
          continue;
        }
        translatedEntries.push({
          key: diff.key,
          value: diff.value,
          translation: result.text,
          metadata: diff.metadata,
        });
        translated++;
      } else {
        failed++;
        const previous = existingTranslations.get(diff.key);
        if (previous !== undefined && diff.value !== undefined) {
          failedCarryEntries.push({
            key: diff.key,
            value: diff.value,
            translation: previous,
            metadata: withoutPluralForms(diff.metadata),
          });
        }
      }
    }

    for (let ri = textsToTranslate.length; ri < results.length; ri++) {
      if (results[ri]?.billedCharacters) {
        localeBilled += results[ri]!.billedCharacters!;
      }
    }

    const successfulKeys: string[] = translatedEntries.map((te) => te.key);

    const allTranslatedEntries: TranslatedEntry[] = [
      ...translatedEntries,
      ...failedCarryEntries,
    ];

    // Carried-forward keys count as successful so the lockfile records the
    // translation the target file holds. Left out, they would come back `new` on
    // every run — re-read, re-carried, and reported missing by `sync status`
    // forever.
    for (const diff of carriedForward) {
      allTranslatedEntries.push({
        key: diff.key,
        value: diff.value!,
        translation: existingTranslations.get(diff.key)!,
        metadata: withoutPluralForms(diff.metadata),
      });
      successfulKeys.push(diff.key);
    }

    // A withheld key still needs an entry: the list is the complete desired key
    // set, so leaving it out deletes the key from the target file rather than
    // leaving it alone. Carry the value the target file already had — the same
    // treatment a `current` key gets — and omit it only when the file has none.
    for (const rejected of screened.withheld) {
      const previous = existingTranslations.get(rejected.key);
      if (previous === undefined) continue;
      const diff = localeDiffs.find((d) => d.key === rejected.key);
      allTranslatedEntries.push({
        key: rejected.key,
        value: rejected.source,
        translation: previous,
        metadata: withoutPluralForms(diff?.metadata),
      });
    }
    const currentDiffs = diffs.filter((d) => d.status === 'current');
    const currentDiffByKey = new Map(currentDiffs.map((d) => [d.key, d]));
    const untranslatedCurrentKeys: string[] = [];
    for (const cd of currentDiffs) {
      if (cd.value === undefined) continue;
      const existingTranslation = existingTranslations.get(cd.key);
      const lockEntry = getOwnMember(fileLockEntries, cd.key);
      const hasLocaleTranslation =
        lockEntry?.translations[locale] !== undefined;
      if (existingTranslation !== undefined) {
        // Present in the target file — including a deliberately empty string,
        // which must be preserved rather than treated as missing. The same
        // goes for its plural forms, which this run is not translating.
        allTranslatedEntries.push({
          key: cd.key,
          value: cd.value,
          translation: existingTranslation,
          metadata: withoutPluralForms(cd.metadata),
        });
      } else {
        // No translation in the target file. Translate it, even when the
        // lockfile claims this locale already has one: that combination means
        // the target file was deleted or emptied. Writing the source value here
        // would record untranslated text as `translated`, which no later run
        // would correct.
        untranslatedCurrentKeys.push(cd.key);
        if (hasLocaleTranslation) {
          Logger.verbose(
            `[verbose] ${locale}: lockfile records a translation for "${cd.key}" but the target file has none — re-translating`
          );
        }
      }
    }

    // Translate current keys that have no translation for this locale (new locale scenario)
    if (untranslatedCurrentKeys.length > 0) {
      const textsForNewLocale = untranslatedCurrentKeys
        .map((key) => currentDiffByKey.get(key)!)
        .map((d) => d.value!)
        .filter((v): v is string => v !== null && v !== undefined);
      if (textsForNewLocale.length > 0) {
        const nlPreservationMaps: Map<string, string>[] = [];
        const nlProtectedTexts = textsForNewLocale.map((text) => {
          const pMap = new Map<string, string>();
          const protected_ = preserveVariables(text, pMap);
          nlPreservationMaps.push(pMap);
          return protected_;
        });

        const newLocaleOpts: TranslationOptions = {
          ...baseTranslationOpts,
          context: undefined,
        };
        const newLocaleResults = await this.translationService.translateBatch(
          nlProtectedTexts,
          newLocaleOpts
        );

        for (let ri = 0; ri < newLocaleResults.length; ri++) {
          const pMap = nlPreservationMaps[ri];
          const nlResult = newLocaleResults[ri];
          if (nlResult && pMap && pMap.size > 0) {
            newLocaleResults[ri] = {
              ...nlResult,
              text: restorePlaceholders(nlResult.text, pMap),
            };
          }
        }

        const newLocaleEntries: TranslatedEntry[] = [];
        for (let nli = 0; nli < untranslatedCurrentKeys.length; nli++) {
          const key = untranslatedCurrentKeys[nli]!;
          const cd = currentDiffByKey.get(key)!;
          const nlResult = newLocaleResults[nli];
          if (nlResult) {
            newLocaleEntries.push({
              key,
              value: cd.value!,
              translation: nlResult.text,
              metadata: cd.metadata,
            });
            translated++;
            if (nlResult.billedCharacters) {
              localeBilled += nlResult.billedCharacters;
            }
          } else {
            // Push nothing, matching the main path above. Writing cd.value as
            // the translation would record untranslated source text, which the
            // next run reads back as an existing translation and skips — the
            // source language would be frozen into the locale file for good.
            failed++;
          }
        }

        const nlScreened = screenTranslations(newLocaleEntries, config);
        localeValidationWarnings += nlScreened.warnings;
        localeValidationErrors += nlScreened.errors;
        withheld.push(...nlScreened.withheld);
        translated -= nlScreened.withheld.length;
        failed += nlScreened.withheld.length;
        for (const entry of nlScreened.accepted) {
          allTranslatedEntries.push(entry);
          successfulKeys.push(entry.key);
        }
      }
    }

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

    if (withheld.length > 0) {
      Logger.warn(withheldKeysWarning(locale, targetRelPath, withheld));
    }

    let templateContent = content;
    let targetExists = false;
    try {
      const existingTargetContent = await fs.promises.readFile(
        targetAbsPath,
        'utf-8'
      );
      if (existingTargetContent.trim()) {
        templateContent = existingTargetContent;
      }
      targetExists = true;
    } catch {
      templateContent = content;
    }

    if (
      targetExists &&
      config.sync?.backup !== false &&
      !this.backupPaths.has(targetAbsPath + BACKUP_SUFFIX)
    ) {
      const bakPath = targetAbsPath + BACKUP_SUFFIX;
      try {
        // COPYFILE_EXCL, because a backup already on disk is not ours to
        // replace. The guard above is per-process, so after a crash — where the
        // lockfile was never written and the backup holds the only surviving
        // copy of the user's file — the natural recovery action of re-running
        // sync used to overwrite that copy with machine output and then unlink
        // it on success, destroying the data at exit 0.
        await fs.promises.copyFile(
          targetAbsPath,
          bakPath,
          fs.constants.COPYFILE_EXCL
        );
        this.backupPaths.add(bakPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          // Deliberately not tracked, so this run's success path does not
          // unlink it either. The stale-backup sweep retires it on age.
          Logger.warn(
            `Keeping the existing backup ${targetRelPath}${BACKUP_SUFFIX} rather than replacing it: ` +
              'it is from an earlier run that did not finish and may hold content this run is about to overwrite. ' +
              `Move it aside to let ${targetRelPath} be backed up again.`
          );
        } else {
          Logger.warn(
            `Failed to backup ${targetRelPath}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    const droppedTargetOnly = droppedTargetOnlyKeys(
      existingTranslations,
      allTranslatedEntries,
      diffs
    );
    if (droppedTargetOnly.length > 0) {
      Logger.warn(
        droppedTargetOnlyWarning(locale, targetRelPath, droppedTargetOnly)
      );
    }

    const reconstructed = isMultiLocale
      ? parser.reconstruct(templateContent, allTranslatedEntries, locale)
      : parser.reconstruct(templateContent, allTranslatedEntries);
    await fs.promises.mkdir(path.dirname(targetAbsPath), { recursive: true });
    await atomicWriteFile(targetAbsPath, reconstructed, 'utf-8');

    const unwritten = unwrittenKeys(
      parser,
      reconstructed,
      allTranslatedEntries,
      isMultiLocale ? locale : undefined
    );

    const targetEntries = new Map<string, string>();
    for (const te of allTranslatedEntries) {
      if (unwritten.has(te.key)) continue;
      targetEntries.set(te.key, te.translation);
    }

    let writtenSuccessfulKeys = successfulKeys;
    if (unwritten.size > 0) {
      Logger.warn(unwrittenKeysWarning(locale, targetRelPath, unwritten));
      writtenSuccessfulKeys = successfulKeys.filter(
        (key) => !unwritten.has(key)
      );
      const lost = successfulKeys.length - writtenSuccessfulKeys.length;
      translated -= lost;
      failed += lost;
    }

    return {
      fileResult: {
        file: targetRelPath,
        locale,
        translated,
        skipped: currentDiffs.length + carriedForward.length,
        failed,
        written: true,
      },
      successfulKeys: writtenSuccessfulKeys,
      charactersBilled: localeBilled,
      billedPerKey,
      contextSentKeys,
      instructionSentKeys,
      instructionGroupCounts,
      targetEntries,
      validationWarnings: localeValidationWarnings,
      validationErrors: localeValidationErrors,
    };
  }
}
