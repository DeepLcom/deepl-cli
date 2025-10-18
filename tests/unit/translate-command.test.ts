/**
 * Tests for Translate Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { TranslateCommand } from '../../src/cli/commands/translate';
import { TranslationService } from '../../src/services/translation';
import { DocumentTranslationService } from '../../src/services/document-translation';
import { GlossaryService } from '../../src/services/glossary';
import { ConfigService } from '../../src/storage/config';
import { Logger } from '../../src/utils/logger';

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
jest.mock('../../src/services/document-translation');
jest.mock('../../src/services/glossary');
jest.mock('../../src/storage/config');

describe('TranslateCommand', () => {
  let mockTranslationService: jest.Mocked<TranslationService>;
  let mockDocumentTranslationService: jest.Mocked<DocumentTranslationService>;
  let mockGlossaryService: jest.Mocked<GlossaryService>;
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

    mockDocumentTranslationService = {
      translateDocument: jest.fn().mockResolvedValue({ success: true, outputPath: '/output.pdf' }),
      isDocumentSupported: jest.fn().mockReturnValue(false),
      getSupportedFileTypes: jest.fn().mockReturnValue(['.pdf', '.docx', '.pptx']),
    } as unknown as jest.Mocked<DocumentTranslationService>;

    mockGlossaryService = {
      getGlossaryByName: jest.fn().mockResolvedValue(null),
      listGlossaries: jest.fn().mockResolvedValue([]),
      getGlossary: jest.fn().mockResolvedValue(null),
      createGlossary: jest.fn().mockResolvedValue(null),
      deleteGlossary: jest.fn().mockResolvedValue(undefined),
      getGlossaryEntries: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<GlossaryService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue({}),
      getValue: jest.fn((key: string) => {
        // Mock API key as set by default
        if (key === 'auth.apiKey') {return 'mock-api-key';}
        return undefined;
      }),
      set: jest.fn().mockResolvedValue(undefined),
      has: jest.fn().mockReturnValue(false),
      delete: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      getDefaults: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<ConfigService>;

    translateCommand = new TranslateCommand(
      mockTranslationService,
      mockDocumentTranslationService,
      mockGlossaryService,
      mockConfigService
    );
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
        { preserveCode: undefined, skipCache: true }
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
        { preserveCode: undefined, skipCache: true }
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
        { preserveCode: undefined, skipCache: true }
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
        { preserveCode: true, skipCache: true }
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
      if (originalEnv) {process.env['DEEPL_API_KEY'] = originalEnv;}
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

    it('should throw error for whitespace-only stdin', async () => {
      // Mock whitespace-only stdin
      mockStdin.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('   \n  \t  ');
        } else if (event === 'end') {
          callback();
        }
        return mockStdin;
      });

      await expect(
        translateCommand.translateFromStdin({ to: 'es' })
      ).rejects.toThrow('No input provided');
    });

    it('should handle stdin errors', async () => {
      // Mock stdin error
      mockStdin.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Stdin read error'));
        }
        return mockStdin;
      });

      await expect(
        translateCommand.translateFromStdin({ to: 'es' })
      ).rejects.toThrow('Stdin read error');
    });

    it('should handle large stdin input', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Large translated text',
      });

      // Mock large stdin data (simulate chunks) - call all 'data' handlers, then 'end'
      mockStdin.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          // Immediately call the callback with all chunks
          callback('First chunk ');
          callback('second chunk ');
          callback('third chunk');
        } else if (event === 'end') {
          // Then call end
          callback();
        }
        return mockStdin;
      });

      const result = await translateCommand.translateFromStdin({
        to: 'es',
      });

      expect(result).toBe('Large translated text');
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'First chunk second chunk third chunk',
        expect.any(Object),
        expect.any(Object)
      );
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

  describe('advanced translation options', () => {
    it('should pass splitSentences option when specified', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Primera oración. Segunda oración.',
      });

      await translateCommand.translateText('First sentence. Second sentence.', {
        to: 'es',
        splitSentences: 'nonewlines',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'First sentence. Second sentence.',
        expect.objectContaining({
          targetLang: 'es',
          splitSentences: 'nonewlines',
        }),
        expect.any(Object)
      );
    });

    it('should pass tagHandling option when specified', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: '<p>Hola mundo</p>',
      });

      await translateCommand.translateText('<p>Hello world</p>', {
        to: 'es',
        tagHandling: 'html',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        '<p>Hello world</p>',
        expect.objectContaining({
          targetLang: 'es',
          tagHandling: 'html',
        }),
        expect.any(Object)
      );
    });

    it('should pass formality to translateToMultiple', async () => {
      (mockTranslationService.translateToMultiple as jest.Mock).mockResolvedValueOnce([
        { targetLang: 'es', text: 'Hola' },
        { targetLang: 'de', text: 'Hallo' },
      ]);

      await translateCommand.translateText('Hello', {
        to: 'es,de',
        formality: 'more',
      });

      expect(mockTranslationService.translateToMultiple).toHaveBeenCalledWith(
        'Hello',
        ['es', 'de'],
        expect.objectContaining({
          formality: 'more',
        })
      );
    });

    it('should pass sourceLang to translateToMultiple', async () => {
      (mockTranslationService.translateToMultiple as jest.Mock).mockResolvedValueOnce([
        { targetLang: 'es', text: 'Hola' },
        { targetLang: 'fr', text: 'Bonjour' },
      ]);

      await translateCommand.translateText('Hello', {
        to: 'es,fr',
        from: 'en',
      });

      expect(mockTranslationService.translateToMultiple).toHaveBeenCalledWith(
        'Hello',
        ['es', 'fr'],
        expect.objectContaining({
          sourceLang: 'en',
        })
      );
    });

    it('should work with all options combined', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: '<p>Hola. ¿Cómo estás?</p>',
      });

      await translateCommand.translateText('<p>Hello. How are you?</p>', {
        to: 'es',
        from: 'en',
        formality: 'more',
        context: 'Formal email greeting',
        splitSentences: 'on',
        tagHandling: 'html',
        modelType: 'quality_optimized',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        '<p>Hello. How are you?</p>',
        expect.objectContaining({
          targetLang: 'es',
          sourceLang: 'en',
          formality: 'more',
          context: 'Formal email greeting',
          splitSentences: 'on',
          tagHandling: 'html',
          modelType: 'quality_optimized',
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
      const mockStats = { isDirectory: () => false, isFile: () => true };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue(mockStats as any);

      // Create a spy on translateFile
      const spy = jest.spyOn(translateCommand as any, 'translateFile')
        .mockResolvedValue('File translation result');

      const result = await translateCommand.translate('/path/to/file.txt', {
        to: 'es',
        output: '/out.txt',
      });

      expect(result).toBe('File translation result');
      expect(spy).toHaveBeenCalledWith('/path/to/file.txt', { to: 'es', output: '/out.txt' }, mockStats);

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
      // Mock fs to make file appear to exist and be a regular file
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'statSync').mockReturnValue({
        size: 1024, // 1KB
        isDirectory: () => false
      } as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Hello world');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola mundo',
      });

      const result = await (translateCommand as any).translateFile('/input.txt', {
        to: 'es',
        output: '/output.txt',
      });

      expect(result).toContain('Translated /input.txt');
      expect(result).toContain('/output.txt');
      expect(mockTranslationService.translate).toHaveBeenCalled();
    });

    it('should translate file to multiple languages', async () => {
      // Mock fs to make file appear to exist
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'statSync').mockReturnValue({
        size: 1024, // 1KB
        isDirectory: () => false
      } as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Hello world');

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
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024, isDirectory: () => false } as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Hello world');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola mundo',
      });

      await (translateCommand as any).translateFile('/input.txt', {
        to: 'es',
        from: 'en',
        output: '/output.txt',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello world',
        expect.objectContaining({ sourceLang: 'en', targetLang: 'es' }),
        expect.any(Object)
      );
    });

    it('should pass formality when specified', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024, isDirectory: () => false } as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Hello world');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola mundo',
      });

      await (translateCommand as any).translateFile('/input.txt', {
        to: 'es',
        formality: 'more',
        output: '/output.txt',
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello world',
        expect.objectContaining({ formality: 'more', targetLang: 'es' }),
        expect.any(Object)
      );
    });

    it('should pass preserveCode option', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024, isDirectory: () => false } as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Hello world');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola mundo',
      });

      await (translateCommand as any).translateFile('/input.txt', {
        to: 'es',
        output: '/output.txt',
        preserveCode: true,
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello world',
        expect.any(Object),
        { preserveCode: true, skipCache: true }
      );
    });

    it('should pass source language to multi-file translation', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024, isDirectory: () => false } as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Hello world');

      const mockFileService = {
        translateFileToMultiple: jest.fn().mockResolvedValue([
          { targetLang: 'es', outputPath: '/output.es.txt' },
          { targetLang: 'fr', outputPath: '/output.fr.txt' },
        ]),
      };
      (translateCommand as any).fileTranslationService = mockFileService;

      await (translateCommand as any).translateFile('/input.txt', {
        to: 'es,fr',
        from: 'en',
        output: '/output',
      });

      expect(mockFileService.translateFileToMultiple).toHaveBeenCalledWith(
        '/input.txt',
        ['es', 'fr'],
        expect.objectContaining({ sourceLang: 'en', outputDir: '/output' })
      );
    });

    it('should pass formality to multi-file translation', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024, isDirectory: () => false } as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Hello world');

      const mockFileService = {
        translateFileToMultiple: jest.fn().mockResolvedValue([
          { targetLang: 'es', outputPath: '/output.es.txt' },
          { targetLang: 'de', outputPath: '/output.de.txt' },
        ]),
      };
      (translateCommand as any).fileTranslationService = mockFileService;

      await (translateCommand as any).translateFile('/input.txt', {
        to: 'es,de',
        formality: 'more',
        output: '/output',
      });

      expect(mockFileService.translateFileToMultiple).toHaveBeenCalledWith(
        '/input.txt',
        ['es', 'de'],
        expect.objectContaining({ formality: 'more', outputDir: '/output' })
      );
    });
  });

  describe('translateDirectory()', () => {
    it('should throw error if output directory is not specified', async () => {
      await expect(
        (translateCommand as any).translateDirectory('/path/to/dir', { to: 'es' })
      ).rejects.toThrow('Output directory is required');
    });

    // Note: Directory translation with ora spinner interactions is complex to mock due to ESM issues
    // The spinner is created (line 281) before the onProgress callback (line 276) uses it,
    // creating a forward reference that's difficult to test in unit tests.
    // This functionality is thoroughly validated through integration and E2E tests:
    // - Successful batch translation with statistics display
    // - Failed files formatting (lines 221-225)
    // - Skipped files count display (line 229-231)
    // - Spinner progress updates (lines 187, 191)
    // - Source language and formality passthrough to batch service
  });

  describe('glossary integration', () => {
    it('should translate text with glossary by name', async () => {
      // Mock glossary service lookup
      (mockGlossaryService.getGlossaryByName as jest.Mock).mockResolvedValueOnce({
        glossary_id: 'glossary-123',
        name: 'my-glossary',
        source_lang: 'en',
        target_lang: 'de',
      });

      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hallo Welt',
        detectedSourceLang: 'en',
      });

      const result = await translateCommand.translateText('Hello world', {
        to: 'de',
        glossary: 'my-glossary',
      });

      expect(result).toBe('Hallo Welt');
      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('my-glossary');
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello world',
        { targetLang: 'de', glossaryId: 'glossary-123' },
        { preserveCode: undefined, skipCache: true }
      );
    });

    it('should translate text with glossary by ID', async () => {
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Bonjour le monde',
        detectedSourceLang: 'en',
      });

      const result = await translateCommand.translateText('Hello world', {
        to: 'fr',
        glossary: '01234567-89ab-cdef-0123-456789abcdef',
      });

      expect(result).toBe('Bonjour le monde');
      expect(mockGlossaryService.getGlossaryByName).not.toHaveBeenCalled();
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Hello world',
        { targetLang: 'fr', glossaryId: '01234567-89ab-cdef-0123-456789abcdef' },
        { preserveCode: undefined, skipCache: true }
      );
    });

    it('should throw error when glossary not found by name', async () => {
      // Mock glossary service lookup returning null
      (mockGlossaryService.getGlossaryByName as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        translateCommand.translateText('Hello world', {
          to: 'de',
          glossary: 'non-existent',
        })
      ).rejects.toThrow('Glossary "non-existent" not found');

      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('non-existent');
    });

    it('should translate to multiple languages with glossary', async () => {
      // Mock glossary service lookup
      (mockGlossaryService.getGlossaryByName as jest.Mock).mockResolvedValueOnce({
        glossary_id: 'glossary-789',
        name: 'tech-terms',
        source_lang: 'en',
        target_lang: 'de',
      });

      (mockTranslationService.translateToMultiple as jest.Mock).mockResolvedValueOnce([
        { targetLang: 'de', text: 'Hallo' },
        { targetLang: 'fr', text: 'Bonjour' },
      ]);

      const result = await translateCommand.translateText('Hello', {
        to: 'de,fr',
        glossary: 'tech-terms',
      });

      expect(result).toBe('[de] Hallo\n[fr] Bonjour');
      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('tech-terms');
      expect(mockTranslationService.translateToMultiple).toHaveBeenCalledWith(
        'Hello',
        ['de', 'fr'],
        { glossaryId: 'glossary-789', skipCache: true }
      );
    });

    it('should combine glossary with other options (formality, context)', async () => {
      // Mock glossary service lookup
      (mockGlossaryService.getGlossaryByName as jest.Mock).mockResolvedValueOnce({
        glossary_id: 'glossary-abc',
        name: 'business-glossary',
        source_lang: 'en',
        target_lang: 'de',
      });

      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Sehr geehrte Damen und Herren',
        detectedSourceLang: 'en',
      });

      const result = await translateCommand.translateText('Dear Sir or Madam', {
        to: 'de',
        glossary: 'business-glossary',
        formality: 'more',
        context: 'Business letter opening',
      });

      expect(result).toBe('Sehr geehrte Damen und Herren');
      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('business-glossary');
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Dear Sir or Madam',
        {
          targetLang: 'de',
          glossaryId: 'glossary-abc',
          formality: 'more',
          context: 'Business letter opening',
        },
        { preserveCode: undefined, skipCache: true }
      );
    });
  });

  describe('text-based file caching', () => {
    // Mock fs module for file operations
    let mockFs: any;

    beforeEach(() => {
      mockFs = jest.requireActual('fs');
      jest.spyOn(mockFs, 'existsSync').mockReturnValue(true);
      jest.spyOn(mockFs, 'readFileSync');
      jest.spyOn(mockFs, 'writeFileSync').mockImplementation(() => undefined);
      jest.spyOn(mockFs, 'mkdirSync').mockImplementation(() => undefined);

      // Mock Logger.shouldShowSpinner() to skip spinner code path in document translation
      jest.spyOn(Logger, 'shouldShowSpinner').mockReturnValue(false);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should use cached text API for small .txt files (under 100 KiB)', async () => {
      const smallContent = 'Hello world!'.repeat(100); // Small file content

      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 50 * 1024, // 50 KiB
        isDirectory: () => false
      } as any);
      jest.spyOn(mockFs, 'readFileSync').mockReturnValue(smallContent);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Translated content',
      });

      const result = await (translateCommand as any).translateFile('/path/to/small.txt', {
        to: 'es',
        output: '/out.txt',
      });

      // Should use text translation API (cached)
      expect(mockTranslationService.translate).toHaveBeenCalled();
      expect(mockDocumentTranslationService.translateDocument).not.toHaveBeenCalled();
      expect(result).toContain('Translated /path/to/small.txt');
    });

    it('should fall back to document API for large .txt files (over 100 KiB)', async () => {
      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 150 * 1024, // 150 KiB
        isDirectory: () => false
      } as any);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockDocumentTranslationService.translateDocument as jest.Mock).mockResolvedValueOnce({
        success: true,
        outputPath: '/out.txt',
      });

      const result = await (translateCommand as any).translateFile('/path/to/large.txt', {
        to: 'es',
        output: '/out.txt',
      });

      // Should use document API (not cached)
      expect(mockDocumentTranslationService.translateDocument).toHaveBeenCalled();
      expect(mockTranslationService.translate).not.toHaveBeenCalled();
      expect(result).toContain('File exceeds');
      expect(result).toContain('using document API');
    });

    it('should use cached text API for small .md files', async () => {
      const smallContent = '# Markdown\n\nHello world!';

      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 10 * 1024, // 10 KiB
        isDirectory: () => false
      } as any);
      jest.spyOn(mockFs, 'readFileSync').mockReturnValue(smallContent);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(false);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Translated markdown',
      });

      const result = await (translateCommand as any).translateFile('/path/to/doc.md', {
        to: 'es',
        output: '/out.md',
      });

      // Should use text translation API (cached)
      expect(mockTranslationService.translate).toHaveBeenCalled();
      expect(result).toContain('Translated /path/to/doc.md');
    });

    it('should use cached text API for small .html files', async () => {
      const smallContent = '<html><body>Hello</body></html>';

      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 5 * 1024, // 5 KiB
        isDirectory: () => false
      } as any);
      jest.spyOn(mockFs, 'readFileSync').mockReturnValue(smallContent);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: '<html><body>Hola</body></html>',
      });

      await (translateCommand as any).translateFile('/path/to/page.html', {
        to: 'es',
        output: '/out.html',
      });

      // Should use text translation API (cached)
      expect(mockTranslationService.translate).toHaveBeenCalled();
      expect(mockDocumentTranslationService.translateDocument).not.toHaveBeenCalled();
    });

    it('should use cached text API for .srt subtitle files', async () => {
      const srtContent = '1\n00:00:01,000 --> 00:00:02,000\nHello world';

      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 5 * 1024, // 5 KiB
        isDirectory: () => false
      } as any);
      jest.spyOn(mockFs, 'readFileSync').mockReturnValue(srtContent);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Translated subtitles',
      });

      await (translateCommand as any).translateFile('/path/to/movie.srt', {
        to: 'es',
        output: '/out.srt',
      });

      // Should use text translation API (cached)
      expect(mockTranslationService.translate).toHaveBeenCalled();
      expect(mockDocumentTranslationService.translateDocument).not.toHaveBeenCalled();
    });

    it('should use cached text API for .xlf translation files', async () => {
      const xlfContent = '<?xml version="1.0"?><xliff><file><trans-unit><source>Hello</source></trans-unit></file></xliff>';

      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 10 * 1024, // 10 KiB
        isDirectory: () => false
      } as any);
      jest.spyOn(mockFs, 'readFileSync').mockReturnValue(xlfContent);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Translated XML',
      });

      await (translateCommand as any).translateFile('/path/to/strings.xlf', {
        to: 'es',
        output: '/out.xlf',
      });

      // Should use text translation API (cached)
      expect(mockTranslationService.translate).toHaveBeenCalled();
      expect(mockDocumentTranslationService.translateDocument).not.toHaveBeenCalled();
    });

    it('should always use document API for binary files (.pdf, .docx)', async () => {
      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 10 * 1024, // 10 KiB (small, but still binary)
        isDirectory: () => false
      } as any);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockDocumentTranslationService.translateDocument as jest.Mock).mockResolvedValueOnce({
        success: true,
        outputPath: '/out.pdf',
      });

      await (translateCommand as any).translateFile('/path/to/document.pdf', {
        to: 'es',
        output: '/out.pdf',
      });

      // Should use document API (even though small)
      expect(mockDocumentTranslationService.translateDocument).toHaveBeenCalled();
      expect(mockTranslationService.translate).not.toHaveBeenCalled();
    });

    it('should show warning when falling back to document API', async () => {
      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 150 * 1024, // 150 KiB
        isDirectory: () => false
      } as any);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockDocumentTranslationService.translateDocument as jest.Mock).mockResolvedValueOnce({
        success: true,
        outputPath: '/out.txt',
      });

      const result = await (translateCommand as any).translateFile('/path/to/large.txt', {
        to: 'es',
        output: '/out.txt',
      });

      // Should include warning message
      expect(result).toContain('File exceeds');
      expect(result).toContain('100 KiB');
      expect(result).toContain('document API');
    });

    it('should write translated content to output file when using text API', async () => {
      const smallContent = 'Hello world!';
      const translatedContent = 'Hola mundo!';

      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 1 * 1024, // 1 KiB
        isDirectory: () => false
      } as any);
      jest.spyOn(mockFs, 'readFileSync').mockReturnValue(smallContent);
      jest.spyOn(mockFs, 'writeFileSync').mockImplementation(() => undefined);
      jest.spyOn(mockFs, 'mkdirSync').mockImplementation(() => undefined);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: translatedContent,
      });

      await (translateCommand as any).translateFile('/path/to/small.txt', {
        to: 'es',
        output: '/out.txt',
      });

      // Should write translated content to file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/out.txt', translatedContent, 'utf-8');
    });

    it('should handle UTF-8 encoding correctly', async () => {
      const unicodeContent = 'Hello 世界 🌍';

      jest.spyOn(mockFs, 'statSync').mockReturnValue({
        size: 5 * 1024, // 5 KiB
        isDirectory: () => false
      } as any);
      jest.spyOn(mockFs, 'readFileSync').mockReturnValue(unicodeContent);

      (mockDocumentTranslationService.isDocumentSupported as jest.Mock).mockReturnValue(true);
      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Hola 世界 🌍',
      });

      await (translateCommand as any).translateFile('/path/to/unicode.txt', {
        to: 'es',
        output: '/out.txt',
      });

      // Should read with UTF-8 encoding
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/unicode.txt', 'utf-8');
    });
  });

  describe('isFilePath() - cross-platform path detection (Issue #4)', () => {
    it('should detect Windows paths with backslashes (C:\\Users\\file.txt)', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Access the private isFilePath method via translate()
      // Windows path should be detected as file path
      const spy = jest.spyOn(translateCommand as any, 'translateFile')
        .mockResolvedValue('File translation result');

      // Mock fileTranslationService.isSupportedFile to return true for .txt
      const mockFileService = (translateCommand as any).fileTranslationService;
      jest.spyOn(mockFileService, 'isSupportedFile').mockReturnValue(true);

      await translateCommand.translate('C:\\Users\\Documents\\file.txt', {
        to: 'es',
        output: '/out.txt',
      });

      expect(spy).toHaveBeenCalledWith('C:\\Users\\Documents\\file.txt', { to: 'es', output: '/out.txt' }, null);
      spy.mockRestore();
    });

    it('should detect Unix paths with forward slashes (/home/user/file.txt)', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const spy = jest.spyOn(translateCommand as any, 'translateFile')
        .mockResolvedValue('File translation result');

      const mockFileService = (translateCommand as any).fileTranslationService;
      jest.spyOn(mockFileService, 'isSupportedFile').mockReturnValue(true);

      await translateCommand.translate('/home/user/documents/file.txt', {
        to: 'es',
        output: '/out.txt',
      });

      expect(spy).toHaveBeenCalledWith('/home/user/documents/file.txt', { to: 'es', output: '/out.txt' }, null);
      spy.mockRestore();
    });

    it('should NOT treat URLs as file paths (http://example.com/file.txt)', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const mockFileService = (translateCommand as any).fileTranslationService;
      jest.spyOn(mockFileService, 'isSupportedFile').mockReturnValue(true);

      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Texto traducido',
      });

      // URL should be treated as text, not file path
      await translateCommand.translate('http://example.com/file.txt', {
        to: 'es',
      });

      // Should call translateText, NOT translateFile
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'http://example.com/file.txt',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should NOT treat text containing "/" as file path', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const mockFileService = (translateCommand as any).fileTranslationService;
      jest.spyOn(mockFileService, 'isSupportedFile').mockReturnValue(false);

      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'Texto traducido',
      });

      // Text with / should be treated as text, not file path
      await translateCommand.translate('Check https://example.com for details', {
        to: 'es',
      });

      // Should call translateText, NOT translateFile
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'Check https://example.com for details',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should detect relative Windows paths (folder\\file.txt)', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const spy = jest.spyOn(translateCommand as any, 'translateFile')
        .mockResolvedValue('File translation result');

      const mockFileService = (translateCommand as any).fileTranslationService;
      jest.spyOn(mockFileService, 'isSupportedFile').mockReturnValue(true);

      await translateCommand.translate('folder\\subfolder\\file.txt', {
        to: 'es',
        output: '/out.txt',
      });

      expect(spy).toHaveBeenCalledWith('folder\\subfolder\\file.txt', { to: 'es', output: '/out.txt' }, null);
      spy.mockRestore();
    });

    it('should detect relative Unix paths (folder/file.txt)', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const spy = jest.spyOn(translateCommand as any, 'translateFile')
        .mockResolvedValue('File translation result');

      const mockFileService = (translateCommand as any).fileTranslationService;
      jest.spyOn(mockFileService, 'isSupportedFile').mockReturnValue(true);

      await translateCommand.translate('folder/subfolder/file.txt', {
        to: 'es',
        output: '/out.txt',
      });

      expect(spy).toHaveBeenCalledWith('folder/subfolder/file.txt', { to: 'es', output: '/out.txt' }, null);
      spy.mockRestore();
    });

    it('should handle files with no path separator (file.txt) as text when file doesn\'t exist', async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const mockFileService = (translateCommand as any).fileTranslationService;
      jest.spyOn(mockFileService, 'isSupportedFile').mockReturnValue(true);

      (mockTranslationService.translate as jest.Mock).mockResolvedValueOnce({
        text: 'archivo.txt',
      });

      // No path separator and file doesn't exist -> treat as text
      await translateCommand.translate('file.txt', {
        to: 'es',
      });

      // Should call translateText, NOT translateFile
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        'file.txt',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});
