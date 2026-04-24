/**
 * Tests for StyleRulesClient
 * Covers getStyleRules with pagination, detailed mode, and error cases
 */

import { StyleRulesClient } from '../../src/api/style-rules-client.js';
import type { StyleRuleDetailed } from '../../src/types/api.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('StyleRulesClient', () => {
  let client: StyleRulesClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAxiosInstance = {
      request: jest.fn(),
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false);

    client = new StyleRulesClient('test-api-key');
  });

  afterAll(() => {
    client.destroy();
  });

  describe('constructor', () => {
    it('should create a StyleRulesClient instance', () => {
      expect(client).toBeInstanceOf(StyleRulesClient);
    });

    it('should throw error for empty API key', () => {
      expect(() => new StyleRulesClient('')).toThrow('API key is required');
    });

    it('should use Free API URL by default', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api-free.deepl.com',
        }),
      );
    });
  });

  describe('getStyleRules()', () => {
    it('should return style rules', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          style_rules: [
            {
              style_id: 'sr-1',
              name: 'Formal English',
              language: 'en',
              version: 1,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-01-02T00:00:00Z',
            },
          ],
        },
        status: 200,
        headers: {},
      });

      const result = await client.getStyleRules();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        styleId: 'sr-1',
        name: 'Formal English',
        language: 'en',
        version: 1,
        creationTime: '2024-01-01T00:00:00Z',
        updatedTime: '2024-01-02T00:00:00Z',
      });
    });

    it('should return detailed style rules when detailed=true', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          style_rules: [
            {
              style_id: 'sr-2',
              name: 'Custom Style',
              language: 'de',
              version: 2,
              creation_time: '2024-01-01T00:00:00Z',
              updated_time: '2024-06-01T00:00:00Z',
              configured_rules: ['rule_a', 'rule_b'],
              custom_instructions: [
                { label: 'Instruction 1', prompt: 'Use formal tone' },
                { label: 'Instruction 2', prompt: 'Short sentences', source_language: 'en' },
              ],
            },
          ],
        },
        status: 200,
        headers: {},
      });

      const result = await client.getStyleRules({ detailed: true });

      expect(result).toHaveLength(1);
      const detailed = result[0] as any;
      expect(detailed.styleId).toBe('sr-2');
      expect(detailed.configuredRules).toEqual(['rule_a', 'rule_b']);
      expect(detailed.customInstructions).toHaveLength(2);
      expect(detailed.customInstructions[0].label).toBe('Instruction 1');
      expect(detailed.customInstructions[1].sourceLanguage).toBe('en');
    });

    it('should support pagination', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { style_rules: [] },
        status: 200,
        headers: {},
      });

      await client.getStyleRules({ page: 2, pageSize: 10 });

      expect(mockAxiosInstance.request).toHaveBeenCalled();
    });

    it('should return empty array when no rules', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { style_rules: [] },
        status: 200,
        headers: {},
      });

      const result = await client.getStyleRules();

      expect(result).toEqual([]);
    });

    it('should handle 403 auth error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 403, data: { message: 'Forbidden' }, headers: {} },
        message: 'Forbidden',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.getStyleRules()).rejects.toThrow();
    });

    it('should handle 429 rate limit error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 429, data: { message: 'Rate limited' }, headers: {} },
        message: 'Rate limited',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.getStyleRules()).rejects.toThrow();
    });
  });

  describe('createStyleRule()', () => {
    it('should POST to /v3/style_rules with name+language and return mapped rule', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          style_id: 'sr-new',
          name: 'Corporate',
          language: 'en',
          version: 1,
          creation_time: '2026-04-24T12:00:00Z',
          updated_time: '2026-04-24T12:00:00Z',
        },
        status: 200,
        headers: {},
      });

      const result = await client.createStyleRule({ name: 'Corporate', language: 'en' });

      expect(result).toEqual({
        styleId: 'sr-new',
        name: 'Corporate',
        language: 'en',
        version: 1,
        creationTime: '2026-04-24T12:00:00Z',
        updatedTime: '2026-04-24T12:00:00Z',
      });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v3/style_rules',
          data: expect.objectContaining({ name: 'Corporate', language: 'en' }),
        }),
      );
    });

    it('should serialize customInstructions with snake_case sourceLanguage', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          style_id: 'sr-new', name: 'X', language: 'de', version: 1,
          creation_time: 't', updated_time: 't',
        },
        status: 200, headers: {},
      });

      await client.createStyleRule({
        name: 'X',
        language: 'de',
        customInstructions: [{ label: 'L', prompt: 'P', sourceLanguage: 'en' }],
      });

      const call = mockAxiosInstance.request.mock.calls[0][0];
      expect(call.data.custom_instructions).toEqual([
        { label: 'L', prompt: 'P', source_language: 'en' },
      ]);
    });

    it('should propagate 400 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: { message: 'Invalid language' }, headers: {} },
        message: 'Bad request',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(
        client.createStyleRule({ name: 'X', language: 'xx' })
      ).rejects.toThrow();
    });
  });

  describe('getStyleRule()', () => {
    it('should GET /v3/style_rules/:id and return basic rule', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          style_id: 'sr-1', name: 'One', language: 'en', version: 1,
          creation_time: 'c', updated_time: 'u',
        },
        status: 200, headers: {},
      });

      const result = await client.getStyleRule('sr-1');

      expect(result).toEqual({
        styleId: 'sr-1', name: 'One', language: 'en', version: 1,
        creationTime: 'c', updatedTime: 'u',
      });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', url: '/v3/style_rules/sr-1' }),
      );
    });

    it('should return StyleRuleDetailed when detailed=true', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          style_id: 'sr-2', name: 'Two', language: 'de', version: 3,
          creation_time: 'c', updated_time: 'u',
          configured_rules: ['r1'],
          custom_instructions: [{ label: 'L', prompt: 'P' }],
        },
        status: 200, headers: {},
      });

      const result = await client.getStyleRule('sr-2', true);
      expect((result as StyleRuleDetailed).configuredRules).toEqual(['r1']);
      expect((result as StyleRuleDetailed).customInstructions).toEqual([{ label: 'L', prompt: 'P' }]);
    });

    it('should URL-encode the styleId path component', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { style_id: 'has space', name: '', language: '', version: 0, creation_time: '', updated_time: '' },
        status: 200, headers: {},
      });
      await client.getStyleRule('has space');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/v3/style_rules/has%20space' }),
      );
    });

    it('should propagate 404 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404, data: { message: 'Not found' }, headers: {} },
        message: 'Not found',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.getStyleRule('missing')).rejects.toThrow();
    });
  });

  describe('updateStyleRule()', () => {
    it('should PATCH /v3/style_rules/:id with partial body', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          style_id: 'sr-1', name: 'Renamed', language: 'en', version: 2,
          creation_time: 'c', updated_time: 'u2',
        },
        status: 200, headers: {},
      });

      const result = await client.updateStyleRule('sr-1', { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          url: '/v3/style_rules/sr-1',
          data: { name: 'Renamed' },
        }),
      );
    });

    it('should omit fields not passed', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { style_id: 'sr-1', name: 'X', language: 'en', version: 1, creation_time: 'c', updated_time: 'u' },
        status: 200, headers: {},
      });

      await client.updateStyleRule('sr-1', {});
      const call = mockAxiosInstance.request.mock.calls[0][0];
      expect(call.data).toEqual({});
    });

    it('should propagate 404 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404, data: { message: 'Not found' }, headers: {} },
        message: 'Not found',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.updateStyleRule('missing', { name: 'X' })).rejects.toThrow();
    });
  });

  describe('deleteStyleRule()', () => {
    it('should DELETE /v3/style_rules/:id and resolve void', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: undefined, status: 204, headers: {} });

      const result = await client.deleteStyleRule('sr-1');

      expect(result).toBeUndefined();
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', url: '/v3/style_rules/sr-1' }),
      );
    });

    it('should propagate 404 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404, data: { message: 'Not found' }, headers: {} },
        message: 'Not found',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.deleteStyleRule('missing')).rejects.toThrow();
    });
  });

  describe('createCustomInstruction()', () => {
    it('should POST to /v3/style_rules/:id/custom_instructions with label+prompt and return mapped instruction', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { label: 'tone', prompt: 'Be formal' },
        status: 200, headers: {},
      });

      const result = await client.createCustomInstruction('sr-1', { label: 'tone', prompt: 'Be formal' });

      expect(result).toEqual({ label: 'tone', prompt: 'Be formal' });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v3/style_rules/sr-1/custom_instructions',
          data: { label: 'tone', prompt: 'Be formal' },
        }),
      );
    });

    it('should serialize sourceLanguage as source_language on the wire', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { label: 'L', prompt: 'P', source_language: 'en' },
        status: 200, headers: {},
      });

      const result = await client.createCustomInstruction('sr-1', {
        label: 'L', prompt: 'P', sourceLanguage: 'en',
      });

      expect(result.sourceLanguage).toBe('en');
      const call = mockAxiosInstance.request.mock.calls[0][0];
      expect(call.data).toEqual({ label: 'L', prompt: 'P', source_language: 'en' });
    });

    it('should propagate 400 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: { message: 'Duplicate label' }, headers: {} },
        message: 'Bad request',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(
        client.createCustomInstruction('sr-1', { label: 'L', prompt: 'P' })
      ).rejects.toThrow();
    });
  });

  describe('getCustomInstruction()', () => {
    it('should GET /v3/style_rules/:id/custom_instructions/:label', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { label: 'tone', prompt: 'Be formal', source_language: 'en' },
        status: 200, headers: {},
      });

      const result = await client.getCustomInstruction('sr-1', 'tone');

      expect(result).toEqual({ label: 'tone', prompt: 'Be formal', sourceLanguage: 'en' });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/v3/style_rules/sr-1/custom_instructions/tone',
        }),
      );
    });

    it('should URL-encode both path components', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { label: 'has space', prompt: 'P' },
        status: 200, headers: {},
      });
      await client.getCustomInstruction('sr id', 'has space');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/v3/style_rules/sr%20id/custom_instructions/has%20space' }),
      );
    });

    it('should propagate 404 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404, data: { message: 'Not found' }, headers: {} },
        message: 'Not found',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.getCustomInstruction('sr-1', 'missing')).rejects.toThrow();
    });
  });

  describe('updateCustomInstruction()', () => {
    it('should PUT /v3/style_rules/:id/custom_instructions/:label with partial body', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { label: 'tone', prompt: 'Be friendlier' },
        status: 200, headers: {},
      });

      const result = await client.updateCustomInstruction('sr-1', 'tone', { prompt: 'Be friendlier' });

      expect(result.prompt).toBe('Be friendlier');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/v3/style_rules/sr-1/custom_instructions/tone',
          data: { prompt: 'Be friendlier' },
        }),
      );
    });

    it('should omit fields not passed', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { label: 'tone', prompt: 'x' }, status: 200, headers: {},
      });
      await client.updateCustomInstruction('sr-1', 'tone', {});
      const call = mockAxiosInstance.request.mock.calls[0][0];
      expect(call.data).toEqual({});
    });

    it('should propagate 404 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404, data: { message: 'Not found' }, headers: {} },
        message: 'Not found',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(
        client.updateCustomInstruction('sr-1', 'missing', { prompt: 'X' })
      ).rejects.toThrow();
    });
  });

  describe('deleteCustomInstruction()', () => {
    it('should DELETE /v3/style_rules/:id/custom_instructions/:label and resolve void', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: undefined, status: 204, headers: {} });

      const result = await client.deleteCustomInstruction('sr-1', 'tone');

      expect(result).toBeUndefined();
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: '/v3/style_rules/sr-1/custom_instructions/tone',
        }),
      );
    });

    it('should propagate 404 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404, data: { message: 'Not found' }, headers: {} },
        message: 'Not found',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.deleteCustomInstruction('sr-1', 'missing')).rejects.toThrow();
    });
  });

  describe('replaceConfiguredRules()', () => {
    it('should PUT /v3/style_rules/:id/configured_rules with rules array', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          style_id: 'sr-1', name: 'X', language: 'en', version: 3,
          creation_time: 'c', updated_time: 'u3',
          configured_rules: ['rule_a', 'rule_b'],
          custom_instructions: [],
        },
        status: 200, headers: {},
      });

      const result = await client.replaceConfiguredRules('sr-1', ['rule_a', 'rule_b']);

      expect(result.configuredRules).toEqual(['rule_a', 'rule_b']);
      expect(result.version).toBe(3);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/v3/style_rules/sr-1/configured_rules',
          data: { configured_rules: ['rule_a', 'rule_b'] },
        }),
      );
    });

    it('should propagate 400 error for invalid rule ids', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: { message: 'Invalid rule id' }, headers: {} },
        message: 'Bad request',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.replaceConfiguredRules('sr-1', ['bogus'])).rejects.toThrow();
    });
  });
});
