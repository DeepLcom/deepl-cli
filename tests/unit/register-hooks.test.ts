/* eslint-disable @typescript-eslint/no-var-requires */
import { Command } from 'commander';
import { registerHooks } from '../../src/cli/commands/register-hooks';
import { Logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    output: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
  },
}));

const mockHooksCommand = {
  install: jest.fn(),
  uninstall: jest.fn(),
  list: jest.fn(),
  showPath: jest.fn(),
};

jest.mock('../../src/cli/commands/hooks', () => ({
  HooksCommand: jest.fn().mockImplementation(() => mockHooksCommand),
}));

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  const handleError = jest.fn((error: unknown) => {
    throw error;
  }) as any;
  registerHooks(program, { handleError });
  return { program, handleError };
}

describe('registerHooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply the constructor mock after clearAllMocks
    const { HooksCommand } = require('../../src/cli/commands/hooks');
    HooksCommand.mockImplementation(() => mockHooksCommand);
  });

  describe('hooks install', () => {
    it('should install a hook and output result', async () => {
      mockHooksCommand.install.mockReturnValue('Installed pre-commit hook');
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'hooks', 'install', 'pre-commit']);

      expect(mockHooksCommand.install).toHaveBeenCalledWith('pre-commit');
      expect(Logger.output).toHaveBeenCalledWith('Installed pre-commit hook');
    });

    it('should call handleError on failure', async () => {
      mockHooksCommand.install.mockImplementation(() => {
        throw new Error('install failed');
      });
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync(['node', 'test', 'hooks', 'install', 'pre-commit'])
      ).rejects.toThrow('install failed');
      expect(handleError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('hooks uninstall', () => {
    it('should uninstall a hook and output result', async () => {
      mockHooksCommand.uninstall.mockReturnValue('Uninstalled pre-commit hook');
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'hooks', 'uninstall', 'pre-commit']);

      expect(mockHooksCommand.uninstall).toHaveBeenCalledWith('pre-commit');
      expect(Logger.output).toHaveBeenCalledWith('Uninstalled pre-commit hook');
    });

    it('should call handleError on failure', async () => {
      mockHooksCommand.uninstall.mockImplementation(() => {
        throw new Error('uninstall failed');
      });
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync(['node', 'test', 'hooks', 'uninstall', 'pre-commit'])
      ).rejects.toThrow('uninstall failed');
      expect(handleError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('hooks list', () => {
    it('should list hooks and output result', async () => {
      mockHooksCommand.list.mockReturnValue('Git Hooks Status:\n  pre-commit installed');
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'hooks', 'list']);

      expect(mockHooksCommand.list).toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledWith('Git Hooks Status:\n  pre-commit installed');
    });

    it('should call handleError on failure', async () => {
      mockHooksCommand.list.mockImplementation(() => {
        throw new Error('list failed');
      });
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync(['node', 'test', 'hooks', 'list'])
      ).rejects.toThrow('list failed');
      expect(handleError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('hooks path', () => {
    it('should show hook path and output result', async () => {
      mockHooksCommand.showPath.mockReturnValue('Hook path: /repo/.git/hooks/pre-commit');
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'hooks', 'path', 'pre-commit']);

      expect(mockHooksCommand.showPath).toHaveBeenCalledWith('pre-commit');
      expect(Logger.output).toHaveBeenCalledWith('Hook path: /repo/.git/hooks/pre-commit');
    });

    it('should call handleError on failure', async () => {
      mockHooksCommand.showPath.mockImplementation(() => {
        throw new Error('path failed');
      });
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync(['node', 'test', 'hooks', 'path', 'pre-commit'])
      ).rejects.toThrow('path failed');
      expect(handleError).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
