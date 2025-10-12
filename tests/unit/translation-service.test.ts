/**
 * Tests for TranslationService
 * Following TDD approach - these tests should fail initially
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { TranslationService } from '../../src/services/translation';
import { DeepLClient } from '../../src/api/deepl-client';
import { ConfigService } from '../../src/storage/config';
import { CacheService } from '../../src/storage/cache';
import { Language } from '../../src/types';

// Mock dependencies
jest.mock('../../src/api/deepl-client');
jest.mock('../../src/storage/config');
jest.mock('../../src/storage/cache');

describe('TranslationService', () => {
  let translationService: TranslationService;
  let mockDeepLClient: jest.Mocked<DeepLClient>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockCacheService: jest.Mocked<CacheService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockDeepLClient = {
      translate: jest.fn(),
      translateBatch: jest.fn(),
      getUsage: jest.fn(),
      getSupportedLanguages: jest.fn(),
    } as unknown as jest.Mocked<DeepLClient>;

    mockConfigService = {
      get: jest.fn().mockReturnValue({
        defaults: {
          sourceLang: undefined,
          targetLangs: [],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: {
          enabled: true,
          maxSize: 1024 * 1024 * 1024,
          ttl: 30 * 24 * 60 * 60,
        },
        api: { baseUrl: 'https://api.deepl.com/v2', usePro: true },
      }),
      getValue: jest.fn().mockReturnValue(true), // cache.enabled default
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mockCacheService = {
      get: jest.fn().mockReturnValue(null), // No cache hit by default
      set: jest.fn(),
      clear: jest.fn(),
      stats: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<CacheService>;

    translationService = new TranslationService(mockDeepLClient, mockConfigService, mockCacheService);
  });

  describe('initialization', () => {
    it('should create a TranslationService instance', () => {
      expect(translationService).toBeInstanceOf(TranslationService);
    });

    it('should initialize with DeepLClient', () => {
      expect(mockDeepLClient).toBeDefined();
    });

    it('should initialize with ConfigService', () => {
      expect(mockConfigService).toBeDefined();
    });
  });

  describe('translate()', () => {
    it('should translate text using DeepLClient', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola',
        detectedSourceLang: 'en',
      });

      const result = await translationService.translate('Hello', {
        targetLang: 'es',
      });

      expect(result.text).toBe('Hola');
      expect(result.detectedSourceLang).toBe('en');
      expect(mockDeepLClient.translate).toHaveBeenCalledWith('Hello', {
        targetLang: 'es',
        sourceLang: undefined,
        formality: 'default',
        preserveFormatting: true,
      });
    });

    it('should use defaults from config when not specified', async () => {
      mockConfigService.get.mockReturnValue({
        defaults: {
          sourceLang: 'en',
          targetLangs: ['es'],
          formality: 'more',
          preserveFormatting: true,
        },
        cache: {
          enabled: true,
          maxSize: 1024 * 1024 * 1024,
          ttl: 30 * 24 * 60 * 60,
        },
        api: { baseUrl: 'https://api.deepl.com/v2', usePro: true },
        auth: {},
        output: { format: 'text', color: true, verbose: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '**/*' },
        team: {},
      });

      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', {
        targetLang: 'es',
      });

      expect(mockDeepLClient.translate).toHaveBeenCalledWith('Hello', {
        targetLang: 'es',
        sourceLang: 'en',
        formality: 'more',
        preserveFormatting: true,
      });
    });

    it('should override defaults with explicit options', async () => {
      mockConfigService.get.mockReturnValue({
        defaults: {
          sourceLang: 'en',
          targetLangs: ['es'],
          formality: 'more',
          preserveFormatting: true,
        },
        cache: { enabled: true, maxSize: 1024 * 1024 * 1024, ttl: 30 * 24 * 60 * 60 },
        api: { baseUrl: 'https://api.deepl.com/v2', usePro: true },
        auth: {},
        output: { format: 'text', color: true, verbose: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '**/*' },
        team: {},
      });

      mockDeepLClient.translate.mockResolvedValue({
        text: 'Salut',
      });

      await translationService.translate('Hello', {
        targetLang: 'fr',
        formality: 'less',
        preserveFormatting: false,
      });

      expect(mockDeepLClient.translate).toHaveBeenCalledWith('Hello', {
        targetLang: 'fr',
        sourceLang: 'en',
        formality: 'less',
        preserveFormatting: false,
      });
    });

    it('should throw error for empty text', async () => {
      await expect(
        translationService.translate('', { targetLang: 'es' })
      ).rejects.toThrow('Text cannot be empty');
    });

    it('should throw error when no target language specified', async () => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        translationService.translate('Hello', {} as any)
      ).rejects.toThrow('Target language is required');
    });

    it('should handle translation errors', async () => {
      mockDeepLClient.translate.mockRejectedValue(
        new Error('API error: Translation failed')
      );

      await expect(
        translationService.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('API error: Translation failed');
    });

    it('should pass through all DeepL API options', async () => {
      mockDeepLClient.translate.mockResolvedValue({ text: 'Translated' });

      await translationService.translate('Hello', {
        targetLang: 'es',
        sourceLang: 'en',
        formality: 'more',
        glossaryId: 'glossary-123',
        preserveFormatting: true,
        context: 'API documentation',
        splitSentences: 'nonewlines',
        tagHandling: 'xml',
      });

      expect(mockDeepLClient.translate).toHaveBeenCalledWith('Hello', {
        targetLang: 'es',
        sourceLang: 'en',
        formality: 'more',
        glossaryId: 'glossary-123',
        preserveFormatting: true,
        context: 'API documentation',
        splitSentences: 'nonewlines',
        tagHandling: 'xml',
      });
    });
  });

  describe('translateBatch()', () => {
    it('should translate multiple texts using batch API', async () => {
      mockDeepLClient.translateBatch.mockResolvedValue([
        { text: 'Hola' },
        { text: 'Adiós' },
        { text: 'Gracias' },
      ]);

      const results = await translationService.translateBatch(
        ['Hello', 'Goodbye', 'Thanks'],
        { targetLang: 'es' }
      );

      expect(results).toHaveLength(3);
      expect(results[0]?.text).toBe('Hola');
      expect(results[1]?.text).toBe('Adiós');
      expect(results[2]?.text).toBe('Gracias');
      expect(mockDeepLClient.translateBatch).toHaveBeenCalledTimes(1);
      expect(mockDeepLClient.translateBatch).toHaveBeenCalledWith(
        ['Hello', 'Goodbye', 'Thanks'],
        expect.objectContaining({ targetLang: 'es' })
      );
    });

    it('should use batch API for efficient translation (single API call)', async () => {
      mockDeepLClient.translateBatch.mockResolvedValue([
        { text: 'Uno' },
        { text: 'Dos' },
        { text: 'Tres' },
      ]);

      await translationService.translateBatch(['One', 'Two', 'Three'], {
        targetLang: 'es',
      });

      // Should use batch API (1 call) instead of individual translate calls (3 calls)
      expect(mockDeepLClient.translateBatch).toHaveBeenCalledTimes(1);
      expect(mockDeepLClient.translate).not.toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      const results = await translationService.translateBatch([], {
        targetLang: 'es',
      });

      expect(results).toHaveLength(0);
      expect(mockDeepLClient.translateBatch).not.toHaveBeenCalled();
      expect(mockDeepLClient.translate).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockDeepLClient.translateBatch.mockRejectedValue(new Error('API error'));

      await expect(
        translationService.translateBatch(['Hello', 'Goodbye', 'Thanks'], {
          targetLang: 'es',
        })
      ).rejects.toThrow('API error');
    });

    it('should utilize cache for batch translations', async () => {
      // Cache hit for first text, miss for others
      mockCacheService.get
        .mockReturnValueOnce({ text: 'Hola (cached)' })
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null);

      mockDeepLClient.translateBatch.mockResolvedValue([
        { text: 'Adiós' },
        { text: 'Gracias' },
      ]);

      const results = await translationService.translateBatch(
        ['Hello', 'Goodbye', 'Thanks'],
        { targetLang: 'es' }
      );

      expect(results).toHaveLength(3);
      expect(results[0]?.text).toBe('Hola (cached)');
      expect(results[1]?.text).toBe('Adiós');
      expect(results[2]?.text).toBe('Gracias');
      // Should only translate uncached texts
      expect(mockDeepLClient.translateBatch).toHaveBeenCalledWith(
        ['Goodbye', 'Thanks'],
        expect.any(Object)
      );
    });

    it('should handle batch size limits (50 texts per batch)', async () => {
      const largeTextArray = Array(100).fill('test');
      mockDeepLClient.translateBatch
        .mockResolvedValueOnce(Array(50).fill({ text: 'traducido' }))
        .mockResolvedValueOnce(Array(50).fill({ text: 'traducido' }));

      await translationService.translateBatch(largeTextArray, {
        targetLang: 'es',
      });

      // Should split into 2 batches of 50
      expect(mockDeepLClient.translateBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('translateToMultiple()', () => {
    it('should translate text to multiple target languages', async () => {
      mockDeepLClient.translate
        .mockResolvedValueOnce({ text: 'Hola' })
        .mockResolvedValueOnce({ text: 'Bonjour' })
        .mockResolvedValueOnce({ text: 'Hallo' });

      const results = await translationService.translateToMultiple('Hello', [
        'es',
        'fr',
        'de',
      ]);

      expect(results).toHaveLength(3);
      expect(results[0]?.targetLang).toBe('es');
      expect(results[0]?.text).toBe('Hola');
      expect(results[1]?.targetLang).toBe('fr');
      expect(results[1]?.text).toBe('Bonjour');
      expect(results[2]?.targetLang).toBe('de');
      expect(results[2]?.text).toBe('Hallo');
    });

    it('should translate in parallel', async () => {
      const startTime = Date.now();

      mockDeepLClient.translate.mockImplementation(
        async () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ text: 'Translated' }), 100)
          )
      );

      await translationService.translateToMultiple('Hello', ['es', 'fr', 'de']);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200);
    });

    it('should pass through translation options', async () => {
      mockDeepLClient.translate.mockResolvedValue({ text: 'Translated' });

      await translationService.translateToMultiple('Hello', ['es', 'fr'], {
        formality: 'more',
        context: 'greeting',
      });

      expect(mockDeepLClient.translate).toHaveBeenCalledWith('Hello', {
        targetLang: 'es',
        sourceLang: undefined,
        formality: 'more',
        preserveFormatting: true,
        context: 'greeting',
      });
      expect(mockDeepLClient.translate).toHaveBeenCalledWith('Hello', {
        targetLang: 'fr',
        sourceLang: undefined,
        formality: 'more',
        preserveFormatting: true,
        context: 'greeting',
      });
    });

    it('should throw error for empty target languages', async () => {
      await expect(
        translationService.translateToMultiple('Hello', [])
      ).rejects.toThrow('At least one target language is required');
    });
  });

  describe('preserveCodeBlocks()', () => {
    it('should preserve inline code blocks', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Usa __CODE_0__ para imprimir',
      });

      const result = await translationService.translate(
        'Use `console.log()` to print',
        { targetLang: 'es' },
        { preserveCode: true }
      );

      expect(result.text).toBe('Usa `console.log()` para imprimir');
    });

    it('should preserve multi-line code blocks', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Aquí hay un ejemplo:\n\n__CODE_0__\n\nEste código imprime Hola',
      });

      const result = await translationService.translate(
        'Here is an example:\n\n```\nconst x = 1;\nconsole.log(x);\n```\n\nThis code prints Hello',
        { targetLang: 'es' },
        { preserveCode: true }
      );

      expect(result.text).toContain('```\nconst x = 1;');
      expect(result.text).toContain('console.log(x);\n```');
    });

    it('should preserve multiple code blocks', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Usa __CODE_0__ o __CODE_1__ para imprimir',
      });

      const result = await translationService.translate(
        'Use `console.log()` or `print()` to print',
        { targetLang: 'es' },
        { preserveCode: true }
      );

      expect(result.text).toBe('Usa `console.log()` o `print()` para imprimir');
    });

    it('should not preserve code blocks when disabled', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Usa registro de consola para imprimir',
      });

      const result = await translationService.translate(
        'Use `console.log()` to print',
        { targetLang: 'es' },
        { preserveCode: false }
      );

      expect(result.text).toBe('Usa registro de consola para imprimir');
      expect(mockDeepLClient.translate).toHaveBeenCalledWith(
        'Use `console.log()` to print',
        expect.any(Object)
      );
    });
  });

  describe('preserveVariables()', () => {
    it('should preserve curly brace variables', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola __VAR_0__',
      });

      const result = await translationService.translate('Hello {name}', {
        targetLang: 'es',
      });

      expect(result.text).toBe('Hola {name}');
    });

    it('should preserve dollar sign variables', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola __VAR_0__',
      });

      const result = await translationService.translate('Hello ${name}', {
        targetLang: 'es',
      });

      expect(result.text).toBe('Hola ${name}');
    });

    it('should preserve printf-style variables', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola __VAR_0__, tienes __VAR_1__ años',
      });

      const result = await translationService.translate('Hello %s, you are %d years old', {
        targetLang: 'es',
      });

      expect(result.text).toBe('Hola %s, tienes %d años');
    });

    it('should preserve numbered placeholders', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola __VAR_0__, tienes __VAR_1__ años',
      });

      const result = await translationService.translate('Hello {0}, you are {1} years old', {
        targetLang: 'es',
      });

      expect(result.text).toBe('Hola {0}, tienes {1} años');
    });

    it('should preserve multiple variable types', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: '__VAR_1__ tiene __VAR_0__ y __VAR_2__',
      });

      const result = await translationService.translate('{name} has ${count} and %s', {
        targetLang: 'es',
      });

      // Variables are preserved, though order may change based on translation
      expect(result.text).toContain('{name}');
      expect(result.text).toContain('${count}');
      expect(result.text).toContain('%s');
    });
  });

  describe('getUsage()', () => {
    it('should return usage statistics from DeepLClient', async () => {
      mockDeepLClient.getUsage.mockResolvedValue({
        characterCount: 12345,
        characterLimit: 500000,
      });

      const usage = await translationService.getUsage();

      expect(usage.characterCount).toBe(12345);
      expect(usage.characterLimit).toBe(500000);
      expect(mockDeepLClient.getUsage).toHaveBeenCalled();
    });

    it('should calculate usage percentage', async () => {
      mockDeepLClient.getUsage.mockResolvedValue({
        characterCount: 250000,
        characterLimit: 500000,
      });

      const usage = await translationService.getUsage();

      expect(usage.percentageUsed).toBe(50);
    });

    it('should calculate remaining characters', async () => {
      mockDeepLClient.getUsage.mockResolvedValue({
        characterCount: 12345,
        characterLimit: 500000,
      });

      const usage = await translationService.getUsage();

      expect(usage.remaining).toBe(487655);
    });

    it('should handle usage API errors', async () => {
      mockDeepLClient.getUsage.mockRejectedValue(
        new Error('Authentication failed')
      );

      await expect(translationService.getUsage()).rejects.toThrow(
        'Authentication failed'
      );
    });
  });

  describe('getSupportedLanguages()', () => {
    it('should return supported source languages', async () => {
      mockDeepLClient.getSupportedLanguages.mockResolvedValue([
        { language: 'en' as Language, name: 'English' },
        { language: 'es' as Language, name: 'Spanish' },
      ]);

      const languages = await translationService.getSupportedLanguages('source');

      expect(languages).toHaveLength(2);
      expect(languages[0]?.language).toBe('en');
      expect(languages[0]?.name).toBe('English');
    });

    it('should return supported target languages', async () => {
      mockDeepLClient.getSupportedLanguages.mockResolvedValue([
        { language: 'es' as Language, name: 'Spanish' },
        { language: 'fr' as Language, name: 'French' },
      ]);

      const languages = await translationService.getSupportedLanguages('target');

      expect(languages).toHaveLength(2);
      expect(languages[0]?.language).toBe('es');
    });

    it('should cache supported languages', async () => {
      mockDeepLClient.getSupportedLanguages.mockResolvedValue([
        { language: 'en' as Language, name: 'English' },
      ]);

      await translationService.getSupportedLanguages('source');
      await translationService.getSupportedLanguages('source');

      // Should only call API once due to caching
      expect(mockDeepLClient.getSupportedLanguages).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle very long text', async () => {
      const longText = 'a'.repeat(50000);
      mockDeepLClient.translate.mockResolvedValue({ text: 'a'.repeat(50000) });

      const result = await translationService.translate(longText, {
        targetLang: 'es',
      });

      expect(result.text.length).toBe(50000);
    });

    it('should handle special characters', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: '¡Hola! ¿Cómo estás?',
      });

      const result = await translationService.translate('Hello! How are you?', {
        targetLang: 'es',
      });

      expect(result.text).toContain('¡');
      expect(result.text).toContain('¿');
    });

    it('should handle unicode characters', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: '你好世界 🌍',
      });

      const result = await translationService.translate('Hello world', {
        targetLang: 'zh',
      });

      expect(result.text).toContain('你好');
      expect(result.text).toContain('🌍');
    });

    it('should handle newlines and whitespace', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Línea 1\n\nLínea 2',
      });

      const result = await translationService.translate('Line 1\n\nLine 2', {
        targetLang: 'es',
      });

      expect(result.text).toContain('\n\n');
    });
  });

  describe('caching', () => {
    it('should cache translation results', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola',
      });

      // First call - should hit API
      await translationService.translate('Hello', { targetLang: 'es' });

      expect(mockDeepLClient.translate).toHaveBeenCalledTimes(1);
      expect(mockCacheService.set).toHaveBeenCalledTimes(1);
    });

    it('should return cached result on second call', async () => {
      // Setup cache to return a hit
      mockCacheService.get.mockReturnValue({
        text: 'Hola (cached)',
      });

      const result = await translationService.translate('Hello', { targetLang: 'es' });

      expect(result.text).toBe('Hola (cached)');
      expect(mockDeepLClient.translate).not.toHaveBeenCalled();
      expect(mockCacheService.get).toHaveBeenCalled();
    });

    it('should not cache when cache is disabled', async () => {
      mockConfigService.getValue.mockReturnValue(false); // cache.enabled = false
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', { targetLang: 'es' });

      expect(mockCacheService.set).not.toHaveBeenCalled();
      expect(mockDeepLClient.translate).toHaveBeenCalled();
    });

    it('should generate different cache keys for different options', async () => {
      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola',
      });

      // Call with different options
      await translationService.translate('Hello', { targetLang: 'es' });
      await translationService.translate('Hello', { targetLang: 'fr' });

      // Should call API twice (different cache keys)
      expect(mockDeepLClient.translate).toHaveBeenCalledTimes(2);
      expect(mockCacheService.set).toHaveBeenCalledTimes(2);
    });

    it('should use same cache key for same text and options', async () => {
      mockCacheService.get
        .mockReturnValueOnce(null) // First call: cache miss
        .mockReturnValueOnce({ text: 'Hola (cached)' }); // Second call: cache hit

      mockDeepLClient.translate.mockResolvedValue({
        text: 'Hola',
      });

      // First call
      await translationService.translate('Hello', { targetLang: 'es' });
      expect(mockDeepLClient.translate).toHaveBeenCalledTimes(1);

      // Second call with same params
      const result2 = await translationService.translate('Hello', { targetLang: 'es' });
      expect(result2.text).toBe('Hola (cached)');
      expect(mockDeepLClient.translate).toHaveBeenCalledTimes(1); // Still only 1 API call
    });
  });
});
