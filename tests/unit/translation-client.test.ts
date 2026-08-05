/**
 * Tests for TranslationClient
 * Covers translate, translateBatch, getUsage, getSupportedLanguages
 */

import {
  TranslationClient,
  isTranslationResult,
  MAX_TRANSLATION_MEMORY_LIST_PAGES,
  TRANSLATION_MEMORY_LIST_PAGE_SIZE,
} from '../../src/api/translation-client.js';
import { Logger } from '../../src/utils/logger.js';
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
        })
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
          translations: [
            { text: 'Hola', model_type_used: 'quality_optimized' },
          ],
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

      const result = await client.translateBatch(['Hello', 'World'], {
        targetLang: 'es',
      });

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
      ).rejects.toThrow('Unexpected API response');
    });

    it('should throw when no translations returned', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {},
        status: 200,
        headers: {},
      });

      await expect(
        client.translateBatch(['Hello'], { targetLang: 'es' })
      ).rejects.toThrow('Unexpected API response');
    });
  });

  describe('translation memory params', () => {
    const TM_UUID = '11111111-2222-3333-4444-555555555555';

    beforeEach(() => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { translations: [{ text: 'Hola' }] },
        status: 200,
        headers: {},
      });
    });

    const getRequestBody = (): string => {
      const call = mockAxiosInstance.request.mock.calls[0]?.[0];
      return (call?.data ?? '') as string;
    };

    it('should emit translation_memory_id when translationMemoryId is set', async () => {
      await client.translate('Hello', {
        targetLang: 'es',
        translationMemoryId: TM_UUID,
      });
      expect(getRequestBody()).toContain(`translation_memory_id=${TM_UUID}`);
    });

    it('should default translation_memory_threshold to 75 when only translationMemoryId is set', async () => {
      await client.translate('Hello', {
        targetLang: 'es',
        translationMemoryId: TM_UUID,
      });
      expect(getRequestBody()).toContain('translation_memory_threshold=75');
    });

    it('should use explicit translation_memory_threshold when provided', async () => {
      await client.translate('Hello', {
        targetLang: 'es',
        translationMemoryId: TM_UUID,
        translationMemoryThreshold: 80,
      });
      expect(getRequestBody()).toContain('translation_memory_threshold=80');
    });

    it('should omit both keys when translationMemoryId is not set', async () => {
      await client.translate('Hello', {
        targetLang: 'es',
        translationMemoryThreshold: 80,
      });
      const body = getRequestBody();
      expect(body).not.toContain('translation_memory_id');
      expect(body).not.toContain('translation_memory_threshold');
    });

    it('should emit both glossary_id and translation_memory_id when both are set', async () => {
      const GLOSSARY_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      await client.translate('Hello', {
        targetLang: 'es',
        glossaryId: GLOSSARY_UUID,
        translationMemoryId: TM_UUID,
      });
      const body = getRequestBody();
      expect(body).toContain(`glossary_id=${GLOSSARY_UUID}`);
      expect(body).toContain(`translation_memory_id=${TM_UUID}`);
    });
  });

  describe('glossary params', () => {
    const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    beforeEach(() => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { translations: [{ text: 'Hola' }] },
        status: 200,
        headers: {},
      });
    });

    const getRequestBody = (): string => {
      const call = mockAxiosInstance.request.mock.calls[0]?.[0];
      return (call?.data ?? '') as string;
    };

    it('should send glossary_id for a single glossaryId', async () => {
      await client.translate('Hello', { targetLang: 'es', glossaryId: A });
      const body = getRequestBody();
      expect(body).toContain(`glossary_id=${A}`);
      expect(body).not.toContain('glossary_ids');
    });

    it('should send glossary_id when glossaryIds holds exactly one ID', async () => {
      await client.translate('Hello', { targetLang: 'es', glossaryIds: [A] });
      const body = getRequestBody();
      expect(body).toContain(`glossary_id=${A}`);
      expect(body).not.toContain('glossary_ids');
    });

    it('should send repeated glossary_ids fields for several glossaries', async () => {
      await client.translate('Hello', {
        targetLang: 'es',
        glossaryIds: [A, B, C],
      });
      const body = getRequestBody();
      expect(body).toContain(`glossary_ids=${A}`);
      expect(body).toContain(`glossary_ids=${B}`);
      expect(body).toContain(`glossary_ids=${C}`);
      expect(body).not.toMatch(/(^|&)glossary_id=/);
    });

    it('should keep the caller order on the wire rather than sorting it', async () => {
      await client.translate('Hello', {
        targetLang: 'es',
        glossaryIds: [C, A],
      });
      expect(getRequestBody()).toContain(`glossary_ids=${C}&glossary_ids=${A}`);
    });

    it('should omit glossary params entirely when none are set', async () => {
      await client.translate('Hello', { targetLang: 'es' });
      expect(getRequestBody()).not.toContain('glossary');
    });

    it('should reject more than five glossaries before sending a request', async () => {
      await expect(
        client.translate('Hello', {
          targetLang: 'es',
          glossaryIds: [A, B, C, A, B, C],
        })
      ).rejects.toThrow(/maximum of 5 glossaries/);
      expect(mockAxiosInstance.request).not.toHaveBeenCalled();
    });

    it('should reject glossaryId combined with glossaryIds', async () => {
      await expect(
        client.translate('Hello', {
          targetLang: 'es',
          glossaryId: A,
          glossaryIds: [B],
        })
      ).rejects.toThrow(/Cannot combine/);
      expect(mockAxiosInstance.request).not.toHaveBeenCalled();
    });

    it('should apply the same shape to translateBatch', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { translations: [{ text: 'Hola' }, { text: 'Adios' }] },
        status: 200,
        headers: {},
      });
      await client.translateBatch(['Hello', 'Bye'], {
        targetLang: 'es',
        glossaryIds: [A, B],
      });
      const body = getRequestBody();
      expect(body).toContain(`glossary_ids=${A}`);
      expect(body).toContain(`glossary_ids=${B}`);
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
    it('should treat an absent role flag as usable, matching the registry', async () => {
      // The registry reads `usable_as_source !== false`, so an entry with the
      // flag absent is recorded as core there. Dropping it here instead would
      // make `deepl languages` omit a language the generator files as usable.
      mockAxiosInstance.request.mockResolvedValue({
        data: [{ lang: 'en', name: 'English' }],
        status: 200,
        headers: {},
      });

      await expect(
        client.getSupportedLanguages('source')
      ).resolves.toHaveLength(1);
    });

    it('should still drop a language whose role flag is explicitly false', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          { lang: 'en-gb', name: 'English (British)', usable_as_source: false },
        ],
        status: 200,
        headers: {},
      });

      await expect(client.getSupportedLanguages('source')).resolves.toEqual([]);
    });

    it('should return source languages', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          {
            lang: 'en',
            name: 'English',
            usable_as_source: true,
            usable_as_target: true,
          },
          {
            lang: 'de',
            name: 'German',
            usable_as_source: true,
            usable_as_target: true,
          },
          {
            lang: 'en-gb',
            name: 'English (British)',
            usable_as_source: false,
            usable_as_target: true,
          },
        ],
        status: 200,
        headers: {},
      });

      const result = await client.getSupportedLanguages('source');

      expect(result).toHaveLength(2);
      expect(result[0]!.language).toBe('en');
      expect(result[0]!.name).toBe('English');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/v3/languages',
          params: { resource: 'translate_text' },
        })
      );
    });

    it('should derive target formality from the features matrix', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          {
            lang: 'es',
            name: 'Spanish',
            usable_as_source: true,
            usable_as_target: true,
            features: {
              formality: { status: 'stable' },
              glossary: { status: 'stable' },
            },
          },
          {
            lang: 'ko',
            name: 'Korean',
            usable_as_source: true,
            usable_as_target: true,
            features: { glossary: { status: 'stable' } },
          },
        ],
        status: 200,
        headers: {},
      });

      const result = await client.getSupportedLanguages('target');

      expect(result[0]!.supportsFormality).toBe(true);
      expect(result[1]!.supportsFormality).toBe(false);
    });

    it('should report formality for a language the static registry never flagged', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          {
            lang: 'pt',
            name: 'Portuguese',
            usable_as_source: true,
            usable_as_target: true,
            features: { formality: { status: 'stable' } },
          },
        ],
        status: 200,
        headers: {},
      });

      const result = await client.getSupportedLanguages('target');

      expect(result[0]!.supportsFormality).toBe(true);
    });

    it('should pass the features matrix through for both roles', async () => {
      const features = {
        glossary: { status: 'stable' },
        style_rules: { status: 'beta' },
      };
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          {
            lang: 'de',
            name: 'German',
            usable_as_source: true,
            usable_as_target: true,
            features,
          },
        ],
        status: 200,
        headers: {},
      });

      const source = await client.getSupportedLanguages('source');
      const target = await client.getSupportedLanguages('target');

      expect(source[0]!.features).toEqual(features);
      expect(target[0]!.features).toEqual(features);
    });

    it('should omit features when the response carries none', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          {
            lang: 'de',
            name: 'German',
            usable_as_source: true,
            usable_as_target: true,
          },
        ],
        status: 200,
        headers: {},
      });

      const result = await client.getSupportedLanguages('target');

      // Formality support is left unstated rather than denied: a response that
      // described no features is not evidence that formality is unavailable, and
      // claiming false would turn on the [F] legend with no [F] to explain.
      expect(result[0]).not.toHaveProperty('features');
      expect(result[0]!.supportsFormality).toBeUndefined();
    });

    it('should fetch the language list once for both roles', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          {
            lang: 'de',
            name: 'German',
            usable_as_source: true,
            usable_as_target: true,
          },
        ],
        status: 200,
        headers: {},
      });

      await client.getSupportedLanguages('source');
      await client.getSupportedLanguages('target');

      // The request does not vary by role -- both are filtered out of one payload.
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
    });
  });

  describe('listTranslationMemories() error context', () => {
    it('suffixes thrown errors with the [listTranslationMemories] method context', async () => {
      expect.assertions(2);
      const axiosError = Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: {
          status: 403,
          data: { message: 'Invalid API key' },
          headers: {},
        },
        config: {},
      });
      mockAxiosInstance.request.mockRejectedValue(axiosError);

      let thrown: unknown;
      try {
        await client.listTranslationMemories();
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(/\[listTranslationMemories\]$/);
    });
  });

  describe('listTranslationMemories()', () => {
    it('should return translation memories from /v3/translation_memories', async () => {
      const tm = {
        translation_memory_id: '11111111-2222-3333-4444-555555555555',
        name: 'my-tm',
        source_lang: 'EN',
        target_lang: 'DE',
      };
      mockAxiosInstance.request.mockResolvedValue({
        data: { translation_memories: [tm] },
        status: 200,
        headers: {},
      });

      const result = await client.listTranslationMemories();

      expect(result).toEqual([tm]);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/v3/translation_memories',
        })
      );
    });

    it('should return empty array when response has no translation_memories field', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {},
        status: 200,
        headers: {},
      });

      const result = await client.listTranslationMemories();
      expect(result).toEqual([]);
    });

    it('should issue the first call without pagination params', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { translation_memories: [] },
        status: 200,
        headers: {},
      });

      await client.listTranslationMemories();

      const call = mockAxiosInstance.request.mock.calls[0]?.[0];
      expect(call.method).toBe('GET');
      expect(call.url).toBe('/v3/translation_memories');
      expect(call.params).toBeUndefined();
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
    });

    it('should not request additional pages when total_count is absent', async () => {
      const pageSize = TRANSLATION_MEMORY_LIST_PAGE_SIZE;
      const buildTm = (i: number) => ({
        translation_memory_id: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`,
        name: `tm-${i}`,
        source_lang: 'EN',
        target_lang: 'DE',
      });
      const fullPage = Array.from({ length: pageSize }, (_, i) => buildTm(i));

      mockAxiosInstance.request.mockResolvedValueOnce({
        data: { translation_memories: fullPage },
        status: 200,
        headers: {},
      });

      const result = await client.listTranslationMemories();

      expect(result).toHaveLength(pageSize);
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
    });

    it('should aggregate results across multiple pages when total_count exceeds first batch', async () => {
      const pageSize = TRANSLATION_MEMORY_LIST_PAGE_SIZE;
      const buildTm = (i: number) => ({
        translation_memory_id: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`,
        name: `tm-${i}`,
        source_lang: 'EN',
        target_lang: 'DE',
      });
      const firstPage = Array.from({ length: pageSize }, (_, i) => buildTm(i));
      const secondPage = Array.from({ length: pageSize }, (_, i) =>
        buildTm(pageSize + i)
      );
      const thirdPage = [buildTm(pageSize * 2)];
      const total = pageSize * 2 + 1;

      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: { translation_memories: firstPage, total_count: total },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { translation_memories: secondPage, total_count: total },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { translation_memories: thirdPage, total_count: total },
          status: 200,
          headers: {},
        });

      const result = await client.listTranslationMemories();

      expect(result).toHaveLength(total);
      expect(result[0]).toEqual(firstPage[0]);
      expect(result[pageSize]).toEqual(secondPage[0]);
      expect(result[pageSize * 2]).toEqual(thirdPage[0]);
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(3);
      expect(mockAxiosInstance.request.mock.calls[0][0].params).toBeUndefined();
      expect(mockAxiosInstance.request.mock.calls[1][0].params).toEqual({
        page: 1,
        page_size: pageSize,
      });
      expect(mockAxiosInstance.request.mock.calls[2][0].params).toEqual({
        page: 2,
        page_size: pageSize,
      });
    });

    it('should stop once accumulated results reach total_count', async () => {
      const pageSize = TRANSLATION_MEMORY_LIST_PAGE_SIZE;
      const buildTm = (i: number) => ({
        translation_memory_id: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`,
        name: `tm-${i}`,
        source_lang: 'EN',
        target_lang: 'DE',
      });
      const fullPage = Array.from({ length: pageSize }, (_, i) => buildTm(i));

      mockAxiosInstance.request.mockResolvedValueOnce({
        data: { translation_memories: fullPage, total_count: pageSize },
        status: 200,
        headers: {},
      });

      const result = await client.listTranslationMemories();

      expect(result).toHaveLength(pageSize);
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
    });

    it('should stop when a subsequent page returns no items', async () => {
      const pageSize = TRANSLATION_MEMORY_LIST_PAGE_SIZE;
      const buildTm = (i: number) => ({
        translation_memory_id: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`,
        name: `tm-${i}`,
        source_lang: 'EN',
        target_lang: 'DE',
      });
      const firstPage = Array.from({ length: pageSize }, (_, i) => buildTm(i));

      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: { translation_memories: firstPage, total_count: pageSize + 10 },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { translation_memories: [], total_count: pageSize + 10 },
          status: 200,
          headers: {},
        });

      const result = await client.listTranslationMemories();

      expect(result).toHaveLength(pageSize);
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
    });

    it('should bound pagination at MAX_TRANSLATION_MEMORY_LIST_PAGES and warn when hit', async () => {
      const pageSize = TRANSLATION_MEMORY_LIST_PAGE_SIZE;
      const buildTm = (i: number) => ({
        translation_memory_id: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`,
        name: `tm-${i}`,
        source_lang: 'EN',
        target_lang: 'DE',
      });
      const fullPage = Array.from({ length: pageSize }, (_, i) => buildTm(i));

      mockAxiosInstance.request.mockResolvedValue({
        data: {
          translation_memories: fullPage,
          total_count: Number.MAX_SAFE_INTEGER,
        },
        status: 200,
        headers: {},
      });
      const warnSpy = jest
        .spyOn(Logger, 'warn')
        .mockImplementation(() => undefined);

      try {
        const result = await client.listTranslationMemories();

        expect(mockAxiosInstance.request).toHaveBeenCalledTimes(
          MAX_TRANSLATION_MEMORY_LIST_PAGES
        );
        expect(result).toHaveLength(
          MAX_TRANSLATION_MEMORY_LIST_PAGES * pageSize
        );
        expect(warnSpy).toHaveBeenCalled();
        const warned = warnSpy.mock.calls.flat().join(' ');
        expect(warned).toMatch(/translation memor/i);
        expect(warned).toMatch(String(MAX_TRANSLATION_MEMORY_LIST_PAGES));
      } finally {
        warnSpy.mockRestore();
      }
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
