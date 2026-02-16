/**
 * Tests for StyleRulesClient
 * Covers getStyleRules with pagination, detailed mode, and error cases
 */

import { StyleRulesClient } from '../../src/api/style-rules-client.js';
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
});
