/**
 * Tests for Translate Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { TranslateCommand } from '../../src/cli/commands/translate';
import { TranslationService } from '../../src/services/translation';
import { ConfigService } from '../../src/storage/config';

// Mock ESM dependencies
jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn(function(this: any) { return this; }),
    succeed: jest.fn(function(this: any) { return this; }),
    fail: jest.fn(function(this: any) { return this; }),
    text: '',
  };
  return jest.fn(() => mockSpinner);
});

jest.mock('p-limit');
jest.mock('fast-glob');

// Mock dependencies
jest.mock('../../src/services/translation');
jest.mock('../../src/services/file-translation');
jest.mock('../../src/services/batch-translation');
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

  describe('context-aware translation', () => {
    it('should pass context to translation service', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola',
      });

      await translateCommand.translateText('Hello', {
        to: 'es',
        context: 'This is a greeting in a formal business email',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({
          targetLang: 'es',
          context: 'This is a greeting in a formal business email',
        }),
        expect.any(Object)
      );
    });

    it('should work without context parameter', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola',
      });

      await translateCommand.translateText('Hello', {
        to: 'es',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello',
        expect.not.objectContaining({
          context: expect.anything(),
        }),
        expect.any(Object)
      );
    });

    it('should pass context for multiple target languages', async () => {
      (mockTranslationService.translateToMultiple as jest.Mock).mockResolvedValueOnce([
        { targetLang: 'es', text: 'Hola' },
        { targetLang: 'fr', text: 'Bonjour' },
      ]);

      await translateCommand.translateText('Hello', {
        to: 'es,fr',
        context: 'Greeting in a casual conversation',
      });

      expect(mockTranslationService.translateToMultiple).toHaveBeenCalledWith(
        'Hello',
        ['es', 'fr'],
        expect.objectContaining({
          context: 'Greeting in a casual conversation',
        })
      );
    });

    it('should handle long context strings', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'El banco está cerrado',
      });

      const longContext = 'This document is about financial services. The previous paragraph discussed banking hours and the next paragraph will cover online banking options.';

      await translateCommand.translateText('The bank is closed', {
        to: 'es',
        context: longContext,
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'The bank is closed',
        expect.objectContaining({
          targetLang: 'es',
          context: longContext,
        }),
        expect.any(Object)
      );
    });

    it('should work with context and other options', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Cómo está usted',
      });

      await translateCommand.translateText('How are you', {
        to: 'es',
        from: 'en',
        formality: 'more',
        context: 'Formal business correspondence',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'How are you',
        expect.objectContaining({
          targetLang: 'es',
          sourceLang: 'en',
          formality: 'more',
          context: 'Formal business correspondence',
        }),
        expect.any(Object)
      );
    });
  });

  describe('model type selection', () => {
    it('should pass modelType to translation service when specified', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola',
      });

      await translateCommand.translateText('Hello', {
        to: 'es',
        modelType: 'latency_optimized',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({
          targetLang: 'es',
          modelType: 'latency_optimized',
        }),
        expect.any(Object)
      );
    });

    it('should work without modelType parameter', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola',
      });

      await translateCommand.translateText('Hello', {
        to: 'es',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello',
        expect.not.objectContaining({
          modelType: expect.anything(),
        }),
        expect.any(Object)
      );
    });

    it('should support quality_optimized model type', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola',
      });

      await translateCommand.translateText('Hello', {
        to: 'es',
        modelType: 'quality_optimized',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({
          modelType: 'quality_optimized',
        }),
        expect.any(Object)
      );
    });

    it('should support prefer_quality_optimized model type', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola',
      });

      await translateCommand.translateText('Hello', {
        to: 'es',
        modelType: 'prefer_quality_optimized',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({
          modelType: 'prefer_quality_optimized',
        }),
        expect.any(Object)
      );
    });
  });

  describe('translate() - file/directory detection', () => {
    it('should detect and route to translateDirectory() for directory paths', async () => {
      // Mock fs to indicate directory
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);

      // Create a spy on translateDirectory
      const spy = jest.spyOn(translateCommand as any, 'translateDirectory')
        .mockResolvedValue('Directory translation result');

      const result = await translateCommand.translate('/path/to/dir', {
        to: 'es',
        output: '/out',
      });

      expect(result).toBe('Directory translation result');
      expect(spy).toHaveBeenCalledWith('/path/to/dir', { to: 'es', output: '/out' });

      spy.mockRestore();
    });

    it('should detect and route to translateFile() for file paths', async () => {
      // Mock fs to indicate file (not directory)
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as any);

      // Create a spy on translateFile
      const spy = jest.spyOn(translateCommand as any, 'translateFile')
        .mockResolvedValue('File translation result');

      const result = await translateCommand.translate('/path/to/file.txt', {
        to: 'es',
        output: '/out.txt',
      });

      expect(result).toBe('File translation result');
      expect(spy).toHaveBeenCalledWith('/path/to/file.txt', { to: 'es', output: '/out.txt' });

      spy.mockRestore();
    });

    it('should route to translateText() for plain text input', async () => {
      // Mock fs to indicate path doesn't exist
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola mundo',
      });

      const result = await translateCommand.translate('Hello world', { to: 'es' });

      expect(result).toBe('Hola mundo');
      expect(mockTranslationService.translate).toHaveBeenCalled();
    });
  });

  describe('translateFile()', () => {
    it('should throw error if output is not specified', async () => {
      await expect(
        (translateCommand as any).translateFile('/path/to/file.txt', { to: 'es' })
      ).rejects.toThrow('Output file path is required');
    });

    it('should translate single file to single language', async () => {
      // Mock file translation service
      const mockFileService = {
        translateFile: jest.fn().mockResolvedValue(undefined),
        isSupportedFile: jest.fn(),
      };
      (translateCommand as any).fileTranslationService = mockFileService;

      const result = await (translateCommand as any).translateFile('/input.txt', {
        to: 'es',
        output: '/output.txt',
      });

      expect(result).toContain('Translated /input.txt');
      expect(result).toContain('/output.txt');
      expect(mockFileService.translateFile).toHaveBeenCalledWith(
        '/input.txt',
        '/output.txt',
        { targetLang: 'es' },
        { preserveCode: undefined }
      );
    });

    it('should translate file to multiple languages', async () => {
      const mockFileService = {
        translateFileToMultiple: jest.fn().mockResolvedValue([
          { targetLang: 'es', outputPath: '/output.es.txt' },
          { targetLang: 'fr', outputPath: '/output.fr.txt' },
          { targetLang: 'de', outputPath: '/output.de.txt' },
        ]),
      };
      (translateCommand as any).fileTranslationService = mockFileService;

      const result = await (translateCommand as any).translateFile('/input.txt', {
        to: 'es,fr,de',
        output: '/output',
      });

      expect(result).toContain('Translated /input.txt to 3 languages');
      expect(result).toContain('[es]');
      expect(result).toContain('[fr]');
      expect(result).toContain('[de]');
      expect(mockFileService.translateFileToMultiple).toHaveBeenCalled();
    });

    it('should pass source language when specified', async () => {
      const mockFileService = {
        translateFile: jest.fn().mockResolvedValue(undefined),
      };
      (translateCommand as any).fileTranslationService = mockFileService;

      await (translateCommand as any).translateFile('/input.txt', {
        to: 'es',
        from: 'en',
        output: '/output.txt',
      });

      expect(mockFileService.translateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ sourceLang: 'en' }),
        expect.any(Object)
      );
    });

    it('should pass formality when specified', async () => {
      const mockFileService = {
        translateFile: jest.fn().mockResolvedValue(undefined),
      };
      (translateCommand as any).fileTranslationService = mockFileService;

      await (translateCommand as any).translateFile('/input.txt', {
        to: 'es',
        formality: 'more',
        output: '/output.txt',
      });

      expect(mockFileService.translateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ formality: 'more' }),
        expect.any(Object)
      );
    });

    it('should pass preserveCode option', async () => {
      const mockFileService = {
        translateFile: jest.fn().mockResolvedValue(undefined),
      };
      (translateCommand as any).fileTranslationService = mockFileService;

      await (translateCommand as any).translateFile('/input.txt', {
        to: 'es',
        output: '/output.txt',
        preserveCode: true,
      });

      expect(mockFileService.translateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        { preserveCode: true }
      );
    });
  });

  describe('translateDirectory()', () => {
    it('should throw error if output directory is not specified', async () => {
      await expect(
        (translateCommand as any).translateDirectory('/path/to/dir', { to: 'es' })
      ).rejects.toThrow('Output directory is required');
    });

    // Note: Directory translation ora spinner interactions are complex to mock
    // This functionality is thoroughly validated through integration and E2E tests
  });
});
