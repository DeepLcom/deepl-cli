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

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    verbose: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    shouldShowSpinner: jest.fn().mockReturnValue(true),
  },
}));

const mockSpinner = {
  start: jest.fn(function(this: any) { return this; }),
  succeed: jest.fn(function(this: any) { return this; }),
  fail: jest.fn(function(this: any) { return this; }),
  text: '',
};
jest.mock('ora', () => {
  return jest.fn(() => mockSpinner);
});
import ora from 'ora';
const mockedOra = ora as jest.MockedFunction<typeof ora>;

function createMockHandlerContext() {
  const translationService = createMockTranslationService();
  const fileTranslationService = createMockFileTranslationService();
  const batchTranslationService = {} as jest.Mocked<BatchTranslationService>;
  const documentTranslationService = createMockDocumentTranslationService({
    translateDocument: jest.fn().mockResolvedValue({ success: true, outputPath: '/tmp/output.pdf', billedCharacters: 100 }),
  });
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
  return { to: 'de', output: '/tmp/output.pdf', cache: true, ...overrides };
}

describe('DocumentTranslationHandler', () => {
  let handler: DocumentTranslationHandler;
  let mocks: ReturnType<typeof createMockHandlerContext>['mocks'];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner.start.mockImplementation(function(this: any) { return this; });
    mockSpinner.succeed.mockImplementation(function(this: any) { return this; });
    mockSpinner.fail.mockImplementation(function(this: any) { return this; });
    mockSpinner.text = '';
    mockedOra.mockReturnValue(mockSpinner as any);

    const { Logger: MockLogger } = jest.requireMock('../../src/utils/logger');
    MockLogger.shouldShowSpinner.mockReturnValue(true);
    MockLogger.warn.mockImplementation(() => {});
    MockLogger.verbose.mockImplementation(() => {});

    const result = createMockHandlerContext();
    handler = new DocumentTranslationHandler(result.ctx);
    mocks = result.mocks;
  });

  describe('translateDocument()', () => {
    it('should throw ValidationError for stdout output', async () => {
      await expect(
        handler.translateDocument('/tmp/doc.pdf', defaultOptions({ output: '-' }))
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.translateDocument('/tmp/doc.pdf', defaultOptions({ output: '-' }))
      ).rejects.toThrow('Cannot stream binary document translation to stdout');
    });

    it('should call warnIgnoredOptions with supported set', async () => {
      const { Logger: MockLogger } = jest.requireMock('../../src/utils/logger');

      await handler.translateDocument('/tmp/doc.pdf', defaultOptions({ splitSentences: 'on' }));

      expect(MockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('document'));
    });

    describe('glossaries', () => {
      const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      const resolveTo = (mapping: Record<string, string>): void => {
        mocks.glossaryService.resolveGlossaryId.mockImplementation(
          async (nameOrId: string) => {
            const id = mapping[nameOrId];
            if (!id) throw new ValidationError(`Glossary "${nameOrId}" not found`);
            return id;
          },
        );
      };

      it('should forward a single resolved glossary as glossaryId', async () => {
        resolveTo({ 'base-terms': A });

        await handler.translateDocument(
          '/tmp/doc.pdf',
          defaultOptions({ from: 'en', glossary: ['base-terms'] }),
        );

        expect(mocks.documentTranslationService.translateDocument).toHaveBeenCalledWith(
          '/tmp/doc.pdf',
          '/tmp/output.pdf',
          expect.objectContaining({ glossaryId: A }),
          expect.any(Function),
        );
        const passed = mocks.documentTranslationService.translateDocument.mock.calls[0]?.[2];
        expect(passed?.glossaryIds).toBeUndefined();
      });

      it('should forward several resolved glossaries as glossaryIds in order', async () => {
        resolveTo({ 'base-terms': A, 'project-overrides': B });

        await handler.translateDocument(
          '/tmp/doc.pdf',
          defaultOptions({ from: 'en', glossary: ['base-terms', 'project-overrides'] }),
        );

        expect(mocks.documentTranslationService.translateDocument).toHaveBeenCalledWith(
          '/tmp/doc.pdf',
          '/tmp/output.pdf',
          expect.objectContaining({ glossaryIds: [A, B] }),
          expect.any(Function),
        );
        const passed = mocks.documentTranslationService.translateDocument.mock.calls[0]?.[2];
        expect(passed?.glossaryId).toBeUndefined();
      });

      it('should preserve the reversed order, which changes the winning glossary', async () => {
        resolveTo({ 'base-terms': A, 'project-overrides': B });

        await handler.translateDocument(
          '/tmp/doc.pdf',
          defaultOptions({ from: 'en', glossary: ['project-overrides', 'base-terms'] }),
        );

        expect(mocks.documentTranslationService.translateDocument).toHaveBeenCalledWith(
          '/tmp/doc.pdf',
          '/tmp/output.pdf',
          expect.objectContaining({ glossaryIds: [B, A] }),
          expect.any(Function),
        );
      });

      it('should no longer warn that document mode ignores --glossary', async () => {
        const { Logger: MockLogger } = jest.requireMock('../../src/utils/logger');
        resolveTo({ 'base-terms': A });

        await handler.translateDocument(
          '/tmp/doc.pdf',
          defaultOptions({ from: 'en', glossary: ['base-terms'] }),
        );

        const warnings = MockLogger.warn.mock.calls.map((call: unknown[]) => String(call[0]));
        expect(warnings.some((w: string) => w.includes('--glossary'))).toBe(false);
      });

      /** The API rejects a document glossary without source_lang. */
      it('should require --from when a glossary is given', async () => {
        expect.assertions(3);
        resolveTo({ 'base-terms': A });

        await expect(
          handler.translateDocument('/tmp/doc.pdf', defaultOptions({ glossary: ['base-terms'] })),
        ).rejects.toThrow(ValidationError);
        try {
          await handler.translateDocument('/tmp/doc.pdf', defaultOptions({ glossary: ['base-terms'] }));
        } catch (error) {
          expect((error as ValidationError).message).toContain('--from');
        }
        expect(mocks.documentTranslationService.translateDocument).not.toHaveBeenCalled();
      });

      it('should not require --from when no glossary is given', async () => {
        await handler.translateDocument('/tmp/doc.pdf', defaultOptions());

        expect(mocks.documentTranslationService.translateDocument).toHaveBeenCalled();
      });

      it('should fail without uploading when a glossary name does not resolve', async () => {
        resolveTo({ 'base-terms': A });

        await expect(
          handler.translateDocument(
            '/tmp/doc.pdf',
            defaultOptions({ from: 'en', glossary: ['base-terms', 'no-such-glossary'] }),
          ),
        ).rejects.toThrow(/no-such-glossary/);
        expect(mocks.documentTranslationService.translateDocument).not.toHaveBeenCalled();
      });

      it('should send no glossary params when the flag is absent', async () => {
        await handler.translateDocument('/tmp/doc.pdf', defaultOptions({ from: 'en' }));

        const passed = mocks.documentTranslationService.translateDocument.mock.calls[0]?.[2];
        expect(passed?.glossaryId).toBeUndefined();
        expect(passed?.glossaryIds).toBeUndefined();
        expect(mocks.glossaryService.resolveGlossaryId).not.toHaveBeenCalled();
      });
    });

    it('should pass outputFormat through', async () => {
      await handler.translateDocument('/tmp/doc.pdf', defaultOptions({ outputFormat: 'pdf' }));

      expect(mocks.documentTranslationService.translateDocument).toHaveBeenCalledWith(
        '/tmp/doc.pdf',
        '/tmp/output.pdf',
        expect.objectContaining({ outputFormat: 'pdf' }),
        expect.any(Function)
      );
    });

    it('should set enableDocumentMinification when enableMinification is true', async () => {
      await handler.translateDocument('/tmp/doc.pdf', defaultOptions({ enableMinification: true }));

      expect(mocks.documentTranslationService.translateDocument).toHaveBeenCalledWith(
        '/tmp/doc.pdf',
        '/tmp/output.pdf',
        expect.objectContaining({ enableDocumentMinification: true }),
        expect.any(Function)
      );
    });

    it('should return success message with billed characters', async () => {
      const result = await handler.translateDocument('/tmp/doc.pdf', defaultOptions());

      expect(result).toContain('Translated /tmp/doc.pdf -> /tmp/output.pdf');
      expect(result).toContain('Billed characters: 100');
    });

    it('should call spinner.succeed on success', async () => {
      await handler.translateDocument('/tmp/doc.pdf', defaultOptions());

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Document translated successfully!');
    });

    it('should call spinner.fail on error and rethrow', async () => {
      const error = new Error('API failure');
      mocks.documentTranslationService.translateDocument.mockRejectedValue(error);

      await expect(
        handler.translateDocument('/tmp/doc.pdf', defaultOptions())
      ).rejects.toThrow('API failure');

      expect(mockSpinner.fail).toHaveBeenCalledWith('Document translation failed');
    });

    it('should not include billed characters when not provided', async () => {
      mocks.documentTranslationService.translateDocument.mockResolvedValue({
        success: true,
        outputPath: '/tmp/output.pdf',
      });

      const result = await handler.translateDocument('/tmp/doc.pdf', defaultOptions());

      expect(result).toContain('Translated /tmp/doc.pdf -> /tmp/output.pdf');
      expect(result).not.toContain('Billed characters');
    });
  });
});
