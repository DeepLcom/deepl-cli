import type { SyncLockFile } from './types.js';

export interface TermInconsistency {
  sourceText: string;
  locale: string;
  translations: string[];
  files: string[];
}

export interface GlossaryReport {
  totalTerms: number;
  inconsistencies: TermInconsistency[];
}

/**
 * Nested map surfaced from target files: filePath -> locale -> key -> translated text.
 * When provided, the report emits actual translated strings in `translations[]`
 * instead of opaque content-hash identifiers. When absent (or when a target
 * file is missing for a specific locale), the hash falls through as the
 * identity proxy — this keeps detection consistent but the display
 * less human-readable.
 */
export type TargetTranslationIndex = Map<string, Map<string, Map<string, string>>>;

export function generateGlossaryReport(
  lockFile: SyncLockFile,
  targetTranslations?: TargetTranslationIndex,
): GlossaryReport {
  // Group translations by (sourceText, locale)
  const termMap = new Map<string, Map<string, { translations: Set<string>; files: Set<string> }>>();

  for (const [filePath, entries] of Object.entries(lockFile.entries)) {
    for (const [key, entry] of Object.entries(entries)) {
      const source = entry.source_text;
      if (!source) continue;

      let localeMap = termMap.get(source);
      if (!localeMap) {
        localeMap = new Map();
        termMap.set(source, localeMap);
      }

      for (const [locale, translation] of Object.entries(entry.translations)) {
        if (translation.status !== 'translated') continue;

        let localeEntry = localeMap.get(locale);
        if (!localeEntry) {
          localeEntry = { translations: new Set(), files: new Set() };
          localeMap.set(locale, localeEntry);
        }

        const actualText = targetTranslations?.get(filePath)?.get(locale)?.get(key);
        // Prefer real translated text; fall back to hash as identity when
        // the target file is unavailable. Hashes are meaningless to readers
        // but preserve inconsistency detection if translations diverge.
        localeEntry.translations.add(actualText ?? translation.hash);
        localeEntry.files.add(filePath);
      }
    }
  }

  const inconsistencies: TermInconsistency[] = [];
  for (const [sourceText, localeMap] of termMap) {
    for (const [locale, data] of localeMap) {
      if (data.translations.size > 1) {
        inconsistencies.push({
          sourceText,
          locale,
          translations: [...data.translations],
          files: [...data.files],
        });
      }
    }
  }

  inconsistencies.sort((a, b) => a.sourceText.localeCompare(b.sourceText));

  return {
    totalTerms: termMap.size,
    inconsistencies,
  };
}
