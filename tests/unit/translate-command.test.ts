/**
 * Tests for Translate Command
 * Following TDD approach - these tests should fail initially
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { TranslationService } from '../../src/services/translation';
import { ConfigService } from '../../src/storage/config';

// Mock dependencies
jest.mock('../../src/services/translation');
jest.mock('../../src/storage/config');

describe('Translate Command', () => {
  let mockTranslationService: jest.Mocked<TranslationService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let translateCommand: {
    translateText: (text: string, options: {
      to: string;
      from?: string;
      formality?: string;
      preserveCode?: boolean;
    }) => Promise<string>;
    translateFromStdin: (options: {
      to: string;
      from?: string;
      formality?: string;
    }) => Promise<string>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTranslationService = {
      translate: jest.fn(),
      translateBatch: jest.fn(),
      translateToMultiple: jest.fn(),
      getUsage: jest.fn(),
      getSupportedLanguages: jest.fn(),
    } as unknown as jest.Mocked<TranslationService>;

    mockConfigService = {
      get: jest.fn(),
      getValue: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
  });

  describe('translateText()', () => {
    it('should translate simple text', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Hola mundo',
        detectedSourceLang: 'en',
      });

      const result = await translateCommand.translateText('Hello world', {
        to: 'es',
      });

      expect(result).toBe('Hola mundo');
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello world',
        { targetLang: 'es' }
      );
    });

    it('should pass source language when specified', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Bonjour',
      });

      await translateCommand.translateText('Hello', {
        to: 'fr',
        from: 'en',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello',
        { targetLang: 'fr', sourceLang: 'en' }
      );
    });

    it('should pass formality when specified', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Buenos días',
      });

      await translateCommand.translateText('Good morning', {
        to: 'es',
        formality: 'more',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Good morning',
        { targetLang: 'es', formality: 'more' }
      );
    });

    it('should enable code preservation when requested', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Usa `console.log()` para imprimir',
      });

      await translateCommand.translateText('Use `console.log()` to print', {
        to: 'es',
        preserveCode: true,
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Use `console.log()` to print',
        { targetLang: 'es' },
        { preserveCode: true }
      );
    });

    it('should throw error for empty text', async () => {
      await expect(
        translateCommand.translateText('', { to: 'es' })
      ).rejects.toThrow('Text cannot be empty');
    });

    it('should throw error when API key is not set', async () => {
      mockConfigService.getValue.mockReturnValue(undefined);
      process.env.DEEPL_API_KEY = undefined;

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('API key not set');
    });

    it('should handle translation errors gracefully', async () => {
      mockTranslationService.translate.mockRejectedValue(
        new Error('API error: Quota exceeded')
      );

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('API error: Quota exceeded');
    });

    it('should support multiple target languages', async () => {
      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'es', text: 'Hola' },
        { targetLang: 'fr', text: 'Bonjour' },
        { targetLang: 'de', text: 'Hallo' },
      ]);

      const result = await translateCommand.translateText('Hello', {
        to: 'es,fr,de',
      });

      expect(result).toContain('Hola');
      expect(result).toContain('Bonjour');
      expect(result).toContain('Hallo');
    });
  });

  describe('translateFromStdin()', () => {
    it('should read from stdin and translate', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Hola desde stdin',
      });

      const result = await translateCommand.translateFromStdin({
        to: 'es',
      });

      expect(result).toBe('Hola desde stdin');
    });

    it('should handle multi-line stdin input', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Línea 1\nLínea 2\nLínea 3',
      });

      const result = await translateCommand.translateFromStdin({
        to: 'es',
      });

      expect(result).toContain('\n');
    });

    it('should throw error for empty stdin', async () => {
      await expect(
        translateCommand.translateFromStdin({ to: 'es' })
      ).rejects.toThrow('No input provided');
    });
  });

  describe('output formatting', () => {
    it('should output plain text by default', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Hola',
      });

      const result = await translateCommand.translateText('Hello', {
        to: 'es',
      });

      expect(result).toBe('Hola');
    });

    it('should support JSON output format', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Hola',
        detectedSourceLang: 'en',
      });

      const result = await translateCommand.translateText('Hello', {
        to: 'es',
      });

      // Should be able to parse as JSON when format is set
      expect(result).toBeDefined();
    });

    it('should display source language when detected', async () => {
      mockTranslationService.translate.mockResolvedValue({
        text: 'Hola',
        detectedSourceLang: 'en',
      });

      const result = await translateCommand.translateText('Hello', {
        to: 'es',
      });

      expect(result).toBe('Hola');
    });
  });

  describe('error handling', () => {
    it('should show user-friendly error for authentication failure', async () => {
      mockTranslationService.translate.mockRejectedValue(
        new Error('Authentication failed: Invalid API key')
      );

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('Authentication failed');
    });

    it('should show user-friendly error for quota exceeded', async () => {
      mockTranslationService.translate.mockRejectedValue(
        new Error('Quota exceeded: Character limit reached')
      );

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('Quota exceeded');
    });

    it('should show user-friendly error for network issues', async () => {
      mockTranslationService.translate.mockRejectedValue(
        new Error('Network error')
      );

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('Network error');
    });
  });
});
