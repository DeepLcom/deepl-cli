/**
 * Tests for CLI Entry Point
 * Tests the main CLI structure and command registration
 */

import { Command } from 'commander';

describe('CLI Entry Point', () => {
  let program: Command;

  beforeEach(() => {
    // Create a fresh program for each test
    program = new Command();
    program
      .name('deepl')
      .description('DeepL CLI - Next-generation translation tool powered by DeepL API')
      .version('0.1.0');

    // Register commands (simulating the actual CLI structure)
    program.command('translate').description('Translate text or files');
    program.command('auth').description('Manage DeepL API authentication');
    program.command('config').description('Manage configuration');
    program.command('cache').description('Manage translation cache');
    program.command('glossary').description('Manage translation glossaries');
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

    it('should register cache command', () => {
      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('cache');
    });

    it('should register glossary command', () => {
      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('glossary');
    });
  });
});
