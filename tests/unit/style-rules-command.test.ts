/**
 * Tests for Style Rules Command
 */

import { StyleRulesCommand } from '../../src/cli/commands/style-rules';
import { StyleRule, StyleRuleDetailed } from '../../src/types/api';
import { createMockStyleRulesService } from '../helpers/mock-factories';

describe('StyleRulesCommand', () => {
  let mockService: ReturnType<typeof createMockStyleRulesService>;
  let command: StyleRulesCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockService = createMockStyleRulesService();

    command = new StyleRulesCommand(mockService);
  });

  describe('list', () => {
    it('should call getStyleRules with default options', async () => {
      await command.list();
      expect(mockService.getStyleRules).toHaveBeenCalledWith({});
    });

    it('should pass detailed option', async () => {
      await command.list({ detailed: true });
      expect(mockService.getStyleRules).toHaveBeenCalledWith({ detailed: true });
    });

    it('should pass pagination options', async () => {
      await command.list({ page: 2, pageSize: 10 });
      expect(mockService.getStyleRules).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    });

    it('should return rules from service', async () => {
      const mockRules: StyleRule[] = [
        {
          styleId: 'uuid-1',
          name: 'Style 1',
          language: 'en',
          version: 1,
          creationTime: '2024-01-01T00:00:00Z',
          updatedTime: '2024-01-02T00:00:00Z',
        },
      ];
      mockService.getStyleRules.mockResolvedValue(mockRules);

      const rules = await command.list();
      expect(rules).toEqual(mockRules);
    });
  });

  describe('formatStyleRulesList', () => {
    it('should format empty results', () => {
      const result = command.formatStyleRulesList([]);
      expect(result).toBe('No style rules found.');
    });

    it('should format basic style rules', () => {
      const rules: StyleRule[] = [
        {
          styleId: 'uuid-1',
          name: 'My Style',
          language: 'en',
          version: 1,
          creationTime: '2024-01-01T00:00:00Z',
          updatedTime: '2024-01-02T00:00:00Z',
        },
      ];

      const result = command.formatStyleRulesList(rules);
      expect(result).toContain('Found 1 style rule(s)');
      expect(result).toContain('My Style');
      expect(result).toContain('uuid-1');
      expect(result).toContain('en');
    });

    it('should format detailed style rules with structured custom instructions', () => {
      const rules: StyleRuleDetailed[] = [
        {
          styleId: 'uuid-1',
          name: 'Detailed Style',
          language: 'de',
          version: 2,
          creationTime: '2024-01-01T00:00:00Z',
          updatedTime: '2024-01-02T00:00:00Z',
          configuredRules: ['rule1', 'rule2'],
          customInstructions: [
            { label: 'Formality', prompt: 'Keep it formal' },
            { label: 'Tone', prompt: 'Use friendly tone', sourceLanguage: 'en' },
          ],
        },
      ];

      const result = command.formatStyleRulesList(rules);
      expect(result).toContain('Detailed Style');
      expect(result).toContain('rule1, rule2');
      expect(result).toContain('Formality: Keep it formal');
      expect(result).toContain('Tone: Use friendly tone [en]');
    });

    it('should format custom instructions without source language', () => {
      const rules: StyleRuleDetailed[] = [
        {
          styleId: 'uuid-2',
          name: 'Simple Style',
          language: 'en',
          version: 1,
          creationTime: '2024-01-01T00:00:00Z',
          updatedTime: '2024-01-02T00:00:00Z',
          configuredRules: [],
          customInstructions: [
            { label: 'Brevity', prompt: 'Keep sentences short' },
          ],
        },
      ];

      const result = command.formatStyleRulesList(rules);
      expect(result).toContain('Brevity: Keep sentences short');
      expect(result).not.toContain('[');
    });

    it('should format multiple rules', () => {
      const rules: StyleRule[] = [
        {
          styleId: 'uuid-1',
          name: 'Style A',
          language: 'en',
          version: 1,
          creationTime: '2024-01-01T00:00:00Z',
          updatedTime: '2024-01-02T00:00:00Z',
        },
        {
          styleId: 'uuid-2',
          name: 'Style B',
          language: 'de',
          version: 3,
          creationTime: '2024-02-01T00:00:00Z',
          updatedTime: '2024-02-02T00:00:00Z',
        },
      ];

      const result = command.formatStyleRulesList(rules);
      expect(result).toContain('Found 2 style rule(s)');
      expect(result).toContain('Style A');
      expect(result).toContain('Style B');
    });
  });

  describe('formatStyleRulesJson', () => {
    it('should format rules as JSON', () => {
      const rules: StyleRule[] = [
        {
          styleId: 'uuid-1',
          name: 'My Style',
          language: 'en',
          version: 1,
          creationTime: '2024-01-01T00:00:00Z',
          updatedTime: '2024-01-02T00:00:00Z',
        },
      ];

      const result = command.formatStyleRulesJson(rules);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].styleId).toBe('uuid-1');
    });

    it('should format empty array as JSON', () => {
      const result = command.formatStyleRulesJson([]);
      expect(JSON.parse(result)).toEqual([]);
    });

    it('should sanitize ANSI escapes in rule name when formatting list text', () => {
      const evil: StyleRule[] = [{
        styleId: 'sr-1',
        name: 'Evil\u001b[31mred',
        language: 'en',
        version: 1,
        creationTime: 'c',
        updatedTime: 'u',
      }];
      const result = command.formatStyleRulesList(evil);
      expect(result).not.toContain('\u001b[31m');
    });
  });

  describe('create', () => {
    it('should proxy to service.createStyleRule', async () => {
      await command.create({ name: 'X', language: 'en' });
      expect(mockService.createStyleRule).toHaveBeenCalledWith({ name: 'X', language: 'en' });
    });
  });

  describe('show', () => {
    it('should proxy to service.getStyleRule with detailed=false by default', async () => {
      await command.show('sr-1');
      expect(mockService.getStyleRule).toHaveBeenCalledWith('sr-1', false);
    });

    it('should pass detailed=true when requested', async () => {
      await command.show('sr-1', true);
      expect(mockService.getStyleRule).toHaveBeenCalledWith('sr-1', true);
    });
  });

  describe('update', () => {
    it('should proxy to service.updateStyleRule', async () => {
      await command.update('sr-1', { name: 'Renamed' });
      expect(mockService.updateStyleRule).toHaveBeenCalledWith('sr-1', { name: 'Renamed' });
    });
  });

  describe('delete', () => {
    it('should proxy to service.deleteStyleRule', async () => {
      await command.delete('sr-1');
      expect(mockService.deleteStyleRule).toHaveBeenCalledWith('sr-1');
    });
  });

  describe('replaceRules', () => {
    it('should proxy to service.replaceConfiguredRules', async () => {
      await command.replaceRules('sr-1', ['r1', 'r2']);
      expect(mockService.replaceConfiguredRules).toHaveBeenCalledWith('sr-1', ['r1', 'r2']);
    });
  });

  describe('formatStyleRule', () => {
    const baseRule: StyleRule = {
      styleId: 'sr-1',
      name: 'My Style',
      language: 'en',
      version: 1,
      creationTime: '2024-01-01T00:00:00Z',
      updatedTime: '2024-01-02T00:00:00Z',
    };

    it('should render a basic rule in text', () => {
      const result = command.formatStyleRule(baseRule);
      expect(result).toContain('My Style');
      expect(result).toContain('ID:       sr-1');
      expect(result).toContain('Language: en');
      expect(result).toContain('Version:  1');
    });

    it('should include configuredRules and customInstructions when detailed', () => {
      const detailed: StyleRuleDetailed = {
        ...baseRule,
        configuredRules: ['rule_a', 'rule_b'],
        customInstructions: [
          { label: 'L', prompt: 'P' },
          { label: 'M', prompt: 'Q', sourceLanguage: 'de' },
        ],
      };
      const result = command.formatStyleRule(detailed);
      expect(result).toContain('rule_a, rule_b');
      expect(result).toContain('- L: P');
      expect(result).toContain('- M: Q [de]');
    });

    it('should sanitize ANSI escapes in rule name', () => {
      const evil: StyleRule = { ...baseRule, name: 'Evil\u001b[31mred' };
      const result = command.formatStyleRule(evil);
      expect(result).not.toContain('\u001b[31m');
    });

    it('should sanitize ANSI escapes in custom instruction text', () => {
      const evil: StyleRuleDetailed = {
        ...baseRule,
        configuredRules: [],
        customInstructions: [{ label: 'L\u001b[31m', prompt: 'P\u001b[0m' }],
      };
      const result = command.formatStyleRule(evil);
      expect(result).not.toContain('\u001b[31m');
      expect(result).not.toContain('\u001b[0m');
    });
  });

  describe('listInstructions', () => {
    it('should call service.getStyleRule with detailed=true and return the nested array', async () => {
      mockService.getStyleRule.mockResolvedValue({
        styleId: 'sr-1', name: 'X', language: 'en', version: 1,
        creationTime: 'c', updatedTime: 'u',
        configuredRules: [],
        customInstructions: [
          { label: 'tone', prompt: 'Be formal' },
          { label: 'register', prompt: 'Use first person' },
        ],
      });

      const result = await command.listInstructions('sr-1');
      expect(mockService.getStyleRule).toHaveBeenCalledWith('sr-1', true);
      expect(result).toHaveLength(2);
      expect(result[0]?.label).toBe('tone');
    });

    it('should return empty array when rule has no customInstructions field', async () => {
      mockService.getStyleRule.mockResolvedValue({
        styleId: 'sr-1', name: 'X', language: 'en', version: 1,
        creationTime: 'c', updatedTime: 'u',
      });

      const result = await command.listInstructions('sr-1');
      expect(result).toEqual([]);
    });
  });

  describe('addInstruction', () => {
    it('should proxy to service.createCustomInstruction', async () => {
      await command.addInstruction('sr-1', { label: 'L', prompt: 'P' });
      expect(mockService.createCustomInstruction).toHaveBeenCalledWith('sr-1', { label: 'L', prompt: 'P' });
    });
  });

  describe('updateInstruction', () => {
    it('should proxy to service.updateCustomInstruction', async () => {
      await command.updateInstruction('sr-1', 'tone', { prompt: 'New text' });
      expect(mockService.updateCustomInstruction).toHaveBeenCalledWith('sr-1', 'tone', { prompt: 'New text' });
    });
  });

  describe('removeInstruction', () => {
    it('should proxy to service.deleteCustomInstruction', async () => {
      await command.removeInstruction('sr-1', 'tone');
      expect(mockService.deleteCustomInstruction).toHaveBeenCalledWith('sr-1', 'tone');
    });
  });

  describe('formatCustomInstruction / formatCustomInstructionsList / formatCustomInstructionJson', () => {
    it('should render a single instruction in text', () => {
      const result = command.formatCustomInstruction({ label: 'tone', prompt: 'Be formal' });
      expect(result).toContain('tone');
      expect(result).toContain('Be formal');
    });

    it('should append source-language suffix when present', () => {
      const result = command.formatCustomInstruction({
        label: 'tone', prompt: 'Be formal', sourceLanguage: 'en',
      });
      expect(result).toContain('[en]');
    });

    it('should render empty list as a friendly message', () => {
      expect(command.formatCustomInstructionsList([])).toBe('No custom instructions found.');
    });

    it('should render a list of instructions', () => {
      const result = command.formatCustomInstructionsList([
        { label: 'a', prompt: 'A' },
        { label: 'b', prompt: 'B' },
      ]);
      expect(result).toContain('Found 2 custom instruction(s)');
      expect(result).toContain('a');
      expect(result).toContain('b');
    });

    it('should sanitize ANSI escapes in label and prompt', () => {
      const result = command.formatCustomInstruction({
        label: 'evil\u001b[31m',
        prompt: 'also\u001b[0m',
      });
      expect(result.indexOf('\u001b')).toBe(-1);
    });

    it('should emit valid JSON preserving raw strings', () => {
      const json = command.formatCustomInstructionJson([{ label: 'L', prompt: 'P' }]);
      expect(JSON.parse(json)).toEqual([{ label: 'L', prompt: 'P' }]);
    });
  });

  describe('formatStyleRuleJson', () => {
    it('should emit valid JSON with raw name preserved', () => {
      const rule: StyleRule = {
        styleId: 'sr-1',
        name: 'Raw\u001b[31mname',
        language: 'en',
        version: 1,
        creationTime: 'c',
        updatedTime: 'u',
      };
      const result = command.formatStyleRuleJson(rule);
      const parsed = JSON.parse(result);
      expect(parsed.styleId).toBe('sr-1');
      // JSON path preserves the raw string; JSON.stringify escapes the control byte to \u001b
      expect(parsed.name).toBe('Raw\u001b[31mname');
      // but the emitted JSON source never contains the raw control byte
      expect(result.indexOf('\u001b')).toBe(-1);
    });
  });
});
