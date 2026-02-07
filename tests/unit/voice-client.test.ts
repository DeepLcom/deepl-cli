/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for VoiceClient
 * Covers REST session creation and WebSocket message handling.
 */

import { VoiceClient } from '../../src/api/voice-client.js';
import { VoiceError } from '../../src/utils/errors.js';
import axios from 'axios';
import type {
  VoiceSessionRequest,
  VoiceSessionResponse,
  VoiceStreamCallbacks,
} from '../../src/types/voice.js';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock ws
jest.mock('ws', () => {
  const EventEmitter = require('events');
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    _readyState = 1;
    send = jest.fn();
    close = jest.fn();
    constructor() {
      super();
    }
    get readyState() {
      return this._readyState;
    }
    set readyState(val: number) {
      this._readyState = val;
    }
  }
  return { default: MockWebSocket, __esModule: true };
});

describe('VoiceClient', () => {
  let client: VoiceClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAxiosInstance = {
      request: jest.fn(),
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false);

    client = new VoiceClient('test-api-key');
  });

  describe('constructor', () => {
    it('should create a VoiceClient instance', () => {
      expect(client).toBeInstanceOf(VoiceClient);
    });

    it('should throw error for empty API key', () => {
      expect(() => new VoiceClient('')).toThrow('API key is required');
    });

    it('should use Pro API URL by default', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.deepl.com',
        }),
      );
    });

    it('should allow baseUrl override', () => {
      new VoiceClient('test-key', { baseUrl: 'https://custom.example.com' });
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom.example.com',
        }),
      );
    });
  });

  describe('createSession()', () => {
    const mockRequest: VoiceSessionRequest = {
      target_langs: [{ lang: 'de' }],
      source_media_content_type: 'audio/mpeg',
    };

    const mockResponse: VoiceSessionResponse = {
      streaming_url: 'wss://voice.deepl.com/ws/123',
      token: 'test-token-abc',
      session_id: 'session-123',
    };

    it('should create a session successfully', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {},
      });

      const result = await client.createSession(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v3/voice/realtime',
        }),
      );
    });

    it('should throw VoiceError on 403', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 403, data: { message: 'Forbidden' }, headers: {} },
        message: 'Forbidden',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.createSession(mockRequest)).rejects.toThrow(VoiceError);
    });

    it('should throw VoiceError on 400', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: { message: 'Invalid request' }, headers: {} },
        message: 'Bad request',
      };
      mockAxiosInstance.request.mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.createSession(mockRequest)).rejects.toThrow(VoiceError);
    });

    it('should include source_lang when provided', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {},
      });

      const reqWithSource: VoiceSessionRequest = {
        ...mockRequest,
        source_lang: 'en',
      };

      await client.createSession(reqWithSource);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source_lang: 'en',
          }),
        }),
      );
    });

    it('should include multiple target languages', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {},
      });

      const multiTargetRequest: VoiceSessionRequest = {
        target_langs: [
          { lang: 'de' },
          { lang: 'fr' },
          { lang: 'es' },
        ],
        source_media_content_type: 'audio/mpeg',
      };

      await client.createSession(multiTargetRequest);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            target_langs: expect.arrayContaining([
              expect.objectContaining({ lang: 'de' }),
              expect.objectContaining({ lang: 'fr' }),
              expect.objectContaining({ lang: 'es' }),
            ]),
          }),
        }),
      );
    });
  });

  describe('createWebSocket()', () => {
    it('should create a WebSocket and route messages', () => {
      const callbacks: VoiceStreamCallbacks = {
        onSourceTranscript: jest.fn(),
        onTargetTranscript: jest.fn(),
        onEndOfSourceTranscript: jest.fn(),
        onEndOfTargetTranscript: jest.fn(),
        onEndOfStream: jest.fn(),
        onError: jest.fn(),
      };

      const ws = client.createWebSocket('wss://voice.deepl.com/ws/123', 'token', callbacks);
      expect(ws).toBeDefined();
    });

    it('should dispatch source_transcript_update messages', () => {
      const onSourceTranscript = jest.fn();
      const ws = client.createWebSocket('wss://test', 'token', { onSourceTranscript });

      const message = JSON.stringify({
        type: 'source_transcript_update',
        lang: 'en',
        concluded: [{ text: 'Hello', start_time: 0, end_time: 1 }],
        tentative: [],
      });

      ws.emit('message', Buffer.from(message));
      expect(onSourceTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'source_transcript_update',
          lang: 'en',
        }),
      );
    });

    it('should dispatch target_transcript_update messages', () => {
      const onTargetTranscript = jest.fn();
      const ws = client.createWebSocket('wss://test', 'token', { onTargetTranscript });

      const message = JSON.stringify({
        type: 'target_transcript_update',
        lang: 'de',
        concluded: [{ text: 'Hallo', start_time: 0, end_time: 1 }],
        tentative: [],
      });

      ws.emit('message', Buffer.from(message));
      expect(onTargetTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'target_transcript_update',
          lang: 'de',
        }),
      );
    });

    it('should dispatch end_of_stream messages', () => {
      const onEndOfStream = jest.fn();
      const ws = client.createWebSocket('wss://test', 'token', { onEndOfStream });

      ws.emit('message', Buffer.from(JSON.stringify({ type: 'end_of_stream' })));
      expect(onEndOfStream).toHaveBeenCalled();
    });

    it('should dispatch end_of_source_transcript messages', () => {
      const onEndOfSourceTranscript = jest.fn();
      const ws = client.createWebSocket('wss://test', 'token', { onEndOfSourceTranscript });

      ws.emit('message', Buffer.from(JSON.stringify({ type: 'end_of_source_transcript' })));
      expect(onEndOfSourceTranscript).toHaveBeenCalled();
    });

    it('should dispatch end_of_target_transcript messages', () => {
      const onEndOfTargetTranscript = jest.fn();
      const ws = client.createWebSocket('wss://test', 'token', { onEndOfTargetTranscript });

      ws.emit('message', Buffer.from(JSON.stringify({ type: 'end_of_target_transcript', lang: 'de' })));
      expect(onEndOfTargetTranscript).toHaveBeenCalledWith('de');
    });

    it('should dispatch error messages', () => {
      const onError = jest.fn();
      const ws = client.createWebSocket('wss://test', 'token', { onError });

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'error',
        code: 'invalid_audio',
        message: 'Invalid audio format',
      })));
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          code: 'invalid_audio',
        }),
      );
    });

    it('should handle WebSocket errors via callback', () => {
      const onError = jest.fn();
      const ws = client.createWebSocket('wss://test', 'token', { onError });

      ws.emit('error', new Error('Connection failed'));
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          code: 'websocket_error',
          message: 'Connection failed',
        }),
      );
    });

    it('should ignore unparseable messages', () => {
      const onError = jest.fn();
      const ws = client.createWebSocket('wss://test', 'token', { onError });

      ws.emit('message', Buffer.from('not json'));
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('sendAudioChunk()', () => {
    it('should send base64 audio chunk', () => {
      const ws = client.createWebSocket('wss://test', 'token', {});
      client.sendAudioChunk(ws, 'dGVzdA==');
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'audio_chunk', data: 'dGVzdA==' }),
      );
    });

    it('should not send if WebSocket is not open', () => {
      const ws = client.createWebSocket('wss://test', 'token', {});
      (ws as any).readyState = 3; // CLOSED
      client.sendAudioChunk(ws, 'dGVzdA==');
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('sendEndOfSource()', () => {
    it('should send end_of_source_media message', () => {
      const ws = client.createWebSocket('wss://test', 'token', {});
      client.sendEndOfSource(ws);
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'end_of_source_media' }),
      );
    });

    it('should not send if WebSocket is not open', () => {
      const ws = client.createWebSocket('wss://test', 'token', {});
      (ws as any).readyState = 3; // CLOSED
      client.sendEndOfSource(ws);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
