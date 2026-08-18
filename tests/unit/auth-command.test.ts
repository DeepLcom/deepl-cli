/**
 * Tests for Auth Command
 */

import { Command } from 'commander';
import { AuthCommand } from '../../src/cli/commands/auth';
import { ConfigService } from '../../src/storage/config';
import { DeepLClient } from '../../src/api/deepl-client';
import { createMockConfigService } from '../helpers/mock-factories';
import { NetworkError, ValidationError } from '../../src/utils/errors';
import { Readable } from 'stream';

// Mock chalk (ESM-only)
jest.mock('chalk', () => {
  const passthrough = (s: string) => s;
  const obj: Record<string, unknown> & { level: number } = {
    level: 3,
    red: passthrough,
    green: passthrough,
    blue: passthrough,
    yellow: passthrough,
    gray: passthrough,
    bold: passthrough,
  };
  return { __esModule: true, default: obj };
});

// Mock Logger for the registerAuth tests
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    output: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock dependencies
jest.mock('../../src/storage/config');
jest.mock('../../src/api/deepl-client');

describe('AuthCommand', () => {
  let mockConfigService: jest.Mocked<ConfigService>;
  let authCommand: AuthCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService = createMockConfigService();

    authCommand = new AuthCommand(mockConfigService);
  });

  describe('setKey()', () => {
    it('should store API key in config', async () => {
      // Mock DeepL client validation
      const mockGetUsage = jest
        .fn()
        .mockResolvedValue({ character: { count: 0, limit: 500000 } });
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(
        () =>
          ({
            getUsage: mockGetUsage,
          }) as any
      );

      await authCommand.setKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx');

      expect(mockConfigService.set).toHaveBeenCalledWith(
        'auth.apiKey',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx'
      );
      expect(mockGetUsage).toHaveBeenCalled();
    });

    it('should throw error for empty API key', async () => {
      await expect(authCommand.setKey('')).rejects.toThrow(
        'API key cannot be empty'
      );
    });

    it('should validate API key with DeepL API', async () => {
      // Mock DeepL client validation
      const mockGetUsage = jest
        .fn()
        .mockResolvedValue({ character: { count: 0, limit: 500000 } });
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(
        () =>
          ({
            getUsage: mockGetUsage,
          }) as any
      );

      await authCommand.setKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx');

      // Should validate by making a test request
      expect(mockGetUsage).toHaveBeenCalled();
      expect(mockConfigService.set).toHaveBeenCalled();
    });

    it('should handle config save errors', async () => {
      // Mock DeepL client validation to succeed
      const mockGetUsage = jest
        .fn()
        .mockResolvedValue({ character: { count: 0, limit: 500000 } });
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(
        () =>
          ({
            getUsage: mockGetUsage,
          }) as any
      );

      (mockConfigService.set as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Failed to save config');
      });

      await expect(
        authCommand.setKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx')
      ).rejects.toThrow('Failed to save config');
    });

    it('should handle non-Error exceptions during validation', async () => {
      // Mock DeepL client to throw non-Error exception
      const mockGetUsage = jest.fn().mockRejectedValue('String error');
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(
        () =>
          ({
            getUsage: mockGetUsage,
          }) as any
      );

      await expect(authCommand.setKey('test-key')).rejects.toThrow(
        'Failed to validate API key'
      );
    });

    it('should pass HTTP client options through to the validation client', async () => {
      const mockGetUsage = jest
        .fn()
        .mockResolvedValue({ character: { count: 0, limit: 500000 } });
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(
        () =>
          ({
            getUsage: mockGetUsage,
          }) as any
      );

      const cmd = new AuthCommand(mockConfigService, {
        timeout: 1234,
        maxRetries: 9,
      });
      await cmd.setKey('test-key');

      expect(DeepLClient).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({ timeout: 1234, maxRetries: 9 })
      );
    });

    it('should handle non-authentication API errors', async () => {
      // Mock DeepL client to throw error without "Authentication failed" message
      const mockGetUsage = jest
        .fn()
        .mockRejectedValue(new Error('Network timeout'));
      (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(
        () =>
          ({
            getUsage: mockGetUsage,
          }) as any
      );

      await expect(authCommand.setKey('test-key')).rejects.toThrow(
        'Network timeout'
      );
    });

    describe('offline storage', () => {
      // Validation requires network access, so on a locked-down network every
      // documented way to store a key was closed.
      it('should store the key without contacting the API when verify is false', async () => {
        const mockGetUsage = jest.fn();
        (
          DeepLClient as jest.MockedClass<typeof DeepLClient>
        ).mockImplementation(
          () =>
            ({
              getUsage: mockGetUsage,
            }) as any
        );

        await authCommand.setKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx', {
          verify: false,
        });

        expect(mockConfigService.set).toHaveBeenCalledWith(
          'auth.apiKey',
          'a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx'
        );
        expect(mockGetUsage).not.toHaveBeenCalled();
      });

      it('should still reject an empty key when verification is skipped', async () => {
        await expect(authCommand.setKey('', { verify: false })).rejects.toThrow(
          'API key cannot be empty'
        );
      });

      it('should name the offline alternatives when the API is unreachable', async () => {
        const mockGetUsage = jest
          .fn()
          .mockRejectedValue(
            new NetworkError('connect ECONNREFUSED 127.0.0.1:443')
          );
        (
          DeepLClient as jest.MockedClass<typeof DeepLClient>
        ).mockImplementation(
          () =>
            ({
              getUsage: mockGetUsage,
            }) as any
        );

        await expect(authCommand.setKey('test-key')).rejects.toMatchObject({
          suggestion: expect.stringContaining('--no-verify'),
        });
        expect(mockConfigService.set).not.toHaveBeenCalled();
      });
    });
  });

  describe('getKey()', () => {
    it('should retrieve API key from config', async () => {
      (mockConfigService.getValue as jest.Mock).mockReturnValueOnce(
        'test-api-key-123'
      );

      const key = await authCommand.getKey();

      expect(key).toBe('test-api-key-123');
      expect(mockConfigService.getValue).toHaveBeenCalledWith('auth.apiKey');
    });

    it('should return undefined when no key is set', async () => {
      const originalEnv = process.env['DEEPL_API_KEY'];
      delete process.env['DEEPL_API_KEY'];

      try {
        const key = await authCommand.getKey();
        expect(key).toBeUndefined();
      } finally {
        if (originalEnv !== undefined) {
          process.env['DEEPL_API_KEY'] = originalEnv;
        }
      }
    });

    it('should check environment variable DEEPL_API_KEY', async () => {
      process.env['DEEPL_API_KEY'] = 'env-api-key';

      const key = await authCommand.getKey();

      expect(key).toBe('env-api-key');

      delete process.env['DEEPL_API_KEY'];
    });

    it('should prefer config over environment variable', async () => {
      process.env['DEEPL_API_KEY'] = 'env-api-key';
      (mockConfigService.getValue as jest.Mock).mockReturnValueOnce(
        'config-api-key'
      );

      const key = await authCommand.getKey();

      expect(key).toBe('config-api-key');

      delete process.env['DEEPL_API_KEY'];
    });
  });

  describe('clearKey()', () => {
    it('should remove API key from config', async () => {
      await authCommand.clearKey();

      expect(mockConfigService.delete).toHaveBeenCalledWith('auth.apiKey');
    });

    it('should handle config delete errors', async () => {
      (mockConfigService.delete as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Failed to delete');
      });

      await expect(authCommand.clearKey()).rejects.toThrow('Failed to delete');
    });
  });
});

/**
 * Feeds `content` to the action's stdin read and reports non-TTY, so the
 * set-key path under test behaves as it does behind a pipe.
 */
function withStdin(content: string): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'stdin');
  const stream = Readable.from([Buffer.from(content)]);
  Object.defineProperty(process, 'stdin', {
    value: stream,
    configurable: true,
  });
  return () => {
    if (original) Object.defineProperty(process, 'stdin', original);
  };
}

describe('registerAuth - set-key', () => {
  // Dynamic import to avoid hoisting issues with chalk mock
  let registerAuth: typeof import('../../src/cli/commands/register-auth').registerAuth;

  beforeAll(async () => {
    registerAuth = (await import('../../src/cli/commands/register-auth'))
      .registerAuth;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an API key passed as an argument without echoing it', async () => {
    const mockConfigService = createMockConfigService();
    const program = new Command();
    program.exitOverride();
    registerAuth(program, {
      getConfigService: () => mockConfigService,
      handleError: (error: unknown) => {
        throw error;
      },
    });

    expect.assertions(5);
    try {
      await program.parseAsync([
        'node',
        'deepl',
        'auth',
        'set-key',
        'test-key-123',
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const err = error as ValidationError;
      expect(err.exitCode).toBe(6);
      // The whole point of rejecting by name rather than letting commander
      // report an excess argument: commander's message quotes the value.
      expect(err.message).not.toContain('test-key-123');
      expect(err.suggestion ?? '').not.toContain('test-key-123');
      expect(mockConfigService.set).not.toHaveBeenCalled();
    }
  });

  it('reads the key from stdin behind a pipe', async () => {
    const mockConfigService = createMockConfigService();
    const mockGetUsage = jest
      .fn()
      .mockResolvedValue({ character: { count: 0, limit: 500000 } });
    (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(
      () =>
        ({
          getUsage: mockGetUsage,
        }) as any
    );

    const program = new Command();
    program.exitOverride();
    registerAuth(program, {
      getConfigService: () => mockConfigService,
      handleError: (error: unknown) => {
        throw error;
      },
    });

    const restore = withStdin('test-key-123\n');
    try {
      await program.parseAsync(['node', 'deepl', 'auth', 'set-key']);
    } finally {
      restore();
    }

    expect(DeepLClient).toHaveBeenCalledWith('test-key-123', expect.anything());
  });

  it('refuses on a terminal, naming the two supported paths', async () => {
    const mockConfigService = createMockConfigService();
    const program = new Command();
    program.exitOverride();
    registerAuth(program, {
      getConfigService: () => mockConfigService,
      handleError: (error: unknown) => {
        throw error;
      },
    });

    const original = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', {
      value: { isTTY: true },
      configurable: true,
    });

    expect.assertions(3);
    try {
      await program.parseAsync(['node', 'deepl', 'auth', 'set-key']);
    } catch (error) {
      const err = error as ValidationError;
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.suggestion ?? '').toContain('--from-stdin');
      expect(err.suggestion ?? '').toContain('deepl init');
    } finally {
      if (original) Object.defineProperty(process, 'stdin', original);
    }
  });

  it('should thread getHttpOptions into the key-validation client', async () => {
    const mockConfigService = createMockConfigService();
    const mockGetUsage = jest
      .fn()
      .mockResolvedValue({ character: { count: 0, limit: 500000 } });
    (DeepLClient as jest.MockedClass<typeof DeepLClient>).mockImplementation(
      () =>
        ({
          getUsage: mockGetUsage,
        }) as any
    );

    const program = new Command();
    program.exitOverride();
    registerAuth(program, {
      getConfigService: () => mockConfigService,
      getHttpOptions: () => ({ timeout: 55, maxRetries: 1 }),
      handleError: (error: unknown) => {
        throw error;
      },
    });

    const restore = withStdin('test-key-123\n');
    try {
      await program.parseAsync(['node', 'deepl', 'auth', 'set-key']);
    } finally {
      restore();
    }

    expect(DeepLClient).toHaveBeenCalledWith(
      'test-key-123',
      expect.objectContaining({ timeout: 55, maxRetries: 1 })
    );
  });
});
