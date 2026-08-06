/**
 * Translation Service
 * Business logic for translation operations
 */

import * as crypto from 'crypto';
import {
  DeepLClient,
  TranslationResult,
  isTranslationResult,
  UsageInfo,
  LanguageInfo,
} from '../api/deepl-client.js';
import { ConfigService } from '../storage/config.js';
import type { CacheService } from '../storage/cache.js';
import {
  TranslationOptions,
  Language,
  TranslationMemory,
} from '../types/index.js';
import { Logger } from '../utils/logger.js';
import {
  mapWithConcurrency,
  MULTI_TARGET_CONCURRENCY,
} from '../utils/concurrency.js';
import { ValidationError } from '../utils/errors.js';
import { errorMessage } from '../utils/error-message.js';
import { resolveGlossaryWireParams } from '../utils/glossary-params.js';
import { resolveTagHandlingVersion } from '../utils/tag-handling-version.js';
import {
  preserveCodeBlocks,
  preserveVariables,
  restorePlaceholders,
} from '../utils/text-preservation.js';

export { MULTI_TARGET_CONCURRENCY };

interface TranslateServiceOptions {
  preserveCode?: boolean;
  skipCache?: boolean;
}

/**
 * Service-level options for `translateBatch`. Separate from
 * `TranslateServiceOptions` because code-block preservation is a single-text
 * concern that the batch path does not apply.
 */
export interface TranslateBatchServiceOptions {
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

export const MAX_TEXT_BYTES = 131072; // 128KB - DeepL API limit per request
export const TRANSLATE_BATCH_SIZE = 50; // DeepL API max texts per request

export class TranslationService {
  private client: DeepLClient;
  private config: ConfigService;
  // No cache means "run cacheless" — the CLI passes undefined when the
  // cache backend is unavailable (see cli/cache-loader.ts).
  private cache?: CacheService;
  private languageCache: Map<
    'source' | 'target',
    { data: LanguageInfo[]; timestamp: number }
  > = new Map();
  private readonly LANGUAGE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    client: DeepLClient,
    config: ConfigService,
    cache?: CacheService
  ) {
    this.client = client;
    this.config = config;
    this.cache = cache;
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
      throw new ValidationError('Text cannot be empty');
    }

    if (!options.targetLang) {
      throw new ValidationError('Target language is required');
    }

    const textBytes = Buffer.byteLength(text, 'utf8');
    if (textBytes > MAX_TEXT_BYTES) {
      throw new ValidationError(
        `Text too large: ${textBytes} bytes exceeds the ${MAX_TEXT_BYTES} byte limit (128KB). ` +
          'Split the text into smaller chunks or use file translation for large documents.'
      );
    }

    // Get defaults from config
    const configData = this.config.get();
    const defaults = configData.defaults;

    // Merge options with defaults
    const translationOptions: TranslationOptions = {
      ...options,
      sourceLang: options.sourceLang ?? defaults.sourceLang,
      formality: options.formality ?? defaults.formality,
      preserveFormatting:
        options.preserveFormatting ?? defaults.preserveFormatting,
    };

    // Preserve code blocks if requested
    let processedText = text;
    const preservationMap: Map<string, string> = new Map();

    if (serviceOptions.preserveCode) {
      processedText = preserveCodeBlocks(text, preservationMap);
    }

    // Always preserve variables
    processedText = preserveVariables(processedText, preservationMap);

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
      const cachedResult = this.cache?.get(cacheKey, isTranslationResult);
      if (cachedResult) {
        Logger.verbose('[verbose] Cache hit');
        return {
          ...cachedResult,
          text: restorePlaceholders(cachedResult.text, preservationMap),
          cached: true,
        };
      }
      Logger.verbose('[verbose] Cache miss');
    }

    // Translate via API
    const startTime = Date.now();
    const result = await this.client.translate(
      processedText,
      translationOptions
    );
    const elapsed = Date.now() - startTime;
    Logger.verbose(`[verbose] API response time: ${elapsed}ms`);

    // Store in cache
    if (shouldUseCache) {
      this.cache?.set(cacheKey, result);
    }

    return {
      ...result,
      text: restorePlaceholders(result.text, preservationMap),
      cached: false,
    };
  }

  /**
   * Translate multiple texts in batch using optimized API calls
   * Uses client.translateBatch() to send multiple texts in a single API request
   * More efficient than individual translate() calls
   *
   * @param texts - Array of texts to translate
   * @param options - Translation options
   * @param serviceOptions - `skipCache` bypasses both the cache read and the
   *   cache write, matching `translate()`. Without it, `--no-cache` was a
   *   silent no-op for every structured i18n format, so a corrupt translation
   *   could not be re-fetched and the natural remedy did nothing.
   */
  async translateBatch(
    texts: string[],
    options: TranslationOptions,
    serviceOptions: TranslateBatchServiceOptions = {}
  ): Promise<TranslationResult[]> {
    if (texts.length === 0) {
      return [];
    }

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text) {
        continue;
      }
      const itemBytes = Buffer.byteLength(text, 'utf8');
      if (itemBytes > MAX_TEXT_BYTES) {
        throw new ValidationError(
          `Text at index ${i} too large: ${itemBytes} bytes exceeds the ${MAX_TEXT_BYTES} byte limit (128KB). ` +
            'Split the text into smaller chunks or use file translation for large documents.'
        );
      }
    }

    // Get config defaults
    const configData = this.config.get();
    const defaults = configData.defaults;
    const cacheEnabled = this.config.getValue<boolean>('cache.enabled') ?? true;
    const shouldUseCache = cacheEnabled && !serviceOptions.skipCache;

    if (!cacheEnabled) {
      Logger.info('ℹ️  Cache is disabled');
    } else if (serviceOptions.skipCache) {
      Logger.info('ℹ️  Cache bypassed for this request (--no-cache)');
    }

    // Merge options with defaults
    const translationOptions: TranslationOptions = {
      ...options,
      sourceLang: options.sourceLang ?? defaults.sourceLang,
      formality: options.formality ?? defaults.formality,
      preserveFormatting:
        options.preserveFormatting ?? defaults.preserveFormatting,
    };

    // Check cache and separate cached vs non-cached texts
    // Use Set for deduplication and Map to track all indices for each text
    const textsToTranslateSet = new Set<string>();
    const textIndexMap = new Map<string, number[]>(); // Maps text to ALL original indices
    const results: (TranslationResult | null)[] =
      new Array<TranslationResult | null>(texts.length).fill(null);

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text) {
        continue;
      }

      const cacheKey = this.generateCacheKey(text, translationOptions);

      if (shouldUseCache) {
        const cachedResult = this.cache?.get(cacheKey, isTranslationResult);
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

    // If all texts were cached, return results preserving positional correspondence
    if (textsToTranslate.length === 0) {
      return results as TranslationResult[];
    }

    // Use batch API to translate all non-cached texts in a single request
    // DeepL API supports up to TRANSLATE_BATCH_SIZE texts per request, so chunk if needed
    const BATCH_SIZE = TRANSLATE_BATCH_SIZE;
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
        const batchResults = await this.client.translateBatch(
          batch,
          translationOptions
        );

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
        Logger.error(`Batch translation failed: ${errorMessage(error)}`);
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
        if (shouldUseCache) {
          const cacheKey = this.generateCacheKey(text, translationOptions);
          this.cache?.set(cacheKey, result);
        }
      }
    }

    // Calculate actual failures
    const actualFailures = results.filter((r) => r === null).length;
    if (actualFailures > 0) {
      Logger.warn(
        `⚠️  Warning: ${actualFailures} of ${texts.length} translations failed`
      );
    }

    // Return sparse array preserving positional correspondence with input texts.
    // Callers must check for null/undefined at each index.
    return results as TranslationResult[];
  }

  /**
   * Translate text to multiple target languages with bounded concurrency
   */
  async translateToMultiple(
    text: string,
    targetLangs: Language[],
    options: Omit<TranslationOptions, 'targetLang'> & {
      skipCache?: boolean;
    } = {}
  ): Promise<MultiTargetResult[]> {
    if (targetLangs.length === 0) {
      throw new ValidationError('At least one target language is required');
    }

    return mapWithConcurrency(
      targetLangs,
      async (targetLang) => {
        const result = await this.translate(
          text,
          {
            ...options,
            targetLang,
          },
          { skipCache: options.skipCache }
        );

        return {
          targetLang,
          text: result.text,
          detectedSourceLang: result.detectedSourceLang,
          billedCharacters: result.billedCharacters,
          modelTypeUsed: result.modelTypeUsed,
        };
      },
      MULTI_TARGET_CONCURRENCY
    );
  }

  async listTranslationMemories(): Promise<TranslationMemory[]> {
    return this.client.listTranslationMemories();
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
  async getSupportedLanguages(
    type: 'source' | 'target'
  ): Promise<LanguageInfo[]> {
    // Check cache first
    const cached = this.languageCache.get(type);
    const now = Date.now();

    // Return cached data if it exists and hasn't expired
    if (cached && now - cached.timestamp < this.LANGUAGE_CACHE_TTL) {
      return cached.data;
    }

    // Fetch from API
    const languages = await this.client.getSupportedLanguages(type);

    // Cache result with timestamp
    this.languageCache.set(type, { data: languages, timestamp: now });

    return languages;
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
   *
   * The text is hashed byte-exact, with no Unicode normalization: NFC and NFD
   * encodings of the same visible string produce distinct cache keys. This is
   * intentional — the API receives the un-normalized bytes, so the cache keys
   * on exactly what is sent.
   *
   * New fields are appended after the existing ones, so a field left `undefined`
   * does not perturb the key -- `JSON.stringify` omits it. `preserveFormatting`
   * is the exception: the service merges a config default for it, so it is always
   * materialized and every key reflects it. `glossaryIds` is hashed in the
   * caller's order rather than sorted, because that order is what goes on the
   * wire, and the API is free to return a different translation for a different
   * ordering of the same glossaries.
   *
   * `tagHandlingVersion` is resolved rather than read straight off the options,
   * so it holds the version the request will actually carry. Leaving it unset
   * would let the key stay stable across a change of the API's own default,
   * serving entries the API would no longer produce.
   *
   * Every parameter that changes the returned text belongs here, or the cache
   * serves the wrong translation: a plain request and the same request with a
   * translation memory, different --ignore-tags, or --preserve-formatting are
   * different requests. `preserveFormatting` counts because preserve_formatting
   * suppresses the sentence-boundary punctuation and case correction, which
   * shows up in the text.
   *
   * `endpoint` is not a request parameter but decides who answers the request,
   * and one cache DB is shared by every endpoint a config dir has ever talked
   * to. Without it, a single run against `--api-url http://localhost:1234`
   * served its answers back for api.deepl.com for the full 30-day TTL, with no
   * network involved. Custom endpoints are a supported feature — proxies,
   * regional endpoints — so this needs no misuse to reach.
   */
  private generateCacheKey(text: string, options: TranslationOptions): string {
    // Keyed on the parameter the request will actually carry, so the two ways of
    // naming one glossary share a key and an empty selection keys as no glossary
    const glossary = resolveGlossaryWireParams(options);

    // Create a stable representation with deterministic property order
    // Property order matters because JSON.stringify() preserves insertion order
    const cacheData = {
      text, // 1. Text to translate
      targetLang: options.targetLang, // 2. Target language
      sourceLang: options.sourceLang, // 3. Source language (if specified)
      formality: options.formality, // 4. Formality level
      glossaryId:
        glossary && 'glossary_id' in glossary
          ? glossary.glossary_id
          : undefined, // 5. Glossary ID
      context: options.context, // 6. Context hint
      modelType: options.modelType, // 7. Model type affects output quality
      splitSentences: options.splitSentences, // 8. Sentence splitting behavior
      tagHandling: options.tagHandling, // 9. HTML/XML processing
      tagHandlingVersion: resolveTagHandlingVersion(options), // 10. Tag handling version
      customInstructions: options.customInstructions, // 11. Custom instructions
      styleId: options.styleId, // 12. Style rules
      glossaryIds:
        glossary && 'glossary_ids' in glossary
          ? glossary.glossary_ids
          : undefined, // 13. Multi-glossary selection (order-significant)
      translationMemoryId: options.translationMemoryId, // 14. Memory consulted for matches
      translationMemoryThreshold: options.translationMemoryThreshold, // 15. Which matches it reuses
      ignoreTags: options.ignoreTags, // 16. Tags left untranslated
      splittingTags: options.splittingTags, // 17. Tags that split sentences
      nonSplittingTags: options.nonSplittingTags, // 18. Tags that do not
      outlineDetection: options.outlineDetection, // 19. XML structure inference
      preserveFormatting: options.preserveFormatting, // 20. Suppresses boundary correction
      endpoint: this.client.resolvedBaseUrl, // 21. Who answered the request
    };

    // Generate SHA-256 hash of the stable representation
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(cacheData))
      .digest('hex');

    return `translation:${hash}`;
  }
}
