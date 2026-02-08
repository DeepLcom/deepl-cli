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

const mockExistsSync = jest.fn().mockReturnValue(false);
jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

const mockWriteFile = jest.fn().mockResolvedValue(undefined);
jest.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

const mockWriteCommand = {
  improve: jest.fn(),
  improveFile: jest.fn(),
  checkText: jest.fn(),
  checkFile: jest.fn(),
  autoFixFile: jest.fn(),
  improveWithDiff: jest.fn(),
  improveFileWithDiff: jest.fn(),
  improveInteractive: jest.fn(),
  improveFileInteractive: jest.fn(),
};

const mockCreateWriteCommand = jest.fn();
jest.mock('../../src/cli/commands/service-factory', () => ({
  createWriteCommand: (...args: unknown[]) => mockCreateWriteCommand(...args),
}));

import { registerWrite } from '../../src/cli/commands/register-write';
import { Logger } from '../../src/utils/logger';

describe('registerWrite', () => {
  let program: Command;
  const handleError = jest.fn() as jest.Mock & ((error: unknown) => never);
  let createDeepLClient: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
    mockExistsSync.mockReturnValue(false);
    mockWriteFile.mockResolvedValue(undefined);
    mockCreateWriteCommand.mockResolvedValue(mockWriteCommand);
    program = new Command();
    program.exitOverride();
    createDeepLClient = jest.fn();
    registerWrite(program, { createDeepLClient, handleError });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('should register write command', () => {
    const cmd = program.commands.find((c) => c.name() === 'write');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('Improve text');
  });

  describe('basic improve (text)', () => {
    it('should improve text and output result', async () => {
      mockWriteCommand.improve.mockResolvedValue('Improved text');
      await program.parseAsync(['node', 'test', 'write', 'Hello world']);
      expect(mockWriteCommand.improve).toHaveBeenCalledWith('Hello world', expect.any(Object));
      expect(Logger.output).toHaveBeenCalledWith('Improved text');
    });

    it('should pass lang option', async () => {
      mockWriteCommand.improve.mockResolvedValue('Hallo');
      await program.parseAsync(['node', 'test', 'write', 'Hello', '--lang', 'de']);
      expect(mockWriteCommand.improve).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ lang: 'de' }),
      );
    });

    it('should pass style option', async () => {
      mockWriteCommand.improve.mockResolvedValue('ok');
      await program.parseAsync(['node', 'test', 'write', 'Hello', '--style', 'business']);
      expect(mockWriteCommand.improve).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ style: 'business' }),
      );
    });

    it('should pass tone option', async () => {
      mockWriteCommand.improve.mockResolvedValue('ok');
      await program.parseAsync(['node', 'test', 'write', 'Hello', '--tone', 'friendly']);
      expect(mockWriteCommand.improve).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ tone: 'friendly' }),
      );
    });
  });

  describe('validation', () => {
    it('should reject invalid language code', async () => {
      await program.parseAsync(['node', 'test', 'write', 'Hello', '--lang', 'xx']);
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Invalid language code') }),
      );
    });

    it('should reject both --style and --tone', async () => {
      await program.parseAsync([
        'node', 'test', 'write', 'Hello', '--style', 'business', '--tone', 'friendly',
      ]);
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Cannot specify both') }),
      );
    });

    it('should reject unsupported format', async () => {
      await program.parseAsync(['node', 'test', 'write', 'Hello', '--format', 'table']);
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Unsupported output format: table') }),
      );
    });

    it('should reject unknown format values', async () => {
      await program.parseAsync(['node', 'test', 'write', 'Hello', '--format', 'xml']);
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Unsupported output format: xml') }),
      );
    });

    it('should accept json format', async () => {
      mockWriteCommand.improve.mockResolvedValue('{"result": "ok"}');
      await program.parseAsync(['node', 'test', 'write', 'Hello', '--format', 'json']);
      expect(handleError).not.toHaveBeenCalled();
      expect(mockWriteCommand.improve).toHaveBeenCalled();
    });
  });

  describe('file input (existsSync returns true)', () => {
    it('should improve file content', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.improveFile.mockResolvedValue('Improved file text');
      await program.parseAsync(['node', 'test', 'write', 'file.txt']);
      expect(mockWriteCommand.improveFile).toHaveBeenCalledWith('file.txt', expect.any(Object));
      expect(Logger.output).toHaveBeenCalledWith('Improved file text');
    });
  });

  describe('--check mode', () => {
    it('should set exitCode 8 when text needs improvement', async () => {
      mockWriteCommand.checkText.mockResolvedValue({ needsImprovement: true, changes: 3 });
      await program.parseAsync(['node', 'test', 'write', 'bad text', '--check']);
      expect(mockWriteCommand.checkText).toHaveBeenCalledWith('bad text', expect.any(Object));
      expect(Logger.warn).toHaveBeenCalled();
      expect(process.exitCode).toBe(8);
    });

    it('should not set exitCode when text is clean', async () => {
      mockWriteCommand.checkText.mockResolvedValue({ needsImprovement: false, changes: 0 });
      await program.parseAsync(['node', 'test', 'write', 'good text', '--check']);
      expect(Logger.success).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it('should check file when path exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.checkFile.mockResolvedValue({ needsImprovement: true, changes: 2 });
      await program.parseAsync(['node', 'test', 'write', 'file.txt', '--check']);
      expect(mockWriteCommand.checkFile).toHaveBeenCalledWith('file.txt', expect.any(Object));
      expect(Logger.info).toHaveBeenCalled();
      expect(process.exitCode).toBe(8);
    });

    it('should return normally without calling process.exit()', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
      mockWriteCommand.checkText.mockResolvedValue({ needsImprovement: true, changes: 1 });
      await program.parseAsync(['node', 'test', 'write', 'text', '--check']);
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });

  describe('--fix mode', () => {
    it('should error when input is not a file', async () => {
      await program.parseAsync(['node', 'test', 'write', 'not-a-file', '--fix']);
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('--fix requires a file path') }),
      );
    });

    it('should fix file and report success', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.autoFixFile.mockResolvedValue({ fixed: true, changes: 5, backupPath: 'file.txt.bak' });
      await program.parseAsync(['node', 'test', 'write', 'file.txt', '--fix']);
      expect(mockWriteCommand.autoFixFile).toHaveBeenCalledWith('file.txt', expect.any(Object));
      expect(Logger.success).toHaveBeenCalledWith(expect.stringContaining('File improved'));
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Backup'));
    });

    it('should report no improvements needed', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.autoFixFile.mockResolvedValue({ fixed: false, changes: 0 });
      await program.parseAsync(['node', 'test', 'write', 'file.txt', '--fix']);
      expect(Logger.success).toHaveBeenCalledWith(expect.stringContaining('No improvements needed'));
    });

    it('should pass backup option', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.autoFixFile.mockResolvedValue({ fixed: true, changes: 1 });
      await program.parseAsync(['node', 'test', 'write', 'file.txt', '--fix', '--backup']);
      expect(mockWriteCommand.autoFixFile).toHaveBeenCalledWith(
        'file.txt',
        expect.objectContaining({ createBackup: true }),
      );
    });
  });

  describe('--diff mode', () => {
    it('should show diff for text input', async () => {
      mockWriteCommand.improveWithDiff.mockResolvedValue({
        original: 'old',
        improved: 'new',
        diff: '-old\n+new',
      });
      await program.parseAsync(['node', 'test', 'write', 'some text', '--diff']);
      expect(mockWriteCommand.improveWithDiff).toHaveBeenCalledWith('some text', expect.any(Object));
      expect(Logger.output).toHaveBeenCalledWith(expect.stringContaining('Original'));
    });

    it('should show diff for file input', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.improveFileWithDiff.mockResolvedValue({
        original: 'old',
        improved: 'new',
        diff: '-old\n+new',
      });
      await program.parseAsync(['node', 'test', 'write', 'file.txt', '--diff']);
      expect(mockWriteCommand.improveFileWithDiff).toHaveBeenCalledWith('file.txt', expect.any(Object));
    });
  });

  describe('--interactive mode', () => {
    it('should run interactive mode for text', async () => {
      mockWriteCommand.improveInteractive.mockResolvedValue('selected text');
      await program.parseAsync(['node', 'test', 'write', 'some text', '-i']);
      expect(mockWriteCommand.improveInteractive).toHaveBeenCalledWith('some text', expect.any(Object));
      expect(Logger.output).toHaveBeenCalledWith('selected text');
    });

    it('should run interactive mode for file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.improveFileInteractive.mockResolvedValue({ selected: 'improved' });
      await program.parseAsync(['node', 'test', 'write', 'file.txt', '-i']);
      expect(mockWriteCommand.improveFileInteractive).toHaveBeenCalledWith('file.txt', expect.any(Object));
      expect(Logger.output).toHaveBeenCalledWith('improved');
    });

    it('should write to output file in interactive file mode', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.improveFileInteractive.mockResolvedValue({ selected: 'improved' });
      await program.parseAsync(['node', 'test', 'write', 'file.txt', '-i', '-o', 'out.txt']);
      expect(mockWriteFile).toHaveBeenCalledWith('out.txt', 'improved', 'utf-8');
      expect(Logger.success).toHaveBeenCalledWith(expect.stringContaining('Saved to out.txt'));
    });

    it('should write in-place in interactive file mode', async () => {
      mockExistsSync.mockReturnValue(true);
      mockWriteCommand.improveFileInteractive.mockResolvedValue({ selected: 'improved' });
      await program.parseAsync(['node', 'test', 'write', 'file.txt', '-i', '--in-place']);
      expect(mockWriteFile).toHaveBeenCalledWith('file.txt', 'improved', 'utf-8');
    });
  });

  describe('error handling', () => {
    it('should call handleError on unexpected errors', async () => {
      mockWriteCommand.improve.mockRejectedValue(new Error('API error'));
      await program.parseAsync(['node', 'test', 'write', 'Hello']);
      expect(handleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'API error' }));
    });
  });
});
