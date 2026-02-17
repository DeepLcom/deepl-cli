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
  });
});
