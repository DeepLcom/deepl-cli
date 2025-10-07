/**
 * DeepL API Client
 * Wrapper around DeepL API with error handling and retry logic
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { TranslationOptions, Language } from '../types';

interface DeepLClientOptions {
  usePro?: boolean;
  timeout?: number;
  maxRetries?: number;
  baseUrl?: string;
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

export interface GlossaryInfo {
  glossary_id: string;
  name: string;
  ready: boolean;
  source_lang: string;
  target_lang: string;
  creation_time: string;
  entry_count: number;
}

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

    this.client = axios.create({
      baseURL,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
      },
    });
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
   * Make HTTP request with retry logic
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    data?: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        let config: Record<string, unknown> = {};

        if (method === 'GET') {
          config = { params: data };
        } else if (method === 'POST') {
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
   * Create a glossary
   */
  async createGlossary(
    name: string,
    sourceLang: string,
    targetLang: string,
    entries: string
  ): Promise<GlossaryInfo> {
    const response = await this.client.post<GlossaryInfo>('/glossaries', {
      name,
      source_lang: sourceLang,
      target_lang: targetLang,
      entries,
      entries_format: 'tsv',
    });

    return response.data;
  }

  /**
   * List all glossaries
   */
  async listGlossaries(): Promise<GlossaryInfo[]> {
    const response = await this.client.get<{ glossaries: GlossaryInfo[] }>('/glossaries');
    return response.data.glossaries || [];
  }

  /**
   * Get glossary information
   */
  async getGlossary(glossaryId: string): Promise<GlossaryInfo> {
    const response = await this.client.get<GlossaryInfo>(`/glossaries/${glossaryId}`);
    return response.data;
  }

  /**
   * Delete a glossary
   */
  async deleteGlossary(glossaryId: string): Promise<void> {
    await this.client.delete(`/glossaries/${glossaryId}`);
  }

  /**
   * Get glossary entries
   */
  async getGlossaryEntries(glossaryId: string): Promise<string> {
    const response = await this.client.get<string>(
      `/glossaries/${glossaryId}/entries`,
      {
        headers: {
          Accept: 'text/tab-separated-values',
        },
      }
    );
    return response.data;
  }
}
