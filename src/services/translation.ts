/**
 * Translation Service
 * Business logic for translation operations
 */

import { DeepLClient, TranslationResult, UsageInfo, LanguageInfo } from '../api/deepl-client';
import { ConfigService } from '../storage/config';
import { TranslationOptions, Language } from '../types';

interface TranslateServiceOptions {
  preserveCode?: boolean;
}

interface BatchOptions {
  concurrency?: number;
}

interface MultiTargetResult {
  targetLang: Language;
  text: string;
  detectedSourceLang?: Language;
}

interface ExtendedUsageInfo extends UsageInfo {
  percentageUsed: number;
  remaining: number;
}

export class TranslationService {
  private client: DeepLClient;
  private config: ConfigService;
  private languageCache: Map<'source' | 'target', LanguageInfo[]> = new Map();

  constructor(client: DeepLClient, config: ConfigService) {
    this.client = client;
    this.config = config;
  }

  /**
   * Translate text with optional code/variable preservation
   */
  async translate(
    text: string,
    options: TranslationOptions,
    serviceOptions: TranslateServiceOptions = {}
  ): Promise<TranslationResult> {
    // Validate inputs
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    if (!options.targetLang) {
      throw new Error('Target language is required');
    }

    // Get defaults from config
    const configData = this.config.get();
    const defaults = configData.defaults;

    // Merge options with defaults
    const translationOptions: TranslationOptions = {
      ...options,
      sourceLang: options.sourceLang ?? defaults.sourceLang,
      formality: options.formality ?? defaults.formality,
      preserveFormatting: options.preserveFormatting ?? defaults.preserveFormatting,
    };

    // Preserve code blocks if requested
    let processedText = text;
    const preservationMap: Map<string, string> = new Map();

    if (serviceOptions.preserveCode) {
      processedText = this.preserveCodeBlocks(text, preservationMap);
    }

    // Always preserve variables
    processedText = this.preserveVariables(processedText, preservationMap);

    // Translate
    const result = await this.client.translate(processedText, translationOptions);

    // Restore preserved content
    let finalText = result.text;
    for (const [placeholder, original] of preservationMap.entries()) {
      finalText = finalText.replace(placeholder, original);
    }

    return {
      ...result,
      text: finalText,
    };
  }

  /**
   * Translate multiple texts in batch with concurrency control
   */
  async translateBatch(
    texts: string[],
    options: TranslationOptions,
    batchOptions: BatchOptions = {}
  ): Promise<TranslationResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const concurrency = batchOptions.concurrency ?? 5;
    const results: TranslationResult[] = [];

    // Process in chunks with concurrency limit
    for (let i = 0; i < texts.length; i += concurrency) {
      const chunk = texts.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((text) => this.translate(text, options))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Translate text to multiple target languages in parallel
   */
  async translateToMultiple(
    text: string,
    targetLangs: Language[],
    options: Omit<TranslationOptions, 'targetLang'> = {}
  ): Promise<MultiTargetResult[]> {
    if (targetLangs.length === 0) {
      throw new Error('At least one target language is required');
    }

    const promises = targetLangs.map(async (targetLang) => {
      const result = await this.translate(text, {
        ...options,
        targetLang,
      });
      return {
        targetLang,
        text: result.text,
        detectedSourceLang: result.detectedSourceLang,
      };
    });

    return Promise.all(promises);
  }

  /**
   * Get usage statistics with additional computed fields
   */
  async getUsage(): Promise<ExtendedUsageInfo> {
    const usage = await this.client.getUsage();

    const percentageUsed = (usage.characterCount / usage.characterLimit) * 100;
    const remaining = usage.characterLimit - usage.characterCount;

    return {
      ...usage,
      percentageUsed: Math.round(percentageUsed * 100) / 100, // Round to 2 decimals
      remaining,
    };
  }

  /**
   * Get supported languages with caching
   */
  async getSupportedLanguages(type: 'source' | 'target'): Promise<LanguageInfo[]> {
    // Check cache first
    const cached = this.languageCache.get(type);
    if (cached) {
      return cached;
    }

    // Fetch from API
    const languages = await this.client.getSupportedLanguages(type);

    // Cache result
    this.languageCache.set(type, languages);

    return languages;
  }

  /**
   * Preserve code blocks by replacing with placeholders
   */
  private preserveCodeBlocks(text: string, preservationMap: Map<string, string>): string {
    let processed = text;
    let counter = 0;

    // Preserve multi-line code blocks (```)
    processed = processed.replace(/```[\s\S]*?```/g, (match) => {
      const placeholder = `__CODE_${counter++}__`;
      preservationMap.set(placeholder, match);
      return placeholder;
    });

    // Preserve inline code blocks (`)
    processed = processed.replace(/`[^`]+`/g, (match) => {
      const placeholder = `__CODE_${counter++}__`;
      preservationMap.set(placeholder, match);
      return placeholder;
    });

    return processed;
  }

  /**
   * Preserve variables by replacing with placeholders
   */
  private preserveVariables(text: string, preservationMap: Map<string, string>): string {
    let processed = text;
    let counter = 0;

    // Preserve various variable formats (order matters - do ${} before {})
    const patterns = [
      /\$\{[a-zA-Z0-9_]+\}/g,         // ${name}
      /\{[a-zA-Z0-9_]+\}/g,           // {name}, {0}
      /%[sd]/g,                        // %s, %d
    ];

    for (const pattern of patterns) {
      processed = processed.replace(pattern, (match) => {
        const placeholder = `__VAR_${counter++}__`;
        preservationMap.set(placeholder, match);
        return placeholder;
      });
    }

    return processed;
  }
}
