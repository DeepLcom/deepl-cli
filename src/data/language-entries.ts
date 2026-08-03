/**
 * Supported DeepL languages, generated from GET /v3/languages.
 *
 * DO NOT EDIT BY HAND. Run "npm run generate:languages" to refresh, and
 * "npm run check:languages" to detect drift. Tiers are derived by
 * deriveLanguageEntry in ./language-registry.ts, not chosen here.
 *
 * The API is the authority on which languages exist; this snapshot exists so
 * the CLI can list and validate languages without a network call or API key.
 * It may therefore lag the API, which is why callers accept well-formed codes
 * it does not contain rather than rejecting them.
 */
import type { LanguageEntry } from './language-registry.js';

export const ENTRIES: LanguageEntry[] = [
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
  { code: 'nb', name: 'Norwegian (bokmål)', category: 'core' },
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
  { code: 'de-ch', name: 'German (Swiss)', category: 'regional', targetOnly: true },
  { code: 'de-de', name: 'German', category: 'regional', targetOnly: true },
  { code: 'en-gb', name: 'English (British)', category: 'regional', targetOnly: true },
  { code: 'en-us', name: 'English (American)', category: 'regional', targetOnly: true },
  { code: 'es-419', name: 'Spanish (Latin American)', category: 'regional', targetOnly: true },
  { code: 'fr-ca', name: 'French (Canadian)', category: 'regional', targetOnly: true },
  { code: 'fr-fr', name: 'French', category: 'regional', targetOnly: true },
  { code: 'pt-br', name: 'Portuguese (Brazilian)', category: 'regional', targetOnly: true },
  { code: 'pt-pt', name: 'Portuguese (European)', category: 'regional', targetOnly: true },
  { code: 'zh-hans', name: 'Chinese (simplified)', category: 'regional', targetOnly: true },
  { code: 'zh-hant', name: 'Chinese (traditional)', category: 'regional', targetOnly: true },

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
  { code: 'ckb', name: 'Kurdish (Sorani)', category: 'extended' },
  { code: 'cy', name: 'Welsh', category: 'extended' },
  { code: 'eo', name: 'Esperanto', category: 'extended' },
  { code: 'eu', name: 'Basque', category: 'extended' },
  { code: 'fa', name: 'Persian', category: 'extended' },
  { code: 'ga', name: 'Irish', category: 'extended' },
  { code: 'gl', name: 'Galician', category: 'extended' },
  { code: 'gn', name: 'Guarani', category: 'extended' },
  { code: 'gom', name: 'Konkani', category: 'extended' },
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
  { code: 'kmr', name: 'Kurdish (Kurmanji)', category: 'extended' },
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
  { code: 'my', name: 'Burmese', category: 'extended' },
  { code: 'ne', name: 'Nepali', category: 'extended' },
  { code: 'oc', name: 'Occitan', category: 'extended' },
  { code: 'om', name: 'Oromo', category: 'extended' },
  { code: 'pa', name: 'Punjabi', category: 'extended' },
  { code: 'pag', name: 'Pangasinan', category: 'extended' },
  { code: 'pam', name: 'Kapampangan', category: 'extended' },
  { code: 'prs', name: 'Dari', category: 'extended' },
  { code: 'ps', name: 'Pashto', category: 'extended' },
  { code: 'qu', name: 'Quechua', category: 'extended' },
  { code: 'sa', name: 'Sanskrit', category: 'extended' },
  { code: 'scn', name: 'Sicilian', category: 'extended' },
  { code: 'sq', name: 'Albanian', category: 'extended' },
  { code: 'sr', name: 'Serbian', category: 'extended' },
  { code: 'st', name: 'Sesotho', category: 'extended' },
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

/**
 * Target languages the Write API accepts, from resource=write.
 *
 * Unlike translation, `write` and `correct` reject a code outside this list
 * locally rather than deferring to the API: the supported set is small enough
 * to enumerate in the error, so naming the valid options beats a round trip.
 * That makes keeping this generated the thing that stops it going stale.
 *
 * `as const` is load-bearing -- the WriteLanguage union in src/types/api.ts is
 * derived from it, so adding a language upstream widens the type on regenerate
 * instead of needing a second hand edit.
 */
export const WRITE_TARGET_LANGUAGES = [
  'de',
  'en',
  'en-gb',
  'en-us',
  'es',
  'fr',
  'it',
  'ja',
  'ko',
  'pt',
  'pt-br',
  'pt-pt',
  'zh',
  'zh-hans',
] as const;
