/**
 * Glossary type definitions for v3 API
 */

import { Language } from './common.js';

/**
 * Raw API response from DeepL v3 glossary endpoints
 * This matches the actual API response structure
 */
export interface GlossaryApiResponse {
  glossary_id: string;
  name: string;
  ready?: boolean; // Indicates if glossary is ready (may be absent)
  dictionaries: LanguagePairInfo[];
  creation_time: string;
}

/**
 * Normalized Glossary Info (used internally in the CLI)
 * Adds derived fields for convenience
 */
export interface GlossaryInfo extends GlossaryApiResponse {
  source_lang: Language; // Derived from dictionaries
  target_langs: Language[]; // Derived from dictionaries (unique targets)
}

/**
 * Language pair within glossary
 */
export interface LanguagePairInfo {
  source_lang: Language;
  target_lang: Language;
  entry_count: number;
}

/**
 * Transform raw API response to normalized GlossaryInfo
 * Derives source_lang and target_langs from dictionaries
 */
export function normalizeGlossaryInfo(response: GlossaryApiResponse): GlossaryInfo {
  // Extract unique source and target languages from dictionaries
  const sourceLangs = new Set<Language>();
  const targetLangs = new Set<Language>();

  response.dictionaries.forEach(dict => {
    sourceLangs.add(dict.source_lang.toLowerCase() as Language);
    targetLangs.add(dict.target_lang.toLowerCase() as Language);
  });

  // For v3 glossaries, there should be one source language
  // (but dictionaries might be empty if still processing)
  const source_lang = sourceLangs.size > 0
    ? Array.from(sourceLangs)[0]!
    : 'en' as Language; // Fallback (shouldn't happen in practice)

  return {
    ...response,
    source_lang,
    target_langs: Array.from(targetLangs),
  };
}

/**
 * Helper: Check if glossary has multiple language pairs
 */
export function isMultilingual(glossary: GlossaryInfo): boolean {
  return glossary.target_langs.length > 1;
}

/**
 * Helper: Get total entry count across all dictionaries
 */
export function getTotalEntryCount(glossary: GlossaryInfo): number {
  return glossary.dictionaries.reduce((sum, dict) => sum + dict.entry_count, 0);
}

/**
 * Helper: Get target language (specified or default to first)
 * Throws error if target is required but not provided
 */
export function getTargetLang(glossary: GlossaryInfo, targetLang?: Language): Language {
  // If specified, validate it exists
  if (targetLang) {
    if (!glossary.target_langs.includes(targetLang)) {
      throw new Error(
        `Target language "${targetLang}" not found in glossary.\n` +
          `Available: ${glossary.target_langs.join(', ')}`
      );
    }
    return targetLang;
  }

  // Otherwise, must be single-target glossary
  if (glossary.target_langs.length === 0) {
    throw new Error('Glossary has no target languages');
  }

  if (glossary.target_langs.length > 1) {
    throw new Error(
      `This glossary contains multiple language pairs: ${glossary.target_langs.join(', ')}\n` +
        `Please specify which pair using --target flag`
    );
  }

  return glossary.target_langs[0]!; // Safe: length === 1
}
