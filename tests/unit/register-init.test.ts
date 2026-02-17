/**
 * Tests for register-init command registration
 */

import { Command } from 'commander';
import { registerInit } from '../../src/cli/commands/register-init';

describe('registerInit', () => {
  it('should have the correct description', () => {
    const program = new Command();
    const deps = {
      getConfigService: jest.fn(),
      handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
    };

    registerInit(program, deps);

    const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
    expect(initCmd?.description()).toContain('setup wizard');
  });
});
