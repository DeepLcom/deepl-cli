 
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

const mockConfigCommandInstance = {
  get: jest.fn(),
  set: jest.fn(),
  list: jest.fn(),
  reset: jest.fn(),
};

jest.mock('../../src/cli/commands/config', () => ({
  ConfigCommand: jest.fn().mockImplementation(() => mockConfigCommandInstance),
}));

const mockConfirm = jest.fn();
jest.mock('../../src/utils/confirm', () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
}));

import { registerConfig } from '../../src/cli/commands/register-config';
import { Logger } from '../../src/utils/logger';

describe('registerConfig', () => {
  let program: Command;
  const handleError = jest.fn() as jest.Mock & ((error: unknown) => never);
  let getConfigService: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup the ConfigCommand constructor after clearAllMocks
    const { ConfigCommand } = require('../../src/cli/commands/config');
    (ConfigCommand as jest.Mock).mockImplementation(() => mockConfigCommandInstance);

    program = new Command();
    program.exitOverride();
    getConfigService = jest.fn().mockReturnValue({ getValue: jest.fn() });
    registerConfig(program, { getConfigService, handleError });
  });

  it('should register config command with subcommands', () => {
    const cmd = program.commands.find((c) => c.name() === 'config');
    expect(cmd).toBeDefined();
    const subNames = cmd!.commands.map((c) => c.name());
    expect(subNames).toEqual(expect.arrayContaining(['get', 'set', 'list', 'reset']));
  });

  describe('config get', () => {
    it('should get and output a config value', async () => {
      mockConfigCommandInstance.get.mockResolvedValue('some-value');
      await program.parseAsync(['node', 'test', 'config', 'get', 'auth.apiKey']);
      expect(mockConfigCommandInstance.get).toHaveBeenCalledWith('auth.apiKey');
      expect(Logger.output).toHaveBeenCalledWith(JSON.stringify('some-value', null, 2));
    });

    it('should handle get with no key', async () => {
      mockConfigCommandInstance.get.mockResolvedValue({ all: true });
      await program.parseAsync(['node', 'test', 'config', 'get']);
      expect(mockConfigCommandInstance.get).toHaveBeenCalledWith(undefined);
    });

    it('should output null for undefined values', async () => {
      mockConfigCommandInstance.get.mockResolvedValue(undefined);
      await program.parseAsync(['node', 'test', 'config', 'get', 'missing']);
      expect(Logger.output).toHaveBeenCalledWith('null');
    });

    it('should call handleError on failure', async () => {
      mockConfigCommandInstance.get.mockRejectedValue(new Error('get failed'));
      await program.parseAsync(['node', 'test', 'config', 'get', 'key']);
      expect(handleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'get failed' }));
    });
  });

  describe('config set', () => {
    it('should set a config value', async () => {
      mockConfigCommandInstance.set.mockResolvedValue(undefined);
      await program.parseAsync(['node', 'test', 'config', 'set', 'api.usePro', 'true']);
      expect(mockConfigCommandInstance.set).toHaveBeenCalledWith('api.usePro', 'true');
      expect(Logger.success).toHaveBeenCalledWith(expect.stringContaining('Set api.usePro = true'));
    });

    it('should mask API key in success message', async () => {
      mockConfigCommandInstance.set.mockResolvedValue(undefined);
      await program.parseAsync(['node', 'test', 'config', 'set', 'auth.apiKey', 'super-secret-key-123']);
      expect(mockConfigCommandInstance.set).toHaveBeenCalledWith('auth.apiKey', 'super-secret-key-123');
      expect(Logger.success).toHaveBeenCalledWith(expect.stringContaining('supe...-123'));
      expect(Logger.success).not.toHaveBeenCalledWith(expect.stringContaining('super-secret-key-123'));
    });

    it('should call handleError on failure', async () => {
      mockConfigCommandInstance.set.mockRejectedValue(new Error('set failed'));
      await program.parseAsync(['node', 'test', 'config', 'set', 'key', 'val']);
      expect(handleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'set failed' }));
    });
  });

  describe('config list', () => {
    it('should list all config', async () => {
      const config = { auth: { apiKey: 'xxx' } };
      mockConfigCommandInstance.list.mockResolvedValue(config);
      await program.parseAsync(['node', 'test', 'config', 'list']);
      expect(mockConfigCommandInstance.list).toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledWith(JSON.stringify(config, null, 2));
    });

    it('should call handleError on failure', async () => {
      mockConfigCommandInstance.list.mockRejectedValue(new Error('list failed'));
      await program.parseAsync(['node', 'test', 'config', 'list']);
      expect(handleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'list failed' }));
    });
  });

  describe('config reset', () => {
    it('should reset config with --yes flag', async () => {
      mockConfigCommandInstance.reset.mockResolvedValue(undefined);
      await program.parseAsync(['node', 'test', 'config', 'reset', '--yes']);
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockConfigCommandInstance.reset).toHaveBeenCalled();
      expect(Logger.success).toHaveBeenCalledWith(expect.stringContaining('Configuration reset'));
    });

    it('should prompt and proceed if confirmed', async () => {
      mockConfirm.mockResolvedValue(true);
      mockConfigCommandInstance.reset.mockResolvedValue(undefined);
      await program.parseAsync(['node', 'test', 'config', 'reset']);
      expect(mockConfirm).toHaveBeenCalled();
      expect(mockConfigCommandInstance.reset).toHaveBeenCalled();
    });

    it('should abort if not confirmed', async () => {
      mockConfirm.mockResolvedValue(false);
      await program.parseAsync(['node', 'test', 'config', 'reset']);
      expect(mockConfirm).toHaveBeenCalled();
      expect(mockConfigCommandInstance.reset).not.toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith('Aborted.');
    });

    it('should call handleError on failure', async () => {
      mockConfigCommandInstance.reset.mockRejectedValue(new Error('reset failed'));
      await program.parseAsync(['node', 'test', 'config', 'reset', '-y']);
      expect(handleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'reset failed' }));
    });
  });
});
