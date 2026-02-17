/**
 * Tests for FileTranslationService directory/multi-target translation handler
 * Covers translateFileToMultiple: multi-target, concurrency, onProgress, error paths
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileTranslationService } from '../../src/services/file-translation';
import { TranslationService } from '../../src/services/translation';
import {
  createMockTranslationService,
  createMockConfigService,
  createMockFileTranslationService,
  createMockGlossaryService,
  createMockDocumentTranslationService,
} from '../helpers/mock-factories';
import { DirectoryTranslationHandler } from '../../src/cli/commands/translate/directory-translation-handler';
import { BatchTranslationService } from '../../src/services/batch-translation';
import { ValidationError } from '../../src/utils/errors';
import { Logger } from '../../src/utils/logger';
import type { HandlerContext, TranslateOptions } from '../../src/cli/commands/translate/types';

jest.mock('../../src/services/translation');

jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn(function(this: any) { return this; }),
    succeed: jest.fn(function(this: any) { return this; }),
    fail: jest.fn(function(this: any) { return this; }),
    text: '',
  };
  return jest.fn(() => mockSpinner);
});

jest.mock('../../src/services/batch-translation', () => ({
  BatchTranslationService: jest.fn().mockImplementation(() => ({
    translateDirectory: jest.fn().mockResolvedValue({
      successful: [{ file: 'test.txt', outputPath: '/out/test.de.txt' }],
      failed: [],
      skipped: [],
    }),
    getStatistics: jest.fn().mockReturnValue({
      total: 1,
      successful: 1,
      failed: 0,
      skipped: 0,
    }),
  })),
}));

jest.mock('../../src/cli/commands/translate/translate-utils', () => ({
  warnIgnoredOptions: jest.fn(),
  validateLanguageCodes: jest.fn(),
  buildTranslationOptions: jest.fn().mockReturnValue({ targetLang: 'de' }),
}));

describe('FileTranslationService – directory/multi-target handler', () => {
  let service: FileTranslationService;
  let mockTranslationService: jest.Mocked<TranslationService>;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `deepl-dir-handler-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    mockTranslationService = createMockTranslationService();
    service = new FileTranslationService(mockTranslationService);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('translateFileToMultiple()', () => {
    it('should translate a txt file to multiple target languages', async () => {
      const inputPath = path.join(testDir, 'readme.txt');
      fs.writeFileSync(inputPath, 'Hello world');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'de', text: 'Hallo Welt' },
        { targetLang: 'fr', text: 'Bonjour le monde' },
        { targetLang: 'es', text: 'Hola mundo' },
      ]);

      const results = await service.translateFileToMultiple(inputPath, ['de', 'fr', 'es']);

      expect(results).toHaveLength(3);
      expect(results[0]?.targetLang).toBe('de');
      expect(results[0]?.text).toBe('Hallo Welt');
      expect(results[1]?.targetLang).toBe('fr');
      expect(results[2]?.targetLang).toBe('es');
    });

    it('should write output files with language suffix when outputDir is given', async () => {
      const inputPath = path.join(testDir, 'doc.txt');
      fs.writeFileSync(inputPath, 'Hello');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'de', text: 'Hallo' },
        { targetLang: 'ja', text: 'こんにちは' },
      ]);

      const outputDir = path.join(testDir, 'output');

      const results = await service.translateFileToMultiple(
        inputPath,
        ['de', 'ja'],
        { outputDir }
      );

      expect(results[0]?.outputPath).toBe(path.join(outputDir, 'doc.de.txt'));
      expect(results[1]?.outputPath).toBe(path.join(outputDir, 'doc.ja.txt'));

      expect(fs.readFileSync(results[0]!.outputPath!, 'utf-8')).toBe('Hallo');
      expect(fs.readFileSync(results[1]!.outputPath!, 'utf-8')).toBe('こんにちは');
    });

    it('should create output directory if it does not exist', async () => {
      const inputPath = path.join(testDir, 'file.txt');
      fs.writeFileSync(inputPath, 'Test');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'es', text: 'Prueba' },
      ]);

      const nested = path.join(testDir, 'a', 'b', 'c');

      await service.translateFileToMultiple(inputPath, ['es'], { outputDir: nested });

      expect(fs.existsSync(path.join(nested, 'file.es.txt'))).toBe(true);
    });

    it('should not create output files when outputDir is omitted', async () => {
      const inputPath = path.join(testDir, 'file.txt');
      fs.writeFileSync(inputPath, 'Hello');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'de', text: 'Hallo' },
      ]);

      const results = await service.translateFileToMultiple(inputPath, ['de']);

      expect(results[0]?.outputPath).toBeUndefined();
    });

    it('should preserve the .md extension in output filenames', async () => {
      const inputPath = path.join(testDir, 'readme.md');
      fs.writeFileSync(inputPath, '# Hello');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'fr', text: '# Bonjour' },
      ]);

      const results = await service.translateFileToMultiple(
        inputPath,
        ['fr'],
        { outputDir: testDir }
      );

      expect(results[0]?.outputPath).toBe(path.join(testDir, 'readme.fr.md'));
    });

    it('should throw ValidationError for unsupported file types', async () => {
      const inputPath = path.join(testDir, 'image.png');
      fs.writeFileSync(inputPath, 'dummy');

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow('Unsupported file type');
    });

    it('should throw ValidationError for non-existent file', async () => {
      const inputPath = path.join(testDir, 'no-such-file.txt');

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow();
    });

    it('should throw ValidationError for empty file', async () => {
      const inputPath = path.join(testDir, 'empty.txt');
      fs.writeFileSync(inputPath, '');

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow('Cannot translate empty file');
    });

    it('should throw ValidationError for whitespace-only file', async () => {
      const inputPath = path.join(testDir, 'whitespace.txt');
      fs.writeFileSync(inputPath, '   \n  \n  ');

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow('Cannot translate empty file');
    });

    it('should propagate API errors', async () => {
      const inputPath = path.join(testDir, 'file.txt');
      fs.writeFileSync(inputPath, 'Hello');

      mockTranslationService.translateToMultiple.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should delegate structured files (JSON) to StructuredFileTranslationService', async () => {
      const inputPath = path.join(testDir, 'locale.json');
      fs.writeFileSync(inputPath, JSON.stringify({ key: 'Hello' }, null, 2));

      // The structured service is lazily loaded; mock translateBatch for it
      mockTranslationService.translateBatch.mockImplementation(async (_texts, opts) => {
        if (opts.targetLang === 'de') return [{ text: 'Hallo', detectedSourceLang: 'en' }];
        return [];
      });

      const results = await service.translateFileToMultiple(inputPath, ['de']);

      expect(results).toHaveLength(1);
      expect(results[0]?.targetLang).toBe('de');
      // translateToMultiple should NOT be called; structured service uses translateBatch
      expect(mockTranslationService.translateToMultiple).not.toHaveBeenCalled();
    });

    it('should delegate structured files (YAML) to StructuredFileTranslationService', async () => {
      const inputPath = path.join(testDir, 'locale.yaml');
      fs.writeFileSync(inputPath, 'greeting: Hello\n');

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hallo', detectedSourceLang: 'en' },
      ]);

      const results = await service.translateFileToMultiple(inputPath, ['de']);

      expect(results).toHaveLength(1);
      expect(results[0]?.targetLang).toBe('de');
    });

    it('should reject symlinks for security', async () => {
      const realFile = path.join(testDir, 'real.txt');
      const linkFile = path.join(testDir, 'link.txt');
      fs.writeFileSync(realFile, 'Hello');
      fs.symlinkSync(realFile, linkFile);

      await expect(
        service.translateFileToMultiple(linkFile, ['de'])
      ).rejects.toThrow();

      expect(mockTranslationService.translateToMultiple).not.toHaveBeenCalled();
    });
  });
});

describe('DirectoryTranslationHandler', () => {
  let handler: DirectoryTranslationHandler;
  let ctx: HandlerContext;
  let mockBatchService: {
    translateDirectory: jest.Mock;
    getStatistics: jest.Mock;
  };

  beforeEach(() => {
    // Re-apply mock implementations cleared by resetMocks: true in jest.config
    const translateUtilsMock = jest.requireMock(
      '../../src/cli/commands/translate/translate-utils'
    );
    translateUtilsMock.buildTranslationOptions.mockReturnValue({ targetLang: 'de' });

    mockBatchService = {
      translateDirectory: jest.fn().mockResolvedValue({
        successful: [{ file: 'test.txt', outputPath: '/out/test.de.txt' }],
        failed: [],
        skipped: [],
      }),
      getStatistics: jest.fn().mockReturnValue({
        total: 1,
        successful: 1,
        failed: 0,
        skipped: 0,
      }),
    };

    ctx = {
      translationService: createMockTranslationService(),
      fileTranslationService: createMockFileTranslationService(),
      batchTranslationService: mockBatchService as unknown as BatchTranslationService,
      documentTranslationService: createMockDocumentTranslationService(),
      glossaryService: createMockGlossaryService(),
      config: createMockConfigService(),
    };

    handler = new DirectoryTranslationHandler(ctx);
    jest.spyOn(Logger, 'shouldShowSpinner').mockReturnValue(false);
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseOptions: TranslateOptions = {
    to: 'de',
    output: '/output',
  };

  describe('output validation', () => {
    it('should throw ValidationError when output is not provided', async () => {
      const options: TranslateOptions = { to: 'de' };

      await expect(handler.translateDirectory('/some/dir', options))
        .rejects.toThrow(ValidationError);
    });

    it('should include helpful message about --output flag', async () => {
      const options: TranslateOptions = { to: 'de' };

      await expect(handler.translateDirectory('/some/dir', options))
        .rejects.toThrow('Output directory is required');
    });
  });

  describe('ignored options warning', () => {
    it('should call warnIgnoredOptions with directory mode and supported keys', async () => {
      const options: TranslateOptions = {
        ...baseOptions,
        tagHandling: 'xml',
        modelType: 'quality_optimized',
      };

      await handler.translateDirectory('/some/dir', options);

      const { warnIgnoredOptions } = jest.requireMock(
        '../../src/cli/commands/translate/translate-utils'
      );

      expect(warnIgnoredOptions).toHaveBeenCalledWith(
        'directory',
        options,
        new Set(['from', 'formality'])
      );
    });
  });

  describe('single target delegation', () => {
    it('should call batchTranslationService.translateDirectory with correct args', async () => {
      await handler.translateDirectory('/some/dir', baseOptions);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledWith(
        '/some/dir',
        expect.objectContaining({ targetLang: 'de' }),
        expect.objectContaining({
          outputDir: '/output',
          recursive: true,
        })
      );
    });

    it('should call buildTranslationOptions with the options', async () => {
      await handler.translateDirectory('/some/dir', baseOptions);

      const { buildTranslationOptions } = jest.requireMock(
        '../../src/cli/commands/translate/translate-utils'
      );

      expect(buildTranslationOptions).toHaveBeenCalledWith(baseOptions);
    });

    it('should pass abortSignal in batchOptions', async () => {
      await handler.translateDirectory('/some/dir', baseOptions);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledWith(
        '/some/dir',
        expect.anything(),
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
        })
      );
    });

    it('should pass onProgress callback in batchOptions', async () => {
      await handler.translateDirectory('/some/dir', baseOptions);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledWith(
        '/some/dir',
        expect.anything(),
        expect.objectContaining({
          onProgress: expect.any(Function),
        })
      );
    });
  });

  describe('multi-target routing', () => {
    it('should call translateDirectory once per target language', async () => {
      const options: TranslateOptions = {
        ...baseOptions,
        to: 'de, fr, es',
      };

      await handler.translateDirectory('/some/dir', options);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledTimes(3);
    });

    it('should format output with language headers', async () => {
      const options: TranslateOptions = {
        ...baseOptions,
        to: 'de, fr',
      };

      const result = await handler.translateDirectory('/some/dir', options);

      expect(result).toContain('[de]');
      expect(result).toContain('[fr]');
    });

    it('should validate all language codes at once', async () => {
      const options: TranslateOptions = {
        ...baseOptions,
        to: 'de, fr',
      };

      await handler.translateDirectory('/some/dir', options);

      const { validateLanguageCodes } = jest.requireMock(
        '../../src/cli/commands/translate/translate-utils'
      );

      expect(validateLanguageCodes).toHaveBeenCalledWith(['de', 'fr']);
    });

    it('should call buildTranslationOptions with each individual language', async () => {
      const options: TranslateOptions = {
        ...baseOptions,
        to: 'de, fr',
      };

      await handler.translateDirectory('/some/dir', options);

      const { buildTranslationOptions } = jest.requireMock(
        '../../src/cli/commands/translate/translate-utils'
      );

      expect(buildTranslationOptions).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'de' })
      );
      expect(buildTranslationOptions).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'fr' })
      );
    });
  });

  describe('concurrency option', () => {
    it('should create new BatchTranslationService when concurrency is set', async () => {
      // Re-apply BatchTranslationService constructor mock (cleared by resetMocks)
      const { BatchTranslationService: MockedBTS } = jest.requireMock(
        '../../src/services/batch-translation'
      );
      MockedBTS.mockImplementation(() => ({
        translateDirectory: jest.fn().mockResolvedValue({
          successful: [{ file: 'test.txt', outputPath: '/out/test.de.txt' }],
          failed: [],
          skipped: [],
        }),
        getStatistics: jest.fn().mockReturnValue({
          total: 1, successful: 1, failed: 0, skipped: 0,
        }),
      }));

      const options: TranslateOptions = {
        ...baseOptions,
        concurrency: 10,
      };

      await handler.translateDirectory('/some/dir', options);

      expect(MockedBTS).toHaveBeenCalledWith(
        ctx.fileTranslationService,
        { concurrency: 10, translationService: ctx.translationService }
      );
    });

    it('should not create new BatchTranslationService when concurrency is not set', async () => {
      await handler.translateDirectory('/some/dir', baseOptions);

      const { BatchTranslationService: MockedBTS } = jest.requireMock(
        '../../src/services/batch-translation'
      );

      expect(MockedBTS).not.toHaveBeenCalled();
    });
  });

  describe('pattern option', () => {
    it('should forward pattern in batchOptions', async () => {
      const options: TranslateOptions = {
        ...baseOptions,
        pattern: '*.md',
      };

      await handler.translateDirectory('/some/dir', options);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledWith(
        '/some/dir',
        expect.anything(),
        expect.objectContaining({ pattern: '*.md' })
      );
    });

    it('should pass undefined pattern when not specified', async () => {
      await handler.translateDirectory('/some/dir', baseOptions);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledWith(
        '/some/dir',
        expect.anything(),
        expect.objectContaining({ pattern: undefined })
      );
    });
  });

  describe('recursive default', () => {
    it('should default recursive to true when not specified', async () => {
      await handler.translateDirectory('/some/dir', baseOptions);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledWith(
        '/some/dir',
        expect.anything(),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should set recursive to false when explicitly disabled', async () => {
      const options: TranslateOptions = {
        ...baseOptions,
        recursive: false,
      };

      await handler.translateDirectory('/some/dir', options);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledWith(
        '/some/dir',
        expect.anything(),
        expect.objectContaining({ recursive: false })
      );
    });

    it('should set recursive to true when explicitly enabled', async () => {
      const options: TranslateOptions = {
        ...baseOptions,
        recursive: true,
      };

      await handler.translateDirectory('/some/dir', options);

      expect(mockBatchService.translateDirectory).toHaveBeenCalledWith(
        '/some/dir',
        expect.anything(),
        expect.objectContaining({ recursive: true })
      );
    });
  });

  describe('statistics output', () => {
    it('should include total and successful counts in output', async () => {
      mockBatchService.getStatistics.mockReturnValue({
        total: 5,
        successful: 3,
        failed: 1,
        skipped: 1,
      });
      mockBatchService.translateDirectory.mockResolvedValue({
        successful: [
          { file: 'a.txt', outputPath: '/out/a.de.txt' },
          { file: 'b.txt', outputPath: '/out/b.de.txt' },
          { file: 'c.txt', outputPath: '/out/c.de.txt' },
        ],
        failed: [{ file: 'd.txt', error: 'API error' }],
        skipped: [{ file: 'e.txt', reason: 'unsupported' }],
      });

      const result = await handler.translateDirectory('/some/dir', baseOptions);

      expect(result).toContain('Total files: 5');
      expect(result).toContain('Successful: 3');
    });

    it('should format statistics with emoji indicators', async () => {
      const result = await handler.translateDirectory('/some/dir', baseOptions);

      expect(result).toContain('✓ Successful:');
    });
  });

  describe('failed files format', () => {
    it('should include failed file details in output', async () => {
      mockBatchService.getStatistics.mockReturnValue({
        total: 2,
        successful: 1,
        failed: 1,
        skipped: 0,
      });
      mockBatchService.translateDirectory.mockResolvedValue({
        successful: [{ file: 'a.txt', outputPath: '/out/a.de.txt' }],
        failed: [{ file: 'broken.txt', error: 'API timeout' }],
        skipped: [],
      });

      const result = await handler.translateDirectory('/some/dir', baseOptions);

      expect(result).toContain('Failed: 1');
      expect(result).toContain('Failed files:');
      expect(result).toContain('- broken.txt: API timeout');
    });

    it('should list multiple failed files', async () => {
      mockBatchService.getStatistics.mockReturnValue({
        total: 3,
        successful: 0,
        failed: 3,
        skipped: 0,
      });
      mockBatchService.translateDirectory.mockResolvedValue({
        successful: [],
        failed: [
          { file: 'a.txt', error: 'Error 1' },
          { file: 'b.txt', error: 'Error 2' },
          { file: 'c.txt', error: 'Error 3' },
        ],
        skipped: [],
      });

      const result = await handler.translateDirectory('/some/dir', baseOptions);

      expect(result).toContain('- a.txt: Error 1');
      expect(result).toContain('- b.txt: Error 2');
      expect(result).toContain('- c.txt: Error 3');
    });

    it('should not include failed section when no failures', async () => {
      const result = await handler.translateDirectory('/some/dir', baseOptions);

      expect(result).not.toContain('Failed:');
      expect(result).not.toContain('Failed files:');
    });
  });

  describe('skipped count', () => {
    it('should include skipped count in output when files are skipped', async () => {
      mockBatchService.getStatistics.mockReturnValue({
        total: 3,
        successful: 2,
        failed: 0,
        skipped: 1,
      });
      mockBatchService.translateDirectory.mockResolvedValue({
        successful: [
          { file: 'a.txt', outputPath: '/out/a.de.txt' },
          { file: 'b.txt', outputPath: '/out/b.de.txt' },
        ],
        failed: [],
        skipped: [{ file: 'c.png', reason: 'unsupported' }],
      });

      const result = await handler.translateDirectory('/some/dir', baseOptions);

      expect(result).toContain('Skipped: 1');
    });

    it('should not include skipped line when count is 0', async () => {
      const result = await handler.translateDirectory('/some/dir', baseOptions);

      expect(result).not.toContain('Skipped');
    });
  });

  describe('error handling', () => {
    it('should rethrow errors from translateDirectory', async () => {
      const error = new Error('Translation service unavailable');
      mockBatchService.translateDirectory.mockRejectedValue(error);

      await expect(handler.translateDirectory('/some/dir', baseOptions))
        .rejects.toThrow('Translation service unavailable');
    });

    it('should rethrow the exact error instance', async () => {
      const error = new Error('Specific error');
      mockBatchService.translateDirectory.mockRejectedValue(error);

      await expect(handler.translateDirectory('/some/dir', baseOptions))
        .rejects.toBe(error);
    });
  });

  describe('spinner behavior', () => {
    function setupSpinnerMock() {
      const mockSpinner = {
        start: jest.fn(function(this: any) { return this; }),
        succeed: jest.fn(),
        fail: jest.fn(),
        text: '',
      };
      const oraMock = jest.requireMock('ora');
      oraMock.mockReturnValue(mockSpinner);
      return mockSpinner;
    }

    it('should call spinner.fail when translateDirectory throws', async () => {
      const mockSpinner = setupSpinnerMock();
      (Logger.shouldShowSpinner as jest.Mock).mockReturnValue(true);
      mockBatchService.translateDirectory.mockRejectedValue(new Error('fail'));

      await expect(handler.translateDirectory('/some/dir', baseOptions))
        .rejects.toThrow('fail');

      expect(mockSpinner.fail).toHaveBeenCalledWith('Translation failed');
    });

    it('should call spinner.succeed on successful translation', async () => {
      const mockSpinner = setupSpinnerMock();
      (Logger.shouldShowSpinner as jest.Mock).mockReturnValue(true);

      await handler.translateDirectory('/some/dir', baseOptions);

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Translation complete!');
    });

    it('should not create spinner when shouldShowSpinner returns false', async () => {
      (Logger.shouldShowSpinner as jest.Mock).mockReturnValue(false);

      await handler.translateDirectory('/some/dir', baseOptions);

      const oraMock = jest.requireMock('ora');
      expect(oraMock).not.toHaveBeenCalled();
    });
  });

  describe('SIGINT handling', () => {
    it('should register SIGINT handler', async () => {
      const onSpy = jest.spyOn(process, 'on');

      await handler.translateDirectory('/some/dir', baseOptions);

      expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      onSpy.mockRestore();
    });

    it('should clean up SIGINT handler after success', async () => {
      const removeListenerSpy = jest.spyOn(process, 'removeListener');

      await handler.translateDirectory('/some/dir', baseOptions);

      expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      removeListenerSpy.mockRestore();
    });

    it('should clean up SIGINT handler even on error', async () => {
      const removeListenerSpy = jest.spyOn(process, 'removeListener');
      mockBatchService.translateDirectory.mockRejectedValue(new Error('fail'));

      await expect(handler.translateDirectory('/some/dir', baseOptions))
        .rejects.toThrow();

      expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      removeListenerSpy.mockRestore();
    });

    it('should register and remove the same handler function', async () => {
      const onSpy = jest.spyOn(process, 'on');
      const removeListenerSpy = jest.spyOn(process, 'removeListener');

      await handler.translateDirectory('/some/dir', baseOptions);

      const sigintOnCall = onSpy.mock.calls.find(call => call[0] === 'SIGINT');
      const sigintRemoveCall = removeListenerSpy.mock.calls.find(
        call => call[0] === 'SIGINT'
      );

      expect(sigintOnCall).toBeDefined();
      expect(sigintRemoveCall).toBeDefined();
      expect(sigintOnCall![1]).toBe(sigintRemoveCall![1]);

      onSpy.mockRestore();
      removeListenerSpy.mockRestore();
    });
  });
});
