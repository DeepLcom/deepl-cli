/**
 * Integration Tests for Translation Workflows
 * Tests complete translation workflows including preservation, caching, and file operations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TranslationService } from '../../src/services/translation.js';
import { FileTranslationService } from '../../src/services/file-translation.js';
import { DeepLClient, LanguageInfo } from '../../src/api/deepl-client.js';
import { ConfigService } from '../../src/storage/config.js';
import { CacheService } from '../../src/storage/cache.js';
import { Language } from '../../src/types/index.js';
import { createMockConfigService, createMockCacheService } from '../helpers/mock-factories';

describe('Translation Workflow Integration', () => {
  const API_KEY = 'test-api-key-123:fx';
  let translationService: TranslationService;
  let fileTranslationService: FileTranslationService;
  let client: DeepLClient;
  let mockConfig: ConfigService;
  let mockCache: CacheService;
  let tmpDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-workflow-test-'));

    // Set up services
    client = new DeepLClient(API_KEY);
    mockConfig = createMockConfigService({
      get: jest.fn(() => ({
        auth: {},
        api: { baseUrl: '', usePro: false },
        defaults: { targetLangs: [], formality: 'default', preserveFormatting: false },
        cache: { enabled: true },
        output: { format: 'text', color: true },
        proxy: {},
      })),
      getValue: jest.fn((key: string) => {
        if (key === 'cache.enabled') {return true;}
        return undefined;
      }),
    });

    mockCache = createMockCacheService();

    translationService = new TranslationService(client, mockConfig, mockCache);
    fileTranslationService = new FileTranslationService(translationService);
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('TranslationService - Basic Translation', () => {
    it('should require non-empty text', async () => {
      await expect(
        translationService.translate('', { targetLang: 'es' })
      ).rejects.toThrow('Text cannot be empty');
    });

    it('should require target language', async () => {
      await expect(
        translationService.translate('Hello', { targetLang: '' as any })
      ).rejects.toThrow('Target language is required');
    });

    it('should translate basic text', async () => {
      // Mock API response
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
        detectedSourceLang: 'en',
      });

      const result = await translationService.translate('Hello', { targetLang: 'es' });

      expect(result.text).toBe('Hola');
      expect(result.detectedSourceLang).toBe('en');
    });

    it('should use config defaults for translation options', async () => {
      mockConfig = createMockConfigService({
        get: jest.fn(() => ({
          auth: {},
          api: { baseUrl: '', usePro: false },
          defaults: {
            targetLangs: [],
            sourceLang: 'en',
            formality: 'more',
            preserveFormatting: true,
          },
          cache: { enabled: true },
          output: { format: 'text', color: true },
          proxy: {},
        })),
        getValue: jest.fn(() => true),
      });

      translationService = new TranslationService(client, mockConfig, mockCache);

      const translateSpy = jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', { targetLang: 'es' });

      expect(translateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sourceLang: 'en',
          formality: 'more',
          preserveFormatting: true,
        })
      );
    });
  });

  describe('TranslationService - Code Preservation', () => {
    it('should preserve inline code blocks', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Use the __CODE_0__ function',
      });

      const result = await translationService.translate(
        'Use the `console.log()` function',
        { targetLang: 'es' },
        { preserveCode: true }
      );

      expect(result.text).toContain('`console.log()`');
    });

    it('should preserve multi-line code blocks', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Here is an example: __CODE_0__',
      });

      const result = await translationService.translate(
        'Here is an example:\n```js\nconst x = 1;\n```',
        { targetLang: 'es' },
        { preserveCode: true }
      );

      expect(result.text).toContain('```js\nconst x = 1;\n```');
    });

    it('should preserve multiple code blocks', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: '__CODE_2__ and __CODE_0__ and __CODE_1__',
      });

      const result = await translationService.translate(
        '`foo` and `bar` and ```baz```',
        { targetLang: 'es' },
        { preserveCode: true }
      );

      // Order of code blocks is preserved after restoration
      expect(result.text).toContain('`foo`');
      expect(result.text).toContain('`bar`');
      expect(result.text).toContain('```baz```');
    });
  });

  describe('TranslationService - Variable Preservation', () => {
    it('should preserve ${} variables', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hello __VAR_0__',
      });

      const result = await translationService.translate(
        'Hello ${name}',
        { targetLang: 'es' }
      );

      expect(result.text).toContain('${name}');
    });

    it('should preserve {} variables', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hello __VAR_0__',
      });

      const result = await translationService.translate(
        'Hello {name}',
        { targetLang: 'es' }
      );

      expect(result.text).toContain('{name}');
    });

    it('should preserve %s and %d placeholders', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'The value is __VAR_0__ and __VAR_1__',
      });

      const result = await translationService.translate(
        'The value is %s and %d',
        { targetLang: 'es' }
      );

      expect(result.text).toContain('%s');
      expect(result.text).toContain('%d');
    });

    it('should preserve multiple variables', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: '__VAR_0__ says: __VAR_1__ is __VAR_2__',
      });

      const result = await translationService.translate(
        '${user} says: {item} is %s',
        { targetLang: 'es' }
      );

      expect(result.text).toContain('${user}');
      expect(result.text).toContain('{item}');
      expect(result.text).toContain('%s');
    });
  });

  describe('TranslationService - Combined Preservation', () => {
    it('should preserve both code blocks and variables', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Use __CODE_0__ with __VAR_0__',
      });

      const result = await translationService.translate(
        'Use `console.log()` with ${variable}',
        { targetLang: 'es' },
        { preserveCode: true }
      );

      expect(result.text).toContain('`console.log()`');
      expect(result.text).toContain('${variable}');
    });
  });

  describe('TranslationService - Caching', () => {
    it('should use cached result when available', async () => {
      const cachedResult = {
        text: 'Hola (cached)',
        detectedSourceLang: 'en',
      };

      (mockCache.get as jest.Mock).mockReturnValue(cachedResult);

      const translateSpy = jest.spyOn(client, 'translate');

      const result = await translationService.translate('Hello', { targetLang: 'es' });

      expect(result.text).toBe('Hola (cached)');
      expect(translateSpy).not.toHaveBeenCalled(); // API not called
      expect(mockCache.get).toHaveBeenCalled();
    });

    it('should cache new translations', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', { targetLang: 'es' });

      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should skip cache when cache is disabled', async () => {
      mockConfig = {
        get: () => ({ defaults: {} }),
        getValue: (key: string) => {
          if (key === 'cache.enabled') {return false;}
          return undefined;
        },
      } as ConfigService;

      translationService = new TranslationService(client, mockConfig, mockCache);

      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', { targetLang: 'es' });

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should skip cache when skipCache option is set', async () => {
      jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate(
        'Hello',
        { targetLang: 'es' },
        { skipCache: true }
      );

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('TranslationService - Multi-Target Translation', () => {
    it('should translate to multiple languages in parallel', async () => {
      jest.spyOn(client, 'translate')
        .mockResolvedValueOnce({ text: 'Hola' })
        .mockResolvedValueOnce({ text: 'Bonjour' })
        .mockResolvedValueOnce({ text: 'Hallo' });

      const results = await translationService.translateToMultiple(
        'Hello',
        ['es', 'fr', 'de']
      );

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ targetLang: 'es', text: 'Hola' });
      expect(results[1]).toEqual({ targetLang: 'fr', text: 'Bonjour' });
      expect(results[2]).toEqual({ targetLang: 'de', text: 'Hallo' });
    });

    it('should require at least one target language', async () => {
      await expect(
        translationService.translateToMultiple('Hello', [])
      ).rejects.toThrow('At least one target language is required');
    });

    it('should pass skipCache option to underlying translate calls', async () => {
      const translateSpy = jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translateToMultiple(
        'Hello',
        ['es'],
        { skipCache: true }
      );

      expect(translateSpy).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ targetLang: 'es' }),
        { skipCache: true }
      );
    });
  });

  describe('TranslationService - Batch Translation', () => {
    it('should translate multiple texts in batch', async () => {
      jest.spyOn(client, 'translateBatch').mockResolvedValue([
        { text: 'Hola' },
        { text: 'Adiós' },
      ]);

      const results = await translationService.translateBatch(
        ['Hello', 'Goodbye'],
        { targetLang: 'es' }
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.text).toBe('Hola');
      expect(results[1]?.text).toBe('Adiós');
    });

    it('should return empty array for empty input', async () => {
      const results = await translationService.translateBatch([], { targetLang: 'es' });
      expect(results).toEqual([]);
    });

    it('should use cached results when available', async () => {
      (mockCache.get as jest.Mock)
        .mockReturnValueOnce({ text: 'Hola (cached)' })
        .mockReturnValueOnce(null);

      jest.spyOn(client, 'translateBatch').mockResolvedValue([
        { text: 'Adiós' },
      ]);

      const results = await translationService.translateBatch(
        ['Hello', 'Goodbye'],
        { targetLang: 'es' }
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.text).toBe('Hola (cached)');
      expect(results[1]?.text).toBe('Adiós');

      // Only non-cached text sent to API
      expect(client.translateBatch).toHaveBeenCalledWith(
        ['Goodbye'],
        expect.any(Object)
      );
    });

    it('should cache newly translated results', async () => {
      jest.spyOn(client, 'translateBatch').mockResolvedValue([
        { text: 'Hola' },
        { text: 'Adiós' },
      ]);

      await translationService.translateBatch(
        ['Hello', 'Goodbye'],
        { targetLang: 'es' }
      );

      expect(mockCache.set).toHaveBeenCalledTimes(2);
    });

    it('should handle batch API errors gracefully', async () => {
      jest.spyOn(client, 'translateBatch').mockRejectedValue(new Error('API error'));

      await expect(
        translationService.translateBatch(['Hello'], { targetLang: 'es' })
      ).rejects.toThrow('API error');
    });

    it('should chunk large batches (>50 texts)', async () => {
      // Create 60 unique texts to avoid cache key collisions
      const texts = Array.from({ length: 60 }, (_, i) => `Hello ${i}`);

      jest.spyOn(client, 'translateBatch')
        .mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ text: `Hola ${i}` })))
        .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ text: `Hola ${i + 50}` })));

      const results = await translationService.translateBatch(texts, { targetLang: 'es' });

      expect(results).toHaveLength(60);
      expect(client.translateBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('TranslationService - Usage and Languages', () => {
    it('should get usage statistics with computed fields', async () => {
      jest.spyOn(client, 'getUsage').mockResolvedValue({
        characterCount: 5000,
        characterLimit: 10000,
      });

      const usage = await translationService.getUsage();

      expect(usage.characterCount).toBe(5000);
      expect(usage.characterLimit).toBe(10000);
      expect(usage.percentageUsed).toBe(50);
      expect(usage.remaining).toBe(5000);
    });

    it('should get supported source languages', async () => {
      const mockLanguages: LanguageInfo[] = [
        { language: 'en' as Language, name: 'English' },
        { language: 'de' as Language, name: 'German' },
      ];

      jest.spyOn(client, 'getSupportedLanguages').mockResolvedValue(mockLanguages);

      const languages = await translationService.getSupportedLanguages('source');

      expect(languages).toEqual(mockLanguages);
    });

    it('should get supported target languages', async () => {
      const mockLanguages: LanguageInfo[] = [
        { language: 'es' as Language, name: 'Spanish' },
        { language: 'fr' as Language, name: 'French' },
      ];

      jest.spyOn(client, 'getSupportedLanguages').mockResolvedValue(mockLanguages);

      const languages = await translationService.getSupportedLanguages('target');

      expect(languages).toEqual(mockLanguages);
    });

    it('should cache language results for 24 hours', async () => {
      const mockLanguages: LanguageInfo[] = [{ language: 'en' as Language, name: 'English' }];

      const getSpy = jest.spyOn(client, 'getSupportedLanguages').mockResolvedValue(mockLanguages);

      // First call
      await translationService.getSupportedLanguages('source');

      // Second call (should use cache)
      await translationService.getSupportedLanguages('source');

      expect(getSpy).toHaveBeenCalledTimes(1); // API called only once
    });
  });

  describe('FileTranslationService - Single File Translation', () => {
    it('should translate a text file', async () => {
      const inputPath = path.join(tmpDir, 'input.txt');
      const outputPath = path.join(tmpDir, 'output.txt');

      fs.writeFileSync(inputPath, 'Hello world');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola mundo',
      });

      await fileTranslationService.translateFile(
        inputPath,
        outputPath,
        { targetLang: 'es' }
      );

      expect(fs.existsSync(outputPath)).toBe(true);
      const output = fs.readFileSync(outputPath, 'utf-8');
      expect(output).toBe('Hola mundo');
    });

    it('should translate a markdown file', async () => {
      const inputPath = path.join(tmpDir, 'input.md');
      const outputPath = path.join(tmpDir, 'output.md');

      fs.writeFileSync(inputPath, '# Hello\n\nWorld');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: '# Hola\n\nMundo',
      });

      await fileTranslationService.translateFile(
        inputPath,
        outputPath,
        { targetLang: 'es' }
      );

      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should create output directory if it does not exist', async () => {
      const inputPath = path.join(tmpDir, 'input.txt');
      const outputPath = path.join(tmpDir, 'nested', 'dir', 'output.txt');

      fs.writeFileSync(inputPath, 'Hello');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await fileTranslationService.translateFile(
        inputPath,
        outputPath,
        { targetLang: 'es' }
      );

      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should throw error for non-existent input file', async () => {
      await expect(
        fileTranslationService.translateFile(
          '/nonexistent/file.txt',
          '/tmp/output.txt',
          { targetLang: 'es' }
        )
      ).rejects.toThrow('Input file not found');
    });

    it('should throw error for unsupported file type', async () => {
      const inputPath = path.join(tmpDir, 'image.png');
      fs.writeFileSync(inputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      await expect(
        fileTranslationService.translateFile(
          inputPath,
          '/tmp/output.txt',
          { targetLang: 'es' }
        )
      ).rejects.toThrow('Unsupported file type');
    });

    it('should throw error for empty file', async () => {
      const inputPath = path.join(tmpDir, 'empty.txt');
      fs.writeFileSync(inputPath, '');

      await expect(
        fileTranslationService.translateFile(
          inputPath,
          '/tmp/output.txt',
          { targetLang: 'es' }
        )
      ).rejects.toThrow('Cannot translate empty file');
    });

    it('should pass preserveCode option to translation service', async () => {
      const inputPath = path.join(tmpDir, 'code.md');
      const outputPath = path.join(tmpDir, 'output.md');

      fs.writeFileSync(inputPath, 'Use `console.log()`');

      const translateSpy = jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Use `console.log()`',
      });

      await fileTranslationService.translateFile(
        inputPath,
        outputPath,
        { targetLang: 'es' },
        { preserveCode: true }
      );

      expect(translateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { preserveCode: true }
      );
    });
  });

  describe('FileTranslationService - Multiple Target Languages', () => {
    it('should translate file to multiple languages', async () => {
      const inputPath = path.join(tmpDir, 'input.txt');
      fs.writeFileSync(inputPath, 'Hello');

      jest.spyOn(translationService, 'translateToMultiple').mockResolvedValue([
        { targetLang: 'es', text: 'Hola' },
        { targetLang: 'fr', text: 'Bonjour' },
      ]);

      const results = await fileTranslationService.translateFileToMultiple(
        inputPath,
        ['es', 'fr']
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ targetLang: 'es', text: 'Hola' });
      expect(results[1]).toEqual({ targetLang: 'fr', text: 'Bonjour' });
    });

    it('should write output files when outputDir is specified', async () => {
      const inputPath = path.join(tmpDir, 'input.txt');
      const outputDir = path.join(tmpDir, 'output');

      fs.writeFileSync(inputPath, 'Hello');

      jest.spyOn(translationService, 'translateToMultiple').mockResolvedValue([
        { targetLang: 'es', text: 'Hola' },
        { targetLang: 'fr', text: 'Bonjour' },
      ]);

      const results = await fileTranslationService.translateFileToMultiple(
        inputPath,
        ['es', 'fr'],
        { outputDir }
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.outputPath).toBe(path.join(outputDir, 'input.es.txt'));
      expect(results[1]?.outputPath).toBe(path.join(outputDir, 'input.fr.txt'));

      const outputPath0 = results[0]?.outputPath;
      const outputPath1 = results[1]?.outputPath;
      expect(outputPath0).toBeDefined();
      expect(outputPath1).toBeDefined();

      if (outputPath0 && outputPath1) {
        expect(fs.existsSync(outputPath0)).toBe(true);
        expect(fs.existsSync(outputPath1)).toBe(true);

        expect(fs.readFileSync(outputPath0, 'utf-8')).toBe('Hola');
        expect(fs.readFileSync(outputPath1, 'utf-8')).toBe('Bonjour');
      }
    });

    it('should throw error for non-existent input file', async () => {
      await expect(
        fileTranslationService.translateFileToMultiple(
          '/nonexistent/file.txt',
          ['es']
        )
      ).rejects.toThrow('Input file not found');
    });

    it('should throw error for unsupported file type', async () => {
      const inputPath = path.join(tmpDir, 'image.png');
      fs.writeFileSync(inputPath, Buffer.from([0x89, 0x50]));

      await expect(
        fileTranslationService.translateFileToMultiple(
          inputPath,
          ['es']
        )
      ).rejects.toThrow('Unsupported file type');
    });

    it('should throw error for empty file', async () => {
      const inputPath = path.join(tmpDir, 'empty.txt');
      fs.writeFileSync(inputPath, '');

      await expect(
        fileTranslationService.translateFileToMultiple(
          inputPath,
          ['es']
        )
      ).rejects.toThrow('Cannot translate empty file');
    });
  });

  describe('FileTranslationService - File Type Validation', () => {
    it('should support .txt files', () => {
      expect(fileTranslationService.isSupportedFile('test.txt')).toBe(true);
    });

    it('should support .md files', () => {
      expect(fileTranslationService.isSupportedFile('test.md')).toBe(true);
    });

    it('should support case-insensitive extensions', () => {
      expect(fileTranslationService.isSupportedFile('test.TXT')).toBe(true);
      expect(fileTranslationService.isSupportedFile('test.MD')).toBe(true);
    });

    it('should reject unsupported file types', () => {
      expect(fileTranslationService.isSupportedFile('test.pdf')).toBe(false);
      expect(fileTranslationService.isSupportedFile('test.docx')).toBe(false);
      expect(fileTranslationService.isSupportedFile('test.png')).toBe(false);
    });

    it('should reject directories', () => {
      expect(fileTranslationService.isSupportedFile(tmpDir)).toBe(false);
    });

    it('should get list of supported file types', () => {
      const types = fileTranslationService.getSupportedFileTypes();
      expect(types).toContain('.txt');
      expect(types).toContain('.md');
    });
  });

  describe('Translation Workflow - Advanced Options', () => {
    it('should translate with formality option', async () => {
      const translateSpy = jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', {
        targetLang: 'es',
        formality: 'more',
      });

      expect(translateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ formality: 'more' })
      );
    });

    it('should translate with source language specified', async () => {
      const translateSpy = jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', {
        targetLang: 'es',
        sourceLang: 'en',
      });

      expect(translateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sourceLang: 'en' })
      );
    });

    it('should translate with glossary', async () => {
      const translateSpy = jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', {
        targetLang: 'es',
        glossaryId: 'glossary-123',
      });

      expect(translateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ glossaryId: 'glossary-123' })
      );
    });

    it('should translate with context', async () => {
      const translateSpy = jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', {
        targetLang: 'es',
        context: 'greeting',
      });

      expect(translateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ context: 'greeting' })
      );
    });

    it('should translate with preserveFormatting', async () => {
      const translateSpy = jest.spyOn(client, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      await translationService.translate('Hello', {
        targetLang: 'es',
        preserveFormatting: true,
      });

      expect(translateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ preserveFormatting: true })
      );
    });
  });
});
