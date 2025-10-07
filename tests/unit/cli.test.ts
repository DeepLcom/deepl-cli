/**
 * Tests for CLI Entry Point
 * Following TDD approach - these tests should fail initially
 */

import { Command } from 'commander';

describe('CLI Entry Point', () => {
  let program: Command;

  beforeEach(() => {
    // We'll import and create the program in the actual implementation
  });

  describe('program structure', () => {
    it('should create a Commander program', () => {
      expect(program).toBeInstanceOf(Command);
    });

    it('should have correct name and description', () => {
      expect(program.name()).toBe('deepl');
      expect(program.description()).toContain('DeepL CLI');
    });

    it('should have version', () => {
      expect(program.version()).toBeDefined();
    });
  });

  describe('commands', () => {
    it('should register translate command', () => {
      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('translate');
    });

    it('should register auth command', () => {
      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('auth');
    });

    it('should register config command', () => {
      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('config');
    });
  });
});
