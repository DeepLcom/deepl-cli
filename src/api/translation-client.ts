import { HttpClient, DeepLClientOptions } from './http-client.js';
import { TranslationOptions, Language } from '../types';

interface DeepLTranslateResponse {
  translations: Array<{
    detected_source_language?: string;
    text: string;
    billed_characters?: number;
    model_type_used?: string;
  }>;
  billed_characters?: number;
}

interface DeepLUsageResponse {
  character_count: number;
  character_limit: number;
  api_key_character_count?: number;
  api_key_character_limit?: number;
  api_key_unit_count?: number;
  api_key_unit_limit?: number;
  account_unit_count?: number;
  account_unit_limit?: number;
  speech_to_text_milliseconds_count?: number;
  speech_to_text_milliseconds_limit?: number;
  start_time?: string;
  end_time?: string;
  products?: Array<{
    product_type: string;
    character_count: number;
    api_key_character_count: number;
    unit_count?: number;
    api_key_unit_count?: number;
    billing_unit?: string;
  }>;
}

interface DeepLLanguageResponse {
  language: string;
  name: string;
  supports_formality?: boolean;
}

export interface TranslationResult {
  text: string;
  detectedSourceLang?: Language;
  billedCharacters?: number;
  modelTypeUsed?: string;
}

export interface ProductUsage {
  productType: string;
  characterCount: number;
  apiKeyCharacterCount: number;
  unitCount?: number;
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
  speechToTextMillisecondsCount?: number;
  speechToTextMillisecondsLimit?: number;
  startTime?: string;
  endTime?: string;
  products?: ProductUsage[];
}

export interface LanguageInfo {
  language: Language;
  name: string;
  supportsFormality?: boolean;
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
      const response = await this.makeRequest<DeepLTranslateResponse>(
        'POST',
        '/v2/translate',
        params
      );

      if (!response.translations || response.translations.length === 0) {
        throw new Error(`No translation returned from DeepL API. Request: translate text (${text.length} chars) to ${options.targetLang}`);
      }

      const translation = response.translations[0];
      if (!translation) {
        throw new Error(`Empty translation in API response. Request: translate text (${text.length} chars) to ${options.targetLang}`);
      }

      return {
        text: translation.text,
        detectedSourceLang: translation.detected_source_language
          ? this.normalizeLanguage(translation.detected_source_language)
          : undefined,
        billedCharacters: translation.billed_characters ?? response.billed_characters,
        modelTypeUsed: translation.model_type_used,
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
      const response = await this.makeRequest<DeepLTranslateResponse>(
        'POST',
        '/v2/translate',
        params
      );

      if (!response.translations) {
        throw new Error(`No translations returned from DeepL API. Request: batch translate ${texts.length} texts to ${options.targetLang}`);
      }

      if (response.translations.length !== texts.length) {
        throw new Error(`Translation count mismatch: sent ${texts.length} texts but received ${response.translations.length} translations. Target language: ${options.targetLang}`);
      }

      return response.translations.map((translation) => ({
        text: translation.text,
        detectedSourceLang: translation.detected_source_language
          ? this.normalizeLanguage(translation.detected_source_language)
          : undefined,
        billedCharacters: translation.billed_characters ?? response.billed_characters,
        modelTypeUsed: translation.model_type_used,
      }));
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
      if (response.speech_to_text_milliseconds_count !== undefined) {
        usage.speechToTextMillisecondsCount = response.speech_to_text_milliseconds_count;
      }
      if (response.speech_to_text_milliseconds_limit !== undefined) {
        usage.speechToTextMillisecondsLimit = response.speech_to_text_milliseconds_limit;
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
        usage.products = response.products.map(p => ({
          productType: p.product_type,
          characterCount: p.character_count,
          apiKeyCharacterCount: p.api_key_character_count,
          ...(p.unit_count !== undefined && { unitCount: p.unit_count }),
          ...(p.api_key_unit_count !== undefined && { apiKeyUnitCount: p.api_key_unit_count }),
          ...(p.billing_unit && { billingUnit: p.billing_unit }),
        }));
      }

      return usage;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getSupportedLanguages(
    type: 'source' | 'target'
  ): Promise<LanguageInfo[]> {
    try {
      const response = await this.makeRequest<DeepLLanguageResponse[]>(
        'GET',
        '/v2/languages',
        { type }
      );

      return response.map((lang) => ({
        language: this.normalizeLanguage(lang.language),
        name: lang.name,
        ...(lang.supports_formality !== undefined && { supportsFormality: lang.supports_formality }),
      }));
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
      params['source_lang'] = this.normalizeLanguage(options.sourceLang).toUpperCase();
    }

    if (options.formality) {
      params['formality'] = options.formality;
    }

    if (options.glossaryId) {
      params['glossary_id'] = options.glossaryId;
    }

    if (options.preserveFormatting) {
      params['preserve_formatting'] = '1';
    }

    if (options.context) {
      params['context'] = options.context;
    }

    if (options.splitSentences) {
      const splitMap: Record<string, string> = { on: '1', off: '0' };
      params['split_sentences'] = splitMap[options.splitSentences] ?? options.splitSentences;
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

    if (options.tagHandlingVersion) {
      params['tag_handling_version'] = options.tagHandlingVersion;
    }

    if (options.enableBetaLanguages) {
      params['enable_beta_languages'] = '1';
    }

    return params;
  }
}
