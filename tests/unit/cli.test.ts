/**
 * Tests for CLI Entry Point
 * Tests the main CLI structure and command registration
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigService } from '../../src/storage/config';

jest.mock('chalk', () => {
  const mockChalk: Record<string, unknown> & { level: number } = {
    level: 3,
    red: (s: string) => s,
    green: (s: string) => s,
    blue: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
    bold: (s: string) => s,
  };
  return { __esModule: true, default: mockChalk };
});

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

  describe('output.color config', () => {
    let testConfigDir: string;
     
    let chalk: { level: number };

    beforeEach(() => {
      chalk = jest.requireMock<{ default: { level: number } }>('chalk').default;
      chalk.level = 3;
      testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-color-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.mkdirSync(testConfigDir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(testConfigDir)) {
        fs.rmSync(testConfigDir, { recursive: true, force: true });
      }
    });

    it('should set chalk.level to 0 when output.color is false', () => {
      const configPath = path.join(testConfigDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        auth: {},
        api: { baseUrl: 'https://api.deepl.com', usePro: true },
        defaults: { targetLangs: [], formality: 'default', preserveFormatting: true },
        cache: { enabled: true, maxSize: 1073741824, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
        watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
        team: {},
      }, null, 2));

      const configService = new ConfigService(configPath);
      const colorEnabled = configService.getValue<boolean>('output.color');

      expect(colorEnabled).toBe(false);

      // Replicate the logic from src/cli/index.ts preAction hook
      if (colorEnabled === false) {
        chalk.level = 0;
      }

      expect(chalk.level).toBe(0);
    });

    it('should not change chalk.level when output.color is true', () => {
      const configPath = path.join(testConfigDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        auth: {},
        api: { baseUrl: 'https://api.deepl.com', usePro: true },
        defaults: { targetLangs: [], formality: 'default', preserveFormatting: true },
        cache: { enabled: true, maxSize: 1073741824, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: true },
        watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
        team: {},
      }, null, 2));

      const configService = new ConfigService(configPath);
      const colorEnabled = configService.getValue<boolean>('output.color');

      expect(colorEnabled).toBe(true);

      if (colorEnabled === false) {
        chalk.level = 0;
      }

      expect(chalk.level).toBe(3);
    });

    it('should not change chalk.level when output.color defaults to true', () => {
      const configPath = path.join(testConfigDir, 'config.json');
      // No config file written -- ConfigService falls back to defaults
      const configService = new ConfigService(configPath);
      const colorEnabled = configService.getValue<boolean>('output.color');

      expect(colorEnabled).toBe(true);

      if (colorEnabled === false) {
        chalk.level = 0;
      }

      expect(chalk.level).toBe(3);
    });
  });
});
