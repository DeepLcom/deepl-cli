import { FileTranslationHandler } from '../../src/cli/commands/translate/file-translation-handler';
import { DocumentTranslationHandler } from '../../src/cli/commands/translate/document-translation-handler';
import type { HandlerContext, TranslateOptions } from '../../src/cli/commands/translate/types';
import { ValidationError } from '../../src/utils/errors';
import {
  createMockTranslationService,
  createMockFileTranslationService,
  createMockDocumentTranslationService,
  createMockGlossaryService,
  createMockConfigService,
} from '../helpers/mock-factories';
import type { BatchTranslationService } from '../../src/services/batch-translation';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
  };
});
jest.mock('../../src/utils/atomic-write', () => ({
  atomicWriteFile: jest.fn().mockResolvedValue(undefined),
  atomicWriteFileSync: jest.fn(),
}));
jest.mock('../../src/utils/safe-read-file', () => ({
  safeReadFileSync: jest.fn().mockReturnValue('file content'),
  safeReadFile: jest.fn().mockResolvedValue('file content'),
}));
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    verbose: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    shouldShowSpinner: jest.fn().mockReturnValue(false),
  },
}));

jest.mock('../../src/cli/commands/translate/translate-utils', () => {
  const actual = jest.requireActual('../../src/cli/commands/translate/translate-utils');
  return {
    ...actual,
    isTextBasedFile: jest.fn().mockReturnValue(false),
    isStructuredFile: jest.fn().mockReturnValue(false),
    getFileSize: jest.fn().mockReturnValue(50),
  };
});

import * as fs from 'fs';
import { safeReadFileSync } from '../../src/utils/safe-read-file';
import { isTextBasedFile, isStructuredFile, getFileSize, SAFE_TEXT_SIZE_LIMIT } from '../../src/cli/commands/translate/translate-utils';

const mockedIsTextBasedFile = isTextBasedFile as jest.MockedFunction<typeof isTextBasedFile>;
const mockedIsStructuredFile = isStructuredFile as jest.MockedFunction<typeof isStructuredFile>;
const mockedGetFileSize = getFileSize as jest.MockedFunction<typeof getFileSize>;
const mockedSafeReadFileSync = jest.mocked(safeReadFileSync) as unknown as jest.Mock;

function createMockHandlerContext() {
  const translationService = createMockTranslationService({
    translate: jest.fn().mockResolvedValue({ text: 'translated', detectedSourceLang: 'en' }),
  });
  const fileTranslationService = createMockFileTranslationService();
  const batchTranslationService = {} as jest.Mocked<BatchTranslationService>;
  const documentTranslationService = createMockDocumentTranslationService();
  const glossaryService = createMockGlossaryService();
  const config = createMockConfigService({
    getValue: jest.fn((key: string) => {
      if (key === 'auth.apiKey') return 'test-api-key';
      return undefined;
    }),
  });

  const ctx: HandlerContext = {
    translationService,
    fileTranslationService,
    batchTranslationService,
    documentTranslationService,
    glossaryService,
    config,
  };

  return { ctx, mocks: { translationService, fileTranslationService, batchTranslationService, documentTranslationService, glossaryService, config } };
}

function defaultOptions(overrides: Partial<TranslateOptions> = {}): TranslateOptions {
  return { to: 'de', output: '/tmp/output.txt', cache: true, ...overrides };
}

describe('FileTranslationHandler', () => {
  let handler: FileTranslationHandler;
  let mocks: ReturnType<typeof createMockHandlerContext>['mocks'];
  let mockDocHandler: jest.Mocked<DocumentTranslationHandler>;

  beforeEach(() => {
    jest.clearAllMocks();

    const { Logger: MockLogger } = jest.requireMock('../../src/utils/logger');
    MockLogger.warn.mockImplementation(() => {});
    MockLogger.verbose.mockImplementation(() => {});

    mockedSafeReadFileSync.mockReturnValue('file content');

    const result = createMockHandlerContext();
    mocks = result.mocks;

    mockDocHandler = {
      translateDocument: jest.fn().mockResolvedValue('Translated doc.pdf -> /tmp/output.pdf'),
      ctx: result.ctx,
    } as unknown as jest.Mocked<DocumentTranslationHandler>;

    handler = new FileTranslationHandler(result.ctx, mockDocHandler);

    // Reset mocks to defaults
    mockedIsTextBasedFile.mockReturnValue(false);
    mockedIsStructuredFile.mockReturnValue(false);
    mockedGetFileSize.mockReturnValue(50);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => undefined);
  });

  describe('translateFile()', () => {
    it('should throw ValidationError when no output is specified', async () => {
      await expect(
        handler.translateFile('/tmp/file.txt', { to: 'de', cache: true } as TranslateOptions)
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.translateFile('/tmp/file.txt', { to: 'de', cache: true } as TranslateOptions)
      ).rejects.toThrow('Output file path is required');
    });

    it('should throw ValidationError for multi-target with stdout output', async () => {
      await expect(
        handler.translateFile('/tmp/file.txt', defaultOptions({ to: 'de,fr', output: '-' }))
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.translateFile('/tmp/file.txt', defaultOptions({ to: 'de,fr', output: '-' }))
      ).rejects.toThrow('Cannot use --output - with multiple target languages');
    });

    it('should call fileTranslationService.translateFileToMultiple for multi-target', async () => {
      mocks.fileTranslationService.translateFileToMultiple.mockResolvedValue([
        { targetLang: 'de' as any, text: 'Hallo', outputPath: '/tmp/out/file.de.txt' },
        { targetLang: 'fr' as any, text: 'Bonjour', outputPath: '/tmp/out/file.fr.txt' },
      ]);

      const result = await handler.translateFile('/tmp/file.txt', defaultOptions({ to: 'de,fr', output: '/tmp/out' }));

      expect(mocks.fileTranslationService.translateFileToMultiple).toHaveBeenCalled();
      expect(result).toContain('2 languages');
    });

    describe('multi-target glossary + translation memory', () => {
      const TM_UUID = '11111111-2222-3333-4444-555555555555';

      beforeEach(() => {
        mocks.fileTranslationService.translateFileToMultiple.mockResolvedValue([
          { targetLang: 'de' as any, text: 'Hallo', outputPath: '/tmp/out/file.de.txt' },
          { targetLang: 'fr' as any, text: 'Bonjour', outputPath: '/tmp/out/file.fr.txt' },
        ]);
      });

      it('throws ValidationError for --glossary without --from in multi-target', async () => {
        const err = await handler
          .translateFile('/tmp/file.txt', defaultOptions({ to: 'de,fr', output: '/tmp/out', glossary: 'my-glossary' }))
          .catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toContain('Source language (--from) is required');
      });

      it('throws ValidationError for --translation-memory without --from in multi-target', async () => {
        const err = await handler
          .translateFile('/tmp/file.txt', defaultOptions({ to: 'de,fr', output: '/tmp/out', translationMemory: 'my-tm' }))
          .catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).exitCode).toBe(6);
        expect((err as Error).message).toContain('--from is required when using --translation-memory');
      });

      it('throws ValidationError for multi-target TM + latency_optimized model', async () => {
        const err = await handler
          .translateFile('/tmp/file.txt', defaultOptions({
            to: 'de,fr', output: '/tmp/out',
            from: 'en', translationMemory: 'my-tm', modelType: 'latency_optimized',
          }))
          .catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toContain('requires quality_optimized model type');
      });

      it('resolves glossary name to ID and passes it to translateFileToMultiple', async () => {
        mocks.glossaryService.resolveGlossaryId.mockResolvedValue('glossary-abc-123');

        await handler.translateFile('/tmp/file.txt', defaultOptions({
          to: 'de,fr', output: '/tmp/out',
          from: 'en', glossary: 'my-glossary',
        }));

        expect(mocks.glossaryService.resolveGlossaryId).toHaveBeenCalledTimes(1);
        expect(mocks.glossaryService.resolveGlossaryId).toHaveBeenCalledWith('my-glossary');
        const call = mocks.fileTranslationService.translateFileToMultiple.mock.calls[0]!;
        expect(call[2]).toEqual(expect.objectContaining({ glossaryId: 'glossary-abc-123' }));
      });

      it('TM UUID fast-path in multi-target: passes UUID through, skips listTranslationMemories, sets quality_optimized', async () => {
        await handler.translateFile('/tmp/file.txt', defaultOptions({
          to: 'de,fr', output: '/tmp/out',
          from: 'en', translationMemory: TM_UUID,
        }));

        expect(mocks.translationService.listTranslationMemories).not.toHaveBeenCalled();
        const call = mocks.fileTranslationService.translateFileToMultiple.mock.calls[0]!;
        expect(call[2]).toEqual(expect.objectContaining({
          translationMemoryId: TM_UUID,
          modelType: 'quality_optimized',
        }));
      });

      it('TM UUID + --tm-threshold passes through as translationMemoryThreshold in multi-target', async () => {
        await handler.translateFile('/tmp/file.txt', defaultOptions({
          to: 'de,fr', output: '/tmp/out',
          from: 'en', translationMemory: TM_UUID, tmThreshold: 85,
        }));

        const call = mocks.fileTranslationService.translateFileToMultiple.mock.calls[0]!;
        expect(call[2]).toEqual(expect.objectContaining({ translationMemoryThreshold: 85 }));
      });

      it('TM name resolution in multi-target: surfaces clean pair-check error when TM target_lang does not match all requested targets', async () => {
        mocks.translationService.listTranslationMemories.mockResolvedValue([
          { translation_memory_id: TM_UUID, name: 'my-tm', source_language: 'en', target_languages: ['de'] },
        ]);

        const err = await handler
          .translateFile('/tmp/file.txt', defaultOptions({
            to: 'de,fr', output: '/tmp/out',
            from: 'en', translationMemory: 'my-tm',
          }))
          .catch(e => e);
        expect((err as Error).message).toContain('does not support the requested language pair');
        expect(mocks.fileTranslationService.translateFileToMultiple).not.toHaveBeenCalled();
      });
    });

    it('should use text translation for small text-based files', async () => {
      mockedIsTextBasedFile.mockReturnValue(true);
      mockedGetFileSize.mockReturnValue(50);
      mockedSafeReadFileSync.mockReturnValue('file content');

      const result = await handler.translateFile('/tmp/file.txt', defaultOptions());

      expect(mocks.translationService.translate).toHaveBeenCalledWith(
        'file content',
        expect.any(Object),
        expect.any(Object)
      );
      expect(result).toContain('Translated');
    });

    it('should use document API with warning for large text-based files when document supported', async () => {
      mockedIsTextBasedFile.mockReturnValue(true);
      mockedGetFileSize.mockReturnValue(SAFE_TEXT_SIZE_LIMIT + 1);
      mocks.documentTranslationService.isDocumentSupported.mockReturnValue(true);

      const result = await handler.translateFile('/tmp/file.txt', defaultOptions());

      expect(mockDocHandler.translateDocument).toHaveBeenCalled();
      expect(result).toContain('100 KiB');
    });

    it('should use fileTranslationService.translateFile for structured files (via isStructuredFile path)', async () => {
      mockedIsTextBasedFile.mockReturnValue(true);
      mockedGetFileSize.mockReturnValue(50);
      mockedIsStructuredFile.mockReturnValue(true);

      const result = await handler.translateFile('/tmp/file.json', defaultOptions());

      expect(mocks.fileTranslationService.translateFile).toHaveBeenCalled();
      expect(result).toContain('Translated');
    });

    it('should use documentHandler for document-supported files', async () => {
      mockedIsTextBasedFile.mockReturnValue(false);
      mocks.documentTranslationService.isDocumentSupported.mockReturnValue(true);

      await handler.translateFile('/tmp/doc.pdf', defaultOptions());

      expect(mockDocHandler.translateDocument).toHaveBeenCalledWith('/tmp/doc.pdf', defaultOptions());
    });

    it('should write to stdout when output is "-"', async () => {
      mockedIsTextBasedFile.mockReturnValue(true);
      mockedGetFileSize.mockReturnValue(50);
      mockedIsStructuredFile.mockReturnValue(false);
      mockedSafeReadFileSync.mockReturnValue('file content');

      const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = await handler.translateFile('/tmp/file.txt', defaultOptions({ output: '-' }));

      expect(stdoutWrite).toHaveBeenCalledWith('translated');
      expect(result).toBe('');

      stdoutWrite.mockRestore();
    });

    it('should throw ValidationError for glossary without --from in translateTextFile', async () => {
      mockedIsTextBasedFile.mockReturnValue(true);
      mockedGetFileSize.mockReturnValue(50);
      mocks.glossaryService.resolveGlossaryId.mockResolvedValue('glossary-123');

      await expect(
        handler.translateFile('/tmp/file.txt', defaultOptions({ glossary: 'my-glossary' }))
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.translateFile('/tmp/file.txt', defaultOptions({ glossary: 'my-glossary' }))
      ).rejects.toThrow('Source language (--from) is required');
    });

    it('should throw ValidationError for structured file + stdout', async () => {
      mockedIsTextBasedFile.mockReturnValue(true);
      mockedGetFileSize.mockReturnValue(50);
      mockedIsStructuredFile.mockReturnValue(true);

      await expect(
        handler.translateFile('/tmp/file.json', defaultOptions({ output: '-' }))
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.translateFile('/tmp/file.json', defaultOptions({ output: '-' }))
      ).rejects.toThrow('Cannot stream structured file');
    });

    it('should fall back to fileTranslationService.translateFile for non-text non-document files', async () => {
      mockedIsTextBasedFile.mockReturnValue(false);
      mocks.documentTranslationService.isDocumentSupported.mockReturnValue(false);

      const result = await handler.translateFile('/tmp/file.xyz', defaultOptions());

      expect(mocks.fileTranslationService.translateFile).toHaveBeenCalledWith(
        '/tmp/file.xyz',
        '/tmp/output.txt',
        expect.any(Object),
        expect.objectContaining({ preserveCode: undefined })
      );
      expect(result).toContain('Translated');
    });

    describe('--translation-memory', () => {
      const TM_UUID = '11111111-2222-3333-4444-555555555555';

      beforeEach(() => {
        mockedIsTextBasedFile.mockReturnValue(true);
        mockedGetFileSize.mockReturnValue(50);
      });

      it('throws ValidationError (exit 6) when --translation-memory used without --from', async () => {
        const err = await handler
          .translateFile('/tmp/file.txt', defaultOptions({ translationMemory: 'my-tm' }))
          .catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).exitCode).toBe(6);
        expect((err as Error).message).toContain('--from is required when using --translation-memory');
      });

      it('throws ValidationError (exit 6) when combined with latency_optimized', async () => {
        const err = await handler
          .translateFile('/tmp/file.txt', defaultOptions({
            from: 'en', translationMemory: 'my-tm', modelType: 'latency_optimized',
          }))
          .catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).exitCode).toBe(6);
        expect((err as Error).message).toContain('requires quality_optimized model type');
      });

      it('resolves TM name and passes resolved UUID to translate() for small text files', async () => {
        mocks.translationService.listTranslationMemories.mockResolvedValue([
          { translation_memory_id: TM_UUID, name: 'my-tm', source_language: 'en', target_languages: ['de'] },
        ]);

        await handler.translateFile('/tmp/file.txt', defaultOptions({
          from: 'en', translationMemory: 'my-tm',
        }));

        expect(mocks.translationService.listTranslationMemories).toHaveBeenCalledTimes(1);
        expect(mocks.translationService.translate).toHaveBeenCalledWith(
          'file content',
          expect.objectContaining({
            targetLang: 'de',
            translationMemoryId: TM_UUID,
            modelType: 'quality_optimized',
          }),
          expect.any(Object)
        );
      });

      it('resolves TM name and passes resolved UUID to fileTranslationService.translateFile for structured files', async () => {
        mockedIsStructuredFile.mockReturnValue(true);
        mocks.translationService.listTranslationMemories.mockResolvedValue([
          { translation_memory_id: TM_UUID, name: 'my-tm', source_language: 'en', target_languages: ['de'] },
        ]);

        await handler.translateFile('/tmp/file.json', defaultOptions({
          from: 'en', translationMemory: 'my-tm',
        }));

        expect(mocks.translationService.listTranslationMemories).toHaveBeenCalledTimes(1);
        expect(mocks.fileTranslationService.translateFile).toHaveBeenCalledWith(
          '/tmp/file.json',
          '/tmp/output.txt',
          expect.objectContaining({
            translationMemoryId: TM_UUID,
            modelType: 'quality_optimized',
          }),
          expect.any(Object)
        );
      });

      it('passes --tm-threshold through as translationMemoryThreshold', async () => {
        mocks.translationService.listTranslationMemories.mockResolvedValue([
          { translation_memory_id: TM_UUID, name: 'my-tm', source_language: 'en', target_languages: ['de'] },
        ]);

        await handler.translateFile('/tmp/file.txt', defaultOptions({
          from: 'en', translationMemory: 'my-tm', tmThreshold: 85,
        }));

        expect(mocks.translationService.translate).toHaveBeenCalledWith(
          'file content',
          expect.objectContaining({ translationMemoryThreshold: 85 }),
          expect.any(Object)
        );
      });

      it('UUID fast-path: does NOT call listTranslationMemories when a UUID is passed', async () => {
        await handler.translateFile('/tmp/file.txt', defaultOptions({
          from: 'en', translationMemory: TM_UUID,
        }));

        expect(mocks.translationService.listTranslationMemories).not.toHaveBeenCalled();
        expect(mocks.translationService.translate).toHaveBeenCalledWith(
          'file content',
          expect.objectContaining({ translationMemoryId: TM_UUID }),
          expect.any(Object)
        );
      });

      it('forces modelType=quality_optimized when --translation-memory set and no --model-type given', async () => {
        mocks.translationService.listTranslationMemories.mockResolvedValue([
          { translation_memory_id: TM_UUID, name: 'my-tm', source_language: 'en', target_languages: ['de'] },
        ]);

        await handler.translateFile('/tmp/file.txt', defaultOptions({
          from: 'en', translationMemory: 'my-tm',
        }));

        expect(mocks.translationService.translate).toHaveBeenCalledWith(
          'file content',
          expect.objectContaining({ modelType: 'quality_optimized' }),
          expect.any(Object)
        );
      });
    });
  });
});
