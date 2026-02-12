/**
 * Tests for Detect Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { DetectCommand } from '../../src/cli/commands/detect';
import { createMockDetectService } from '../helpers/mock-factories';

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
  let mockService: ReturnType<typeof createMockDetectService>;
  let detectCommand: DetectCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    mockService = createMockDetectService({
      detect: jest.fn().mockResolvedValue({
        detectedLanguage: 'fr',
        languageName: 'French',
      }),
    });

    detectCommand = new DetectCommand(mockService);
  });

  describe('detect()', () => {
    it('should detect language of French text', async () => {
      mockService.detect = jest.fn().mockResolvedValue({
        detectedLanguage: 'fr',
        languageName: 'French',
      });

      const result = await detectCommand.detect('Bonjour le monde');

      expect(result.detectedLanguage).toBe('fr');
      expect(result.languageName).toBe('French');
    });

    it('should detect language of German text', async () => {
      mockService.detect = jest.fn().mockResolvedValue({
        detectedLanguage: 'de',
        languageName: 'German',
      });

      const result = await detectCommand.detect('Hallo Welt');

      expect(result.detectedLanguage).toBe('de');
      expect(result.languageName).toBe('German');
    });

    it('should detect language of Japanese text', async () => {
      mockService.detect = jest.fn().mockResolvedValue({
        detectedLanguage: 'ja',
        languageName: 'Japanese',
      });

      const result = await detectCommand.detect('こんにちは世界');

      expect(result.detectedLanguage).toBe('ja');
      expect(result.languageName).toBe('Japanese');
    });

    it('should delegate to service', async () => {
      await detectCommand.detect('Bonjour');

      expect(mockService.detect).toHaveBeenCalledWith('Bonjour');
    });

    it('should throw error for empty text', async () => {
      mockService.detect = jest.fn().mockRejectedValue(
        new Error('Text cannot be empty. Provide text to detect language.')
      );

      await expect(detectCommand.detect('')).rejects.toThrow(
        'Text cannot be empty'
      );
    });

    it('should throw error for whitespace-only text', async () => {
      mockService.detect = jest.fn().mockRejectedValue(
        new Error('Text cannot be empty. Provide text to detect language.')
      );

      await expect(detectCommand.detect('   ')).rejects.toThrow(
        'Text cannot be empty'
      );
    });

    it('should throw error when API returns no detected language', async () => {
      mockService.detect = jest.fn().mockRejectedValue(
        new Error('Could not detect source language. The text may be too short or ambiguous.')
      );

      await expect(detectCommand.detect('x')).rejects.toThrow(
        'Could not detect source language'
      );
    });

    it('should handle API errors', async () => {
      mockService.detect = jest.fn().mockRejectedValue(
        new Error('API error')
      );

      await expect(detectCommand.detect('Bonjour')).rejects.toThrow('API error');
    });

    it('should handle authentication errors', async () => {
      mockService.detect = jest.fn().mockRejectedValue(
        new Error('Authentication failed: Invalid API key')
      );

      await expect(detectCommand.detect('Bonjour')).rejects.toThrow(
        'Authentication failed: Invalid API key'
      );
    });

    it('should handle quota exceeded errors', async () => {
      mockService.detect = jest.fn().mockRejectedValue(
        new Error('Quota exceeded')
      );

      await expect(detectCommand.detect('Bonjour')).rejects.toThrow(
        'Quota exceeded'
      );
    });

    it('should return language code as name when not in registry', async () => {
      mockService.detect = jest.fn().mockResolvedValue({
        detectedLanguage: 'xx',
        languageName: 'XX',
      });

      const result = await detectCommand.detect('Some text');

      expect(result.detectedLanguage).toBe('xx');
      expect(result.languageName).toBe('XX');
    });

    it('should detect extended languages', async () => {
      mockService.detect = jest.fn().mockResolvedValue({
        detectedLanguage: 'hi',
        languageName: 'Hindi',
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
