import type { Language } from '../../../types/index.js';
import type { GlossaryService } from '../../../services/glossary.js';
import type { TranslationService } from '../../../services/translation.js';
import { resolveTranslationMemoryId } from '../../../services/translation-memory.js';
import type { TranslateOptions, TranslationParams } from './types.js';
import { buildTranslationOptions as buildBaseLegacy, resolveGlossaryId } from './translate-utils.js';

/**
 * Single source of truth for the *base* TranslateOptions mapping from CLI
 * flags — the shape all translate handlers (text, file, directory, document)
 * agreed on. Produces the same field set regardless of handler.
 *
 * Shared downstream shaping lives in `applySharedTmAndGlossary`; handlers
 * keep only handler-specific shaping (custom instructions, style id, XML tag
 * handling, multi-target stripping of `targetLang`, etc.).
 *
 * Intentional drift NOT folded in:
 *  - `SyncCommand` builds `TranslateOptions` from resolved config, not CLI
 *    flags (per-locale `formality` overrides, `context_sent` wiring, glossary
 *    and TM IDs resolved separately via LocaleTranslator). That construction
 *    stays in `src/sync/sync-locale-translator.ts`.
 *  - `customInstructions` and `styleId` are only meaningful for text and
 *    multi-target text translate; those handlers layer them in directly.
 *  - XML tag-handling parameters (`outlineDetection`, `splittingTags`, etc.)
 *    are text-handler-specific.
 */
export function buildBaseTranslationOptions(options: TranslateOptions): TranslationParams {
  return buildBaseLegacy(options);
}

/**
 * Resolve `--glossary` values to IDs and place them on `base`. One glossary is
 * assigned to `glossaryId` so the request keeps the shape — and cache key — it
 * had before multiple glossaries were supported; several go to `glossaryIds`,
 * in the order given, because the API applies the last glossary that defines a
 * conflicting term.
 *
 * Separate from `applySharedTmAndGlossary` because document translation
 * supports glossaries but not translation memories.
 */
export async function applyGlossarySelection<
  T extends { glossaryId?: string; glossaryIds?: string[] },
>(
  base: T,
  options: TranslateOptions,
  glossaryService: GlossaryService,
  targets?: Language[],
): Promise<void> {
  if (!options.glossary || options.glossary.length === 0) {
    return;
  }

  // --glossary already requires --from, so the pair is always known here.
  const expected =
    options.from && targets && targets.length > 0
      ? { from: options.from as Language, targets }
      : undefined;

  // Resolved sequentially so the service's resolution cache is populated
  // before the next name-or-ID lookup needs the glossary list.
  //
  // Deduplicated after resolution, because a name and its own UUID resolve to
  // the same glossary: naming one twice would otherwise flip the wire parameter
  // from glossary_id to glossary_ids, mint a third cache key for an identical
  // request, and spend two of the five slots the API allows.
  const ids: string[] = [];
  for (const nameOrId of options.glossary) {
    const id = await resolveGlossaryId(glossaryService, nameOrId, expected);
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }

  const [only] = ids;
  if (ids.length === 1 && only) {
    base.glossaryId = only;
  } else {
    base.glossaryIds = ids;
  }
}

export interface SharedTmAndGlossaryDeps {
  glossaryService: GlossaryService;
  translationService: TranslationService;
  targets: Language[];
  /**
   * Optional shared TM resolver cache. Defaults to a fresh per-call Map so
   * callers that don't already manage one get safe no-op behavior. Sync/watch
   * flows pass their session-scoped cache here.
   */
  tmCache?: Map<string, string>;
}

/**
 * Layer glossary + translation-memory resolution + tm-threshold + model-type
 * default onto a base `TranslationParams`-compatible object. Mutates `base`
 * in place so handlers can compose additional downstream shaping.
 *
 * Shared by the text + file handlers. All
 * validation (required `--from`, TM-requires-quality_optimized, extended-lang
 * constraints) remains in the caller so per-handler error messages are
 * preserved; this helper is called only after validation passes.
 *
 * The generic `T` lets callers pass a `TranslationParams` (text handler), a
 * `TranslationParams & { outputDir: string }` (file multi-target), or the
 * rest-spread object produced by multi-target text (which drops `targetLang`)
 * without TypeScript index-signature friction.
 */
export async function applySharedTmAndGlossary<
  T extends {
    glossaryId?: string;
    glossaryIds?: string[];
    translationMemoryId?: string;
    translationMemoryThreshold?: number;
    modelType?: TranslationParams['modelType'];
  },
>(
  base: T,
  options: TranslateOptions,
  deps: SharedTmAndGlossaryDeps,
): Promise<void> {
  await applyGlossarySelection(base, options, deps.glossaryService, deps.targets);

  if (options.translationMemory) {
    const cache = deps.tmCache ?? new Map<string, string>();
    base.translationMemoryId = await resolveTranslationMemoryId(
      deps.translationService,
      options.translationMemory,
      cache,
      { from: options.from as Language, targets: deps.targets },
    );
    if (options.tmThreshold !== undefined) {
      base.translationMemoryThreshold = options.tmThreshold;
    }
    base.modelType = base.modelType ?? 'quality_optimized';
  }
}
