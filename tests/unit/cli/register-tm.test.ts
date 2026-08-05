/**
 * Unit tests for the `deepl tm` command registration.
 *
 * `tm list` chooses between the formatted table and raw JSON on --format, and
 * that dispatch is the only behaviour the registration itself carries.
 */

import { Command } from 'commander';

jest.mock('../../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    output: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/cli/commands/service-factory', () => ({
  createTmCommand: jest.fn(),
}));

import { registerTm } from '../../../src/cli/commands/register-tm';
import { createTmCommand } from '../../../src/cli/commands/service-factory';
import { Logger } from '../../../src/utils/logger';

const mockCreateTmCommand = createTmCommand as jest.MockedFunction<
  typeof createTmCommand
>;

const TMS = [{ translationMemoryId: 'tm-1', name: 'legal' }];

describe('registerTm', () => {
  let program: Command;
  let handleError: jest.Mock;
  let list: jest.Mock;
  let formatList: jest.Mock;

  beforeEach(() => {
    list = jest.fn().mockResolvedValue(TMS);
    formatList = jest.fn().mockReturnValue('tm-table');
    mockCreateTmCommand.mockResolvedValue({
      list,
      formatList,
    } as unknown as Awaited<ReturnType<typeof createTmCommand>>);

    program = new Command();
    program.exitOverride();
    handleError = jest.fn();
    registerTm(program, {
      createDeepLClient: jest.fn(),
      handleError: handleError as unknown as (error: unknown) => never,
    });
  });

  async function runTmList(argv: string[] = []): Promise<void> {
    await program.parseAsync(['node', 'deepl', 'tm', 'list', ...argv]);
  }

  describe('output format', () => {
    it('prints the formatted table by default', async () => {
      await runTmList();

      expect(formatList).toHaveBeenCalledWith(TMS);
      expect(Logger.output).toHaveBeenCalledWith('tm-table');
      expect(handleError).not.toHaveBeenCalled();
    });

    it('prints raw JSON when --format json', async () => {
      await runTmList(['--format', 'json']);

      expect(Logger.output).toHaveBeenCalledWith(JSON.stringify(TMS, null, 2));
      expect(formatList).not.toHaveBeenCalled();
    });

    it('prints the formatted table when --format text is explicit', async () => {
      await runTmList(['--format', 'text']);

      expect(formatList).toHaveBeenCalledWith(TMS);
      expect(Logger.output).toHaveBeenCalledWith('tm-table');
    });
  });

  describe('error handling', () => {
    it('routes a listing failure to handleError', async () => {
      list.mockRejectedValue(new Error('boom'));

      await runTmList();

      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'boom' })
      );
      expect(Logger.output).not.toHaveBeenCalled();
    });

    it('routes a client construction failure to handleError', async () => {
      mockCreateTmCommand.mockRejectedValue(new Error('no api key'));

      await runTmList();

      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'no api key' })
      );
    });
  });
});
