/**
 * Language Registry
 * Single source of truth for all supported language codes, names, and categories.
 */

export type LanguageCategory = 'core' | 'regional' | 'extended';

export interface LanguageEntry {
  code: string;
  name: string;
  category: LanguageCategory;
  targetOnly?: boolean;
}

const ENTRIES: LanguageEntry[] = [
  // Core languages (full feature support: formality, glossary, all model types)
  { code: 'ar', name: 'Arabic', category: 'core' },
  { code: 'bg', name: 'Bulgarian', category: 'core' },
  { code: 'cs', name: 'Czech', category: 'core' },
  { code: 'da', name: 'Danish', category: 'core' },
  { code: 'de', name: 'German', category: 'core' },
  { code: 'el', name: 'Greek', category: 'core' },
  { code: 'en', name: 'English', category: 'core' },
  { code: 'es', name: 'Spanish', category: 'core' },
  { code: 'et', name: 'Estonian', category: 'core' },
  { code: 'fi', name: 'Finnish', category: 'core' },
  { code: 'fr', name: 'French', category: 'core' },
  { code: 'he', name: 'Hebrew', category: 'core' },
  { code: 'hu', name: 'Hungarian', category: 'core' },
  { code: 'id', name: 'Indonesian', category: 'core' },
  { code: 'it', name: 'Italian', category: 'core' },
  { code: 'ja', name: 'Japanese', category: 'core' },
  { code: 'ko', name: 'Korean', category: 'core' },
  { code: 'lt', name: 'Lithuanian', category: 'core' },
  { code: 'lv', name: 'Latvian', category: 'core' },
  { code: 'nb', name: 'Norwegian Bokmål', category: 'core' },
  { code: 'nl', name: 'Dutch', category: 'core' },
  { code: 'pl', name: 'Polish', category: 'core' },
  { code: 'pt', name: 'Portuguese', category: 'core' },
  { code: 'ro', name: 'Romanian', category: 'core' },
  { code: 'ru', name: 'Russian', category: 'core' },
  { code: 'sk', name: 'Slovak', category: 'core' },
  { code: 'sl', name: 'Slovenian', category: 'core' },
  { code: 'sv', name: 'Swedish', category: 'core' },
  { code: 'tr', name: 'Turkish', category: 'core' },
  { code: 'uk', name: 'Ukrainian', category: 'core' },
  { code: 'vi', name: 'Vietnamese', category: 'core' },
  { code: 'zh', name: 'Chinese', category: 'core' },

  // Regional variants (target-only)
  { code: 'en-gb', name: 'English (British)', category: 'regional', targetOnly: true },
  { code: 'en-us', name: 'English (American)', category: 'regional', targetOnly: true },
  { code: 'es-419', name: 'Spanish (Latin America)', category: 'regional', targetOnly: true },
  { code: 'pt-br', name: 'Portuguese (Brazilian)', category: 'regional', targetOnly: true },
  { code: 'pt-pt', name: 'Portuguese (European)', category: 'regional', targetOnly: true },
  { code: 'zh-hans', name: 'Chinese (Simplified)', category: 'regional', targetOnly: true },
  { code: 'zh-hant', name: 'Chinese (Traditional)', category: 'regional', targetOnly: true },

  // Extended languages (quality_optimized only, no formality/glossary)
  { code: 'ace', name: 'Acehnese', category: 'extended' },
  { code: 'af', name: 'Afrikaans', category: 'extended' },
  { code: 'an', name: 'Aragonese', category: 'extended' },
  { code: 'as', name: 'Assamese', category: 'extended' },
  { code: 'ay', name: 'Aymara', category: 'extended' },
  { code: 'az', name: 'Azerbaijani', category: 'extended' },
  { code: 'ba', name: 'Bashkir', category: 'extended' },
  { code: 'be', name: 'Belarusian', category: 'extended' },
  { code: 'bho', name: 'Bhojpuri', category: 'extended' },
  { code: 'bn', name: 'Bengali', category: 'extended' },
  { code: 'br', name: 'Breton', category: 'extended' },
  { code: 'bs', name: 'Bosnian', category: 'extended' },
  { code: 'ca', name: 'Catalan', category: 'extended' },
  { code: 'ceb', name: 'Cebuano', category: 'extended' },
  { code: 'ckb', name: 'Central Kurdish', category: 'extended' },
  { code: 'cy', name: 'Welsh', category: 'extended' },
  { code: 'eo', name: 'Esperanto', category: 'extended' },
  { code: 'eu', name: 'Basque', category: 'extended' },
  { code: 'fa', name: 'Persian', category: 'extended' },
  { code: 'ga', name: 'Irish', category: 'extended' },
  { code: 'gl', name: 'Galician', category: 'extended' },
  { code: 'gn', name: 'Guarani', category: 'extended' },
  { code: 'gom', name: 'Goan Konkani', category: 'extended' },
  { code: 'gu', name: 'Gujarati', category: 'extended' },
  { code: 'ha', name: 'Hausa', category: 'extended' },
  { code: 'hi', name: 'Hindi', category: 'extended' },
  { code: 'hr', name: 'Croatian', category: 'extended' },
  { code: 'ht', name: 'Haitian Creole', category: 'extended' },
  { code: 'hy', name: 'Armenian', category: 'extended' },
  { code: 'ig', name: 'Igbo', category: 'extended' },
  { code: 'is', name: 'Icelandic', category: 'extended' },
  { code: 'jv', name: 'Javanese', category: 'extended' },
  { code: 'ka', name: 'Georgian', category: 'extended' },
  { code: 'kk', name: 'Kazakh', category: 'extended' },
  { code: 'kmr', name: 'Northern Kurdish', category: 'extended' },
  { code: 'ky', name: 'Kyrgyz', category: 'extended' },
  { code: 'la', name: 'Latin', category: 'extended' },
  { code: 'lb', name: 'Luxembourgish', category: 'extended' },
  { code: 'lmo', name: 'Lombard', category: 'extended' },
  { code: 'ln', name: 'Lingala', category: 'extended' },
  { code: 'mai', name: 'Maithili', category: 'extended' },
  { code: 'mg', name: 'Malagasy', category: 'extended' },
  { code: 'mi', name: 'Maori', category: 'extended' },
  { code: 'mk', name: 'Macedonian', category: 'extended' },
  { code: 'ml', name: 'Malayalam', category: 'extended' },
  { code: 'mn', name: 'Mongolian', category: 'extended' },
  { code: 'mr', name: 'Marathi', category: 'extended' },
  { code: 'ms', name: 'Malay', category: 'extended' },
  { code: 'mt', name: 'Maltese', category: 'extended' },
  { code: 'my', name: 'Myanmar (Burmese)', category: 'extended' },
  { code: 'ne', name: 'Nepali', category: 'extended' },
  { code: 'oc', name: 'Occitan', category: 'extended' },
  { code: 'om', name: 'Oromo', category: 'extended' },
  { code: 'pa', name: 'Punjabi', category: 'extended' },
  { code: 'pag', name: 'Pangasinan', category: 'extended' },
  { code: 'pam', name: 'Pampanga', category: 'extended' },
  { code: 'prs', name: 'Dari', category: 'extended' },
  { code: 'ps', name: 'Pashto', category: 'extended' },
  { code: 'qu', name: 'Quechua', category: 'extended' },
  { code: 'sa', name: 'Sanskrit', category: 'extended' },
  { code: 'scn', name: 'Sicilian', category: 'extended' },
  { code: 'sq', name: 'Albanian', category: 'extended' },
  { code: 'sr', name: 'Serbian', category: 'extended' },
  { code: 'st', name: 'Southern Sotho', category: 'extended' },
  { code: 'su', name: 'Sundanese', category: 'extended' },
  { code: 'sw', name: 'Swahili', category: 'extended' },
  { code: 'ta', name: 'Tamil', category: 'extended' },
  { code: 'te', name: 'Telugu', category: 'extended' },
  { code: 'tg', name: 'Tajik', category: 'extended' },
  { code: 'th', name: 'Thai', category: 'extended' },
  { code: 'tk', name: 'Turkmen', category: 'extended' },
  { code: 'tl', name: 'Tagalog', category: 'extended' },
  { code: 'tn', name: 'Tswana', category: 'extended' },
  { code: 'ts', name: 'Tsonga', category: 'extended' },
  { code: 'tt', name: 'Tatar', category: 'extended' },
  { code: 'ur', name: 'Urdu', category: 'extended' },
  { code: 'uz', name: 'Uzbek', category: 'extended' },
  { code: 'wo', name: 'Wolof', category: 'extended' },
  { code: 'xh', name: 'Xhosa', category: 'extended' },
  { code: 'yi', name: 'Yiddish', category: 'extended' },
  { code: 'yue', name: 'Cantonese', category: 'extended' },
  { code: 'zu', name: 'Zulu', category: 'extended' },
];

export const LANGUAGE_REGISTRY: ReadonlyMap<string, LanguageEntry> = new Map(
  ENTRIES.map(entry => [entry.code, entry])
);

export function isValidLanguage(code: string): boolean {
  return LANGUAGE_REGISTRY.has(code);
}

export function isExtendedLanguage(code: string): boolean {
  const entry = LANGUAGE_REGISTRY.get(code);
  return entry?.category === 'extended';
}

export function getLanguageName(code: string): string | undefined {
  return LANGUAGE_REGISTRY.get(code)?.name;
}

export function getSourceLanguages(): LanguageEntry[] {
  return ENTRIES.filter(e => !e.targetOnly);
}

export function getTargetLanguages(): LanguageEntry[] {
  return [...ENTRIES];
}

export function getAllLanguageCodes(): ReadonlySet<string> {
  return new Set(ENTRIES.map(e => e.code));
}

export function getExtendedLanguageCodes(): ReadonlySet<string> {
  return new Set(ENTRIES.filter(e => e.category === 'extended').map(e => e.code));
}
