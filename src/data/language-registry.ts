/**
 * Language Registry
 *
 * Lookup and classification helpers over the generated language snapshot in
 * ./language-entries.ts. GET /v3/languages is the authority on which languages
 * exist; the snapshot is a build artifact of it, so that listing and validating
 * languages works without a network call or an API key.
 *
 * Because the snapshot can lag the API, callers that validate user input accept
 * well-formed codes it does not contain (see looksLikeLanguageTag) instead of
 * rejecting them.
 *
 * Languages are organized into three categories that determine feature availability:
 * - **core**: Full feature support (formality, glossary, all model types)
 * - **regional**: Target-only variants of core languages (e.g., en-gb, pt-br)
 * - **extended**: quality_optimized model only; no formality or glossary support
 */
import { ENTRIES as GENERATED_ENTRIES } from './language-entries.js';

/**
 * Feature-availability tier for a language.
 * Determines which API features (formality, glossary, model types) are available.
 */
export type LanguageCategory = 'core' | 'regional' | 'extended';

/**
 * A single language entry in the registry.
 * @property code - ISO 639 language code (lowercase), e.g. 'de', 'en-gb', 'zh-hans'
 * @property name - Human-readable display name
 * @property category - Feature-availability tier
 * @property targetOnly - When true, the language can only be used as a translation target
 *   (not as a source). Applies to regional variants like 'en-gb' and 'pt-br'.
 */
export interface LanguageEntry {
  readonly code: string;
  readonly name: string;
  readonly category: LanguageCategory;
  readonly targetOnly?: boolean;
}

/**
 * The snapshot as plain entries. It is generated `as const` so the `Language`
 * union can derive from its codes; the lookups below want the interface rather
 * than one literal type per language.
 *
 * `LanguageEntry`'s fields are `readonly` because the accessors below hand out
 * these very objects: a caller mutating one would change the registry for the
 * whole process, which the generated `as const` tuple forbids but a widened
 * element type would have silently permitted.
 */
const ENTRIES: readonly LanguageEntry[] = GENERATED_ENTRIES;

/** Read-only map of language code to its registry entry. Primary lookup structure. */
export const LANGUAGE_REGISTRY: ReadonlyMap<string, LanguageEntry> = new Map(
  ENTRIES.map(entry => [entry.code, entry])
);

/** The fields of a GET /v3/languages entry the derivation below depends on. */
export interface DerivableLanguage {
  lang: string;
  name: string;
  usable_as_source?: boolean;
  features?: Record<string, unknown>;
}

/**
 * Derives a registry entry from one GET /v3/languages entry. The tiers are not
 * a human judgement: glossary support separates extended from the rest, and
 * source usability separates core from regional.
 *
 * Shared with scripts/generate-language-registry.mjs so the snapshot and the
 * runtime fallback for codes it does not list cannot disagree.
 */
export function deriveLanguageEntry(language: DerivableLanguage): LanguageEntry {
  const code = language.lang.toLowerCase();
  const usableAsSource = language.usable_as_source !== false;

  // An empty matrix is evidence — it says the language supports none of them,
  // glossary included — while a missing one says nothing. Since the extended
  // tier is what refuses formality and glossary before a request is sent,
  // silence must not put a language there; tiering it by source usability
  // leaves the judgement to the API instead.
  const described = language.features !== undefined;
  const supportsGlossary = language.features?.['glossary'] !== undefined;

  const category: LanguageCategory = described && !supportsGlossary
    ? 'extended'
    : usableAsSource
      ? 'core'
      : 'regional';

  return {
    code,
    name: language.name,
    category,
    ...(!usableAsSource && { targetOnly: true }),
  };
}

/**
 * Whether a code is shaped like a language tag DeepL might serve. Used where the
 * API is the authority on what exists: a well-formed code the snapshot has not
 * heard of is passed through for the API to accept or reject, while malformed
 * input is still worth rejecting locally with a suggestion.
 */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;

export function looksLikeLanguageTag(code: string): boolean {
  return LANGUAGE_TAG.test(code);
}

/**
 * The base language of a code, dropping any regional subtag: `en-us` -> `en`.
 * For comparisons where one side carries variants the other cannot -- glossary
 * dictionaries name base languages only, while `--to` accepts `en-us`, `pt-br`
 * and the rest.
 */
export function baseLanguage(code: string): string {
  return code.toLowerCase().split('-')[0] ?? code.toLowerCase();
}

/** Check whether a language code is recognized by the registry. */
export function isValidLanguage(code: string): boolean {
  return LANGUAGE_REGISTRY.has(code);
}

/** Check whether a language belongs to the 'extended' tier (quality_optimized only). */
export function isExtendedLanguage(code: string): boolean {
  const entry = LANGUAGE_REGISTRY.get(code);
  return entry?.category === 'extended';
}

/** Return the human-readable name for a language code, or undefined if not found. */
export function getLanguageName(code: string): string | undefined {
  return LANGUAGE_REGISTRY.get(code)?.name;
}

/** Return all languages that can be used as a source language (excludes regional target-only variants). */
export function getSourceLanguages(): LanguageEntry[] {
  return ENTRIES.filter(e => !e.targetOnly);
}

/** Return all languages that can be used as a target language (includes regional variants). */
export function getTargetLanguages(): LanguageEntry[] {
  return [...ENTRIES];
}

/** Return the set of all known language codes (core + regional + extended). */
export function getAllLanguageCodes(): ReadonlySet<string> {
  return new Set(ENTRIES.map(e => e.code));
}

/** Return only the extended-tier language codes (no formality/glossary support). */
export function getExtendedLanguageCodes(): ReadonlySet<string> {
  return new Set(ENTRIES.filter(e => e.category === 'extended').map(e => e.code));
}
