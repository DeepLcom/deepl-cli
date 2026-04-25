import { Command } from 'commander';
import { registerStyleRules } from '../../src/cli/commands/register-style-rules';
import { createStyleRulesCommand } from '../../src/cli/commands/service-factory';
import { Logger } from '../../src/utils/logger';

jest.mock('../../src/cli/commands/service-factory', () => ({
  createStyleRulesCommand: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    success: jest.fn(),
    output: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/utils/confirm', () => ({
  confirm: jest.fn(),
}));

jest.mock('chalk', () => ({
  default: {
    green: (t: string) => t,
    yellow: (t: string) => t,
  },
  green: (t: string) => t,
  yellow: (t: string) => t,
}));

const mockCreateStyleRulesCommand = createStyleRulesCommand as jest.MockedFunction<typeof createStyleRulesCommand>;

const SAMPLE_RULE = {
  styleId: 'sr-1',
  name: 'Sample',
  language: 'en',
  version: 1,
  creationTime: 'c',
  updatedTime: 'u',
};

const SAMPLE_DETAILED = {
  ...SAMPLE_RULE,
  configuredRules: { punctuation: { quotation_mark: 'use_guillemets' } },
  customInstructions: [{ label: 'tone', prompt: 'Be formal' }],
};

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  const handleError = jest.fn((error: unknown) => {
    throw error;
  }) as any;
  const createDeepLClient = jest.fn();
  registerStyleRules(program, { createDeepLClient, handleError });
  return { program, handleError, createDeepLClient };
}

function makeMockStyleRulesCmd() {
  return {
    list: jest.fn().mockResolvedValue([SAMPLE_RULE]),
    create: jest.fn().mockResolvedValue(SAMPLE_RULE),
    show: jest.fn().mockResolvedValue(SAMPLE_RULE),
    update: jest.fn().mockResolvedValue(SAMPLE_RULE),
    delete: jest.fn().mockResolvedValue(undefined),
    replaceRules: jest.fn().mockResolvedValue(SAMPLE_DETAILED),
    listInstructions: jest.fn().mockResolvedValue([{ label: 'tone', prompt: 'Be formal' }]),
    addInstruction: jest.fn().mockResolvedValue({ label: 'tone', prompt: 'Be formal' }),
    updateInstruction: jest.fn().mockResolvedValue({ label: 'tone', prompt: 'Be friendlier' }),
    removeInstruction: jest.fn().mockResolvedValue(undefined),
    formatStyleRulesList: jest.fn().mockReturnValue('rules-list-text'),
    formatStyleRulesJson: jest.fn().mockReturnValue('[]'),
    formatStyleRulesTable: jest.fn().mockReturnValue('rules-list-table'),
    formatStyleRule: jest.fn().mockReturnValue('rule-text'),
    formatStyleRuleJson: jest.fn().mockReturnValue('{}'),
    formatCustomInstruction: jest.fn().mockReturnValue('instruction-text'),
    formatCustomInstructionsList: jest.fn().mockReturnValue('instructions-list-text'),
    formatCustomInstructionsTable: jest.fn().mockReturnValue('instructions-list-table'),
    formatCustomInstructionJson: jest.fn().mockReturnValue('{}'),
  };
}

async function withTTY<T>(value: boolean, fn: () => Promise<T> | T): Promise<T> {
  const original = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true, writable: true });
  }
}

describe('registerStyleRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('style-rules list', () => {
    it('should list rules and output text by default', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'list']);

      expect(mock.list).toHaveBeenCalled();
      expect(mock.formatStyleRulesList).toHaveBeenCalledWith([SAMPLE_RULE]);
      expect(Logger.output).toHaveBeenCalledWith('rules-list-text');
    });

    it('should output JSON when --format json', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'list', '--format', 'json']);

      expect(mock.formatStyleRulesJson).toHaveBeenCalledWith([SAMPLE_RULE]);
    });

    it('should call handleError on failure', async () => {
      mockCreateStyleRulesCommand.mockRejectedValue(new Error('boom'));
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync(['node', 'test', 'style-rules', 'list'])
      ).rejects.toThrow('boom');
      expect(handleError).toHaveBeenCalled();
    });

    it('should render cli-table3 output when --format table and stdout is a TTY', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await withTTY(true, async () => {
        await program.parseAsync(['node', 'test', 'style-rules', 'list', '--format', 'table']);
      });

      expect(mock.formatStyleRulesTable).toHaveBeenCalledWith([SAMPLE_RULE]);
      expect(mock.formatStyleRulesList).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledWith('rules-list-table');
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should fall back to plain text with a warn when --format table in non-TTY', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await withTTY(false, async () => {
        await program.parseAsync(['node', 'test', 'style-rules', 'list', '--format', 'table']);
      });

      expect(mock.formatStyleRulesTable).not.toHaveBeenCalled();
      expect(mock.formatStyleRulesList).toHaveBeenCalledWith([SAMPLE_RULE]);
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('non-TTY'));
      expect(Logger.output).toHaveBeenCalledWith('rules-list-text');
    });
  });

  describe('style-rules create', () => {
    it('should create a rule with required flags', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'create', '--name', 'X', '--language', 'en']);

      expect(mock.create).toHaveBeenCalledWith({ name: 'X', language: 'en' });
      expect(Logger.success).toHaveBeenCalled();
    });

    it('should parse --rules as a JSON object of category → settings', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'create',
        '--name', 'X', '--language', 'en',
        '--rules', '{"punctuation":{"quotation_mark":"use_guillemets"}}',
      ]);

      expect(mock.create).toHaveBeenCalledWith({
        name: 'X', language: 'en',
        configuredRules: { punctuation: { quotation_mark: 'use_guillemets' } },
      });
    });

    it('should reject malformed --rules JSON', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync([
          'node', 'test', 'style-rules', 'create',
          '--name', 'X', '--language', 'en', '--rules', '{garbage',
        ])
      ).rejects.toThrow();
      expect(handleError).toHaveBeenCalled();
    });

    it('should reject --rules that is not a JSON object', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync([
          'node', 'test', 'style-rules', 'create',
          '--name', 'X', '--language', 'en', '--rules', '["rule_a"]',
        ])
      ).rejects.toThrow();
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('JSON object of category') }),
      );
    });

    it('should reject --rules whose category does not map to an object', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync([
          'node', 'test', 'style-rules', 'create',
          '--name', 'X', '--language', 'en', '--rules', '{"punctuation":"wrong"}',
        ])
      ).rejects.toThrow();
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('category "punctuation"') }),
      );
    });

    it('should reject --rules whose leaf value is not a string', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync([
          'node', 'test', 'style-rules', 'create',
          '--name', 'X', '--language', 'en', '--rules', '{"x":{"y":42}}',
        ])
      ).rejects.toThrow();
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('"x.y"') }),
      );
    });

    it('should output JSON when --format json', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'create',
        '--name', 'X', '--language', 'en', '--format', 'json',
      ]);

      expect(mock.formatStyleRuleJson).toHaveBeenCalledWith(SAMPLE_RULE);
    });
  });

  describe('style-rules show', () => {
    it('should show a rule in text format', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'show', 'sr-1']);

      expect(mock.show).toHaveBeenCalledWith('sr-1', false);
      expect(mock.formatStyleRule).toHaveBeenCalled();
    });

    it('should pass --detailed to show', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'show', 'sr-1', '--detailed']);

      expect(mock.show).toHaveBeenCalledWith('sr-1', true);
    });

    it('should output JSON when --format json', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'show', 'sr-1', '--format', 'json']);

      expect(mock.formatStyleRuleJson).toHaveBeenCalledWith(SAMPLE_RULE);
    });

    it('should propagate errors via handleError', async () => {
      mockCreateStyleRulesCommand.mockRejectedValue(new Error('404'));
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync(['node', 'test', 'style-rules', 'show', 'missing'])
      ).rejects.toThrow('404');
      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('style-rules update', () => {
    it('should update name only (PATCH branch)', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'update', 'sr-1', '--name', 'Renamed']);

      expect(mock.update).toHaveBeenCalledWith('sr-1', { name: 'Renamed' });
      expect(mock.replaceRules).not.toHaveBeenCalled();
      expect(mock.show).toHaveBeenCalledWith('sr-1');
    });

    it('should update rules only (PUT branch)', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'update', 'sr-1',
        '--rules', '{"punctuation":{"quotation_mark":"use_guillemets"}}',
      ]);

      expect(mock.update).not.toHaveBeenCalled();
      expect(mock.replaceRules).toHaveBeenCalledWith('sr-1', {
        punctuation: { quotation_mark: 'use_guillemets' },
      });
    });

    it('should run both PATCH and PUT when name and rules passed', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'update', 'sr-1',
        '--name', 'New', '--rules', '{"x":{"y":"z"}}',
      ]);

      expect(mock.update).toHaveBeenCalledWith('sr-1', { name: 'New' });
      expect(mock.replaceRules).toHaveBeenCalledWith('sr-1', { x: { y: 'z' } });
    });

    it('should reject when neither --name nor --rules provided', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync(['node', 'test', 'style-rules', 'update', 'sr-1'])
      ).rejects.toThrow(/at least one of --name or --rules/);
      expect(handleError).toHaveBeenCalled();
    });

    it('should output JSON when --format json', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'update', 'sr-1',
        '--name', 'X', '--format', 'json',
      ]);

      expect(mock.formatStyleRuleJson).toHaveBeenCalled();
    });
  });

  describe('style-rules delete', () => {
    it('should delete after --yes', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'delete', 'sr-1', '--yes']);

      expect(mock.delete).toHaveBeenCalledWith('sr-1');
      expect(Logger.success).toHaveBeenCalled();
    });

    it('should dry-run without deleting', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'delete', 'sr-1', '--dry-run']);

      expect(mock.delete).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    });

    it('should abort on declined confirmation', async () => {
      const { confirm } = await import('../../src/utils/confirm');
      (confirm as jest.Mock).mockResolvedValueOnce(false);

      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'delete', 'sr-1']);

      expect(mock.delete).not.toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith('Aborted.');
    });

    it('should delete on confirmed prompt', async () => {
      const { confirm } = await import('../../src/utils/confirm');
      (confirm as jest.Mock).mockResolvedValueOnce(true);

      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'delete', 'sr-1']);

      expect(mock.delete).toHaveBeenCalledWith('sr-1');
    });
  });

  describe('style-rules instructions', () => {
    it('should list instructions in text', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'instructions', 'sr-1']);

      expect(mock.listInstructions).toHaveBeenCalledWith('sr-1');
      expect(mock.formatCustomInstructionsList).toHaveBeenCalled();
    });

    it('should list instructions in JSON', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync(['node', 'test', 'style-rules', 'instructions', 'sr-1', '--format', 'json']);

      expect(mock.formatCustomInstructionJson).toHaveBeenCalled();
    });

    it('should render cli-table3 output when --format table and stdout is a TTY', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await withTTY(true, async () => {
        await program.parseAsync(['node', 'test', 'style-rules', 'instructions', 'sr-1', '--format', 'table']);
      });

      expect(mock.formatCustomInstructionsTable).toHaveBeenCalled();
      expect(mock.formatCustomInstructionsList).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledWith('instructions-list-table');
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should fall back to plain text with a warn when --format table in non-TTY', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await withTTY(false, async () => {
        await program.parseAsync(['node', 'test', 'style-rules', 'instructions', 'sr-1', '--format', 'table']);
      });

      expect(mock.formatCustomInstructionsTable).not.toHaveBeenCalled();
      expect(mock.formatCustomInstructionsList).toHaveBeenCalled();
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('non-TTY'));
      expect(Logger.output).toHaveBeenCalledWith('instructions-list-text');
    });

    it('should propagate errors via handleError', async () => {
      mockCreateStyleRulesCommand.mockRejectedValue(new Error('404'));
      const { program, handleError } = makeProgram();

      await expect(
        program.parseAsync(['node', 'test', 'style-rules', 'instructions', 'sr-1'])
      ).rejects.toThrow('404');
      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('style-rules add-instruction', () => {
    it('should add an instruction with label+prompt', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'add-instruction', 'sr-1', 'tone', 'Be formal',
      ]);

      expect(mock.addInstruction).toHaveBeenCalledWith('sr-1', { label: 'tone', prompt: 'Be formal' });
    });

    it('should pass --source-language through', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'add-instruction', 'sr-1', 'tone', 'Be formal',
        '--source-language', 'en',
      ]);

      expect(mock.addInstruction).toHaveBeenCalledWith('sr-1', {
        label: 'tone', prompt: 'Be formal', sourceLanguage: 'en',
      });
    });

    it('should output JSON when --format json', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'add-instruction', 'sr-1', 'tone', 'Be formal',
        '--format', 'json',
      ]);

      expect(mock.formatCustomInstructionJson).toHaveBeenCalled();
    });
  });

  describe('style-rules update-instruction', () => {
    it('should update an instruction with new prompt', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'update-instruction', 'sr-1', 'tone', 'Be friendlier',
      ]);

      expect(mock.updateInstruction).toHaveBeenCalledWith('sr-1', 'tone', { prompt: 'Be friendlier' });
    });

    it('should pass --source-language through', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'update-instruction', 'sr-1', 'tone', 'Be friendlier',
        '--source-language', 'en',
      ]);

      expect(mock.updateInstruction).toHaveBeenCalledWith('sr-1', 'tone', {
        prompt: 'Be friendlier', sourceLanguage: 'en',
      });
    });

    it('should output JSON when --format json', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'update-instruction', 'sr-1', 'tone', 'New',
        '--format', 'json',
      ]);

      expect(mock.formatCustomInstructionJson).toHaveBeenCalled();
    });
  });

  describe('style-rules remove-instruction', () => {
    it('should remove after --yes', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'remove-instruction', 'sr-1', 'tone', '--yes',
      ]);

      expect(mock.removeInstruction).toHaveBeenCalledWith('sr-1', 'tone');
      expect(Logger.success).toHaveBeenCalled();
    });

    it('should dry-run without removing', async () => {
      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'remove-instruction', 'sr-1', 'tone', '--dry-run',
      ]);

      expect(mock.removeInstruction).not.toHaveBeenCalled();
      expect(Logger.output).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    });

    it('should abort on declined confirmation', async () => {
      const { confirm } = await import('../../src/utils/confirm');
      (confirm as jest.Mock).mockResolvedValueOnce(false);

      const mock = makeMockStyleRulesCmd();
      mockCreateStyleRulesCommand.mockResolvedValue(mock as any);
      const { program } = makeProgram();

      await program.parseAsync([
        'node', 'test', 'style-rules', 'remove-instruction', 'sr-1', 'tone',
      ]);

      expect(mock.removeInstruction).not.toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith('Aborted.');
    });
  });
});
