/**
 * Tests for Style Rules Command
 */

import { StyleRulesCommand } from '../../src/cli/commands/style-rules';
import { DeepLClient } from '../../src/api/deepl-client';
import { StyleRule, StyleRuleDetailed } from '../../src/types/api';

jest.mock('../../src/api/deepl-client');

describe('StyleRulesCommand', () => {
  let mockClient: jest.Mocked<DeepLClient>;
  let command: StyleRulesCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      getStyleRules: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DeepLClient>;

    command = new StyleRulesCommand(mockClient);
  });

  describe('list', () => {
    it('should call getStyleRules with default options', async () => {
      await command.list();
      expect(mockClient.getStyleRules).toHaveBeenCalledWith({});
    });

    it('should pass detailed option', async () => {
      await command.list({ detailed: true });
      expect(mockClient.getStyleRules).toHaveBeenCalledWith({ detailed: true });
    });

    it('should pass pagination options', async () => {
      await command.list({ page: 2, pageSize: 10 });
      expect(mockClient.getStyleRules).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    });

    it('should return rules from client', async () => {
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
      mockClient.getStyleRules.mockResolvedValue(mockRules);

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

    it('should format detailed style rules', () => {
      const rules: StyleRuleDetailed[] = [
        {
          styleId: 'uuid-1',
          name: 'Detailed Style',
          language: 'de',
          version: 2,
          creationTime: '2024-01-01T00:00:00Z',
          updatedTime: '2024-01-02T00:00:00Z',
          configuredRules: ['rule1', 'rule2'],
          customInstructions: ['Keep it formal'],
        },
      ];

      const result = command.formatStyleRulesList(rules);
      expect(result).toContain('Detailed Style');
      expect(result).toContain('rule1, rule2');
      expect(result).toContain('Keep it formal');
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
