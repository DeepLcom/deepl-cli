/**
 * Tests for TranslationClient
 * Covers translate, translateBatch, getUsage, getSupportedLanguages
 */

import { TranslationClient, isTranslationResult } from '../../src/api/translation-client.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TranslationClient', () => {
  let client: TranslationClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAxiosInstance = {
      request: jest.fn(),
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false);

    client = new TranslationClient('test-api-key');
  });

  afterAll(() => {
    client.destroy();
  });

  describe('constructor', () => {
    it('should create a TranslationClient instance', () => {
      expect(client).toBeInstanceOf(TranslationClient);
    });

    it('should throw error for empty API key', () => {
      expect(() => new TranslationClient('')).toThrow('API key is required');
    });

    it('should use Free API URL by default', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api-free.deepl.com',
        }),
      );
    });
  });

  describe('translate()', () => {
    it('should translate text successfully', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          translations: [{ text: 'Hola', detected_source_language: 'EN' }],
        },
        status: 200,
        headers: {},
      });

      const result = await client.translate('Hello', { targetLang: 'es' });

      expect(result.text).toBe('Hola');
      expect(result.detectedSourceLang).toBe('en');
    });

    it('should include billed_characters when present', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          translations: [{ text: 'Hola', billed_characters: 5 }],
        },
        status: 200,
        headers: {},
      });

      const result = await client.translate('Hello', { targetLang: 'es' });

      expect(result.billedCharacters).toBe(5);
    });

    it('should use top-level billed_characters as fallback', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          translations: [{ text: 'Hola' }],
          billed_characters: 10,
        },
        status: 200,
        headers: {},
      });

      const result = await client.translate('Hello', { targetLang: 'es' });

      expect(result.billedCharacters).toBe(10);
    });

    it('should include model_type_used when present', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          translations: [{ text: 'Hola', model_type_used: 'quality_optimized' }],
        },
        status: 200,
        headers: {},
      });

      const result = await client.translate('Hello', { targetLang: 'es' });

      expect(result.modelTypeUsed).toBe('quality_optimized');
    });

    it('should throw NetworkError when no translations returned', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { translations: [] },
        status: 200,
        headers: {},
      });

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('No translation returned');
    });

    it('should throw on 403 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 403, data: { message: 'Forbidden' }, headers: {} },
        message: 'Forbidden',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow();
    });
  });

  describe('translateBatch()', () => {
    it('should translate multiple texts', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          translations: [
            { text: 'Hola', detected_source_language: 'EN' },
            { text: 'Mundo', detected_source_language: 'EN' },
          ],
        },
        status: 200,
        headers: {},
      });

      const result = await client.translateBatch(['Hello', 'World'], { targetLang: 'es' });

      expect(result).toHaveLength(2);
      expect(result[0]!.text).toBe('Hola');
      expect(result[1]!.text).toBe('Mundo');
    });

    it('should return empty array for empty input', async () => {
      const result = await client.translateBatch([], { targetLang: 'es' });

      expect(result).toEqual([]);
      expect(mockAxiosInstance.request).not.toHaveBeenCalled();
    });

    it('should throw NetworkError on count mismatch', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          translations: [{ text: 'Hola' }],
        },
        status: 200,
        headers: {},
      });

      await expect(
        client.translateBatch(['Hello', 'World'], { targetLang: 'es' })
      ).rejects.toThrow('Translation count mismatch');
    });

    it('should throw when no translations returned', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {},
        status: 200,
        headers: {},
      });

      await expect(
        client.translateBatch(['Hello'], { targetLang: 'es' })
      ).rejects.toThrow('No translations returned');
    });
  });

  describe('getUsage()', () => {
    it('should return usage information', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          character_count: 50000,
          character_limit: 500000,
        },
        status: 200,
        headers: {},
      });

      const result = await client.getUsage();

      expect(result.characterCount).toBe(50000);
      expect(result.characterLimit).toBe(500000);
    });

    it('should include optional fields when present', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          character_count: 100,
          character_limit: 1000,
          api_key_character_count: 50,
          api_key_character_limit: 500,
          start_time: '2024-01-01',
          end_time: '2024-12-31',
          speech_to_text_milliseconds_count: 5000,
          speech_to_text_milliseconds_limit: 60000,
          api_key_unit_count: 10,
          api_key_unit_limit: 100,
          account_unit_count: 20,
          account_unit_limit: 200,
        },
        status: 200,
        headers: {},
      });

      const result = await client.getUsage();

      expect(result.apiKeyCharacterCount).toBe(50);
      expect(result.apiKeyCharacterLimit).toBe(500);
      expect(result.startTime).toBe('2024-01-01');
      expect(result.endTime).toBe('2024-12-31');
      expect(result.speechToTextMillisecondsCount).toBe(5000);
      expect(result.speechToTextMillisecondsLimit).toBe(60000);
      expect(result.apiKeyUnitCount).toBe(10);
      expect(result.apiKeyUnitLimit).toBe(100);
      expect(result.accountUnitCount).toBe(20);
      expect(result.accountUnitLimit).toBe(200);
    });

    it('should include products when present', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          character_count: 100,
          character_limit: 1000,
          products: [
            {
              product_type: 'translation',
              character_count: 80,
              api_key_character_count: 40,
              unit_count: 5,
              api_key_unit_count: 3,
              billing_unit: 'character',
            },
          ],
        },
        status: 200,
        headers: {},
      });

      const result = await client.getUsage();

      expect(result.products).toHaveLength(1);
      expect(result.products![0]!.productType).toBe('translation');
      expect(result.products![0]!.unitCount).toBe(5);
      expect(result.products![0]!.billingUnit).toBe('character');
    });
  });

  describe('getSupportedLanguages()', () => {
    it('should return source languages', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          { language: 'EN', name: 'English' },
          { language: 'DE', name: 'German', supports_formality: true },
        ],
        status: 200,
        headers: {},
      });

      const result = await client.getSupportedLanguages('source');

      expect(result).toHaveLength(2);
      expect(result[0]!.language).toBe('en');
      expect(result[0]!.name).toBe('English');
      expect(result[1]!.supportsFormality).toBe(true);
    });

    it('should return target languages', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          { language: 'ES', name: 'Spanish', supports_formality: true },
        ],
        status: 200,
        headers: {},
      });

      const result = await client.getSupportedLanguages('target');

      expect(result).toHaveLength(1);
      expect(result[0]!.language).toBe('es');
    });
  });

  describe('isTranslationResult()', () => {
    it('should return true for valid result', () => {
      expect(isTranslationResult({ text: 'hello' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isTranslationResult(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isTranslationResult('string')).toBe(false);
    });

    it('should return false for missing text field', () => {
      expect(isTranslationResult({ other: 'value' })).toBe(false);
    });

    it('should return false for non-string text field', () => {
      expect(isTranslationResult({ text: 123 })).toBe(false);
    });
  });
});
