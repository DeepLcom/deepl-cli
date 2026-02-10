/**
 * Common types used throughout the application
 */

export type Language =
  // Core languages (full feature support: formality, glossaries, all model types)
  | 'ar' | 'bg' | 'cs' | 'da' | 'de' | 'el' | 'en' | 'es' | 'et' | 'fi'
  | 'fr' | 'he' | 'hu' | 'id' | 'it' | 'ja' | 'ko' | 'lt' | 'lv' | 'nb'
  | 'nl' | 'pl' | 'pt' | 'ro' | 'ru' | 'sk' | 'sl' | 'sv' | 'tr' | 'uk'
  | 'vi' | 'zh'
  // Target-only regional variants
  | 'en-gb' | 'en-us' | 'es-419' | 'pt-br' | 'pt-pt' | 'zh-hans' | 'zh-hant'
  // Extended languages (quality_optimized only, no formality/glossary support)
  | 'ace' | 'af' | 'an' | 'as' | 'ay' | 'az' | 'ba' | 'be' | 'bho' | 'bn'
  | 'br' | 'bs' | 'ca' | 'ceb' | 'ckb' | 'cy' | 'eo' | 'eu' | 'fa' | 'ga'
  | 'gl' | 'gn' | 'gom' | 'gu' | 'ha' | 'hi' | 'hr' | 'ht' | 'hy' | 'ig'
  | 'is' | 'jv' | 'ka' | 'kk' | 'kmr' | 'ky' | 'la' | 'lb' | 'lmo' | 'ln'
  | 'mai' | 'mg' | 'mi' | 'mk' | 'ml' | 'mn' | 'mr' | 'ms' | 'mt' | 'my'
  | 'ne' | 'oc' | 'om' | 'pa' | 'pag' | 'pam' | 'prs' | 'ps' | 'qu' | 'sa'
  | 'scn' | 'sq' | 'sr' | 'st' | 'su' | 'sw' | 'ta' | 'te' | 'tg' | 'th'
  | 'tk' | 'tl' | 'tn' | 'ts' | 'tt' | 'ur' | 'uz' | 'wo' | 'xh' | 'yi'
  | 'yue' | 'zu';

export type Formality =
  | 'default'
  | 'more'
  | 'less'
  | 'prefer_more'
  | 'prefer_less';

export type OutputFormat = 'text' | 'json' | 'table';
