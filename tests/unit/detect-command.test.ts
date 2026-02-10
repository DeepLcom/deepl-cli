/**
 * Tests for Detect Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { DetectCommand } from '../../src/cli/commands/detect';
import { DeepLClient } from '../../src/api/deepl-client';

jest.mock('../../src/api/deepl-client');

jest.mock('chalk', () => {
  const mockChalk = {
    bold: (text: string) => text,
    green: (text: string) => text,
    yellow: (text: string) => text,
    red: (text: string) => text,
    blue: (text: string) => text,
    gray: (text: string) => text,
    cyan: (text: string) => text,
  };
  return {
    __esModule: true,
    default: mockChalk,
  };
});

describe('DetectCommand', () => {
  let mockDeepLClient: jest.Mocked<DeepLClient>;
  let detectCommand: DetectCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDeepLClient = {
      translate: jest.fn().mockResolvedValue({
        text: 'Hello world',
        detectedSourceLang: 'fr',
      }),
    } as unknown as jest.Mocked<DeepLClient>;

    detectCommand = new DetectCommand(mockDeepLClient);
  });

  describe('detect()', () => {
    it('should detect language of French text', async () => {
      mockDeepLClient.translate = jest.fn().mockResolvedValue({
        text: 'Hello world',
        detectedSourceLang: 'fr',
      });

      const result = await detectCommand.detect('Bonjour le monde');

      expect(result.detectedLanguage).toBe('fr');
      expect(result.languageName).toBe('French');
    });

    it('should detect language of German text', async () => {
      mockDeepLClient.translate = jest.fn().mockResolvedValue({
        text: 'Hello world',
        detectedSourceLang: 'de',
      });

      const result = await detectCommand.detect('Hallo Welt');

      expect(result.detectedLanguage).toBe('de');
      expect(result.languageName).toBe('German');
    });

    it('should detect language of Japanese text', async () => {
      mockDeepLClient.translate = jest.fn().mockResolvedValue({
        text: 'Hello world',
        detectedSourceLang: 'ja',
      });

      const result = await detectCommand.detect('こんにちは世界');

      expect(result.detectedLanguage).toBe('ja');
      expect(result.languageName).toBe('Japanese');
    });

    it('should call translate API with target_lang EN', async () => {
      await detectCommand.detect('Bonjour');

      expect(mockDeepLClient.translate).toHaveBeenCalledWith('Bonjour', {
        targetLang: 'en',
      });
    });

    it('should throw error for empty text', async () => {
      await expect(detectCommand.detect('')).rejects.toThrow(
        'Text cannot be empty'
      );
    });

    it('should throw error for whitespace-only text', async () => {
      await expect(detectCommand.detect('   ')).rejects.toThrow(
        'Text cannot be empty'
      );
    });

    it('should throw error when API returns no detected language', async () => {
      mockDeepLClient.translate = jest.fn().mockResolvedValue({
        text: 'test',
        detectedSourceLang: undefined,
      });

      await expect(detectCommand.detect('x')).rejects.toThrow(
        'Could not detect source language'
      );
    });

    it('should handle API errors', async () => {
      mockDeepLClient.translate = jest.fn().mockRejectedValue(
        new Error('API error')
      );

      await expect(detectCommand.detect('Bonjour')).rejects.toThrow('API error');
    });

    it('should handle authentication errors', async () => {
      mockDeepLClient.translate = jest.fn().mockRejectedValue(
        new Error('Authentication failed: Invalid API key')
      );

      await expect(detectCommand.detect('Bonjour')).rejects.toThrow(
        'Authentication failed: Invalid API key'
      );
    });

    it('should handle quota exceeded errors', async () => {
      mockDeepLClient.translate = jest.fn().mockRejectedValue(
        new Error('Quota exceeded')
      );

      await expect(detectCommand.detect('Bonjour')).rejects.toThrow(
        'Quota exceeded'
      );
    });

    it('should return language code as name when not in registry', async () => {
      mockDeepLClient.translate = jest.fn().mockResolvedValue({
        text: 'test',
        detectedSourceLang: 'xx' as any,
      });

      const result = await detectCommand.detect('Some text');

      expect(result.detectedLanguage).toBe('xx');
      expect(result.languageName).toBe('XX');
    });

    it('should detect extended languages', async () => {
      mockDeepLClient.translate = jest.fn().mockResolvedValue({
        text: 'Hello',
        detectedSourceLang: 'hi',
      });

      const result = await detectCommand.detect('नमस्ते दुनिया');

      expect(result.detectedLanguage).toBe('hi');
      expect(result.languageName).toBe('Hindi');
    });
  });

  describe('formatPlain()', () => {
    it('should format detected language as plain text', () => {
      const output = detectCommand.formatPlain({
        detectedLanguage: 'fr' as any,
        languageName: 'French',
      });

      expect(output).toBe('Detected language: French (fr)');
    });

    it('should format German detection as plain text', () => {
      const output = detectCommand.formatPlain({
        detectedLanguage: 'de' as any,
        languageName: 'German',
      });

      expect(output).toBe('Detected language: German (de)');
    });
  });

  describe('formatJson()', () => {
    it('should format detected language as JSON', () => {
      const output = detectCommand.formatJson({
        detectedLanguage: 'fr' as any,
        languageName: 'French',
      });

      const parsed = JSON.parse(output);
      expect(parsed).toEqual({
        detected_language: 'fr',
        language_name: 'French',
      });
    });

    it('should produce valid JSON for German', () => {
      const output = detectCommand.formatJson({
        detectedLanguage: 'de' as any,
        languageName: 'German',
      });

      const parsed = JSON.parse(output);
      expect(parsed.detected_language).toBe('de');
      expect(parsed.language_name).toBe('German');
    });

    it('should produce pretty-printed JSON', () => {
      const output = detectCommand.formatJson({
        detectedLanguage: 'ja' as any,
        languageName: 'Japanese',
      });

      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });
  });
});
