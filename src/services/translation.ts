/**
 * Translation Service
 * Business logic for translation operations
 */

import * as crypto from 'crypto';
import { DeepLClient, TranslationResult, UsageInfo, LanguageInfo } from '../api/deepl-client.js';
import { ConfigService } from '../storage/config.js';
import { CacheService } from '../storage/cache.js';
import { TranslationOptions, Language } from '../types/index.js';

interface TranslateServiceOptions {
  preserveCode?: boolean;
  skipCache?: boolean;
}

interface BatchOptions {
  concurrency?: number;
}

interface MultiTargetResult {
  targetLang: Language;
  text: string;
  detectedSourceLang?: Language;
  billedCharacters?: number;
}

interface ExtendedUsageInfo extends UsageInfo {
  percentageUsed: number;
  remaining: number;
}

export class TranslationService {
  private client: DeepLClient;
  private config: ConfigService;
  private cache: CacheService;
  private languageCache: Map<'source' | 'target', { data: LanguageInfo[]; timestamp: number }> = new Map();
  private readonly LANGUAGE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(client: DeepLClient, config: ConfigService, cache?: CacheService) {
    this.client = client;
    this.config = config;
    this.cache = cache ?? new CacheService();
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

    // Check cache (only if cache is enabled AND skipCache is not set)
    const cacheEnabled = this.config.getValue<boolean>('cache.enabled') ?? true;
    const shouldUseCache = cacheEnabled && !serviceOptions.skipCache;
    const cacheKey = this.generateCacheKey(processedText, translationOptions);

    if (shouldUseCache) {
      const cachedResult = this.cache.get(cacheKey) as TranslationResult | null;
      if (cachedResult) {
        // Restore preserved content from cached result
        let finalText = cachedResult.text;
        for (const [placeholder, original] of preservationMap.entries()) {
          finalText = finalText.replace(placeholder, original);
        }
        return {
          ...cachedResult,
          text: finalText,
        };
      }
    }

    // Translate via API
    const result = await this.client.translate(processedText, translationOptions);

    // Store in cache
    if (shouldUseCache) {
      this.cache.set(cacheKey, result);
    }

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
   * Translate multiple texts in batch using optimized API calls
   * Uses client.translateBatch() to send multiple texts in a single API request
   * More efficient than individual translate() calls
   *
   * @param texts - Array of texts to translate
   * @param options - Translation options
   * @param _batchOptions - Batch options (deprecated, kept for backward compatibility)
   */
  async translateBatch(
    texts: string[],
    options: TranslationOptions,
    _batchOptions: BatchOptions = {}
  ): Promise<TranslationResult[]> {
    if (texts.length === 0) {
      return [];
    }

    // Get config defaults
    const configData = this.config.get();
    const defaults = configData.defaults;
    const cacheEnabled = this.config.getValue<boolean>('cache.enabled') ?? true;

    // Merge options with defaults
    const translationOptions: TranslationOptions = {
      ...options,
      sourceLang: options.sourceLang ?? defaults.sourceLang,
      formality: options.formality ?? defaults.formality,
      preserveFormatting: options.preserveFormatting ?? defaults.preserveFormatting,
    };

    // Check cache and separate cached vs non-cached texts
    const textsToTranslate: string[] = [];
    const textIndexMap = new Map<string, number>(); // Maps text to original index
    const results: (TranslationResult | null)[] = new Array(texts.length).fill(null) as (TranslationResult | null)[];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text) {
        continue;
      }

      const cacheKey = this.generateCacheKey(text, translationOptions);

      if (cacheEnabled) {
        const cachedResult = this.cache.get(cacheKey) as TranslationResult | null;
        if (cachedResult) {
          results[i] = cachedResult;
          continue;
        }
      }

      // Not cached, need to translate
      textsToTranslate.push(text);
      textIndexMap.set(text, i);
    }

    // If all texts were cached, return cached results
    if (textsToTranslate.length === 0) {
      return results.filter((r): r is TranslationResult => r !== null);
    }

    // Use batch API to translate all non-cached texts in a single request
    // DeepL API supports up to 50 texts per request, so chunk if needed
    const BATCH_SIZE = 50;
    const batches: string[][] = [];
    for (let i = 0; i < textsToTranslate.length; i += BATCH_SIZE) {
      batches.push(textsToTranslate.slice(i, i + BATCH_SIZE));
    }

    // Process all batches
    const batchResults: TranslationResult[] = [];
    for (const batch of batches) {
      const batchResult = await this.client.translateBatch(batch, translationOptions);
      batchResults.push(...batchResult);
    }

    // Store results in cache and map back to original indices
    for (let i = 0; i < textsToTranslate.length; i++) {
      const text = textsToTranslate[i];
      const result = batchResults[i];
      if (!text || !result) {
        continue;
      }

      const originalIndex = textIndexMap.get(text);
      if (originalIndex !== undefined) {
        results[originalIndex] = result;

        // Cache the result
        if (cacheEnabled) {
          const cacheKey = this.generateCacheKey(text, translationOptions);
          this.cache.set(cacheKey, result);
        }
      }
    }

    return results.filter((r): r is TranslationResult => r !== null);
  }

  /**
   * Translate text to multiple target languages in parallel
   */
  async translateToMultiple(
    text: string,
    targetLangs: Language[],
    options: Omit<TranslationOptions, 'targetLang'> & { skipCache?: boolean } = {}
  ): Promise<MultiTargetResult[]> {
    if (targetLangs.length === 0) {
      throw new Error('At least one target language is required');
    }

    const promises = targetLangs.map(async (targetLang) => {
      const result = await this.translate(text, {
        ...options,
        targetLang,
      }, { skipCache: options.skipCache });

      return {
        targetLang,
        text: result.text,
        detectedSourceLang: result.detectedSourceLang,
        billedCharacters: result.billedCharacters,
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
   * Get supported languages with caching (24-hour TTL)
   */
  async getSupportedLanguages(type: 'source' | 'target'): Promise<LanguageInfo[]> {
    // Check cache first
    const cached = this.languageCache.get(type);
    const now = Date.now();

    // Return cached data if it exists and hasn't expired
    if (cached && (now - cached.timestamp) < this.LANGUAGE_CACHE_TTL) {
      return cached.data;
    }

    // Fetch from API
    const languages = await this.client.getSupportedLanguages(type);

    // Cache result with timestamp
    this.languageCache.set(type, { data: languages, timestamp: now });

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
   * Uses hash-based placeholders to eliminate collision risk
   */
  private preserveVariables(text: string, preservationMap: Map<string, string>): string {
    let processed = text;

    // Preserve various variable formats (order matters - do ${} before {})
    const patterns = [
      /\$\{[a-zA-Z0-9_]+\}/g,         // ${name}
      /\{[a-zA-Z0-9_]+\}/g,           // {name}, {0}
      /%[sd]/g,                        // %s, %d
    ];

    for (const pattern of patterns) {
      processed = processed.replace(pattern, (match) => {
        // Use hash of match + random value to ensure uniqueness
        // This makes collisions virtually impossible
        const hash = crypto
          .createHash('sha256')
          .update(match + Math.random().toString())
          .digest('hex')
          .slice(0, 16);
        const placeholder = `__VAR_${hash}__`;
        preservationMap.set(placeholder, match);
        return placeholder;
      });
    }

    return processed;
  }

  /**
   * Generate cache key from text and options
   */
  private generateCacheKey(text: string, options: TranslationOptions): string {
    // Create a stable representation of the translation request
    const cacheData = {
      text,
      targetLang: options.targetLang,
      sourceLang: options.sourceLang,
      formality: options.formality,
      glossaryId: options.glossaryId,
      context: options.context,
      // Note: preserveFormatting doesn't affect translation output caching
    };

    // Generate SHA-256 hash
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(cacheData))
      .digest('hex');

    return `translation:${hash}`;
  }
}
