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
  assertPlaceholdersSurvived,
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
  private announcedCacheNotices = new Set<string>();

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
   * The cache state is a property of the run, not of one request, so repeat it
   * no more than once. A file of more than `TRANSLATE_BATCH_SIZE` strings needs
   * several requests, and one notice per request would bury the output.
   */
  private announceCacheMode(cacheEnabled: boolean, skipCache: boolean): void {
    const notice = !cacheEnabled
      ? 'ℹ️  Cache is disabled'
      : skipCache
        ? 'ℹ️  Cache bypassed for this request (--no-cache)'
        : undefined;
    if (notice && !this.announcedCacheNotices.has(notice)) {
      this.announcedCacheNotices.add(notice);
      Logger.info(notice);
    }
  }

  /**
   * Translate text with optional code/variable preservation
   */
  async translate(
    text: string,
    options: TranslationOptions,
    serviceOptions: TranslateServiceOptions = {}
  ): Promise<TranslationResult> {
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

    const configData = this.config.get();
    const defaults = configData.defaults;

    const translationOptions: TranslationOptions = {
      ...options,
      sourceLang: options.sourceLang ?? defaults.sourceLang,
      formality: options.formality ?? defaults.formality,
      preserveFormatting:
        options.preserveFormatting ?? defaults.preserveFormatting,
    };

    let processedText = text;
    const preservationMap: Map<string, string> = new Map();

    if (serviceOptions.preserveCode) {
      processedText = preserveCodeBlocks(text, preservationMap);
    }

    processedText = preserveVariables(processedText, preservationMap);

    const cacheEnabled = this.config.getValue<boolean>('cache.enabled') ?? true;
    const shouldUseCache = cacheEnabled && !serviceOptions.skipCache;

    this.announceCacheMode(cacheEnabled, serviceOptions.skipCache === true);

    const cacheKey = this.generateCacheKey(processedText, translationOptions);

    if (shouldUseCache) {
      const cachedResult = this.cache?.get(cacheKey, isTranslationResult);
      if (cachedResult) {
        Logger.verbose('[verbose] Cache hit');
        assertPlaceholdersSurvived(cachedResult.text, preservationMap);
        return {
          ...cachedResult,
          text: restorePlaceholders(cachedResult.text, preservationMap),
          cached: true,
        };
      }
      Logger.verbose('[verbose] Cache miss');
    }

    const startTime = Date.now();
    const result = await this.client.translate(
      processedText,
      translationOptions
    );
    const elapsed = Date.now() - startTime;
    Logger.verbose(`[verbose] API response time: ${elapsed}ms`);

    // Checked before the cache write: a response that lost a placeholder must
    // not become a cache entry that reproduces the same output offline.
    assertPlaceholdersSurvived(result.text, preservationMap);

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
   *   cache write, matching `translate()`. Every structured i18n format goes
   *   through this path, so it is what makes `--no-cache` reach them.
   * @returns One slot per input text, in input order. A slot is `null` when the
   *   request carrying that text failed; the surviving batches are still
   *   returned so callers that track failure per item can retry only those.
   *   Callers needing all-or-nothing should submit at most
   *   `TRANSLATE_BATCH_SIZE` texts, which makes any failure a rejection.
   */
  async translateBatch(
    texts: string[],
    options: TranslationOptions,
    serviceOptions: TranslateBatchServiceOptions = {}
  ): Promise<(TranslationResult | null)[]> {
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

    const configData = this.config.get();
    const defaults = configData.defaults;
    const cacheEnabled = this.config.getValue<boolean>('cache.enabled') ?? true;
    const shouldUseCache = cacheEnabled && !serviceOptions.skipCache;

    this.announceCacheMode(cacheEnabled, serviceOptions.skipCache === true);

    const translationOptions: TranslationOptions = {
      ...options,
      sourceLang: options.sourceLang ?? defaults.sourceLang,
      formality: options.formality ?? defaults.formality,
      preserveFormatting:
        options.preserveFormatting ?? defaults.preserveFormatting,
    };

    const textsToTranslateSet = new Set<string>();
    const textIndexMap = new Map<string, number[]>(); // Maps text to ALL original indices
    const results: (TranslationResult | null)[] =
      new Array<TranslationResult | null>(texts.length).fill(null);

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text) {
        // An empty source value has an empty translation, filled in without a
        // request: sending it is billed for nothing, and a null slot would be
        // indistinguishable from a request that failed.
        results[i] = { text: '', billedCharacters: 0 };
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

      textsToTranslateSet.add(text);

      if (!textIndexMap.has(text)) {
        textIndexMap.set(text, []);
      }
      textIndexMap.get(text)!.push(i);
    }

    const textsToTranslate = Array.from(textsToTranslateSet);

    if (textsToTranslate.length === 0) {
      return results;
    }

    const BATCH_SIZE = TRANSLATE_BATCH_SIZE;
    const batches: string[][] = [];
    for (let i = 0; i < textsToTranslate.length; i += BATCH_SIZE) {
      batches.push(textsToTranslate.slice(i, i + BATCH_SIZE));
    }

    const textToResultMap = new Map<string, TranslationResult>();
    let lastError: Error | null = null;

    for (const batch of batches) {
      try {
        const batchResults = await this.client.translateBatch(
          batch,
          translationOptions
        );

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
        // The other batches still run; only a run where every batch failed
        // rejects.
      }
    }

    if (textToResultMap.size === 0 && lastError) {
      throw lastError;
    }

    for (const text of textsToTranslate) {
      const result = textToResultMap.get(text);

      if (!result) {
        continue;
      }

      const originalIndices = textIndexMap.get(text);
      if (originalIndices) {
        // Each of the indices this text deduplicated to gets its own copy: the
        // returned array is typed as one result per index, so a caller editing
        // results[i] in place must not reach any other index.
        for (const index of originalIndices) {
          results[index] = { ...result };
        }

        if (shouldUseCache) {
          const cacheKey = this.generateCacheKey(text, translationOptions);
          this.cache?.set(cacheKey, result);
        }
      }
    }

    const actualFailures = results.filter((r) => r === null).length;
    if (actualFailures > 0) {
      Logger.warn(
        `⚠️  Warning: ${actualFailures} of ${texts.length} translations failed`
      );
    }

    return results;
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
    const cached = this.languageCache.get(type);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.LANGUAGE_CACHE_TTL) {
      return cached.data;
    }

    const languages = await this.client.getSupportedLanguages(type);

    this.languageCache.set(type, { data: languages, timestamp: now });

    return languages;
  }

  /**
   * Generate cache key from text and options
   *
   * IMPORTANT: the property order in `cacheData` is fixed and must not be
   * changed, because the key is a hash of its `JSON.stringify` output: two
   * requests with identical parameters must produce the same key whatever order
   * the caller specified those parameters in.
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
   * serves its answers back for api.deepl.com for the full 30-day TTL, with no
   * network involved. Custom endpoints are a supported feature — proxies,
   * regional endpoints — so this needs no misuse to reach.
   */
  private generateCacheKey(text: string, options: TranslationOptions): string {
    // Keyed on the parameter the request will actually carry, so the two ways of
    // naming one glossary share a key and an empty selection keys as no glossary
    const glossary = resolveGlossaryWireParams(options);

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

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(cacheData))
      .digest('hex');

    return `translation:${hash}`;
  }
}
