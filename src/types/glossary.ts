/**
 * Glossary type definitions for v3 API
 */

import { Language } from './common.js';

/**
 * Glossary Info (v3 API structure)
 * Supports both single and multiple target languages
 */
export interface GlossaryInfo {
  glossary_id: string;
  name: string;
  source_lang: Language;
  target_langs: Language[]; // Always array (even for single target)
  dictionaries: LanguagePairInfo[];
  creation_time: string;
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
