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

export interface WriteOptions {
  lang: Language;
  tone?:
    | 'default'
    | 'business'
    | 'academic'
    | 'casual'
    | 'enthusiastic'
    | 'diplomatic';
  fix?: boolean;
}

export interface Suggestion {
  type: 'grammar' | 'spelling' | 'style' | 'punctuation';
  original: string;
  suggestion: string;
  start: number;
  end: number;
  confidence: number;
  alternatives?: string[];
}

export interface WriteResult {
  originalText: string;
  improvedText: string;
  suggestions: Suggestion[];
  applied: boolean;
}
