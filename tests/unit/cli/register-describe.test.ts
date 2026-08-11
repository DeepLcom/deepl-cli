/**
 * Unit tests for the hidden `_describe` command registration.
 *
 * The action normalises --format before validating it, so a value differing
 * only in case or surrounding whitespace is accepted rather than rejected.
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

import { registerDescribe } from '../../../src/cli/commands/register-describe';
import { Logger } from '../../../src/utils/logger';
import { ValidationError } from '../../../src/utils/errors';

describe('registerDescribe', () => {
  let program: Command;
  let handleError: jest.Mock;

  beforeEach(() => {
    program = new Command();
    program.name('deepl').description('DeepL CLI');
    program.exitOverride();
    handleError = jest.fn();
    registerDescribe(program, {
      handleError: handleError as unknown as (error: unknown) => never,
    });
  });

  async function runDescribe(argv: string[] = []): Promise<void> {
    await program.parseAsync(['node', 'deepl', '_describe', ...argv]);
  }

  function emittedTree(): { name: string; commands: { name: string }[] } {
    const [payload] = (Logger.output as jest.Mock).mock.calls[0] as [string];
    return JSON.parse(payload);
  }

  describe('emitting the surface', () => {
    it('writes the program tree as JSON when no format is given', async () => {
      await runDescribe();

      expect(handleError).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledTimes(1);
      expect(emittedTree().name).toBe('deepl');
    });

    it('includes the registered command in the tree', async () => {
      await runDescribe();

      expect(emittedTree().commands.map((c) => c.name)).toContain('_describe');
    });

    it('pretty-prints with two-space indentation', async () => {
      await runDescribe();

      const [payload] = (Logger.output as jest.Mock).mock.calls[0] as [string];
      expect(payload).toContain('\n  "name": "deepl"');
    });

    it('accepts --format json explicitly', async () => {
      await runDescribe(['--format', 'json']);

      expect(handleError).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledTimes(1);
    });
  });

  describe('format normalisation', () => {
    it('accepts an uppercase format', async () => {
      await runDescribe(['--format', 'JSON']);

      expect(handleError).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledTimes(1);
    });

    it('accepts a format padded with whitespace', async () => {
      await runDescribe(['--format', '  json  ']);

      expect(handleError).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledTimes(1);
    });
  });

  describe('rejecting an unsupported format', () => {
    it('routes a ValidationError to handleError', async () => {
      await runDescribe(['--format', 'yaml']);

      expect(Logger.output).not.toHaveBeenCalled();
      expect(handleError).toHaveBeenCalledTimes(1);
      expect(handleError.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
    });

    it('names the offending value and the supported formats', async () => {
      await runDescribe(['--format', 'yaml']);

      const error = handleError.mock.calls[0]![0] as ValidationError;
      expect(error.message).toContain('yaml');
      expect(error.message).toContain('json');
    });
  });
});
