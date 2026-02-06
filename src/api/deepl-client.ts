/**
 * DeepL API Client
 * Wrapper around DeepL API with error handling and retry logic
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as http from 'http';
import * as https from 'https';
import {
  TranslationOptions,
  Language,
  WriteOptions,
  WriteImprovement,
  DocumentTranslationOptions,
  DocumentHandle,
  DocumentStatus,
  GlossaryInfo,
  GlossaryLanguagePair,
  StyleRule,
  StyleRuleDetailed,
  StyleRulesListOptions,
  AdminApiKey,
  AdminUsageEntry,
  AdminUsageOptions,
} from '../types';
import { normalizeGlossaryInfo, GlossaryApiResponse } from '../types/glossary.js';

interface ProxyConfig {
  protocol?: 'http' | 'https';
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

interface DeepLClientOptions {
  usePro?: boolean;
  timeout?: number;
  maxRetries?: number;
  baseUrl?: string;
  proxy?: ProxyConfig;
}

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
  start_time?: string;
  end_time?: string;
  products?: Array<{
    product_type: string;
    character_count: number;
    api_key_character_count: number;
  }>;
}

interface DeepLLanguageResponse {
  language: string;
  name: string;
  supports_formality?: boolean;
}

interface DeepLWriteResponse {
  improvements: Array<{
    text: string;
    target_language: string;
    detected_source_language?: string;
  }>;
}

interface DeepLDocumentUploadResponse {
  document_id: string;
  document_key: string;
}

interface DeepLDocumentStatusResponse {
  document_id: string;
  status: 'queued' | 'translating' | 'done' | 'error';
  seconds_remaining?: number;
  billed_characters?: number;
  error_message?: string;
}

interface DeepLGlossaryLanguagePairsResponse {
  supported_languages: Array<{
    source_lang: string;
    target_lang: string;
  }>;
}

// GlossaryInfo now imported from types

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
}

export interface UsageInfo {
  characterCount: number;
  characterLimit: number;
  apiKeyCharacterCount?: number;
  apiKeyCharacterLimit?: number;
  startTime?: string;
  endTime?: string;
  products?: ProductUsage[];
}

export interface LanguageInfo {
  language: Language;
  name: string;
  supportsFormality?: boolean;
}

const FREE_API_URL = 'https://api-free.deepl.com';
const PRO_API_URL = 'https://api.deepl.com';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;

export class DeepLClient {
  private client: AxiosInstance;
  private maxRetries: number;

  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('API key is required');
    }

    const baseURL = options.baseUrl ?? (options.usePro ? PRO_API_URL : FREE_API_URL);

    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    // Build axios config with HTTP keep-alive for connection reuse
    // This significantly improves performance for batch translations
    const axiosConfig: Record<string, unknown> = {
      baseURL,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Connection': 'keep-alive',
      },
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 10,
        maxFreeSockets: 10,
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 10,
        maxFreeSockets: 10,
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
      }),
    };

    // Add proxy configuration if provided
    let proxyConfig = options.proxy;

    // Check for proxy environment variables if no explicit proxy config
    if (!proxyConfig) {
      const httpProxy = process.env['HTTP_PROXY'] ?? process.env['http_proxy'];
      const httpsProxy = process.env['HTTPS_PROXY'] ?? process.env['https_proxy'];
      const proxyUrl = httpsProxy ?? httpProxy;

      if (proxyUrl) {
        try {
          const url = new URL(proxyUrl);
          proxyConfig = {
            protocol: url.protocol.replace(':', '') as 'http' | 'https',
            host: url.hostname,
            port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10),
          };

          // Add auth if present in URL
          if (url.username && url.password) {
            proxyConfig.auth = {
              username: url.username,
              password: url.password,
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Invalid proxy URL "${proxyUrl}": ${errorMessage}`);
        }
      }
    }

    // Apply proxy config to axios
    if (proxyConfig) {
      axiosConfig['proxy'] = {
        protocol: proxyConfig.protocol,
        host: proxyConfig.host,
        port: proxyConfig.port,
        ...(proxyConfig.auth && { auth: proxyConfig.auth }),
      };
    }

    this.client = axios.create(axiosConfig);
  }

  /**
   * Translate text
   */
  async translate(
    text: string,
    options: TranslationOptions
  ): Promise<TranslationResult> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

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

  /**
   * Translate multiple texts in a single API call
   * More efficient than calling translate() multiple times
   */
  async translateBatch(
    texts: string[],
    options: TranslationOptions
  ): Promise<TranslationResult[]> {
    // Handle empty array
    if (texts.length === 0) {
      return [];
    }

    // Build request parameters using shared helper
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

      // Verify we got the same number of translations as texts
      if (response.translations.length !== texts.length) {
        throw new Error(`Translation count mismatch: sent ${texts.length} texts but received ${response.translations.length} translations. Target language: ${options.targetLang}`);
      }

      // Map response translations to results
      // Note: billed_characters can be returned per translation or at the batch level
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

  /**
   * Get usage statistics
   */
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
      if (response.products) {
        usage.products = response.products.map(p => ({
          productType: p.product_type,
          characterCount: p.character_count,
          apiKeyCharacterCount: p.api_key_character_count,
        }));
      }

      return usage;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get supported languages
   */
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

  /**
   * Get supported glossary language pairs
   */
  async getGlossaryLanguages(): Promise<GlossaryLanguagePair[]> {
    try {
      const response = await this.makeRequest<DeepLGlossaryLanguagePairsResponse>(
        'GET',
        '/v2/glossary-language-pairs'
      );

      return response.supported_languages.map((pair) => ({
        sourceLang: this.normalizeLanguage(pair.source_lang),
        targetLang: this.normalizeLanguage(pair.target_lang),
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * List all API keys (Admin API)
   */
  async listApiKeys(): Promise<AdminApiKey[]> {
    try {
      const response = await this.client.get<Array<{
        key_id: string;
        label: string;
        creation_time: string;
        is_deactivated: boolean;
        usage_limits?: { characters?: number | null };
      }>>('/v2/admin/developer-keys');

      return response.data.map((key) => this.normalizeApiKey(key));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a new API key (Admin API)
   */
  async createApiKey(label?: string): Promise<AdminApiKey> {
    try {
      const body: Record<string, string> = {};
      if (label) {
        body['label'] = label;
      }

      const response = await this.client.post<{
        key_id: string;
        label: string;
        creation_time: string;
        is_deactivated: boolean;
        usage_limits?: { characters?: number | null };
      }>('/v2/admin/developer-keys', body, {
        headers: { 'Content-Type': 'application/json' },
      });

      return this.normalizeApiKey(response.data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Deactivate an API key (Admin API, permanent)
   */
  async deactivateApiKey(keyId: string): Promise<void> {
    try {
      await this.client.put('/v2/admin/developer-keys/deactivate', { key_id: keyId }, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Rename an API key (Admin API)
   */
  async renameApiKey(keyId: string, label: string): Promise<void> {
    try {
      await this.client.put('/v2/admin/developer-keys/label', { key_id: keyId, label }, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Set usage limit for an API key (Admin API)
   */
  async setApiKeyLimit(keyId: string, characters: number | null): Promise<void> {
    try {
      await this.client.put('/v2/admin/developer-keys/limits', { key_id: keyId, characters }, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get organization usage analytics (Admin API)
   */
  async getAdminUsage(options: AdminUsageOptions): Promise<AdminUsageEntry[]> {
    try {
      const params: Record<string, string> = {
        start_date: options.startDate,
        end_date: options.endDate,
      };

      if (options.groupBy) {
        params['group_by'] = options.groupBy;
      }

      const response = await this.client.get<Array<{
        key_id?: string;
        date?: string;
        characters_translated: number;
        characters_billed: number;
      }>>('/v2/admin/usage', { params });

      return response.data.map((entry) => ({
        keyId: entry.key_id,
        date: entry.date,
        charactersTranslated: entry.characters_translated,
        charactersBilled: entry.characters_billed,
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private normalizeApiKey(key: {
    key_id: string;
    label: string;
    creation_time: string;
    is_deactivated: boolean;
    usage_limits?: { characters?: number | null };
  }): AdminApiKey {
    return {
      keyId: key.key_id,
      label: key.label,
      creationTime: key.creation_time,
      isDeactivated: key.is_deactivated,
      usageLimits: key.usage_limits,
    };
  }

  /**
   * Get style rules (v3 API)
   */
  async getStyleRules(
    options: StyleRulesListOptions = {}
  ): Promise<(StyleRule | StyleRuleDetailed)[]> {
    try {
      const params: Record<string, string | number | boolean> = {};

      if (options.detailed) {
        params['detailed'] = true;
      }

      if (options.page !== undefined) {
        params['page'] = options.page;
      }

      if (options.pageSize !== undefined) {
        params['page_size'] = options.pageSize;
      }

      const response = await this.client.get<{
        style_rules: Array<{
          style_id: string;
          name: string;
          language: string;
          version: number;
          creation_time: string;
          updated_time: string;
          configured_rules?: string[];
          custom_instructions?: string[];
        }>;
      }>('/v3/style_rules', { params });

      return response.data.style_rules.map((rule) => {
        const base: StyleRule = {
          styleId: rule.style_id,
          name: rule.name,
          language: rule.language,
          version: rule.version,
          creationTime: rule.creation_time,
          updatedTime: rule.updated_time,
        };

        if (options.detailed && rule.configured_rules && rule.custom_instructions) {
          return {
            ...base,
            configuredRules: rule.configured_rules,
            customInstructions: rule.custom_instructions,
          } as StyleRuleDetailed;
        }

        return base;
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    data?: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        let config: Record<string, unknown> = {};

        if (method === 'GET') {
          config = { params: data };
        } else if (method === 'POST' || method === 'PATCH') {
          // DeepL API uses form-encoded data
          const formData = new URLSearchParams();
          if (data) {
            for (const [key, value] of Object.entries(data)) {
              if (Array.isArray(value)) {
                value.forEach(v => formData.append(key, String(v)));
              } else {
                formData.append(key, String(value));
              }
            }
          }
          config = {
            data: formData.toString(),
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          };
        } else if (method === 'DELETE') {
          // DELETE typically doesn't have a body
          config = {};
        }

        const response = await this.client.request<T>({
          method,
          url: path,
          ...config,
        });

        return response.data;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (this.isAxiosError(error)) {
          const status = error.response?.status;
          if (status && status >= 400 && status < 500) {
            throw error;
          }
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Handle and normalize errors
   */
  private handleError(error: unknown): Error {
    if (this.isAxiosError(error)) {
      const status = error.response?.status;
      const responseData = error.response?.data as { message?: string } | undefined;
      const message = responseData?.message ?? error.message;

      switch (status) {
        case 403:
          return new Error('Authentication failed: Invalid API key');
        case 456:
          return new Error('Quota exceeded: Character limit reached');
        case 429:
          return new Error('Rate limit exceeded: Too many requests');
        case 503:
          return new Error('Service temporarily unavailable: Please try again later');
        default:
          return new Error(`API error: ${message}`);
      }
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error('Unknown error occurred');
  }

  /**
   * Normalize language code to lowercase
   */
  private normalizeLanguage(lang: string): Language {
    return lang.toLowerCase() as Language;
  }

  private validateGlossaryId(glossaryId: string): void {
    if (!/^[a-zA-Z0-9-]+$/.test(glossaryId)) {
      throw new Error('Invalid glossary ID format');
    }
  }

  /**
   * Type guard for Axios errors
   */
  private isAxiosError(error: unknown): error is AxiosError {
    return axios.isAxiosError(error);
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Build translation parameters from options
   * Shared between translate() and translateBatch()
   */
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
      params['split_sentences'] = options.splitSentences;
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

    return params;
  }

  /**
   * Create a glossary (v3 API - supports multilingual glossaries)
   * v3 API requires dictionaries array in JSON format (not form-encoded)
   */
  async createGlossary(
    name: string,
    sourceLang: Language,
    targetLangs: Language[],
    entries: string
  ): Promise<GlossaryInfo> {
    if (targetLangs.length === 0) {
      throw new Error('At least one target language is required');
    }

    try {
      // v3 API expects dictionaries array, not flat structure
      // Create a dictionary for each target language
      const dictionaries = targetLangs.map(targetLang => ({
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
        entries,
        entries_format: 'tsv',
      }));

      const requestBody = {
        name,
        dictionaries,
      };

      // v3 glossary creation requires JSON, not form-encoded data
      // Use axios client directly instead of makeRequest
      const response = await this.client.post<GlossaryApiResponse>(
        '/v3/glossaries',
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return normalizeGlossaryInfo(response.data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * List all glossaries (v3 API)
   */
  async listGlossaries(): Promise<GlossaryInfo[]> {
    try {
      const response = await this.makeRequest<{ glossaries: GlossaryApiResponse[] }>(
        'GET',
        '/v3/glossaries'
      );

      return (response.glossaries || []).map(normalizeGlossaryInfo);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get glossary information (v3 API)
   */
  async getGlossary(glossaryId: string): Promise<GlossaryInfo> {
    this.validateGlossaryId(glossaryId);
    try {
      const response = await this.makeRequest<GlossaryApiResponse>(
        'GET',
        `/v3/glossaries/${glossaryId}`
      );

      return normalizeGlossaryInfo(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Delete a glossary (v3 API)
   */
  async deleteGlossary(glossaryId: string): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'DELETE',
        `/v3/glossaries/${glossaryId}`
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get glossary entries for a specific language pair (v3 API)
   * Note: v3 API returns JSON with TSV data in entries field, not raw TSV
   */
  async getGlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<string> {
    this.validateGlossaryId(glossaryId);
    try {
      // v3 API requires source and target lang query params
      // v3 always returns JSON with structure: { dictionaries: [{ entries: "tsv data" }] }
      const response = await this.client.get<{
        dictionaries: Array<{
          source_lang: string;
          target_lang: string;
          entries: string;
          entries_format: string;
        }>;
      }>(
        `/v3/glossaries/${glossaryId}/entries`,
        {
          params: {
            source_lang: sourceLang.toUpperCase(),
            target_lang: targetLang.toUpperCase(),
          },
        }
      );

      // Extract TSV data from the first dictionary
      if (!response.data.dictionaries || response.data.dictionaries.length === 0) {
        return '';
      }

      const dictionary = response.data.dictionaries[0];
      if (!dictionary) {
        return '';
      }

      return dictionary.entries;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Update glossary entries for a specific language pair (v3 API)
   */
  async updateGlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    entries: string
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'PATCH',
        `/v3/glossaries/${glossaryId}/dictionaries/${sourceLang.toUpperCase()}-${targetLang.toUpperCase()}`,
        {
          entries,
          entries_format: 'tsv',
        }
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Rename a glossary (v3 API)
   */
  async renameGlossary(glossaryId: string, newName: string): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'PATCH',
        `/v3/glossaries/${glossaryId}`,
        {
          name: newName,
        }
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Delete a dictionary from a multilingual glossary (v3 API)
   * Removes a specific language pair from the glossary
   */
  async deleteGlossaryDictionary(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<void> {
    this.validateGlossaryId(glossaryId);
    try {
      await this.makeRequest<void>(
        'DELETE',
        `/v3/glossaries/${glossaryId}/dictionaries/${sourceLang.toUpperCase()}-${targetLang.toUpperCase()}`
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Improve text using DeepL Write API
   */
  async improveText(
    text: string,
    options: WriteOptions
  ): Promise<WriteImprovement[]> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    if (options.writingStyle && options.tone) {
      throw new Error('Cannot specify both writing_style and tone in a single request');
    }

    const params: Record<string, string | string[]> = {
      text: [text],
      target_lang: options.targetLang,
    };

    if (options.writingStyle) {
      params['writing_style'] = options.writingStyle;
    }

    if (options.tone) {
      params['tone'] = options.tone;
    }

    try {
      const response = await this.makeRequest<DeepLWriteResponse>(
        'POST',
        '/v2/write/rephrase',
        params
      );

      if (!response.improvements || response.improvements.length === 0) {
        throw new Error('No improvements returned');
      }

      return response.improvements.map(improvement => ({
        text: improvement.text,
        targetLanguage: improvement.target_language as WriteImprovement['targetLanguage'],
        detectedSourceLanguage: improvement.detected_source_language,
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Upload document for translation
   */
  async uploadDocument(
    file: Buffer,
    options: DocumentTranslationOptions
  ): Promise<DocumentHandle> {
    if (!file || file.length === 0) {
      throw new Error('Document file cannot be empty');
    }

    if (!options.filename) {
      throw new Error('filename is required when uploading document as Buffer');
    }

    // Create form data with multipart/form-data
    const { default: FormData } = await import('form-data');
    const formData = new FormData();

    formData.append('file', file, options.filename);
    formData.append('target_lang', this.normalizeLanguage(options.targetLang).toUpperCase());

    if (options.sourceLang) {
      formData.append('source_lang', this.normalizeLanguage(options.sourceLang).toUpperCase());
    }

    if (options.formality) {
      formData.append('formality', options.formality);
    }

    if (options.glossaryId) {
      formData.append('glossary_id', options.glossaryId);
    }

    if (options.outputFormat) {
      formData.append('output_format', options.outputFormat);
    }

    if (options.enableDocumentMinification) {
      formData.append('enable_document_minification', '1');
    }

    try {
      const response = await this.client.request<DeepLDocumentUploadResponse>({
        method: 'POST',
        url: '/v2/document',
        data: formData,
        headers: {
          ...formData.getHeaders(),
        },
      });

      return {
        documentId: response.data.document_id,
        documentKey: response.data.document_key,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get document translation status
   */
  async getDocumentStatus(handle: DocumentHandle): Promise<DocumentStatus> {
    const formData = new URLSearchParams();
    formData.append('document_key', handle.documentKey);

    try {
      const response = await this.client.request<DeepLDocumentStatusResponse>({
        method: 'POST',
        url: `/v2/document/${handle.documentId}`,
        data: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return {
        documentId: response.data.document_id,
        status: response.data.status,
        secondsRemaining: response.data.seconds_remaining,
        billedCharacters: response.data.billed_characters,
        errorMessage: response.data.error_message,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Download translated document
   */
  async downloadDocument(handle: DocumentHandle): Promise<Buffer> {
    const formData = new URLSearchParams();
    formData.append('document_key', handle.documentKey);

    try {
      const response = await this.client.request<Buffer>({
        method: 'POST',
        url: `/v2/document/${handle.documentId}/result`,
        data: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
