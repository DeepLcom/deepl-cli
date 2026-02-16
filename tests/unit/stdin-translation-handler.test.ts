import { StdinTranslationHandler } from '../../src/cli/commands/translate/stdin-translation-handler';
import { TextTranslationHandler } from '../../src/cli/commands/translate/text-translation-handler';
import { ValidationError } from '../../src/utils/errors';
import type { TranslateOptions } from '../../src/cli/commands/translate/types';

jest.mock('../../src/utils/read-stdin');
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    verbose: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    shouldShowSpinner: jest.fn().mockReturnValue(false),
  },
}));

import { readStdin } from '../../src/utils/read-stdin';

const mockedReadStdin = readStdin as jest.MockedFunction<typeof readStdin>;

function defaultOptions(overrides: Partial<TranslateOptions> = {}): TranslateOptions {
  return { to: 'de', cache: true, ...overrides };
}

describe('StdinTranslationHandler', () => {
  let handler: StdinTranslationHandler;
  let mockTextHandler: jest.Mocked<TextTranslationHandler>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTextHandler = {
      translateText: jest.fn().mockResolvedValue('translated'),
      ctx: {} as any,
    } as unknown as jest.Mocked<TextTranslationHandler>;
    handler = new StdinTranslationHandler(mockTextHandler);
  });

  describe('translateFromStdin()', () => {
    it('should read stdin and delegate to textHandler.translateText', async () => {
      mockedReadStdin.mockResolvedValue('Hello from stdin');

      const result = await handler.translateFromStdin(defaultOptions());

      expect(mockedReadStdin).toHaveBeenCalled();
      expect(mockTextHandler.translateText).toHaveBeenCalledWith('Hello from stdin', defaultOptions());
      expect(result).toBe('translated');
    });

    it('should throw ValidationError for empty stdin', async () => {
      mockedReadStdin.mockResolvedValue('');

      await expect(handler.translateFromStdin(defaultOptions())).rejects.toThrow(ValidationError);
      await expect(handler.translateFromStdin(defaultOptions())).rejects.toThrow('No input provided from stdin');
    });

    it('should throw ValidationError for whitespace-only stdin', async () => {
      mockedReadStdin.mockResolvedValue('   \n  \t  ');

      await expect(handler.translateFromStdin(defaultOptions())).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for null stdin', async () => {
      mockedReadStdin.mockResolvedValue(null as unknown as string);

      await expect(handler.translateFromStdin(defaultOptions())).rejects.toThrow(ValidationError);
    });

    it('should pass options through to textHandler', async () => {
      mockedReadStdin.mockResolvedValue('Hello');
      const opts = defaultOptions({ from: 'en', formality: 'more' });

      await handler.translateFromStdin(opts);

      expect(mockTextHandler.translateText).toHaveBeenCalledWith('Hello', opts);
    });
  });
});
