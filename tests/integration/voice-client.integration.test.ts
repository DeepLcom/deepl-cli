/**
 * Integration Tests for Voice API Client (REST endpoints)
 * Tests HTTP request/response handling with mocked DeepL Voice API using nock.
 * WebSocket streaming is tested separately in unit tests.
 */

import nock from 'nock';
import { VoiceClient } from '../../src/api/voice-client.js';
import { DEEPL_PRO_API_URL } from '../helpers';

describe('VoiceClient Integration', () => {
  const API_KEY = 'test-voice-key:fx';
  const PRO_URL = DEEPL_PRO_API_URL;

  afterEach(() => {
    nock.cleanAll();
  });

  describe('createSession()', () => {
    it('should POST session request and parse response', async () => {
      const client = new VoiceClient(API_KEY);

      const scope = nock(PRO_URL)
        .post('/v3/voice/realtime', (body) => {
          expect(body.target_languages).toEqual(['de', 'fr']);
          expect(body.source_media_content_type).toBe('audio/ogg');
          return true;
        })
        .reply(200, {
          session_id: 'sess-123',
          streaming_url: 'wss://stream.deepl.com/v3/voice/realtime/sess-123',
          token: 'token-abc',
          expires_at: '2024-07-01T10:00:00Z',
        });

      const session = await client.createSession({
        target_languages: ['de', 'fr'],
        source_media_content_type: 'audio/ogg',
      });

      expect(session.session_id).toBe('sess-123');
      expect(session.streaming_url).toContain('wss://');
      expect(session.token).toBe('token-abc');
      expect(scope.isDone()).toBe(true);
    });

    it('should include optional source_language', async () => {
      const client = new VoiceClient(API_KEY);

      const scope = nock(PRO_URL)
        .post('/v3/voice/realtime', (body) => {
          expect(body.source_language).toBe('en');
          return true;
        })
        .reply(200, {
          session_id: 'sess-456',
          streaming_url: 'wss://stream.deepl.com/v3/voice/realtime/sess-456',
          token: 'token-def',
          expires_at: '2024-07-01T10:00:00Z',
        });

      await client.createSession({
        target_languages: ['de'],
        source_media_content_type: 'audio/ogg',
        source_language: 'en',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should include optional formality', async () => {
      const client = new VoiceClient(API_KEY);

      const scope = nock(PRO_URL)
        .post('/v3/voice/realtime', (body) => {
          expect(body.formality).toBe('more');
          return true;
        })
        .reply(200, {
          session_id: 'sess-789',
          streaming_url: 'wss://stream.deepl.com/v3/voice/realtime/sess-789',
          token: 'token-ghi',
          expires_at: '2024-07-01T10:00:00Z',
        });

      await client.createSession({
        target_languages: ['de'],
        source_media_content_type: 'audio/ogg',
        formality: 'more',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should include optional glossary_id', async () => {
      const client = new VoiceClient(API_KEY);

      const scope = nock(PRO_URL)
        .post('/v3/voice/realtime', (body) => {
          expect(body.glossary_id).toBe('gloss-123');
          return true;
        })
        .reply(200, {
          session_id: 'sess-gl',
          streaming_url: 'wss://stream.deepl.com/v3/voice/realtime/sess-gl',
          token: 'token-gl',
          expires_at: '2024-07-01T10:00:00Z',
        });

      await client.createSession({
        target_languages: ['de'],
        source_media_content_type: 'audio/ogg',
        glossary_id: 'gloss-123',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should handle 403 access denied with VoiceError', async () => {
      const client = new VoiceClient(API_KEY);

      nock(PRO_URL)
        .post('/v3/voice/realtime')
        .reply(403, { message: 'Voice API not available' });

      await expect(
        client.createSession({
          target_languages: ['de'],
          source_media_content_type: 'audio/ogg',
        })
      ).rejects.toThrow(/Voice API access denied|Authentication failed/);
    });

    it('should handle 400 bad request', async () => {
      const client = new VoiceClient(API_KEY);

      nock(PRO_URL)
        .post('/v3/voice/realtime')
        .reply(400, { message: 'Invalid content type' });

      await expect(
        client.createSession({
          target_languages: ['de'],
          source_media_content_type: 'audio/ogg',
        })
      ).rejects.toThrow();
    });

    it('should use Pro API URL by default', async () => {
      const client = new VoiceClient(API_KEY);

      const scope = nock(PRO_URL)
        .post('/v3/voice/realtime')
        .reply(200, {
          session_id: 'sess-pro',
          streaming_url: 'wss://stream.deepl.com/v3/voice/realtime/sess-pro',
          token: 'token-pro',
          expires_at: '2024-07-01T10:00:00Z',
        });

      await client.createSession({
        target_languages: ['de'],
        source_media_content_type: 'audio/ogg',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should use correct Authorization header', async () => {
      const client = new VoiceClient(API_KEY);

      const scope = nock(PRO_URL, {
        reqheaders: {
          'authorization': `DeepL-Auth-Key ${API_KEY}`,
        },
      })
        .post('/v3/voice/realtime')
        .reply(200, {
          session_id: 'sess-auth',
          streaming_url: 'wss://stream.deepl.com/v3/voice/realtime/sess-auth',
          token: 'token-auth',
          expires_at: '2024-07-01T10:00:00Z',
        });

      await client.createSession({
        target_languages: ['de'],
        source_media_content_type: 'audio/ogg',
      });

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('reconnectSession()', () => {
    it('should GET with token query parameter', async () => {
      const client = new VoiceClient(API_KEY);

      const scope = nock(PRO_URL)
        .get('/v3/voice/realtime')
        .query({ token: 'reconnect-token' })
        .reply(200, {
          streaming_url: 'wss://stream.deepl.com/v3/voice/realtime/sess-reconnect',
          token: 'new-token',
        });

      const response = await client.reconnectSession('reconnect-token');

      expect(response.streaming_url).toContain('wss://');
      expect(response.token).toBe('new-token');
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 403 on expired session', async () => {
      const client = new VoiceClient(API_KEY);

      nock(PRO_URL)
        .get('/v3/voice/realtime')
        .query({ token: 'expired-token' })
        .reply(403, { message: 'Session expired' });

      await expect(
        client.reconnectSession('expired-token')
      ).rejects.toThrow(/Voice API access denied|Authentication failed/);
    });
  });

  describe('URL validation', () => {
    it('should reject non-wss streaming URLs', () => {
      const client = new VoiceClient(API_KEY);

      expect(() =>
        client.createWebSocket('ws://evil.com/stream', 'token', {})
      ).toThrow('scheme must be wss://');
    });

    it('should reject non-deepl.com hostnames', () => {
      const client = new VoiceClient(API_KEY);

      expect(() =>
        client.createWebSocket('wss://evil.com/stream', 'token', {})
      ).toThrow('hostname must be under deepl.com');
    });

    it('should reject unparseable URLs', () => {
      const client = new VoiceClient(API_KEY);

      expect(() =>
        client.createWebSocket('not-a-url', 'token', {})
      ).toThrow('Invalid streaming URL');
    });
  });
});
