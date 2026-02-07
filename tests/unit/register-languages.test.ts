import { Command } from 'commander';

jest.mock('chalk', () => {
  const passthrough = (s: string) => s;
  const mockChalk: Record<string, unknown> & { level: number } = {
    level: 3,
    red: passthrough,
    green: passthrough,
    blue: passthrough,
    yellow: passthrough,
    gray: passthrough,
    bold: passthrough,
  };
  return { __esModule: true, default: mockChalk };
});

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    output: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLanguagesCommandInstance = {
  getSourceLanguages: jest.fn(),
  getTargetLanguages: jest.fn(),
  formatLanguages: jest.fn(),
  formatAllLanguages: jest.fn(),
};

jest.mock('../../src/cli/commands/languages', () => ({
  LanguagesCommand: jest.fn().mockImplementation(() => mockLanguagesCommandInstance),
}));

import { registerLanguages } from '../../src/cli/commands/register-languages';
import { Logger } from '../../src/utils/logger';

describe('registerLanguages', () => {
  let program: Command;
  const handleError = jest.fn() as jest.Mock & ((error: unknown) => never);
  let createDeepLClient: jest.Mock;
  let mockGetValue: jest.Mock;
  let getConfigService: jest.Mock;
  const origEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    const { LanguagesCommand } = require('../../src/cli/commands/languages');
    (LanguagesCommand as jest.Mock).mockImplementation(() => mockLanguagesCommandInstance);

    process.env = { ...origEnv };
    delete process.env['DEEPL_API_KEY'];
    program = new Command();
    program.exitOverride();
    createDeepLClient = jest.fn().mockResolvedValue({});
    mockGetValue = jest.fn().mockReturnValue(undefined);
    getConfigService = jest.fn().mockReturnValue({ getValue: mockGetValue });
    registerLanguages(program, { getConfigService, createDeepLClient, handleError });
  });

  afterAll(() => {
    process.env = origEnv;
  });

  it('should register languages command', () => {
    const cmd = program.commands.find((c) => c.name() === 'languages');
    expect(cmd).toBeDefined();
  });

  describe('with API key from config', () => {
    beforeEach(() => {
      mockGetValue.mockReturnValue('fake-key');
    });

    it('should show all languages by default', async () => {
      const sources = [{ code: 'en', name: 'English' }];
      const targets = [{ code: 'de', name: 'German' }];
      mockLanguagesCommandInstance.getSourceLanguages.mockResolvedValue(sources);
      mockLanguagesCommandInstance.getTargetLanguages.mockResolvedValue(targets);
      mockLanguagesCommandInstance.formatAllLanguages.mockReturnValue('all languages');
      await program.parseAsync(['node', 'test', 'languages']);
      expect(createDeepLClient).toHaveBeenCalled();
      expect(mockLanguagesCommandInstance.formatAllLanguages).toHaveBeenCalledWith(sources, targets);
      expect(Logger.output).toHaveBeenCalledWith('all languages');
    });

    it('should show only source languages with --source', async () => {
      const sources = [{ code: 'en', name: 'English' }];
      mockLanguagesCommandInstance.getSourceLanguages.mockResolvedValue(sources);
      mockLanguagesCommandInstance.formatLanguages.mockReturnValue('source list');
      await program.parseAsync(['node', 'test', 'languages', '--source']);
      expect(mockLanguagesCommandInstance.formatLanguages).toHaveBeenCalledWith(sources, 'source');
      expect(Logger.output).toHaveBeenCalledWith('source list');
    });

    it('should show only target languages with --target', async () => {
      const targets = [{ code: 'de', name: 'German' }];
      mockLanguagesCommandInstance.getTargetLanguages.mockResolvedValue(targets);
      mockLanguagesCommandInstance.formatLanguages.mockReturnValue('target list');
      await program.parseAsync(['node', 'test', 'languages', '--target']);
      expect(mockLanguagesCommandInstance.formatLanguages).toHaveBeenCalledWith(targets, 'target');
      expect(Logger.output).toHaveBeenCalledWith('target list');
    });

    it('should show all when both --source and --target are given', async () => {
      const sources = [{ code: 'en', name: 'English' }];
      const targets = [{ code: 'de', name: 'German' }];
      mockLanguagesCommandInstance.getSourceLanguages.mockResolvedValue(sources);
      mockLanguagesCommandInstance.getTargetLanguages.mockResolvedValue(targets);
      mockLanguagesCommandInstance.formatAllLanguages.mockReturnValue('all');
      await program.parseAsync(['node', 'test', 'languages', '--source', '--target']);
      expect(mockLanguagesCommandInstance.formatAllLanguages).toHaveBeenCalledWith(sources, targets);
    });
  });

  describe('with API key from environment', () => {
    it('should create client when env key is set', async () => {
      process.env['DEEPL_API_KEY'] = 'env-key';
      mockLanguagesCommandInstance.getSourceLanguages.mockResolvedValue([]);
      mockLanguagesCommandInstance.getTargetLanguages.mockResolvedValue([]);
      mockLanguagesCommandInstance.formatAllLanguages.mockReturnValue('');
      await program.parseAsync(['node', 'test', 'languages']);
      expect(createDeepLClient).toHaveBeenCalled();
    });
  });

  describe('without API key', () => {
    it('should warn and use local registry', async () => {
      mockLanguagesCommandInstance.getSourceLanguages.mockResolvedValue([]);
      mockLanguagesCommandInstance.getTargetLanguages.mockResolvedValue([]);
      mockLanguagesCommandInstance.formatAllLanguages.mockReturnValue('local');
      await program.parseAsync(['node', 'test', 'languages']);
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('No API key'));
      expect(createDeepLClient).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledWith('local');
    });
  });

  describe('error handling', () => {
    it('should call handleError on failure', async () => {
      mockGetValue.mockReturnValue('key');
      createDeepLClient.mockRejectedValue(new Error('connection failed'));
      await program.parseAsync(['node', 'test', 'languages']);
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'connection failed' }),
      );
    });
  });
});
