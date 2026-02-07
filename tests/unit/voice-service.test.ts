/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for VoiceService
 * Covers content type detection, validation, chunking, and transcript accumulation.
 */

import { VoiceService } from '../../src/services/voice.js';
import { VoiceClient } from '../../src/api/voice-client.js';
import { ValidationError, VoiceError } from '../../src/utils/errors.js';
import type { VoiceTranslateOptions } from '../../src/types/voice.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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

describe('VoiceService', () => {
  let service: VoiceService;
  let mockClient: jest.Mocked<VoiceClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      createSession: jest.fn(),
      createWebSocket: jest.fn(),
      sendAudioChunk: jest.fn(),
      sendEndOfSource: jest.fn(),
    } as unknown as jest.Mocked<VoiceClient>;

    service = new VoiceService(mockClient);
  });

  describe('constructor', () => {
    it('should create a VoiceService instance', () => {
      expect(service).toBeInstanceOf(VoiceService);
    });

    it('should throw error if client is not provided', () => {
      expect(() => new VoiceService(null as unknown as VoiceClient)).toThrow();
    });
  });

  describe('detectContentType()', () => {
    it('should detect .ogg as opus/ogg', () => {
      expect(service.detectContentType('audio.ogg')).toBe('audio/opus;container=ogg');
    });

    it('should detect .opus as opus/ogg', () => {
      expect(service.detectContentType('audio.opus')).toBe('audio/opus;container=ogg');
    });

    it('should detect .webm as opus/webm', () => {
      expect(service.detectContentType('audio.webm')).toBe('audio/opus;container=webm');
    });

    it('should detect .mka as opus/matroska', () => {
      expect(service.detectContentType('audio.mka')).toBe('audio/opus;container=matroska');
    });

    it('should detect .flac as audio/flac', () => {
      expect(service.detectContentType('recording.flac')).toBe('audio/flac');
    });

    it('should detect .mp3 as audio/mpeg', () => {
      expect(service.detectContentType('song.mp3')).toBe('audio/mpeg');
    });

    it('should detect .pcm as PCM 16kHz', () => {
      expect(service.detectContentType('raw.pcm')).toBe('audio/pcm;encoding=s16le;rate=16000');
    });

    it('should detect .raw as PCM 16kHz', () => {
      expect(service.detectContentType('raw.raw')).toBe('audio/pcm;encoding=s16le;rate=16000');
    });

    it('should return undefined for unknown extensions', () => {
      expect(service.detectContentType('file.wav')).toBeUndefined();
    });

    it('should return undefined for files without extension', () => {
      expect(service.detectContentType('audio')).toBeUndefined();
    });

    it('should handle uppercase extensions via extname', () => {
      // extname('audio.OGG') returns '.OGG', and toLowerCase() handles it
      expect(service.detectContentType('audio.OGG')).toBe('audio/opus;container=ogg');
      expect(service.detectContentType('audio.ogg')).toBe('audio/opus;container=ogg');
    });

    it('should handle paths with directories', () => {
      expect(service.detectContentType('/path/to/audio.mp3')).toBe('audio/mpeg');
    });
  });

  describe('validateOptions()', () => {
    it('should accept valid options with one target language', () => {
      expect(() =>
        service.validateOptions({ targetLangs: ['de'] } as VoiceTranslateOptions),
      ).not.toThrow();
    });

    it('should accept valid options with 5 target languages', () => {
      expect(() =>
        service.validateOptions({
          targetLangs: ['de', 'fr', 'es', 'it', 'pt'],
        } as VoiceTranslateOptions),
      ).not.toThrow();
    });

    it('should reject empty target languages', () => {
      expect(() =>
        service.validateOptions({ targetLangs: [] } as VoiceTranslateOptions),
      ).toThrow(ValidationError);
      expect(() =>
        service.validateOptions({ targetLangs: [] } as VoiceTranslateOptions),
      ).toThrow(/at least one target language/i);
    });

    it('should reject undefined target languages', () => {
      expect(() =>
        service.validateOptions({} as VoiceTranslateOptions),
      ).toThrow(ValidationError);
    });

    it('should reject more than 5 target languages', () => {
      expect(() =>
        service.validateOptions({
          targetLangs: ['de', 'fr', 'es', 'it', 'pt', 'ja'],
        } as VoiceTranslateOptions),
      ).toThrow(ValidationError);
      expect(() =>
        service.validateOptions({
          targetLangs: ['de', 'fr', 'es', 'it', 'pt', 'ja'],
        } as VoiceTranslateOptions),
      ).toThrow(/maximum 5/i);
    });
  });

  describe('translateFile()', () => {
    let tmpDir: string;
    let testFile: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-test-'));
      testFile = path.join(tmpDir, 'test.mp3');
      await fs.writeFile(testFile, Buffer.alloc(1024));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('should throw ValidationError for unknown file extension without content-type', async () => {
      const unknownFile = path.join(tmpDir, 'test.wav');
      await fs.writeFile(unknownFile, Buffer.alloc(100));

      await expect(
        service.translateFile(unknownFile, {
          targetLangs: ['de'],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('should accept explicit content-type override', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createSession.mockResolvedValue({
        streaming_url: 'wss://test',
        token: 'token',
        session_id: 'session-1',
      });
      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onEndOfStream?.();
          }, 10);
        }, 0);
        return mockWs;
      });

      const wavFile = path.join(tmpDir, 'test.wav');
      await fs.writeFile(wavFile, Buffer.alloc(100));

      const result = await service.translateFile(wavFile, {
        targetLangs: ['de'],
        contentType: 'audio/pcm;encoding=s16le;rate=16000',
      });

      expect(result.sessionId).toBe('session-1');
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        service.translateFile('/nonexistent/file.mp3', {
          targetLangs: ['de'],
        }),
      ).rejects.toThrow();
    });

    it('should auto-detect content type from extension', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createSession.mockResolvedValue({
        streaming_url: 'wss://test',
        token: 'token',
        session_id: 'session-mp3',
      });
      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onEndOfStream?.();
          }, 10);
        }, 0);
        return mockWs;
      });

      const result = await service.translateFile(testFile, {
        targetLangs: ['de'],
      });

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          source_media_content_type: 'audio/mpeg',
        }),
      );
      expect(result.sessionId).toBe('session-mp3');
    });

    it('should stream audio and accumulate transcripts', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createSession.mockResolvedValue({
        streaming_url: 'wss://test',
        token: 'token',
        session_id: 'session-transcript',
      });
      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onSourceTranscript?.({
              type: 'source_transcript_update',
              lang: 'en',
              concluded: [{ text: 'Hello world', start_time: 0, end_time: 1.5 }],
              tentative: [],
            });
            callbacks.onTargetTranscript?.({
              type: 'target_transcript_update',
              lang: 'de',
              concluded: [{ text: 'Hallo Welt', start_time: 0, end_time: 1.5 }],
              tentative: [],
            });
            callbacks.onEndOfStream?.();
          }, 10);
        }, 0);
        return mockWs;
      });

      const result = await service.translateFile(testFile, {
        targetLangs: ['de'],
        chunkInterval: 0,
      });

      expect(result.source.text).toBe('Hello world');
      expect(result.source.lang).toBe('en');
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.lang).toBe('de');
      expect(result.targets[0]!.text).toBe('Hallo Welt');
    });

    it('should accumulate multiple concluded segments', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createSession.mockResolvedValue({
        streaming_url: 'wss://test',
        token: 'token',
        session_id: 'session-multi',
      });
      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onSourceTranscript?.({
              type: 'source_transcript_update',
              lang: 'en',
              concluded: [{ text: 'Hello', start_time: 0, end_time: 0.5 }],
              tentative: [{ text: 'world', start_time: 0.5, end_time: 1 }],
            });
            callbacks.onSourceTranscript?.({
              type: 'source_transcript_update',
              lang: 'en',
              concluded: [{ text: 'world', start_time: 0.5, end_time: 1 }],
              tentative: [],
            });
            callbacks.onEndOfStream?.();
          }, 10);
        }, 0);
        return mockWs;
      });

      const result = await service.translateFile(testFile, {
        targetLangs: ['de'],
        chunkInterval: 0,
      });

      expect(result.source.text).toBe('Hello world');
      expect(result.source.segments).toHaveLength(2);
    });

    it('should handle multi-target languages', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createSession.mockResolvedValue({
        streaming_url: 'wss://test',
        token: 'token',
        session_id: 'session-multi-target',
      });
      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onTargetTranscript?.({
              type: 'target_transcript_update',
              lang: 'de',
              concluded: [{ text: 'Hallo', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            callbacks.onTargetTranscript?.({
              type: 'target_transcript_update',
              lang: 'fr',
              concluded: [{ text: 'Bonjour', start_time: 0, end_time: 1 }],
              tentative: [],
            });
            callbacks.onEndOfStream?.();
          }, 10);
        }, 0);
        return mockWs;
      });

      const result = await service.translateFile(testFile, {
        targetLangs: ['de', 'fr'],
        chunkInterval: 0,
      });

      expect(result.targets).toHaveLength(2);
      expect(result.targets[0]!.text).toBe('Hallo');
      expect(result.targets[1]!.text).toBe('Bonjour');
    });

    it('should reject on voice streaming error', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createSession.mockResolvedValue({
        streaming_url: 'wss://test',
        token: 'token',
        session_id: 'session-error',
      });
      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => {
            callbacks.onError?.({
              type: 'error',
              code: 'invalid_audio',
              message: 'Invalid audio format',
            });
          }, 10);
        }, 0);
        return mockWs;
      });

      await expect(
        service.translateFile(testFile, {
          targetLangs: ['de'],
          chunkInterval: 0,
        }),
      ).rejects.toThrow(VoiceError);
    });

    it('should pass formality and glossary_id to session request', async () => {
      const EventEmitter = require('events');
      const mockWs = new EventEmitter();
      mockWs.readyState = 1;
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();

      mockClient.createSession.mockResolvedValue({
        streaming_url: 'wss://test',
        token: 'token',
        session_id: 'session-opts',
      });
      mockClient.createWebSocket.mockImplementation((_url, _token, callbacks) => {
        setTimeout(() => {
          mockWs.emit('open');
          setTimeout(() => callbacks.onEndOfStream?.(), 10);
        }, 0);
        return mockWs;
      });

      await service.translateFile(testFile, {
        targetLangs: ['de'],
        formality: 'more',
        glossaryId: 'glossary-123',
        chunkInterval: 0,
      });

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          target_langs: [
            expect.objectContaining({
              lang: 'de',
              formality: 'more',
              glossary_id: 'glossary-123',
            }),
          ],
        }),
      );
    });
  });

  describe('translateStdin()', () => {
    it('should require content-type for stdin', async () => {
      await expect(
        service.translateStdin({
          targetLangs: ['de'],
        }),
      ).rejects.toThrow(ValidationError);
      await expect(
        service.translateStdin({
          targetLangs: ['de'],
        }),
      ).rejects.toThrow(/content type is required/i);
    });

    it('should validate options before streaming', async () => {
      await expect(
        service.translateStdin({
          targetLangs: [],
          contentType: 'audio/mpeg',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
