/**
 * API-related type definitions
 */

import { Language, Formality } from './common';

export type ModelType =
  | 'quality_optimized'
  | 'prefer_quality_optimized'
  | 'latency_optimized';

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
  modelType?: ModelType;
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

// Document Translation Types

export type DocumentStatusCode = 'queued' | 'translating' | 'error' | 'done';

export interface DocumentHandle {
  documentId: string;
  documentKey: string;
}

export interface DocumentStatus {
  documentId: string;
  status: DocumentStatusCode;
  secondsRemaining?: number;
  billedCharacters?: number;
  errorMessage?: string;
}

export type DocumentOutputFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'html' | 'htm' | 'txt' | 'srt' | 'xlf' | 'xliff';

export interface DocumentTranslationOptions {
  sourceLang?: Language;
  targetLang: Language;
  filename?: string;
  formality?: Formality;
  glossaryId?: string;
  outputFormat?: DocumentOutputFormat;
}

// Glossary Types

export interface GlossaryLanguagePair {
  sourceLang: Language;
  targetLang: Language;
}
