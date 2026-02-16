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
      } as any);

      const result = await handler.translateDocument('/tmp/doc.pdf', defaultOptions());

      expect(result).toContain('Translated /tmp/doc.pdf -> /tmp/output.pdf');
      expect(result).not.toContain('Billed characters');
    });
  });
});
