import { HttpClient, DeepLClientOptions } from './http-client.js';
import {
  requireItemArray,
  requireItemText,
  optionalString,
  optionalNumber,
  optionalNumberField,
} from './response-shape.js';
import {
  TranslationOptions,
  Language,
  TranslationMemory,
} from '../types/index.js';
import { NetworkError } from '../utils/errors.js';
import { normalizeFormality } from '../utils/formality.js';
import { resolveGlossaryWireParams } from '../utils/glossary-params.js';
import { resolveTagHandlingVersion } from '../utils/tag-handling-version.js';
import { Logger } from '../utils/logger.js';

// DeepL's /v3/translation_memories endpoint paginates via `page` (0-indexed) and
// `page_size` (max 25 per API docs). The page cap guards against infinite loops
// if the server misreports `total_count` or never returns a short page.
export const TRANSLATION_MEMORY_LIST_PAGE_SIZE = 25;
export const MAX_TRANSLATION_MEMORY_LIST_PAGES = 20;

interface DeepLUsageResponse {
  character_count: number;
  character_limit: number;
  api_key_character_count?: number;
  api_key_character_limit?: number;
  api_key_unit_count?: number;
  api_key_unit_limit?: number;
  account_unit_count?: number;
  account_unit_limit?: number;
  start_time?: string;
  end_time?: string;
  products?: Array<{
    product_type: string;
    character_count: number;
    api_key_character_count: number;
    unit_count?: number;
    account_unit_count?: number;
    api_key_unit_count?: number;
    billing_unit?: string;
  }>;
}

interface DeepLV3LanguageResponse {
  lang: string;
  name: string;
  status?: string;
  usable_as_source?: boolean;
  usable_as_target?: boolean;
  features?: LanguageFeatures;
}

export interface TranslationResult {
  text: string;
  detectedSourceLang?: Language;
  billedCharacters?: number;
  modelTypeUsed?: string;
  /** Set by TranslationService: true when served from the local cache. */
  cached?: boolean;
}

/**
 * Whether `returned` is the submitted `texts` themselves, rearranged.
 *
 * /v2/translate correlates a translation to its request item by position and
 * nothing else, so a same-length reordered response passes the length check and
 * gets written under the wrong i18n key at exit 0. This catches the one
 * reordering that is provable from the response alone; an endpoint that returns
 * plausible translations in the wrong order stays undetectable, because the
 * protocol carries no per-item identity to check against.
 *
 * Both conditions are required. Multiset equality alone fires on a legitimate
 * identity translation (source language equal to target). A displaced position
 * alone fires whenever one item's translation happens to equal another item's
 * source text, which a partially translated file produces.
 */
function isReorderedEcho(texts: string[], returned: string[]): boolean {
  const remaining = new Map<string, number>();
  for (const text of texts) {
    remaining.set(text, (remaining.get(text) ?? 0) + 1);
  }

  let displaced = false;
  for (let i = 0; i < returned.length; i++) {
    const text = returned[i]!;
    const count = remaining.get(text);
    if (count === undefined) {
      return false;
    }
    if (count === 1) {
      remaining.delete(text);
    } else {
      remaining.set(text, count - 1);
    }
    if (text !== texts[i]) {
      displaced = true;
    }
  }

  return displaced && remaining.size === 0;
}

export function isTranslationResult(data: unknown): data is TranslationResult {
  if (data === null || typeof data !== 'object') {
    return false;
  }
  const record = data as Record<string, unknown>;
  return typeof record['text'] === 'string';
}

export interface ProductUsage {
  productType: string;
  characterCount: number;
  apiKeyCharacterCount: number;
  unitCount?: number;
  /**
   * Account-wide units, which is what duration-billed products report instead of
   * `unit_count`.
   */
  accountUnitCount?: number;
  apiKeyUnitCount?: number;
  billingUnit?: string;
}

export interface UsageInfo {
  characterCount: number;
  characterLimit: number;
  apiKeyCharacterCount?: number;
  apiKeyCharacterLimit?: number;
  apiKeyUnitCount?: number;
  apiKeyUnitLimit?: number;
  accountUnitCount?: number;
  accountUnitLimit?: number;
  startTime?: string;
  endTime?: string;
  products?: ProductUsage[];
}

/**
 * Per-feature support as reported by GET /v3/languages. A feature is supported
 * when its key is present; `status` describes maturity, not availability.
 * Known values are `stable`, `beta` and `early_access`, but the enum is open,
 * so it stays a plain string.
 */
export interface LanguageFeature {
  status: string;
}

/** Feature keys vary by `resource`, so the map is deliberately open-ended. */
export type LanguageFeatures = Record<string, LanguageFeature>;

export interface LanguageInfo {
  language: Language;
  name: string;
  supportsFormality?: boolean;
  features?: LanguageFeatures;
}

export class TranslationClient extends HttpClient {
  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    super(apiKey, options);
  }

  async translate(
    text: string,
    options: TranslationOptions
  ): Promise<TranslationResult> {
    const params = this.buildTranslationParams([text], options);

    try {
      // Deliberately `unknown`: a declared interface asserts nothing at
      // runtime, and a redirected endpoint can return any shape.
      const response = await this.makeRequest<unknown>(
        'POST',
        '/v2/translate',
        params
      );

      const context = `Request: translate text (${text.length} chars) to ${options.targetLang}`;
      const items = requireItemArray(response, 'translations', context);

      if (items.length === 0) {
        throw new NetworkError(
          `No translation returned from DeepL API. ${context}`
        );
      }

      const translated = requireItemText(items, 0, 'translations', context);
      const item = items[0]!;
      const detected = optionalString(item['detected_source_language']);

      return {
        text: translated,
        detectedSourceLang: detected
          ? this.normalizeLanguage(detected)
          : undefined,
        billedCharacters:
          optionalNumber(item['billed_characters']) ??
          optionalNumberField(response, 'billed_characters'),
        modelTypeUsed: optionalString(item['model_type_used']),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async translateBatch(
    texts: string[],
    options: TranslationOptions
  ): Promise<TranslationResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const params = this.buildTranslationParams(texts, options);

    try {
      // Deliberately `unknown`: a declared interface asserts nothing at
      // runtime, and a redirected endpoint can return any shape.
      const response = await this.makeRequest<unknown>(
        'POST',
        '/v2/translate',
        params
      );

      const context = `Request: translate ${texts.length} texts to ${options.targetLang}`;
      const items = requireItemArray(response, 'translations', context);

      if (items.length !== texts.length) {
        throw new NetworkError(
          'Unexpected API response. Please retry your translation. If the issue persists, report it at https://github.com/DeepL/deepl-cli/issues'
        );
      }

      // Every text is validated before any is used, so a bad element late in
      // the array cannot leave earlier ones already written.
      const translatedTexts = items.map((_item, index) =>
        requireItemText(items, index, 'translations', context)
      );

      if (isReorderedEcho(texts, translatedTexts)) {
        throw new NetworkError(
          'The endpoint returned the submitted texts in a different order, so each translation ' +
            'would be stored against the wrong entry. Nothing was written. Check which endpoint ' +
            'this run used (--api-url, or api.baseUrl in your config).'
        );
      }

      const topBilled = optionalNumberField(response, 'billed_characters');

      return items.map((item, index) => {
        const detected = optionalString(item['detected_source_language']);
        return {
          text: translatedTexts[index]!,
          detectedSourceLang: detected
            ? this.normalizeLanguage(detected)
            : undefined,
          billedCharacters:
            optionalNumber(item['billed_characters']) ?? topBilled,
          modelTypeUsed: optionalString(item['model_type_used']),
        };
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUsage(): Promise<UsageInfo> {
    try {
      const response = await this.makeRequest<DeepLUsageResponse>(
        'GET',
        '/v2/usage'
      );

      const usage: UsageInfo = {
        characterCount: response.character_count,
        characterLimit: response.character_limit,
      };

      if (response.api_key_character_count !== undefined) {
        usage.apiKeyCharacterCount = response.api_key_character_count;
      }
      if (response.api_key_character_limit !== undefined) {
        usage.apiKeyCharacterLimit = response.api_key_character_limit;
      }
      if (response.start_time) {
        usage.startTime = response.start_time;
      }
      if (response.end_time) {
        usage.endTime = response.end_time;
      }
      if (response.api_key_unit_count !== undefined) {
        usage.apiKeyUnitCount = response.api_key_unit_count;
      }
      if (response.api_key_unit_limit !== undefined) {
        usage.apiKeyUnitLimit = response.api_key_unit_limit;
      }
      if (response.account_unit_count !== undefined) {
        usage.accountUnitCount = response.account_unit_count;
      }
      if (response.account_unit_limit !== undefined) {
        usage.accountUnitLimit = response.account_unit_limit;
      }
      if (response.products) {
        usage.products = response.products.map((p) => ({
          productType: p.product_type,
          characterCount: p.character_count,
          apiKeyCharacterCount: p.api_key_character_count,
          ...(p.unit_count !== undefined && { unitCount: p.unit_count }),
          ...(p.account_unit_count !== undefined && {
            accountUnitCount: p.account_unit_count,
          }),
          ...(p.api_key_unit_count !== undefined && {
            apiKeyUnitCount: p.api_key_unit_count,
          }),
          ...(p.billing_unit && { billingUnit: p.billing_unit }),
        }));
      }

      return usage;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async listTranslationMemories(): Promise<TranslationMemory[]> {
    try {
      const first = await this.makeRequest<{
        translation_memories?: TranslationMemory[];
        total_count?: number;
      }>('GET', '/v3/translation_memories');

      const aggregated: TranslationMemory[] = [
        ...(first.translation_memories ?? []),
      ];
      const total = first.total_count;
      if (typeof total !== 'number' || aggregated.length >= total) {
        return aggregated;
      }

      const pageSize = TRANSLATION_MEMORY_LIST_PAGE_SIZE;
      let page = 1;
      while (page < MAX_TRANSLATION_MEMORY_LIST_PAGES) {
        const response = await this.makeRequest<{
          translation_memories?: TranslationMemory[];
          total_count?: number;
        }>('GET', '/v3/translation_memories', { page, page_size: pageSize });

        const batch = response.translation_memories ?? [];
        aggregated.push(...batch);

        if (batch.length === 0 || aggregated.length >= total) {
          return aggregated;
        }
        page += 1;
      }

      Logger.warn(
        `[warn] Stopped listing translation memories after ${MAX_TRANSLATION_MEMORY_LIST_PAGES} pages; results may be truncated.`
      );
      return aggregated;
    } catch (error) {
      throw this.handleError(error, 'listTranslationMemories');
    }
  }

  /**
   * The raw translate_text language list, fetched at most once per client. The
   * request does not vary by role and both roles are filtered out of the one
   * payload, so a caller asking for both costs a single request. A failed fetch
   * is not retained, leaving the next caller free to retry.
   */
  private translateLanguages?: Promise<DeepLV3LanguageResponse[]>;

  private fetchTranslateLanguages(): Promise<DeepLV3LanguageResponse[]> {
    this.translateLanguages ??= this.makeRequest<DeepLV3LanguageResponse[]>(
      'GET',
      '/v3/languages',
      { resource: 'translate_text' }
    ).catch((error: unknown) => {
      delete this.translateLanguages;
      throw error;
    });
    return this.translateLanguages;
  }

  /**
   * Lists languages via GET /v3/languages (v2 is deprecated). One response
   * carries both roles as usable_as_source/usable_as_target flags, filtered
   * here to preserve the per-type contract. Formality support comes from the
   * per-language features matrix, which is what v2's supports_formality became.
   */
  async getSupportedLanguages(
    type: 'source' | 'target'
  ): Promise<LanguageInfo[]> {
    try {
      const response = await this.fetchTranslateLanguages();

      return (
        response
          // `!== false`, not truthiness: an absent flag is not a denial, and the
          // language registry reads it the same way, so a truthy filter here would
          // drop a language the generator records as usable.
          .filter((lang) =>
            type === 'source'
              ? lang.usable_as_source !== false
              : lang.usable_as_target !== false
          )
          .map((lang) => {
            const code = this.normalizeLanguage(lang.lang);
            return {
              language: code,
              name: lang.name,
              // Only claimed when the response described this language's features;
              // silence about a language is not evidence that formality is absent.
              ...(type === 'target' &&
                lang.features && {
                  supportsFormality: lang.features['formality'] !== undefined,
                }),
              ...(lang.features && { features: lang.features }),
            };
          })
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private buildTranslationParams(
    texts: string[],
    options: TranslationOptions
  ): Record<string, string | string[] | number | boolean> {
    const params: Record<string, string | string[] | number | boolean> = {
      text: texts,
      target_lang: this.normalizeLanguage(options.targetLang).toUpperCase(),
    };

    if (options.sourceLang) {
      params['source_lang'] = this.normalizeLanguage(
        options.sourceLang
      ).toUpperCase();
    }

    if (options.formality) {
      params['formality'] = normalizeFormality(options.formality, 'text');
    }

    const glossaryParams = resolveGlossaryWireParams(options);
    if (glossaryParams) {
      Object.assign(params, glossaryParams);
    }

    if (options.translationMemoryId) {
      params['translation_memory_id'] = options.translationMemoryId;
      params['translation_memory_threshold'] = String(
        options.translationMemoryThreshold ?? 75
      );
    }

    if (options.preserveFormatting) {
      params['preserve_formatting'] = '1';
    }

    if (options.context) {
      params['context'] = options.context;
    }

    if (options.splitSentences) {
      const splitMap: Record<string, string> = { on: '1', off: '0' };
      params['split_sentences'] =
        splitMap[options.splitSentences] ?? options.splitSentences;
    }

    if (options.tagHandling) {
      params['tag_handling'] = options.tagHandling;
    }

    if (options.modelType) {
      params['model_type'] = options.modelType;
    }

    if (options.showBilledCharacters) {
      params['show_billed_characters'] = '1';
    }

    if (options.outlineDetection !== undefined) {
      params['outline_detection'] = options.outlineDetection ? '1' : '0';
    }

    if (options.splittingTags && options.splittingTags.length > 0) {
      params['splitting_tags'] = options.splittingTags.join(',');
    }

    if (options.nonSplittingTags && options.nonSplittingTags.length > 0) {
      params['non_splitting_tags'] = options.nonSplittingTags.join(',');
    }

    if (options.ignoreTags && options.ignoreTags.length > 0) {
      params['ignore_tags'] = options.ignoreTags.join(',');
    }

    if (options.customInstructions && options.customInstructions.length > 0) {
      params['custom_instructions'] = options.customInstructions;
    }

    if (options.styleId) {
      params['style_id'] = options.styleId;
    }

    const tagHandlingVersion = resolveTagHandlingVersion(options);
    if (tagHandlingVersion) {
      params['tag_handling_version'] = tagHandlingVersion;
    }

    return params;
  }
}
