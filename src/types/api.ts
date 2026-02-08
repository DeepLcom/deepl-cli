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
  context?: string;
  splitSentences?: 'on' | 'off' | 'nonewlines';
  tagHandling?: 'xml' | 'html';
  modelType?: ModelType;
  showBilledCharacters?: boolean;
  outlineDetection?: boolean;
  splittingTags?: string[];
  nonSplittingTags?: string[];
  ignoreTags?: string[];
  customInstructions?: string[];
  styleId?: string;
  tagHandlingVersion?: 'v1' | 'v2';
  enableBetaLanguages?: boolean;
}

export type WriteLanguage =
  | 'de'
  | 'en'
  | 'en-GB'
  | 'en-US'
  | 'es'
  | 'fr'
  | 'it'
  | 'pt'
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
  targetLang?: WriteLanguage;
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
  enableDocumentMinification?: boolean;
  enableBetaLanguages?: boolean;
}

// Glossary Types

export interface GlossaryLanguagePair {
  sourceLang: Language;
  targetLang: Language;
}

// Style Rules Types

export interface StyleRule {
  styleId: string;
  name: string;
  language: string;
  version: number;
  creationTime: string;
  updatedTime: string;
}

export interface CustomInstruction {
  label: string;
  prompt: string;
  sourceLanguage?: string;
}

export interface StyleRuleDetailed extends StyleRule {
  configuredRules: string[];
  customInstructions: CustomInstruction[];
}

export interface StyleRulesListOptions {
  detailed?: boolean;
  page?: number;
  pageSize?: number;
}

// Admin API Types

export interface AdminApiKey {
  keyId: string;
  key?: string;
  label: string;
  creationTime: string;
  isDeactivated: boolean;
  usageLimits?: {
    characters?: number | null;
    speechToTextMilliseconds?: number | null;
  };
}

export interface UsageBreakdown {
  totalCharacters: number;
  textTranslationCharacters: number;
  documentTranslationCharacters: number;
  textImprovementCharacters: number;
  speechToTextMilliseconds: number;
}

export interface AdminUsageEntry {
  apiKey?: string;
  apiKeyLabel?: string;
  usageDate?: string;
  usage: UsageBreakdown;
}

export interface AdminUsageReport {
  totalUsage: UsageBreakdown;
  startDate: string;
  endDate: string;
  groupBy?: string;
  entries: AdminUsageEntry[];
}

export interface AdminUsageOptions {
  startDate: string;
  endDate: string;
  groupBy?: 'key' | 'key_and_day';
}
