/**
 * API-related type definitions
 */

import { Language, Formality } from './common';

export interface TranslationOptions {
  sourceLang?: Language;
  targetLang: Language;
  glossaryId?: string;
  formality?: Formality;
  preserveFormatting?: boolean;
  preserveCode?: boolean;
  preserveVars?: boolean;
  context?: string;
  splitSentences?: 'on' | 'off' | 'nonewlines';
  tagHandling?: 'xml' | 'html';
}

export interface TranslationResult {
  text: string;
  detectedSourceLang?: Language;
  confidence?: number;
  cached: boolean;
  usage?: {
    characterCount: number;
    billableCharacters: number;
  };
}

export type WriteLanguage =
  | 'de'
  | 'en-GB'
  | 'en-US'
  | 'es'
  | 'fr'
  | 'it'
  | 'pt-BR'
  | 'pt-PT';

export type WritingStyle =
  | 'default'
  | 'simple'
  | 'business'
  | 'academic'
  | 'casual'
  | 'prefer_simple'
  | 'prefer_business'
  | 'prefer_academic'
  | 'prefer_casual';

export type WriteTone =
  | 'default'
  | 'enthusiastic'
  | 'friendly'
  | 'confident'
  | 'diplomatic'
  | 'prefer_enthusiastic'
  | 'prefer_friendly'
  | 'prefer_confident'
  | 'prefer_diplomatic';

export interface WriteOptions {
  targetLang: WriteLanguage;
  writingStyle?: WritingStyle;
  tone?: WriteTone;
}

export interface WriteImprovement {
  text: string;
  targetLanguage: WriteLanguage;
  detectedSourceLanguage?: string;
}

export interface WriteResult {
  improvements: WriteImprovement[];
}
