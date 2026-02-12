import { Command } from 'commander';

jest.mock('chalk', () => {
  const passthrough = (s: string) => s;
  return { __esModule: true, default: { green: passthrough, level: 3 } };
});

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    output: jest.fn(),
  },
}));

const mockAdmin = {
  listKeys: jest.fn(),
  createKey: jest.fn(),
  deactivateKey: jest.fn(),
  renameKey: jest.fn(),
  setKeyLimit: jest.fn(),
  getUsage: jest.fn(),
  formatJson: jest.fn(),
  formatKeyList: jest.fn(),
  formatKeyInfo: jest.fn(),
  formatUsage: jest.fn(),
};

jest.mock('../../src/cli/commands/service-factory', () => ({
  createAdminCommand: jest.fn(),
}));

jest.mock('../../src/utils/confirm', () => ({
  confirm: jest.fn(),
}));

import { registerAdmin } from '../../src/cli/commands/register-admin';
import { Logger } from '../../src/utils/logger';
import { createAdminCommand } from '../../src/cli/commands/service-factory';
import { confirm } from '../../src/utils/confirm';

const mockLogger = Logger as jest.Mocked<typeof Logger>;
const mockCreateAdmin = createAdminCommand as jest.MockedFunction<typeof createAdminCommand>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;

describe('registerAdmin', () => {
  let program: Command;
  let handleError: jest.Mock;
  const mockCreateDeepLClient = jest.fn();

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    handleError = jest.fn();

    (mockCreateAdmin as jest.Mock).mockResolvedValue(mockAdmin);
    mockAdmin.formatJson.mockReturnValue('{"json":true}');
    mockAdmin.formatKeyList.mockReturnValue('key list output');
    mockAdmin.formatKeyInfo.mockReturnValue('key info output');
    mockAdmin.formatUsage.mockReturnValue('usage output');

    registerAdmin(program, {
      createDeepLClient: mockCreateDeepLClient,
      handleError: handleError as unknown as (error: unknown) => never,
    });
  });

  describe('admin keys list', () => {
    it('should list keys in plain text format', async () => {
      const keys = [{ keyId: 'k1', label: 'Test' }];
      mockAdmin.listKeys.mockResolvedValue(keys);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'list']);

      expect(mockCreateAdmin).toHaveBeenCalledWith(mockCreateDeepLClient);
      expect(mockAdmin.listKeys).toHaveBeenCalled();
      expect(mockAdmin.formatKeyList).toHaveBeenCalledWith(keys);
      expect(mockLogger.output).toHaveBeenCalledWith('key list output');
    });

    it('should list keys in JSON format', async () => {
      const keys = [{ keyId: 'k1' }];
      mockAdmin.listKeys.mockResolvedValue(keys);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'list', '--format', 'json']);

      expect(mockAdmin.formatJson).toHaveBeenCalledWith(keys);
      expect(mockLogger.output).toHaveBeenCalledWith('{"json":true}');
    });

    it('should call handleError on failure', async () => {
      const err = new Error('list failed');
      mockAdmin.listKeys.mockRejectedValue(err);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'list']);

      expect(handleError).toHaveBeenCalledWith(err);
    });
  });

  describe('admin keys create', () => {
    it('should create a key without label in plain text', async () => {
      const key = { keyId: 'new-key', label: '' };
      mockAdmin.createKey.mockResolvedValue(key);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'create']);

      expect(mockAdmin.createKey).toHaveBeenCalledWith(undefined);
      expect(mockLogger.success).toHaveBeenCalled();
      expect(mockAdmin.formatKeyInfo).toHaveBeenCalledWith(key);
      expect(mockLogger.output).toHaveBeenCalledWith('key info output');
    });

    it('should create a key with label', async () => {
      const key = { keyId: 'new-key', label: 'My Key' };
      mockAdmin.createKey.mockResolvedValue(key);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'create', '--label', 'My Key']);

      expect(mockAdmin.createKey).toHaveBeenCalledWith('My Key');
    });

    it('should create a key in JSON format', async () => {
      const key = { keyId: 'new-key' };
      mockAdmin.createKey.mockResolvedValue(key);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'create', '--format', 'json']);

      expect(mockAdmin.formatJson).toHaveBeenCalledWith(key);
      expect(mockLogger.output).toHaveBeenCalledWith('{"json":true}');
      expect(mockLogger.success).not.toHaveBeenCalled();
    });

    it('should call handleError on failure', async () => {
      const err = new Error('create failed');
      mockAdmin.createKey.mockRejectedValue(err);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'create']);

      expect(handleError).toHaveBeenCalledWith(err);
    });
  });

  describe('admin keys deactivate', () => {
    it('should deactivate key with --yes flag (skip confirmation)', async () => {
      await program.parseAsync(['node', 'test', 'admin', 'keys', 'deactivate', 'key-99', '--yes']);

      expect(mockAdmin.deactivateKey).toHaveBeenCalledWith('key-99');
      expect(mockLogger.success).toHaveBeenCalled();
    });

    it('should deactivate key after user confirms', async () => {
      mockConfirm.mockResolvedValue(true);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'deactivate', 'key-42']);

      expect(mockConfirm).toHaveBeenCalledWith({
        message: 'Deactivate API key "key-42"? This action is permanent.',
      });
      expect(mockAdmin.deactivateKey).toHaveBeenCalledWith('key-42');
    });

    it('should abort when user declines confirmation', async () => {
      mockConfirm.mockResolvedValue(false);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'deactivate', 'key-42']);

      expect(mockLogger.info).toHaveBeenCalledWith('Aborted.');
      expect(mockAdmin.deactivateKey).not.toHaveBeenCalled();
    });

    it('should call handleError on failure', async () => {
      const err = new Error('deactivate failed');
      mockAdmin.deactivateKey.mockRejectedValue(err);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'deactivate', 'key-1', '-y']);

      expect(handleError).toHaveBeenCalledWith(err);
    });
  });

  describe('admin keys rename', () => {
    it('should rename a key', async () => {
      await program.parseAsync(['node', 'test', 'admin', 'keys', 'rename', 'key-5', 'New Label']);

      expect(mockCreateAdmin).toHaveBeenCalledWith(mockCreateDeepLClient);
      expect(mockAdmin.renameKey).toHaveBeenCalledWith('key-5', 'New Label');
      expect(mockLogger.success).toHaveBeenCalled();
    });

    it('should call handleError on failure', async () => {
      const err = new Error('rename failed');
      mockAdmin.renameKey.mockRejectedValue(err);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'rename', 'key-5', 'label']);

      expect(handleError).toHaveBeenCalledWith(err);
    });
  });

  describe('admin keys set-limit', () => {
    it('should set a numeric character limit', async () => {
      await program.parseAsync(['node', 'test', 'admin', 'keys', 'set-limit', 'key-7', '500000']);

      expect(mockAdmin.setKeyLimit).toHaveBeenCalledWith('key-7', 500000, undefined);
      expect(mockLogger.success).toHaveBeenCalled();
    });

    it('should set unlimited limit', async () => {
      await program.parseAsync(['node', 'test', 'admin', 'keys', 'set-limit', 'key-7', 'unlimited']);

      expect(mockAdmin.setKeyLimit).toHaveBeenCalledWith('key-7', null, undefined);
      expect(mockLogger.success).toHaveBeenCalled();
    });

    it('should call handleError for non-numeric characters value', async () => {
      await program.parseAsync(['node', 'test', 'admin', 'keys', 'set-limit', 'key-7', 'abc']);

      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Characters must be a number or "unlimited"' }),
      );
    });

    it('should call handleError on failure', async () => {
      const err = new Error('set-limit failed');
      mockAdmin.setKeyLimit.mockRejectedValue(err);

      await program.parseAsync(['node', 'test', 'admin', 'keys', 'set-limit', 'key-7', '100']);

      expect(handleError).toHaveBeenCalledWith(err);
    });
  });

  describe('admin usage', () => {
    it('should get usage in plain text format', async () => {
      const report = { totalUsage: { totalCharacters: 1000 } };
      mockAdmin.getUsage.mockResolvedValue(report);

      await program.parseAsync([
        'node', 'test', 'admin', 'usage',
        '--start', '2024-01-01', '--end', '2024-01-31',
      ]);

      expect(mockCreateAdmin).toHaveBeenCalledWith(mockCreateDeepLClient);
      expect(mockAdmin.getUsage).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        groupBy: undefined,
      });
      expect(mockAdmin.formatUsage).toHaveBeenCalledWith(report);
      expect(mockLogger.output).toHaveBeenCalledWith('usage output');
    });

    it('should get usage in JSON format', async () => {
      const report = { totalUsage: { totalCharacters: 500 } };
      mockAdmin.getUsage.mockResolvedValue(report);

      await program.parseAsync([
        'node', 'test', 'admin', 'usage',
        '--start', '2024-02-01', '--end', '2024-02-28',
        '--format', 'json',
      ]);

      expect(mockAdmin.formatJson).toHaveBeenCalledWith(report);
      expect(mockLogger.output).toHaveBeenCalledWith('{"json":true}');
    });

    it('should pass group-by option', async () => {
      mockAdmin.getUsage.mockResolvedValue({});

      await program.parseAsync([
        'node', 'test', 'admin', 'usage',
        '--start', '2024-01-01', '--end', '2024-01-31',
        '--group-by', 'key',
      ]);

      expect(mockAdmin.getUsage).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: 'key' }),
      );
    });

    it('should call handleError on failure', async () => {
      const err = new Error('usage failed');
      mockAdmin.getUsage.mockRejectedValue(err);

      await program.parseAsync([
        'node', 'test', 'admin', 'usage',
        '--start', '2024-01-01', '--end', '2024-01-31',
      ]);

      expect(handleError).toHaveBeenCalledWith(err);
    });
  });
});
