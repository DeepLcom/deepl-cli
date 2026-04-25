import { Command } from 'commander';

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    output: jest.fn(),
    error: jest.fn(),
  },
}));

const mockUsageCommandInstance = {
  getUsage: jest.fn(),
  formatUsage: jest.fn().mockReturnValue('plain usage'),
  formatUsageTable: jest.fn().mockReturnValue('usage-table'),
};

jest.mock('../../src/cli/commands/service-factory', () => ({
  createUsageCommand: jest.fn(),
}));

import { registerUsage } from '../../src/cli/commands/register-usage';
import { createUsageCommand } from '../../src/cli/commands/service-factory';
import { Logger } from '../../src/utils/logger';

const mockCreateUsageCommand = createUsageCommand as jest.MockedFunction<typeof createUsageCommand>;

async function withTTY<T>(value: boolean, fn: () => Promise<T> | T): Promise<T> {
  const original = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true, writable: true });
  }
}

describe('registerUsage', () => {
  let program: Command;
  const handleError = jest.fn() as jest.Mock & ((error: unknown) => never);
  let createDeepLClient: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateUsageCommand.mockResolvedValue(mockUsageCommandInstance as any);
    program = new Command();
    program.exitOverride();
    createDeepLClient = jest.fn();
    registerUsage(program, { createDeepLClient, handleError });
  });

  it('should output formatted text by default', async () => {
    const usage = { characterCount: 100, characterLimit: 500 };
    mockUsageCommandInstance.getUsage.mockResolvedValue(usage);
    mockUsageCommandInstance.formatUsage.mockReturnValue('plain usage');

    await program.parseAsync(['node', 'test', 'usage']);

    expect(mockUsageCommandInstance.formatUsage).toHaveBeenCalledWith(usage);
    expect(Logger.output).toHaveBeenCalledWith('plain usage');
  });

  it('should output JSON when --format json', async () => {
    const usage = { characterCount: 100, characterLimit: 500 };
    mockUsageCommandInstance.getUsage.mockResolvedValue(usage);

    await program.parseAsync(['node', 'test', 'usage', '--format', 'json']);

    expect(Logger.output).toHaveBeenCalledWith(JSON.stringify(usage, null, 2));
    expect(mockUsageCommandInstance.formatUsage).not.toHaveBeenCalled();
  });

  it('should render cli-table3 output when --format table and stdout is a TTY', async () => {
    const usage = { characterCount: 100, characterLimit: 500 };
    mockUsageCommandInstance.getUsage.mockResolvedValue(usage);
    mockUsageCommandInstance.formatUsageTable.mockReturnValue('usage-table');

    await withTTY(true, async () => {
      await program.parseAsync(['node', 'test', 'usage', '--format', 'table']);
    });

    expect(mockUsageCommandInstance.formatUsageTable).toHaveBeenCalledWith(usage);
    expect(mockUsageCommandInstance.formatUsage).not.toHaveBeenCalled();
    expect(Logger.output).toHaveBeenCalledWith('usage-table');
    expect(Logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('non-TTY'));
  });

  it('should fall back to plain text with a warn when --format table in non-TTY', async () => {
    const usage = { characterCount: 100, characterLimit: 500 };
    mockUsageCommandInstance.getUsage.mockResolvedValue(usage);
    mockUsageCommandInstance.formatUsage.mockReturnValue('plain usage');

    await withTTY(false, async () => {
      await program.parseAsync(['node', 'test', 'usage', '--format', 'table']);
    });

    expect(mockUsageCommandInstance.formatUsageTable).not.toHaveBeenCalled();
    expect(mockUsageCommandInstance.formatUsage).toHaveBeenCalledWith(usage);
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('non-TTY'));
    expect(Logger.output).toHaveBeenCalledWith('plain usage');
  });

  it('should call handleError on failure', async () => {
    mockUsageCommandInstance.getUsage.mockRejectedValue(new Error('boom'));

    await program.parseAsync(['node', 'test', 'usage']);

    expect(handleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });
});
