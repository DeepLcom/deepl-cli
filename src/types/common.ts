/**
 * Common types used throughout the application
 */

export type Language =
  | 'ar'
  | 'bg'
  | 'cs'
  | 'da'
  | 'de'
  | 'el'
  | 'en'
  | 'es'
  | 'et'
  | 'fi'
  | 'fr'
  | 'hu'
  | 'id'
  | 'it'
  | 'ja'
  | 'ko'
  | 'lt'
  | 'lv'
  | 'nb'
  | 'nl'
  | 'pl'
  | 'pt'
  | 'ro'
  | 'ru'
  | 'sk'
  | 'sl'
  | 'sv'
  | 'tr'
  | 'uk'
  | 'zh';

export type Formality =
  | 'default'
  | 'more'
  | 'less'
  | 'prefer_more'
  | 'prefer_less';

export type OutputFormat = 'text' | 'json' | 'yaml' | 'table';
