import { TextTranslationHandler } from '../../src/cli/commands/translate/text-translation-handler';
import type { HandlerContext, TranslateOptions } from '../../src/cli/commands/translate/types';
import { ValidationError, AuthError } from '../../src/utils/errors';
import {
  createMockTranslationService,
  createMockFileTranslationService,
  createMockDocumentTranslationService,
  createMockGlossaryService,
  createMockConfigService,
} from '../helpers/mock-factories';
import type { TranslationService } from '../../src/services/translation';
import type { FileTranslationService } from '../../src/services/file-translation';
import type { DocumentTranslationService } from '../../src/services/document-translation';
import type { GlossaryService } from '../../src/services/glossary';
import type { ConfigService } from '../../src/storage/config';
import type { BatchTranslationService } from '../../src/services/batch-translation';

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    verbose: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    shouldShowSpinner: jest.fn().mockReturnValue(false),
  },
}));

function createMockContext(overrides: {
  translationService?: jest.Mocked<TranslationService>;
  fileTranslationService?: jest.Mocked<FileTranslationService>;
  documentTranslationService?: jest.Mocked<DocumentTranslationService>;
  glossaryService?: jest.Mocked<GlossaryService>;
  config?: jest.Mocked<ConfigService>;
} = {}): { ctx: HandlerContext; mocks: {
  translationService: jest.Mocked<TranslationService>;
  fileTranslationService: jest.Mocked<FileTranslationService>;
  batchTranslationService: jest.Mocked<BatchTranslationService>;
  documentTranslationService: jest.Mocked<DocumentTranslationService>;
  glossaryService: jest.Mocked<GlossaryService>;
  config: jest.Mocked<ConfigService>;
}} {
  const translationService = overrides.translationService ?? createMockTranslationService({
    translate: jest.fn().mockResolvedValue({ text: 'translated', detectedSourceLang: 'en' }),
  });
  const fileTranslationService = overrides.fileTranslationService ?? createMockFileTranslationService();
  const batchTranslationService = {} as jest.Mocked<BatchTranslationService>;
  const documentTranslationService = overrides.documentTranslationService ?? createMockDocumentTranslationService();
  const glossaryService = overrides.glossaryService ?? createMockGlossaryService();
  const config = overrides.config ?? createMockConfigService({
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
  return { to: 'de', cache: true, ...overrides };
}

describe('TextTranslationHandler', () => {
  let handler: TextTranslationHandler;
  let mocks: ReturnType<typeof createMockContext>['mocks'];
  const origEnv = process.env['DEEPL_API_KEY'];

  beforeEach(() => {
    jest.clearAllMocks();

    const { Logger: MockLogger } = jest.requireMock('../../src/utils/logger');
    MockLogger.warn.mockImplementation(() => {});
    MockLogger.verbose.mockImplementation(() => {});

    const result = createMockContext();
    handler = new TextTranslationHandler(result.ctx);
    mocks = result.mocks;
    delete process.env['DEEPL_API_KEY'];
  });

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env['DEEPL_API_KEY'] = origEnv;
    } else {
      delete process.env['DEEPL_API_KEY'];
    }
  });

  describe('translateText()', () => {
    it('should throw ValidationError for empty text', async () => {
      await expect(handler.translateText('', defaultOptions())).rejects.toThrow(ValidationError);
      await expect(handler.translateText('', defaultOptions())).rejects.toThrow('Text cannot be empty');
    });

    it('should throw ValidationError for whitespace-only text', async () => {
      await expect(handler.translateText('   ', defaultOptions())).rejects.toThrow(ValidationError);
    });

    it('should throw AuthError when no API key is configured', async () => {
      const { ctx } = createMockContext({
        config: createMockConfigService({
          getValue: jest.fn().mockReturnValue(undefined),
        }),
      });
      const h = new TextTranslationHandler(ctx);
      await expect(h.translateText('Hello', defaultOptions())).rejects.toThrow(AuthError);
    });

    it('should not throw AuthError when DEEPL_API_KEY env var is set', async () => {
      process.env['DEEPL_API_KEY'] = 'env-key';
      const { ctx } = createMockContext({
        config: createMockConfigService({
          getValue: jest.fn().mockReturnValue(undefined),
        }),
      });
      const h = new TextTranslationHandler(ctx);
      const result = await h.translateText('Hello', defaultOptions());
      expect(result).toBe('translated');
    });

    it('should call translate() and return result text for single target', async () => {
      const result = await handler.translateText('Hello', defaultOptions());
      expect(mocks.translationService.translate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ targetLang: 'de' }),
        expect.objectContaining({ skipCache: false })
      );
      expect(result).toBe('translated');
    });

    it('should call translateToMultiple() for comma-separated targets', async () => {
      mocks.translationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'de' as any, text: 'Hallo' },
        { targetLang: 'fr' as any, text: 'Bonjour' },
      ]);

      const result = await handler.translateText('Hello', defaultOptions({ to: 'de,fr' }));
      expect(mocks.translationService.translateToMultiple).toHaveBeenCalled();
      expect(result).toContain('[de]');
      expect(result).toContain('[fr]');
    });

    describe('custom instructions validation', () => {
      it('should throw ValidationError when >10 custom instructions', async () => {
        const instructions = Array.from({ length: 11 }, (_, i) => `instruction ${i}`);
        await expect(
          handler.translateText('Hello', defaultOptions({ customInstruction: instructions }))
        ).rejects.toThrow(ValidationError);
        await expect(
          handler.translateText('Hello', defaultOptions({ customInstruction: instructions }))
        ).rejects.toThrow('Maximum 10 custom instructions allowed');
      });

      it('should throw ValidationError when instruction exceeds 300 chars', async () => {
        const longInstruction = 'x'.repeat(301);
        await expect(
          handler.translateText('Hello', defaultOptions({ customInstruction: [longInstruction] }))
        ).rejects.toThrow(ValidationError);
        await expect(
          handler.translateText('Hello', defaultOptions({ customInstruction: [longInstruction] }))
        ).rejects.toThrow('character limit');
      });

      it('should throw ValidationError when custom instructions used with latency_optimized', async () => {
        await expect(
          handler.translateText('Hello', defaultOptions({ customInstruction: ['Be formal'], modelType: 'latency_optimized' }))
        ).rejects.toThrow(ValidationError);
        await expect(
          handler.translateText('Hello', defaultOptions({ customInstruction: ['Be formal'], modelType: 'latency_optimized' }))
        ).rejects.toThrow('cannot be used with latency_optimized');
      });
    });

    it('should throw ValidationError when styleId used with latency_optimized', async () => {
      await expect(
        handler.translateText('Hello', defaultOptions({ styleId: 'some-style', modelType: 'latency_optimized' }))
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.translateText('Hello', defaultOptions({ styleId: 'some-style', modelType: 'latency_optimized' }))
      ).rejects.toThrow('Style ID cannot be used with latency_optimized');
    });

    describe('XML parameters without --tag-handling xml', () => {
      it('should throw ValidationError for --outline-detection without --tag-handling xml', async () => {
        await expect(
          handler.translateText('Hello', defaultOptions({ outlineDetection: 'true' }))
        ).rejects.toThrow(ValidationError);
        await expect(
          handler.translateText('Hello', defaultOptions({ outlineDetection: 'true' }))
        ).rejects.toThrow('require --tag-handling xml');
      });

      it('should throw ValidationError for --splitting-tags without --tag-handling xml', async () => {
        await expect(
          handler.translateText('Hello', defaultOptions({ splittingTags: 'p,div' }))
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for --non-splitting-tags without --tag-handling xml', async () => {
        await expect(
          handler.translateText('Hello', defaultOptions({ nonSplittingTags: 'span' }))
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for --ignore-tags without --tag-handling xml', async () => {
        await expect(
          handler.translateText('Hello', defaultOptions({ ignoreTags: 'code' }))
        ).rejects.toThrow(ValidationError);
      });
    });

    it('should throw ValidationError for invalid outlineDetection value', async () => {
      await expect(
        handler.translateText('Hello', defaultOptions({ outlineDetection: 'yes', tagHandling: 'xml' }))
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.translateText('Hello', defaultOptions({ outlineDetection: 'yes', tagHandling: 'xml' }))
      ).rejects.toThrow('must be "true" or "false"');
    });

    describe('tagHandlingVersion validation', () => {
      it('should throw ValidationError without --tag-handling', async () => {
        await expect(
          handler.translateText('Hello', defaultOptions({ tagHandlingVersion: 'v1' }))
        ).rejects.toThrow(ValidationError);
        await expect(
          handler.translateText('Hello', defaultOptions({ tagHandlingVersion: 'v1' }))
        ).rejects.toThrow('requires --tag-handling to be set');
      });

      it('should throw ValidationError for invalid version value', async () => {
        await expect(
          handler.translateText('Hello', defaultOptions({ tagHandlingVersion: 'v3', tagHandling: 'xml' }))
        ).rejects.toThrow(ValidationError);
        await expect(
          handler.translateText('Hello', defaultOptions({ tagHandlingVersion: 'v3', tagHandling: 'xml' }))
        ).rejects.toThrow('must be "v1" or "v2"');
      });
    });

    it('should throw ValidationError for glossary without --from', async () => {
      mocks.glossaryService.resolveGlossaryId.mockResolvedValue('glossary-123');
      await expect(
        handler.translateText('Hello', defaultOptions({ glossary: 'my-glossary' }))
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.translateText('Hello', defaultOptions({ glossary: 'my-glossary' }))
      ).rejects.toThrow('Source language (--from) is required');
    });

    describe('format output', () => {
      it('should return JSON string for format=json', async () => {
        const result = await handler.translateText('Hello', defaultOptions({ format: 'json' }));
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('text', 'translated');
      });

      it('should return table for format=table with multi-target', async () => {
        mocks.translationService.translateToMultiple.mockResolvedValue([
          { targetLang: 'de' as any, text: 'Hallo' },
          { targetLang: 'fr' as any, text: 'Bonjour' },
        ]);

        const result = await handler.translateText('Hello', defaultOptions({ to: 'de,fr', format: 'table' }));
        expect(result).toContain('DE');
        expect(result).toContain('FR');
      });

      it('should append billed characters metadata when present', async () => {
        mocks.translationService.translate.mockResolvedValue({
          text: 'translated',
          detectedSourceLang: 'en' as any,
          billedCharacters: 42,
        });

        const result = await handler.translateText('Hello', defaultOptions());
        expect(result).toContain('Billed characters: 42');
      });

      it('should append model type metadata when present', async () => {
        mocks.translationService.translate.mockResolvedValue({
          text: 'translated',
          detectedSourceLang: 'en' as any,
          modelTypeUsed: 'quality_optimized',
        });

        const result = await handler.translateText('Hello', defaultOptions());
        expect(result).toContain('Model: quality_optimized');
      });
    });

    it('should call warnIgnoredOptions for multi-target translation', async () => {
      const { Logger } = jest.requireMock('../../src/utils/logger');
      mocks.translationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'de' as any, text: 'Hallo' },
      ]);

      await handler.translateText('Hello', defaultOptions({
        to: 'de,fr',
        splitSentences: 'on',
      }));

      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('multi-target'));
    });

    it('should lowercase target and source language codes', async () => {
      await handler.translateText('Hello', defaultOptions({ to: 'DE', from: 'EN' }));
      expect(mocks.translationService.translate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ targetLang: 'de', sourceLang: 'en' }),
        expect.any(Object)
      );
    });
  });
});
