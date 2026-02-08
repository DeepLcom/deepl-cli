/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for VoiceStreamSession
 * Covers WebSocket lifecycle, reconnection, SIGINT handling, chunk streaming,
 * and transcript accumulation directly on the extracted class.
 */

import { VoiceStreamSession } from '../../src/services/voice-stream-session.js';
import { VoiceClient } from '../../src/api/voice-client.js';
import { VoiceError } from '../../src/utils/errors.js';
import type {
  VoiceSessionResponse,
  VoiceTranslateOptions,
  VoiceStreamCallbacks,
} from '../../src/types/voice.js';

jest.mock('ws', () => {
  const EventEmitter = require('events');
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    send = jest.fn();
    close = jest.fn();
  }
  return { default: MockWebSocket, __esModule: true };
});

describe('VoiceStreamSession', () => {
  let mockClient: jest.Mocked<VoiceClient>;
  let session: VoiceSessionResponse;
  let options: VoiceTranslateOptions;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      createSession: jest.fn(),
      createWebSocket: jest.fn(),
      sendAudioChunk: jest.fn(),
      sendEndOfSource: jest.fn(),
      reconnectSession: jest.fn(),
    } as unknown as jest.Mocked<VoiceClient>;

    session = {
      streaming_url: 'wss://test.deepl.com/stream',
      token: 'token-1',
      session_id: 'session-1',
    };

    options = {
      targetLangs: ['de'],
      chunkInterval: 0,
    };
  });

  describe('constructor', () => {
    it('should initialize transcript state for source and targets', () => {
      const streamSession = new VoiceStreamSession(mockClient, session, {
        targetLangs: ['de', 'fr', 'es'],
      });
      expect(streamSession).toBeInstanceOf(VoiceStreamSession);
    });

    it('should use "auto" as default source language', () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => callbacks.onEndOfStream?.(), 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);

      return streamSession.run(emptyChunks()).then((result) => {
        expect(result.source.lang).toBe('auto');
      });
    });

    it('should use provided source language', () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => callbacks.onEndOfStream?.(), 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, {
        ...options,
        sourceLang: 'en',
      });

      return streamSession.run(emptyChunks()).then((result) => {
        expect(result.source.lang).toBe('en');
      });
    });
  });

  describe('run()', () => {
    it('should create WebSocket and stream chunks', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => callbacks.onEndOfStream?.(), 10);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      const result = await streamSession.run(singleChunk(Buffer.from('audio-data')));

      expect(mockClient.createWebSocket).toHaveBeenCalledWith(
        'wss://test.deepl.com/stream',
        'token-1',
        expect.any(Object),
      );
      expect(mockClient.sendAudioChunk).toHaveBeenCalled();
      expect(mockClient.sendEndOfSource).toHaveBeenCalled();
      expect(result.sessionId).toBe('session-1');
    });

    it('should return session result with source and targets', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onSourceTranscript?.({
              concluded: [{ text: 'Hello', language: 'en', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            callbacks.onTargetTranscript?.({
              language: 'de',
              concluded: [{ text: 'Hallo', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            callbacks.onEndOfStream?.();
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      const result = await streamSession.run(emptyChunks());

      expect(result.source.text).toBe('Hello');
      expect(result.source.lang).toBe('en');
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.lang).toBe('de');
      expect(result.targets[0]!.text).toBe('Hallo');
    });

    it('should register and clean up SIGINT handler', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      const listenerCountBefore = process.listenerCount('SIGINT');

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onEndOfStream?.();
            mockWs.emit('close');
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      await streamSession.run(emptyChunks());

      expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore);
    });
  });

  describe('SIGINT handling', () => {
    it('should call sendEndOfSource when SIGINT is received', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            process.emit('SIGINT' as any);
            setTimeout(() => callbacks.onEndOfStream?.(), 5);
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      await streamSession.run(emptyChunks());

      expect(mockClient.sendEndOfSource).toHaveBeenCalledWith(mockWs);
    });
  });

  describe('error handling', () => {
    it('should reject with VoiceError on WebSocket error', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation(() => {
        setTimeout(() => {
          mockWs.emit('error', new Error('Connection refused'));
        }, 5);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);

      await expect(streamSession.run(emptyChunks())).rejects.toThrow(VoiceError);
      await expect(
        new VoiceStreamSession(mockClient, session, options).run(emptyChunks()),
      ).rejects.toThrow(/WebSocket connection failed: Connection refused/);
    });

    it('should reject with VoiceError on voice streaming error callback', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onError?.({
              request_type: 'unknown',
              error_code: 400,
              reason_code: 9040000,
              error_message: 'Invalid audio format',
            });
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      await expect(streamSession.run(emptyChunks())).rejects.toThrow(VoiceError);
    });

    it('should reject when chunk streaming throws', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation(() => {
        setTimeout(() => mockWs.emit('open'), 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      await expect(streamSession.run(throwingChunks())).rejects.toThrow('chunk error');
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('reconnection', () => {
    it('should reconnect on unexpected WebSocket close', async () => {
      const EventEmitter = require('events');
      const onReconnecting = jest.fn();

      const mockWs1 = new EventEmitter();
      mockWs1.readyState = 1;
      mockWs1.send = jest.fn();
      mockWs1.close = jest.fn();

      const mockWs2 = new EventEmitter();
      mockWs2.readyState = 1;
      mockWs2.send = jest.fn();
      mockWs2.close = jest.fn();

      mockClient.reconnectSession.mockResolvedValue({
        streaming_url: 'wss://test-new.deepl.com/stream',
        token: 'token-2',
      });

      let wsCallCount = 0;
      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        wsCallCount++;
        if (wsCallCount === 1) {
          setTimeout(() => {
            mockWs1.emit('open');
            setTimeout(() => {
              mockWs1.readyState = 3;
              mockWs1.emit('close');
            }, 5);
          }, 0);
          return mockWs1;
        } else {
          setTimeout(() => {
            mockWs2.emit('open');
            setTimeout(() => callbacks.onEndOfStream?.(), 5);
          }, 0);
          return mockWs2;
        }
      });

      const streamSession = new VoiceStreamSession(
        mockClient, session, options, { onReconnecting },
      );
      const result = await streamSession.run(emptyChunks());

      expect(result.sessionId).toBe('session-1');
      expect(onReconnecting).toHaveBeenCalledWith(1);
      expect(mockClient.reconnectSession).toHaveBeenCalledWith('token-1');
    });

    it('should reject after max reconnect attempts exhausted', async () => {
      const EventEmitter = require('events');

      let tokenCounter = 1;
      mockClient.reconnectSession.mockImplementation(() => {
        tokenCounter++;
        return Promise.resolve({
          streaming_url: `wss://test-${tokenCounter}.deepl.com/stream`,
          token: `token-${tokenCounter}`,
        });
      });

      mockClient.createWebSocket.mockImplementation(() => {
        const mockWs = new EventEmitter();
        mockWs.readyState = 1;
        mockWs.send = jest.fn();
        mockWs.close = jest.fn();

        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            mockWs.readyState = 3;
            mockWs.emit('close');
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, {
        ...options,
        maxReconnectAttempts: 2,
      });

      await expect(streamSession.run(emptyChunks())).rejects.toThrow(VoiceError);
      await expect(
        new VoiceStreamSession(mockClient, session, {
          ...options,
          maxReconnectAttempts: 2,
        }).run(emptyChunks()),
      ).rejects.toThrow(/WebSocket closed unexpectedly/);
    });

    it('should not reconnect when reconnect option is false', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation(() => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            mockWs.readyState = 3;
            mockWs.emit('close');
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, {
        ...options,
        reconnect: false,
      });

      await expect(streamSession.run(emptyChunks())).rejects.toThrow(VoiceError);
      expect(mockClient.reconnectSession).not.toHaveBeenCalled();
    });

    it('should reject if reconnectSession itself fails', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.reconnectSession.mockRejectedValue(
        new VoiceError('Voice API access denied.'),
      );

      mockClient.createWebSocket.mockImplementation(() => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            mockWs.readyState = 3;
            mockWs.emit('close');
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      await expect(streamSession.run(emptyChunks())).rejects.toThrow(VoiceError);
    });
  });

  describe('transcript accumulation', () => {
    it('should accumulate multiple source transcript updates', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onSourceTranscript?.({
              concluded: [{ text: 'Hello', language: 'en', start_time: 0, end_time: 0.5 }],
              tentative: [],
            });
            callbacks.onSourceTranscript?.({
              concluded: [{ text: 'world', language: 'en', start_time: 0.5, end_time: 1 }],
              tentative: [],
            });
            callbacks.onEndOfStream?.();
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      const result = await streamSession.run(emptyChunks());

      expect(result.source.text).toBe('Hello world');
      expect(result.source.segments).toHaveLength(2);
    });

    it('should accumulate multiple target languages', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onTargetTranscript?.({
              language: 'de',
              concluded: [{ text: 'Hallo', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            callbacks.onTargetTranscript?.({
              language: 'fr',
              concluded: [{ text: 'Bonjour', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            callbacks.onEndOfStream?.();
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, {
        targetLangs: ['de', 'fr'],
      });
      const result = await streamSession.run(emptyChunks());

      expect(result.targets).toHaveLength(2);
      expect(result.targets[0]!.text).toBe('Hallo');
      expect(result.targets[1]!.text).toBe('Bonjour');
    });

    it('should detect source language from concluded segments', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onSourceTranscript?.({
              concluded: [{ text: 'Bonjour', language: 'fr', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            callbacks.onEndOfStream?.();
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options);
      const result = await streamSession.run(emptyChunks());

      expect(result.source.lang).toBe('fr');
    });
  });

  describe('callback proxying', () => {
    it('should proxy all callback types', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      const callbacks: VoiceStreamCallbacks = {
        onSourceTranscript: jest.fn(),
        onTargetTranscript: jest.fn(),
        onEndOfSourceTranscript: jest.fn(),
        onEndOfTargetTranscript: jest.fn(),
        onEndOfStream: jest.fn(),
      };

      mockClient.createWebSocket.mockImplementation((_url, _token, internalCbs) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            internalCbs.onSourceTranscript?.({
              concluded: [{ text: 'Hello', language: 'en', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            internalCbs.onTargetTranscript?.({
              language: 'de',
              concluded: [{ text: 'Hallo', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            internalCbs.onEndOfSourceTranscript?.();
            internalCbs.onEndOfTargetTranscript?.('de');
            internalCbs.onEndOfStream?.();
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(mockClient, session, options, callbacks);
      await streamSession.run(emptyChunks());

      expect(callbacks.onSourceTranscript).toHaveBeenCalledTimes(1);
      expect(callbacks.onTargetTranscript).toHaveBeenCalledTimes(1);
      expect(callbacks.onEndOfSourceTranscript).toHaveBeenCalledTimes(1);
      expect(callbacks.onEndOfTargetTranscript).toHaveBeenCalledWith('de');
      expect(callbacks.onEndOfStream).toHaveBeenCalledTimes(1);
    });

    it('should proxy onError callback', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      const onError = jest.fn();

      mockClient.createWebSocket.mockImplementation((_url, _token, internalCbs) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            internalCbs.onError?.({
              request_type: 'unknown',
              error_code: 400,
              reason_code: 0,
              error_message: 'Bad request',
            });
          }, 5);
        }, 0);
        return mockWs;
      });

      const streamSession = new VoiceStreamSession(
        mockClient, session, options, { onError },
      );

      await expect(streamSession.run(emptyChunks())).rejects.toThrow(VoiceError);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ error_code: 400 }),
      );
    });
  });
});

async function* emptyChunks(): AsyncGenerator<Buffer> {
  // yields nothing
}

// eslint-disable-next-line @typescript-eslint/require-await
async function* singleChunk(data: Buffer): AsyncGenerator<Buffer> {
  yield data;
}

// eslint-disable-next-line @typescript-eslint/require-await, require-yield
async function* throwingChunks(): AsyncGenerator<Buffer> {
  throw new Error('chunk error');
}
