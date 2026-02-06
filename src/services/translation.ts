/**
 * Translation Service
 * Business logic for translation operations
 */

import * as crypto from 'crypto';
import { DeepLClient, TranslationResult, UsageInfo, LanguageInfo } from '../api/deepl-client.js';
import { ConfigService } from '../storage/config.js';
import { CacheService } from '../storage/cache.js';
import { TranslationOptions, Language } from '../types/index.js';
import { Logger } from '../utils/logger.js';

interface TranslateServiceOptions {
  preserveCode?: boolean;
  skipCache?: boolean;
}

interface MultiTargetResult {
  targetLang: Language;
  text: string;
  detectedSourceLang?: Language;
  billedCharacters?: number;
  modelTypeUsed?: string;
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
    this.cache = cache ?? CacheService.getInstance();
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

    // Log when cache is bypassed
    if (!cacheEnabled) {
      Logger.info('ℹ️  Cache is disabled');
    } else if (serviceOptions.skipCache) {
      Logger.info('ℹ️  Cache bypassed for this request (--no-cache)');
    }

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
   */
  async translateBatch(
    texts: string[],
    options: TranslationOptions
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
    // Use Set for deduplication and Map to track all indices for each text
    const textsToTranslateSet = new Set<string>();
    const textIndexMap = new Map<string, number[]>(); // Maps text to ALL original indices
    const results: (TranslationResult | null)[] = new Array<TranslationResult | null>(texts.length).fill(null);

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
      // Track this text for translation (deduplicated via Set)
      textsToTranslateSet.add(text);

      // Track ALL indices for this text (handles duplicates)
      if (!textIndexMap.has(text)) {
        textIndexMap.set(text, []);
      }
      textIndexMap.get(text)!.push(i);
    }

    // Convert Set to Array for batch translation
    const textsToTranslate = Array.from(textsToTranslateSet);

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

    // Process all batches and track failures
    // Use a Map to correctly track which text maps to which result
    const textToResultMap = new Map<string, TranslationResult>();
    let lastError: Error | null = null;

    for (const batch of batches) {
      try {
        const batchResults = await this.client.translateBatch(batch, translationOptions);

        // Map each result to its corresponding text
        for (let i = 0; i < batch.length; i++) {
          const text = batch[i];
          const result = batchResults[i];
          if (text && result) {
            textToResultMap.set(text, result);
          }
        }
      } catch (error) {
        lastError = error as Error;
        Logger.error(`Batch translation failed: ${error instanceof Error ? error.message : String(error)}`);
        // Mark all texts in this batch as processed (but failed)
        // Continue with other batches rather than failing completely
      }
    }

    // If all batches failed, throw the last error
    if (textToResultMap.size === 0 && lastError) {
      throw lastError;
    }

    // Store results in cache and map back to ALL original indices
    for (const text of textsToTranslate) {
      const result = textToResultMap.get(text);

      if (!result) {
        // Translation failed for this text
        continue;
      }

      const originalIndices = textIndexMap.get(text);
      if (originalIndices) {
        // Assign result to ALL indices where this text appeared (handles duplicates)
        for (const index of originalIndices) {
          results[index] = result;
        }

        // Cache the result (only once per unique text)
        if (cacheEnabled) {
          const cacheKey = this.generateCacheKey(text, translationOptions);
          this.cache.set(cacheKey, result);
        }
      }
    }

    // Filter out null results (these are actual failures, not cached successes)
    const filteredResults = results.filter((r): r is TranslationResult => r !== null);

    // Calculate actual failures (excluding cached successes)
    const actualFailures = texts.length - filteredResults.length;
    if (actualFailures > 0) {
      Logger.warn(`⚠️  Warning: ${actualFailures} of ${texts.length} translations failed`);
    }

    return filteredResults;
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
        modelTypeUsed: result.modelTypeUsed,
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
   * Uses simple counter for efficient placeholder generation (10-20x faster than crypto)
   */
  private preserveVariables(text: string, preservationMap: Map<string, string>): string {
    let processed = text;
    let counter = 0;  // Simple counter suffices - no need for crypto-secure random

    // Preserve various variable formats (order matters - do ${} before {})
    const patterns = [
      /\$\{[a-zA-Z0-9_]+\}/g,         // ${name}
      /\{[a-zA-Z0-9_]+\}/g,           // {name}, {0}
      /%[sd]/g,                        // %s, %d
    ];

    for (const pattern of patterns) {
      processed = processed.replace(pattern, (match) => {
        // Simple counter-based placeholder
        // Collision risk is negligible since variables are replaced immediately
        // and placeholders are ephemeral (used only during translation)
        const placeholder = `__VAR_${counter++}__`;
        preservationMap.set(placeholder, match);
        return placeholder;
      });
    }

    return processed;
  }

  /**
   * Generate cache key from text and options
   *
   * IMPORTANT: This method creates a new object with properties in a FIXED order
   * to ensure deterministic cache keys. Two translation requests with identical
   * parameters must generate the same cache key, regardless of the order in which
   * properties were specified in the input options object.
   *
   * The property order in `cacheData` is intentional and must not be changed,
   * as it directly affects cache key generation via JSON.stringify().
   */
  private generateCacheKey(text: string, options: TranslationOptions): string {
    // Create a stable representation with deterministic property order
    // Property order matters because JSON.stringify() preserves insertion order
    const cacheData = {
      text,                      // 1. Text to translate
      targetLang: options.targetLang,    // 2. Target language
      sourceLang: options.sourceLang,    // 3. Source language (if specified)
      formality: options.formality,      // 4. Formality level
      glossaryId: options.glossaryId,    // 5. Glossary ID
      context: options.context,          // 6. Context hint
      // Note: preserveFormatting doesn't affect translation output, so not cached
    };

    // Generate SHA-256 hash of the stable representation
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(cacheData))
      .digest('hex');

    return `translation:${hash}`;
  }
}
