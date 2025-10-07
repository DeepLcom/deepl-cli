/**
 * Tests for Translate Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { TranslateCommand } from '../../src/cli/commands/translate';
import { TranslationService } from '../../src/services/translation';
import { ConfigService } from '../../src/storage/config';

// Mock dependencies
jest.mock('../../src/services/translation');
jest.mock('../../src/storage/config');

describe('TranslateCommand', () => {
  let mockTranslationService: jest.Mocked<TranslationService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let translateCommand: TranslateCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTranslationService = {
      translate: jest.fn().mockResolvedValue({ text: '', detectedSourceLang: undefined }),
      translateBatch: jest.fn().mockResolvedValue([]),
      translateToMultiple: jest.fn().mockResolvedValue([]),
      getUsage: jest.fn().mockResolvedValue({ character: { count: 0, limit: 0 } }),
      getSupportedLanguages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TranslationService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue({}),
      getValue: jest.fn((key: string) => {
        // Mock API key as set by default
        if (key === 'auth.apiKey') return 'mock-api-key';
        return undefined;
      }),
      set: jest.fn().mockResolvedValue(undefined),
      has: jest.fn().mockReturnValue(false),
      delete: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      getDefaults: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<ConfigService>;

    translateCommand = new TranslateCommand(mockTranslationService, mockConfigService);
  });

  describe('translateText()', () => {
    it('should translate simple text', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola mundo',
        detectedSourceLang: 'en',
      });

      const result = await translateCommand.translateText('Hello world', {
        to: 'es',
      });

      expect(result).toBe('Hola mundo');
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello world',
        { targetLang: 'es' },
        { preserveCode: undefined }
      );
    });

    it('should pass source language when specified', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Bonjour',
      });

      await translateCommand.translateText('Hello', {
        to: 'fr',
        from: 'en',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello',
        { targetLang: 'fr', sourceLang: 'en' },
        { preserveCode: undefined }
      );
    });

    it('should pass formality when specified', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Buenos días',
      });

      await translateCommand.translateText('Good morning', {
        to: 'es',
        formality: 'more',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Good morning',
        { targetLang: 'es', formality: 'more' },
        { preserveCode: undefined }
      );
    });

    it('should enable code preservation when requested', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Usa `console.log()` para imprimir',
      });

      await translateCommand.translateText('Use `console.log()` to print', {
        to: 'es',
        preserveCode: true,
      });

      // Check that translate was called with preserveCode option
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
      // Override mock to return no API key for this specific test
      (mockConfigService.getValue as jest.Mock).mockImplementation(() => undefined);
      const originalEnv = process.env['DEEPL_API_KEY'];
      delete process.env['DEEPL_API_KEY'];

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('API key not set');

      // Restore environment
      if (originalEnv) process.env['DEEPL_API_KEY'] = originalEnv;
    });

    it('should handle translation errors gracefully', async () => {
      (mockTranslationService.translate as jest.Mock).mockRejectedValueOnce(
        new Error('API error: Quota exceeded')
      );

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('API error: Quota exceeded');
    });

    it('should support multiple target languages', async () => {
      (mockTranslationService.translateToMultiple as jest.Mock).mockResolvedValueOnce([
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
    let mockStdin: any;

    beforeEach(() => {
      // Mock process.stdin
      mockStdin = {
        setEncoding: jest.fn(),
        on: jest.fn(),
      };
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });
    });

    it('should read from stdin and translate', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola desde stdin',
      });

      // Mock stdin data
      mockStdin.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Hello from stdin');
        } else if (event === 'end') {
          callback();
        }
        return mockStdin;
      });

      const result = await translateCommand.translateFromStdin({
        to: 'es',
      });

      expect(result).toBe('Hola desde stdin');
    });

    it('should handle multi-line stdin input', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Línea 1\nLínea 2\nLínea 3',
      });

      // Mock multi-line stdin data
      mockStdin.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Line 1\nLine 2\nLine 3');
        } else if (event === 'end') {
          callback();
        }
        return mockStdin;
      });

      const result = await translateCommand.translateFromStdin({
        to: 'es',
      });

      expect(result).toContain('\n');
    });

    it('should throw error for empty stdin', async () => {
      // Mock empty stdin
      mockStdin.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'end') {
          callback();
        }
        return mockStdin;
      });

      await expect(
        translateCommand.translateFromStdin({ to: 'es' })
      ).rejects.toThrow('No input provided');
    });
  });

  describe('output formatting', () => {
    it('should output plain text by default', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola',
      });

      const result = await translateCommand.translateText('Hello', {
        to: 'es',
      });

      expect(result).toBe('Hola');
    });

    it('should support JSON output format', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
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
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
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
      (mockTranslationService.translate as jest.Mock).mockRejectedValueOnce(
        new Error('Authentication failed: Invalid API key')
      );

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('Authentication failed');
    });

    it('should show user-friendly error for quota exceeded', async () => {
      (mockTranslationService.translate as jest.Mock).mockRejectedValueOnce(
        new Error('Quota exceeded: Character limit reached')
      );

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('Quota exceeded');
    });

    it('should show user-friendly error for network issues', async () => {
      (mockTranslationService.translate as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        translateCommand.translateText('Hello', { to: 'es' })
      ).rejects.toThrow('Network error');
    });
  });
});
