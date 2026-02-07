/**
 * Tests for VoiceCommand
 * Covers output formatting, TTY detection, and format options.
 */

// Mock chalk to avoid ESM issues in tests
jest.mock('chalk', () => {
  const mockChalk = {
    bold: (text: string) => text,
    gray: (text: string) => text,
  };
  return {
    __esModule: true,
    default: mockChalk,
  };
});

import { VoiceCommand } from '../../src/cli/commands/voice.js';
import { VoiceService } from '../../src/services/voice.js';
import type { VoiceSessionResult } from '../../src/types/voice.js';

describe('VoiceCommand', () => {
  let command: VoiceCommand;
  let mockService: jest.Mocked<VoiceService>;

  const mockResult: VoiceSessionResult = {
    sessionId: 'session-123',
    source: {
      lang: 'en',
      text: 'Hello world',
      segments: [{ text: 'Hello world', start_time: 0, end_time: 1.5 }],
    },
    targets: [
      {
        lang: 'de',
        text: 'Hallo Welt',
        segments: [{ text: 'Hallo Welt', start_time: 0, end_time: 1.5 }],
      },
    ],
  };

  const multiTargetResult: VoiceSessionResult = {
    sessionId: 'session-456',
    source: {
      lang: 'en',
      text: 'Hello',
      segments: [{ text: 'Hello', start_time: 0, end_time: 0.5 }],
    },
    targets: [
      {
        lang: 'de',
        text: 'Hallo',
        segments: [{ text: 'Hallo', start_time: 0, end_time: 0.5 }],
      },
      {
        lang: 'fr',
        text: 'Bonjour',
        segments: [{ text: 'Bonjour', start_time: 0, end_time: 0.5 }],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockService = {
      translateFile: jest.fn(),
      translateStdin: jest.fn(),
      detectContentType: jest.fn(),
      validateOptions: jest.fn(),
    } as unknown as jest.Mocked<VoiceService>;

    command = new VoiceCommand(mockService);

    // Force non-TTY for most tests (no live display)
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
  });

  describe('translate()', () => {
    it('should translate a file and return plain text result', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      const result = await command.translate('test.mp3', { to: 'de' });

      expect(result).toContain('[source] Hello world');
      expect(result).toContain('[de] Hallo Welt');
      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          targetLangs: ['de'],
        }),
        undefined,
      );
    });

    it('should handle multiple target languages in output', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      const result = await command.translate('test.mp3', { to: 'de,fr' });

      expect(result).toContain('[de] Hallo');
      expect(result).toContain('[fr] Bonjour');
    });

    it('should format as JSON when --format json', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      const result = await command.translate('test.mp3', { to: 'de', format: 'json' });
      const parsed = JSON.parse(result);

      expect(parsed.sessionId).toBe('session-123');
      expect(parsed.source.lang).toBe('en');
      expect(parsed.source.text).toBe('Hello world');
      expect(parsed.targets).toHaveLength(1);
      expect(parsed.targets[0].lang).toBe('de');
      expect(parsed.targets[0].text).toBe('Hallo Welt');
    });

    it('should include segment timing in JSON output', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      const result = await command.translate('test.mp3', { to: 'de', format: 'json' });
      const parsed = JSON.parse(result);

      expect(parsed.source.segments[0].startTime).toBe(0);
      expect(parsed.source.segments[0].endTime).toBe(1.5);
    });

    it('should pass source language option', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de', from: 'en' });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          sourceLang: 'en',
        }),
        undefined,
      );
    });

    it('should pass formality option', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de', formality: 'more' });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          formality: 'more',
        }),
        undefined,
      );
    });

    it('should pass glossary option', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de', glossary: 'glossary-123' });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          glossaryId: 'glossary-123',
        }),
        undefined,
      );
    });

    it('should pass content-type option', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.pcm', { to: 'de', contentType: 'audio/pcm;encoding=s16le;rate=16000' });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.pcm',
        expect.objectContaining({
          contentType: 'audio/pcm;encoding=s16le;rate=16000',
        }),
        undefined,
      );
    });

    it('should pass chunk size and interval options', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de', chunkSize: 3200, chunkInterval: 100 });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          chunkSize: 3200,
          chunkInterval: 100,
        }),
        undefined,
      );
    });

    it('should not pass TTY callbacks when stdout is not a TTY', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de' });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.anything(),
        undefined,
      );
    });

    it('should not pass TTY callbacks when --no-stream is set', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de', stream: false });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.anything(),
        undefined,
      );
    });

    it('should propagate errors from service', async () => {
      mockService.translateFile.mockRejectedValue(new Error('API error'));

      await expect(command.translate('test.mp3', { to: 'de' })).rejects.toThrow('API error');
    });

    it('should split comma-separated target languages', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      await command.translate('test.mp3', { to: 'de,fr' });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          targetLangs: ['de', 'fr'],
        }),
        undefined,
      );
    });

    it('should trim whitespace from target languages', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      await command.translate('test.mp3', { to: 'de , fr' });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          targetLangs: ['de', 'fr'],
        }),
        undefined,
      );
    });
  });

  describe('translateFromStdin()', () => {
    it('should call translateStdin on service', async () => {
      mockService.translateStdin.mockResolvedValue(mockResult);

      const result = await command.translateFromStdin({ to: 'de' });

      expect(result).toContain('[de] Hallo Welt');
      expect(mockService.translateStdin).toHaveBeenCalled();
    });

    it('should format as JSON when requested', async () => {
      mockService.translateStdin.mockResolvedValue(mockResult);

      const result = await command.translateFromStdin({ to: 'de', format: 'json' });
      const parsed = JSON.parse(result);

      expect(parsed.sessionId).toBe('session-123');
    });
  });
});
