/**
 * Tests for VoiceCommand
 * Covers output formatting, TTY detection, and format options.
 */

// Mock chalk to avoid ESM issues in tests
jest.mock('chalk', () => {
  const mockChalk = {
    bold: (text: string) => text,
    gray: (text: string) => text,
    yellow: (text: string) => text,
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
import { createMockVoiceService } from '../helpers/mock-factories';

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
    mockService = createMockVoiceService();

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

    it('should pass reconnect option when set to false', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de', reconnect: false });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          reconnect: false,
        }),
        undefined,
      );
    });

    it('should pass maxReconnectAttempts option', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de', maxReconnectAttempts: 5 });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          maxReconnectAttempts: 5,
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

  describe('SIGINT handling', () => {
    it('should register SIGINT handler during translate and clean up after', async () => {
      const listenerCountBefore = process.listenerCount('SIGINT');
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de' });

      expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore);
    });

    it('should call cancel on service when SIGINT is received during translate', async () => {
      mockService.translateFile.mockImplementation(() => {
        process.emit('SIGINT' as any);
        return Promise.resolve(mockResult);
      });

      await command.translate('test.mp3', { to: 'de' });

      expect(mockService.cancel).toHaveBeenCalled();
    });

    it('should register SIGINT handler during translateFromStdin and clean up after', async () => {
      const listenerCountBefore = process.listenerCount('SIGINT');
      mockService.translateStdin.mockResolvedValue(mockResult);

      await command.translateFromStdin({ to: 'de' });

      expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore);
    });

    it('should call cancel on service when SIGINT is received during translateFromStdin', async () => {
      mockService.translateStdin.mockImplementation(() => {
        process.emit('SIGINT' as any);
        return Promise.resolve(mockResult);
      });

      await command.translateFromStdin({ to: 'de' });

      expect(mockService.cancel).toHaveBeenCalled();
    });

    it('should clean up SIGINT handler even when translate throws', async () => {
      const listenerCountBefore = process.listenerCount('SIGINT');
      mockService.translateFile.mockRejectedValue(new Error('API error'));

      await expect(command.translate('test.mp3', { to: 'de' })).rejects.toThrow('API error');

      expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore);
    });
  });

  describe('translateFromStdin()', () => {
    it('should call translateStdin on service', async () => {
      mockService.translateStdin.mockResolvedValue(mockResult);

      const result = await command.translateFromStdin({ to: 'de' });

      expect(result).toContain('[de] Hallo Welt');
      expect(mockService.translateStdin).toHaveBeenCalled();
    });

    it('should delegate to service without any stdin size limit', async () => {
      mockService.translateStdin.mockResolvedValue(mockResult);

      await command.translateFromStdin({ to: 'de', contentType: 'audio/mpeg' });

      // Voice stdin delegates directly to VoiceService.translateStdin without
      // any byte-counting or size guard — unlike TranslateCommand.readStdin()
      // which enforces a 128KB (MAX_STDIN_BYTES) limit for text translation.
      // This test documents that the voice path has no such restriction.
      expect(mockService.translateStdin).toHaveBeenCalledWith(
        expect.objectContaining({
          targetLangs: ['de'],
          contentType: 'audio/mpeg',
        }),
        undefined,
      );
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
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({


          concluded: [{ text: 'Hello', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        return Promise.resolve(mockResult);
      });

      await command.translate('test.mp3', { to: 'de' });

      const sourceWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[source]') && call[0].includes('Hello')
      );
      expect(sourceWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should render target transcript when onTargetTranscript is invoked', async () => {
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onTargetTranscript!({
          language: 'de' as any,
          concluded: [{ text: 'Hallo', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        return Promise.resolve(mockResult);
      });

      await command.translate('test.mp3', { to: 'de' });

      const targetWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[de]') && call[0].includes('Hallo')
      );
      expect(targetWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should accumulate concluded text across multiple source updates', async () => {
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({


          concluded: [{ text: 'Hello', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        callbacks!.onSourceTranscript!({


          concluded: [{ text: 'world', start_time: 0.5, end_time: 1.0 }],
          tentative: [],
        });
        return Promise.resolve(mockResult);
      });

      await command.translate('test.mp3', { to: 'de' });

      const accumulatedWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Hello world')
      );
      expect(accumulatedWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should display tentative text in source transcript', async () => {
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({


          concluded: [],
          tentative: [{ text: 'Hel', start_time: 0, end_time: 0.3 }],
        });
        return Promise.resolve(mockResult);
      });

      await command.translate('test.mp3', { to: 'de' });

      const tentativeWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Hel')
      );
      expect(tentativeWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should display tentative text in target transcript', async () => {
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onTargetTranscript!({
          language: 'de' as any,
          concluded: [],
          tentative: [{ text: 'Hal', start_time: 0, end_time: 0.3 }],
        });
        return Promise.resolve(mockResult);
      });

      await command.translate('test.mp3', { to: 'de' });

      const tentativeWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[de]') && call[0].includes('Hal')
      );
      expect(tentativeWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should ignore target transcript for unknown language', async () => {
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onTargetTranscript!({
          language: 'es' as any,
          concluded: [{ text: 'Hola', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        return Promise.resolve(mockResult);
      });

      await command.translate('test.mp3', { to: 'de' });

      const esWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Hola')
      );
      expect(esWrites).toHaveLength(0);
    });

    it('should include onReconnecting callback in TTY mode', async () => {
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        expect(callbacks).toHaveProperty('onReconnecting');
        expect(typeof callbacks!.onReconnecting).toBe('function');
        callbacks!.onReconnecting!(1);
        return Promise.resolve(mockResult);
      });

      await command.translate('test.mp3', { to: 'de' });

      const reconnectWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('reconnecting'),
      );
      expect(reconnectWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should use readline functions during render', async () => {
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({


          concluded: [{ text: 'Hi', start_time: 0, end_time: 0.2 }],
          tentative: [],
        });
        return Promise.resolve(mockResult);
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

  describe('TTY render debouncing', () => {
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

    it('should coalesce multiple synchronous transcript updates into a single render', async () => {
      const multiResult: VoiceSessionResult = {
        sessionId: 'session-debounce',
        source: { lang: 'en', text: 'Hello', segments: [{ text: 'Hello', start_time: 0, end_time: 0.5 }] },
        targets: [
          { lang: 'de', text: 'Hallo', segments: [{ text: 'Hallo', start_time: 0, end_time: 0.5 }] },
          { lang: 'fr', text: 'Bonjour', segments: [{ text: 'Bonjour', start_time: 0, end_time: 0.5 }] },
          { lang: 'es', text: 'Hola', segments: [{ text: 'Hola', start_time: 0, end_time: 0.5 }] },
        ],
      };
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({
          concluded: [{ text: 'Hello', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        callbacks!.onTargetTranscript!({
          language: 'de' as any,
          concluded: [{ text: 'Hallo', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        callbacks!.onTargetTranscript!({
          language: 'fr' as any,
          concluded: [{ text: 'Bonjour', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        callbacks!.onTargetTranscript!({
          language: 'es' as any,
          concluded: [{ text: 'Hola', start_time: 0, end_time: 0.5 }],
          tentative: [],
        });
        return Promise.resolve(multiResult);
      });

      await command.translate('test.mp3', { to: 'de,fr,es' });

      // Count render passes: each render moves cursor up by -lineCount (4 lines for source+3 targets).
      // Without debouncing: 4 callbacks = 4 renders = 4 upward moves of -4
      // With debouncing: 1 coalesced render = 1 upward move of -4 (plus clearTTYDisplay's -4)
      const renderUpMoves = mockMoveCursor.mock.calls.filter(
        (call: unknown[]) => (call as number[])[2] === -4,
      );
      expect(renderUpMoves.length).toBeLessThanOrEqual(2);
    });

    it('should still render all accumulated state in the coalesced render', async () => {
      const multiResult: VoiceSessionResult = {
        sessionId: 'session-debounce-2',
        source: { lang: 'en', text: 'Hi', segments: [{ text: 'Hi', start_time: 0, end_time: 0.3 }] },
        targets: [
          { lang: 'de', text: 'Hallo', segments: [{ text: 'Hallo', start_time: 0, end_time: 0.3 }] },
          { lang: 'fr', text: 'Salut', segments: [{ text: 'Salut', start_time: 0, end_time: 0.3 }] },
        ],
      };
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        callbacks!.onSourceTranscript!({
          concluded: [{ text: 'Hi', start_time: 0, end_time: 0.3 }],
          tentative: [],
        });
        callbacks!.onTargetTranscript!({
          language: 'de' as any,
          concluded: [{ text: 'Hallo', start_time: 0, end_time: 0.3 }],
          tentative: [],
        });
        callbacks!.onTargetTranscript!({
          language: 'fr' as any,
          concluded: [{ text: 'Salut', start_time: 0, end_time: 0.3 }],
          tentative: [],
        });
        return Promise.resolve(multiResult);
      });

      await command.translate('test.mp3', { to: 'de,fr' });

      const sourceWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[source]') && call[0].includes('Hi'),
      );
      const deWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[de]') && call[0].includes('Hallo'),
      );
      const frWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[fr]') && call[0].includes('Salut'),
      );
      expect(sourceWrites.length).toBeGreaterThanOrEqual(1);
      expect(deWrites.length).toBeGreaterThanOrEqual(1);
      expect(frWrites.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow a new render after the debounced render fires', async () => {
      mockService.translateFile.mockImplementation((_file, _opts, callbacks) => {
        return new Promise((resolve) => {
          callbacks!.onSourceTranscript!({
            concluded: [{ text: 'Hello', start_time: 0, end_time: 0.5 }],
            tentative: [],
          });
          callbacks!.onTargetTranscript!({
            language: 'de' as any,
            concluded: [{ text: 'Hallo', start_time: 0, end_time: 0.5 }],
            tentative: [],
          });

          // Let the first debounced render fire, then send more updates
          queueMicrotask(() => {
            queueMicrotask(() => {
              callbacks!.onSourceTranscript!({
                concluded: [{ text: 'world', start_time: 0.5, end_time: 1.0 }],
                tentative: [],
              });
              queueMicrotask(() => {
                resolve(mockResult);
              });
            });
          });
        });
      });

      await command.translate('test.mp3', { to: 'de' });

      const accumulatedWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Hello world'),
      );
      expect(accumulatedWrites.length).toBeGreaterThanOrEqual(1);
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
      mockService.translateStdin.mockImplementation((_opts, callbacks) => {
        callbacks!.onSourceTranscript!({


          concluded: [{ text: 'Test', start_time: 0, end_time: 0.3 }],
          tentative: [],
        });
        callbacks!.onTargetTranscript!({
          language: 'de' as any,
          concluded: [{ text: 'Prüfung', start_time: 0, end_time: 0.3 }],
          tentative: [],
        });
        return Promise.resolve(mockResult);
      });

      await command.translateFromStdin({ to: 'de' });

      const sourceWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[source]') && call[0].includes('Test')
      );
      const targetWrites = writeSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[de]') && call[0].includes('Prüfung')
      );
      expect(sourceWrites.length).toBeGreaterThanOrEqual(1);
      expect(targetWrites.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('glossary with multiple targets warning', () => {
    let stderrSpy: jest.SpyInstance;

    beforeEach(() => {
      stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('should warn on stderr when --glossary is used with multiple target languages', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      await command.translate('test.mp3', { to: 'de,fr', glossary: 'glossary-123' });

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: --glossary applies a single glossary ID to all target languages'),
      );
    });

    it('should mention the target languages in the warning', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      await command.translate('test.mp3', { to: 'de,fr', glossary: 'glossary-123' });

      const warningCall = stderrSpy.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Warning'),
      );
      expect(warningCall).toBeDefined();
      expect(warningCall![0]).toContain('de, fr');
    });

    it('should suggest translating each target separately', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      await command.translate('test.mp3', { to: 'de,fr', glossary: 'glossary-123' });

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Consider translating each target language separately'),
      );
    });

    it('should not warn when --glossary is used with a single target language', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);

      await command.translate('test.mp3', { to: 'de', glossary: 'glossary-123' });

      const warningCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Warning'),
      );
      expect(warningCalls).toHaveLength(0);
    });

    it('should not warn when no --glossary is provided with multiple targets', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      await command.translate('test.mp3', { to: 'de,fr' });

      const warningCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Warning'),
      );
      expect(warningCalls).toHaveLength(0);
    });

    it('should warn for translateFromStdin too when glossary + multiple targets', async () => {
      mockService.translateStdin.mockResolvedValue(multiTargetResult);

      await command.translateFromStdin({ to: 'de,fr', glossary: 'glossary-123' });

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: --glossary applies a single glossary ID to all target languages'),
      );
    });

    it('should still pass glossaryId through to the service despite the warning', async () => {
      mockService.translateFile.mockResolvedValue(multiTargetResult);

      await command.translate('test.mp3', { to: 'de,fr', glossary: 'glossary-123' });

      expect(mockService.translateFile).toHaveBeenCalledWith(
        'test.mp3',
        expect.objectContaining({
          glossaryId: 'glossary-123',
        }),
        undefined,
      );
    });
  });

  describe('language code validation', () => {
    it('should reject invalid target language code', async () => {
      await expect(command.translate('test.mp3', { to: 'zz' })).rejects.toThrow(
        /Invalid voice target language.*"zz"/,
      );
    });

    it('should reject when one of multiple target languages is invalid', async () => {
      await expect(command.translate('test.mp3', { to: 'de,xyz' })).rejects.toThrow(
        /Invalid voice target language.*"xyz"/,
      );
    });

    it('should list valid target languages in error message', async () => {
      await expect(command.translate('test.mp3', { to: 'zz' })).rejects.toThrow(
        /Valid codes:/,
      );
    });

    it('should accept valid target language codes', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);
      await expect(command.translate('test.mp3', { to: 'de' })).resolves.toBeDefined();
    });

    it('should accept regional target language variants', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);
      await expect(command.translate('test.mp3', { to: 'en-GB' })).resolves.toBeDefined();
      await expect(command.translate('test.mp3', { to: 'pt-BR' })).resolves.toBeDefined();
    });

    it('should reject invalid source language code', async () => {
      await expect(
        command.translate('test.mp3', { to: 'de', from: 'zz' }),
      ).rejects.toThrow(/Invalid voice source language.*"zz"/);
    });

    it('should accept valid source language code', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);
      await expect(
        command.translate('test.mp3', { to: 'de', from: 'en' }),
      ).resolves.toBeDefined();
    });

    it('should reject invalid content type', async () => {
      await expect(
        command.translate('test.mp3', { to: 'de', contentType: 'audio/wav' }),
      ).rejects.toThrow(/Invalid voice content type.*"audio\/wav"/);
    });

    it('should accept valid content type', async () => {
      mockService.translateFile.mockResolvedValue(mockResult);
      await expect(
        command.translate('test.mp3', { to: 'de', contentType: 'audio/mpeg' }),
      ).resolves.toBeDefined();
    });

    it('should validate language codes for translateFromStdin too', async () => {
      await expect(command.translateFromStdin({ to: 'invalid' })).rejects.toThrow(
        /Invalid voice target language/,
      );
    });

    it('should reject target language codes that are only valid as source', async () => {
      // en-GB is target-only, but check that source-only codes don't leak
      // All source codes are a subset of target codes in current data,
      // but en-GB/en-US/pt-BR/pt-PT are target-only
      await expect(
        command.translate('test.mp3', { to: 'de', from: 'en-GB' }),
      ).rejects.toThrow(/Invalid voice source language.*"en-GB"/);
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
