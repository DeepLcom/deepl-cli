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

import { Command } from 'commander';
import { registerTranslate } from '../../src/cli/commands/register-translate';

describe('registerTranslate', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    const mockDeps = {
      handleError: jest.fn(),
      getConfigService: jest.fn(),
      getApiKeyOrThrow: jest.fn(),
    };
    registerTranslate(program, mockDeps as any);
  });

  describe('--output-format option', () => {
    it('should only accept docx as a valid choice', () => {
      const translateCmd = program.commands.find(c => c.name() === 'translate')!;
      const outputFormatOpt = translateCmd.options.find(o => o.long === '--output-format')!;
      expect(outputFormatOpt.argChoices).toEqual(['docx']);
    });

    it('should have correct help example showing PDF to DOCX conversion', () => {
      const translateCmd = program.commands.find(c => c.name() === 'translate')!;
      let helpOutput = '';
      translateCmd.configureOutput({ writeOut: (str: string) => { helpOutput += str; } });
      translateCmd.outputHelp();
      expect(helpOutput).toContain('report.pdf --to de --output-format docx');
      expect(helpOutput).not.toContain('report.docx --to de --output-format pdf');
    });
  });
});
