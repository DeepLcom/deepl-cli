/**
 * Tests for translate command default target language fallback
 * When --to is not specified, the translate command should fall back to
 * config defaults.targetLangs[0]
 */

jest.mock('chalk', () => {
  const mockChalk: Record<string, unknown> & { level: number } = {
    level: 3,
    red: (s: string) => s,
    green: (s: string) => s,
    blue: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
    bold: (s: string) => s,
  };
  return { __esModule: true, default: mockChalk };
});

jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn(function(this: any) { return this; }),
    succeed: jest.fn(function(this: any) { return this; }),
    fail: jest.fn(function(this: any) { return this; }),
    text: '',
  };
  return jest.fn(() => mockSpinner);
});

import { Command } from 'commander';
import { registerTranslate } from '../../src/cli/commands/register-translate';
import type { ServiceDeps } from '../../src/cli/commands/service-factory';

jest.mock('../../src/cli/commands/service-factory', () => ({
  createTranslateCommand: jest.fn(),
}));

import { createTranslateCommand } from '../../src/cli/commands/service-factory';

const mockCreateTranslateCommand = createTranslateCommand as jest.MockedFunction<typeof createTranslateCommand>;

describe('translate command default target language', () => {
  let program: Command;
  let mockDeps: ServiceDeps;
  let mockConfigService: {
    getValue: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    has: jest.Mock;
    delete: jest.Mock;
    clear: jest.Mock;
  };
  let handleErrorSpy: jest.Mock;
  let capturedError: unknown;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedError = undefined;

    mockConfigService = {
      getValue: jest.fn().mockReturnValue(undefined),
      get: jest.fn().mockReturnValue({}),
      set: jest.fn(),
      has: jest.fn().mockReturnValue(false),
      delete: jest.fn(),
      clear: jest.fn(),
    };

    handleErrorSpy = jest.fn((error: unknown) => {
      capturedError = error;
      throw error;
    });

    mockDeps = {
      createDeepLClient: jest.fn(),
      getApiKeyAndOptions: jest.fn().mockReturnValue({ apiKey: 'test-key', options: {} }),
      getConfigService: jest.fn().mockReturnValue(mockConfigService),
      getCacheService: jest.fn(),
      handleError: handleErrorSpy as unknown as (error: unknown) => never,
    };

    program = new Command();
    program.exitOverride();
    registerTranslate(program, mockDeps);
  });

  describe('when --to is provided', () => {
    it('should use the --to value directly without checking config', async () => {
      const mockTranslate = jest.fn().mockResolvedValue('Hola');
      mockCreateTranslateCommand.mockResolvedValue({
        translate: mockTranslate,
        translateFromStdin: jest.fn(),
      } as any);

      await program.parseAsync(['node', 'test', 'translate', 'Hello', '--to', 'es']);

      expect(mockDeps.getConfigService).not.toHaveBeenCalled();
      expect(mockTranslate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ to: 'es' }),
      );
    });
  });

  describe('when --to is omitted', () => {
    it('should fall back to config defaults.targetLangs[0]', async () => {
      mockConfigService.getValue.mockImplementation((key: string) => {
        if (key === 'defaults.targetLangs') {
          return ['fr', 'de'];
        }
        return undefined;
      });

      const mockTranslate = jest.fn().mockResolvedValue('Bonjour');
      mockCreateTranslateCommand.mockResolvedValue({
        translate: mockTranslate,
        translateFromStdin: jest.fn(),
      } as any);

      await program.parseAsync(['node', 'test', 'translate', 'Hello']);

      expect(mockDeps.getConfigService).toHaveBeenCalled();
      expect(mockConfigService.getValue).toHaveBeenCalledWith('defaults.targetLangs');
      expect(mockTranslate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ to: 'fr' }),
      );
    });

    it('should use the first element of targetLangs when multiple are configured', async () => {
      mockConfigService.getValue.mockImplementation((key: string) => {
        if (key === 'defaults.targetLangs') {
          return ['ja', 'ko', 'zh'];
        }
        return undefined;
      });

      const mockTranslate = jest.fn().mockResolvedValue('Result');
      mockCreateTranslateCommand.mockResolvedValue({
        translate: mockTranslate,
        translateFromStdin: jest.fn(),
      } as any);

      await program.parseAsync(['node', 'test', 'translate', 'Hello']);

      expect(mockTranslate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ to: 'ja' }),
      );
    });

    it('should throw error when config has empty targetLangs', async () => {
      mockConfigService.getValue.mockImplementation((key: string) => {
        if (key === 'defaults.targetLangs') {
          return [];
        }
        return undefined;
      });

      await expect(
        program.parseAsync(['node', 'test', 'translate', 'Hello']),
      ).rejects.toThrow();

      expect(handleErrorSpy).toHaveBeenCalled();
      const error = capturedError as Error;
      expect(error.message).toContain('Target language is required');
      expect(error.message).toContain('--to');
      expect(error.message).toContain('defaults.targetLangs');
    });

    it('should throw error when config has no targetLangs', async () => {
      mockConfigService.getValue.mockReturnValue(undefined);

      await expect(
        program.parseAsync(['node', 'test', 'translate', 'Hello']),
      ).rejects.toThrow();

      expect(handleErrorSpy).toHaveBeenCalled();
      const error = capturedError as Error;
      expect(error.message).toContain('Target language is required');
      expect(error.message).toContain('--to');
      expect(error.message).toContain('defaults.targetLangs');
    });

    it('should work with stdin when --to is omitted and config has default', async () => {
      mockConfigService.getValue.mockImplementation((key: string) => {
        if (key === 'defaults.targetLangs') {
          return ['de'];
        }
        return undefined;
      });

      const mockTranslateFromStdin = jest.fn().mockResolvedValue('Hallo');
      mockCreateTranslateCommand.mockResolvedValue({
        translate: jest.fn(),
        translateFromStdin: mockTranslateFromStdin,
      } as any);

      await program.parseAsync(['node', 'test', 'translate']);

      expect(mockTranslateFromStdin).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'de' }),
      );
    });
  });
});
