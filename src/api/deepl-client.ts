/**
 * DeepL API Client
 * Wrapper around DeepL API with error handling and retry logic
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
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
  }>;
}

interface DeepLUsageResponse {
  character_count: number;
  character_limit: number;
}

interface DeepLLanguageResponse {
  language: string;
  name: string;
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
}

export interface UsageInfo {
  characterCount: number;
  characterLimit: number;
}

export interface LanguageInfo {
  language: Language;
  name: string;
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

    // Build axios config
    const axiosConfig: Record<string, unknown> = {
      baseURL,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
      },
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
        } catch {
          // Invalid proxy URL, ignore and continue without proxy
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

    const params: Record<string, string | string[]> = {
      text: [text],
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

    try {
      const response = await this.makeRequest<DeepLTranslateResponse>(
        'POST',
        '/v2/translate',
        params
      );

      if (!response.translations || response.translations.length === 0) {
        throw new Error('No translation returned');
      }

      const translation = response.translations[0];
      if (!translation) {
        throw new Error('No translation returned');
      }

      return {
        text: translation.text,
        detectedSourceLang: translation.detected_source_language
          ? this.normalizeLanguage(translation.detected_source_language)
          : undefined,
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

    // Build request parameters
    const params: Record<string, string | string[]> = {
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

    try {
      const response = await this.makeRequest<DeepLTranslateResponse>(
        'POST',
        '/v2/translate',
        params
      );

      if (!response.translations) {
        throw new Error('No translations returned');
      }

      // Verify we got the same number of translations as texts
      if (response.translations.length !== texts.length) {
        throw new Error('Mismatch between texts sent and translations received');
      }

      // Map response translations to results
      return response.translations.map((translation) => ({
        text: translation.text,
        detectedSourceLang: translation.detected_source_language
          ? this.normalizeLanguage(translation.detected_source_language)
          : undefined,
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

      return {
        characterCount: response.character_count,
        characterLimit: response.character_limit,
      };
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
   * Create a glossary (v3 API - supports multilingual glossaries)
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
      const response = await this.makeRequest<GlossaryApiResponse>(
        'POST',
        '/v3/glossaries',
        {
          name,
          source_lang: sourceLang.toUpperCase(),
          target_langs: targetLangs.map(lang => lang.toUpperCase()),
          entries,
          entries_format: 'tsv',
        }
      );

      return normalizeGlossaryInfo(response);
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
   */
  async getGlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<string> {
    try {
      // v3 API requires source and target lang query params
      const response = await this.client.get<string>(
        `/v3/glossaries/${glossaryId}/entries`,
        {
          params: {
            source_lang: sourceLang.toUpperCase(),
            target_lang: targetLang.toUpperCase(),
          },
          headers: {
            Accept: 'text/tab-separated-values',
          },
        }
      );
      return response.data;
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
