/**
 * API-related type definitions
 */

import { Language, Formality } from './common';
import { WRITE_TARGET_LANGUAGES } from '../data/language-entries.js';

export type ModelType =
  | 'quality_optimized'
  | 'prefer_quality_optimized'
  | 'latency_optimized';

export interface TranslationOptions {
  sourceLang?: Language;
  targetLang: Language;
  glossaryId?: string;
  /**
   * Two to five glossaries applied to one request. Their entries are merged;
   * when more than one defines the same source term the last one wins, so the
   * order is significant. Mutually exclusive with `glossaryId`.
   */
  glossaryIds?: string[];
  translationMemoryId?: string;
  translationMemoryThreshold?: number;
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
}

export interface TranslationMemory {
  translation_memory_id: string;
  name: string;
  source_language: string;
  target_languages: string[];
}

/**
 * Target languages the Write API accepts. Derived from the generated snapshot
 * so that adding a language upstream widens this on `npm run generate:languages`
 * rather than needing a second, hand-kept copy of the same list.
 */
export type WriteLanguage = (typeof WRITE_TARGET_LANGUAGES)[number];

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

export interface CorrectOptions {
  targetLang?: WriteLanguage;
}

export interface WriteImprovement {
  text: string;
  /** As echoed by the API, which uses its own casing (`en-GB`, `zh-Hans`). */
  targetLanguage: string;
  detectedSourceLanguage?: string;
}

export function isWriteImprovementArray(data: unknown): data is WriteImprovement[] {
  if (!Array.isArray(data)) {
    return false;
  }
  return data.every(item => {
    if (item === null || typeof item !== 'object') {
      return false;
    }
    const record = item as Record<string, unknown>;
    return typeof record['text'] === 'string';
  });
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
  /** See `TranslationOptions.glossaryIds`. */
  glossaryIds?: string[];
  outputFormat?: DocumentOutputFormat;
  enableDocumentMinification?: boolean;
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
  /** Server-assigned UUID. Present on responses; not sent on create. Used as the URL path segment for get/update/delete. */
  id?: string;
  label: string;
  prompt: string;
  sourceLanguage?: string;
}

/**
 * Configured rules for a style rule list. The DeepL API models this as a
 * two-level dictionary: category → setting → value. Example for fr-CA:
 *   { "punctuation": { "quotation_mark": "use_guillemets" } }
 * Empty rules are represented as `{}`.
 */
export type ConfiguredRules = Record<string, Record<string, string>>;

export interface StyleRuleDetailed extends StyleRule {
  configuredRules: ConfiguredRules;
  customInstructions: CustomInstruction[];
}

export interface StyleRulesListOptions {
  detailed?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateStyleRuleOptions {
  name: string;
  language: string;
  configuredRules?: ConfiguredRules;
  customInstructions?: CustomInstruction[];
}

export interface UpdateStyleRuleOptions {
  name?: string;
  configuredRules?: ConfiguredRules;
  customInstructions?: CustomInstruction[];
}

export interface CreateCustomInstructionOptions {
  label: string;
  prompt: string;
  sourceLanguage?: string;
}

export interface UpdateCustomInstructionOptions {
  prompt?: string;
  sourceLanguage?: string;
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
