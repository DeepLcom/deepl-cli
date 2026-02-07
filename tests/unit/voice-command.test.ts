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

const mockMoveCursor = jest.fn();
const mockClearLine = jest.fn();
const mockCursorTo = jest.fn();

jest.mock('readline', () => ({
  moveCursor: (...args: unknown[]) => mockMoveCursor(...args),
  clearLine: (...args: unknown[]) => mockClearLine(...args),
  cursorTo: (...args: unknown[]) => mockCursorTo(...args),
}));

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

  describe('TTY rendering (translate)', () => {
    let writeSpy: jest.SpyInstance;

    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      mockMoveCursor.mockReset();
      mockClearLine.mockReset();
      mockCursorTo.mockReset();
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    it('should pass TTY callbacks when stdout is a TTY and stream is not disabled', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de' });

      const callArgs = mockService.translateFile.mock.calls[0]!;
      expect(callArgs[2]).toBeDefined();
      expect(callArgs[2]).toHaveProperty('onSourceTranscript');
      expect(callArgs[2]).toHaveProperty('onTargetTranscript');
    });

    it('should write initial blank lines for source + target count', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de' });

      const newlineWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === '\n'
      );
      expect(newlineWrites.length).toBeGreaterThanOrEqual(2);
    });

    it('should write initial blank lines for multiple targets', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      await command.translate('test.mp3', { to: 'de,fr' });

      const newlineWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === '\n'
      );
      expect(newlineWrites.length).toBeGreaterThanOrEqual(3);
    });

    it('should render source transcript when onSourceTranscript is invoked', async () => {
      mockService.translateFile.mockImplementation(async (_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({
          type: 'source_transcript_update',
          lang: 'en' as any,
          concluded: [{ text: 'Hello', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        return mockResult;
      });

      await command.translate('test.mp3', { to: 'de' });

      const sourceWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('[source]') && (call[0] as string).includes('Hello')
      );
      expect(sourceWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should render target transcript when onTargetTranscript is invoked', async () => {
      mockService.translateFile.mockImplementation(async (_file, _opts, callbacks) => {
        callbacks!.onTargetTranscript!({
          type: 'target_transcript_update',
          lang: 'de' as any,
          concluded: [{ text: 'Hallo', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        return mockResult;
      });

      await command.translate('test.mp3', { to: 'de' });

      const targetWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('[de]') && (call[0] as string).includes('Hallo')
      );
      expect(targetWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should accumulate concluded text across multiple source updates', async () => {
      mockService.translateFile.mockImplementation(async (_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({
          type: 'source_transcript_update',
          lang: 'en' as any,
          concluded: [{ text: 'Hello', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        callbacks!.onSourceTranscript!({
          type: 'source_transcript_update',
          lang: 'en' as any,
          concluded: [{ text: 'world', start_time: 0.5, end_time: 1.0 }],
          tentative: [],
        });
        return mockResult;
      });

      await command.translate('test.mp3', { to: 'de' });

      const accumulatedWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Hello world')
      );
      expect(accumulatedWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should display tentative text in source transcript', async () => {
      mockService.translateFile.mockImplementation(async (_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({
          type: 'source_transcript_update',
          lang: 'en' as any,
          concluded: [],
          tentative: [{ text: 'Hel', start_time: 0, end_time: 0.3 }],
        });
        return mockResult;
      });

      await command.translate('test.mp3', { to: 'de' });

      const tentativeWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Hel')
      );
      expect(tentativeWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should display tentative text in target transcript', async () => {
      mockService.translateFile.mockImplementation(async (_file, _opts, callbacks) => {
        callbacks!.onTargetTranscript!({
          type: 'target_transcript_update',
          lang: 'de' as any,
          concluded: [],
          tentative: [{ text: 'Hal', start_time: 0, end_time: 0.3 }],
        });
        return mockResult;
      });

      await command.translate('test.mp3', { to: 'de' });

      const tentativeWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('[de]') && (call[0] as string).includes('Hal')
      );
      expect(tentativeWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should ignore target transcript for unknown language', async () => {
      mockService.translateFile.mockImplementation(async (_file, _opts, callbacks) => {
        callbacks!.onTargetTranscript!({
          type: 'target_transcript_update',
          lang: 'es' as any,
          concluded: [{ text: 'Hola', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        return mockResult;
      });

      await command.translate('test.mp3', { to: 'de' });

      const esWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Hola')
      );
      expect(esWrites).toHaveLength(0);
    });

    it('should use readline functions during render', async () => {
      mockService.translateFile.mockImplementation(async (_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({
          type: 'source_transcript_update',
          lang: 'en' as any,
          concluded: [{ text: 'Hi', start_time: 0, end_time: 0.2 }],
          tentative: [],
        });
        return mockResult;
      });

      await command.translate('test.mp3', { to: 'de' });

      expect(mockMoveCursor).toHaveBeenCalled();
      expect(mockClearLine).toHaveBeenCalled();
      expect(mockCursorTo).toHaveBeenCalled();
    });

    it('should call clearTTYDisplay after service resolves', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de' });

      // clearTTYDisplay calls moveCursor with negative lineCount to move up
      const moveCursorCalls = mockMoveCursor.mock.calls;
      const upwardMoves = moveCursorCalls.filter(
        (call: unknown[]) => ((call as number[])[2] ?? 0) < 0
      );
      expect(upwardMoves.length).toBeGreaterThanOrEqual(1);

      // clearTTYDisplay calls clearLine and cursorTo for each line
      expect(mockClearLine).toHaveBeenCalled();
      expect(mockCursorTo).toHaveBeenCalled();
    });

    it('should still return formatted result after TTY display', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      const result = await command.translate('test.mp3', { to: 'de' });

      expect(result).toContain('[source] Hello world');
      expect(result).toContain('[de] Hallo Welt');
    });
  });

  describe('TTY rendering (translateFromStdin)', () => {
    let writeSpy: jest.SpyInstance;

    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      mockMoveCursor.mockReset();
      mockClearLine.mockReset();
      mockCursorTo.mockReset();
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    it('should pass TTY callbacks when stdout is a TTY', async () => {
      mockService.translateStdin.mockResolvedValue(mockResult);

      await command.translateFromStdin({ to: 'de' });

      const callArgs = mockService.translateStdin.mock.calls[0]!;
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[1]).toHaveProperty('onSourceTranscript');
      expect(callArgs[1]).toHaveProperty('onTargetTranscript');
    });

    it('should call clearTTYDisplay after stdin translation completes', async () => {
      mockService.translateStdin.mockResolvedValue(mockResult);

      await command.translateFromStdin({ to: 'de' });

      expect(mockMoveCursor).toHaveBeenCalled();
      expect(mockClearLine).toHaveBeenCalled();
      expect(mockCursorTo).toHaveBeenCalled();
    });

    it('should not pass callbacks when stream is false', async () => {
      mockService.translateStdin.mockResolvedValue(mockResult);

      await command.translateFromStdin({ to: 'de', stream: false });

      const callArgs = mockService.translateStdin.mock.calls[0]!;
      expect(callArgs[1]).toBeUndefined();
    });

    it('should render source and target when callbacks are invoked via stdin', async () => {
      mockService.translateStdin.mockImplementation(async (_opts, callbacks) => {
        callbacks!.onSourceTranscript!({
          type: 'source_transcript_update',
          lang: 'en' as any,
          concluded: [{ text: 'Test', start_time: 0, end_time: 0.3 }],
          tentative: [],
        });
        callbacks!.onTargetTranscript!({
          type: 'target_transcript_update',
          lang: 'de' as any,
          concluded: [{ text: 'Prüfung', start_time: 0, end_time: 0.3 }],
          tentative: [],
        });
        return mockResult;
      });

      await command.translateFromStdin({ to: 'de' });

      const sourceWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('[source]') && (call[0] as string).includes('Test')
      );
      const targetWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('[de]') && (call[0] as string).includes('Prüfung')
      );
      expect(sourceWrites.length).toBeGreaterThanOrEqual(1);
      expect(targetWrites.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('formatResult edge cases', () => {
    it('should omit source line when source text is empty', async () => {
      const emptySourceResult: VoiceSessionResult = {
        sessionId: 'session-789',
        source: {
          lang: 'en',
          text: '',
          segments: [],
        },
        targets: [
          {
            lang: 'de',
            text: 'Hallo',
            segments: [{ text: 'Hallo', start_time: 0, end_time: 0.5 }],
          },
        ],
      };
      mockService.translateFile.mockResolvedValue(emptySourceResult);

      const result = await command.translate('test.mp3', { to: 'de' });

      expect(result).not.toContain('[source]');
      expect(result).toContain('[de] Hallo');
    });

    it('should return only target lines when source text is undefined-like', async () => {
      const noSourceResult: VoiceSessionResult = {
        sessionId: 'session-000',
        source: {
          lang: 'en',
          text: '',
          segments: [],
        },
        targets: [
          {
            lang: 'de',
            text: 'Welt',
            segments: [{ text: 'Welt', start_time: 0, end_time: 0.5 }],
          },
          {
            lang: 'fr',
            text: 'Monde',
            segments: [{ text: 'Monde', start_time: 0, end_time: 0.5 }],
          },
        ],
      };
      mockService.translateFile.mockResolvedValue(noSourceResult);

      const result = await command.translate('test.mp3', { to: 'de,fr' });

      expect(result).toBe('[de] Welt\n[fr] Monde');
    });
  });
});
