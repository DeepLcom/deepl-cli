/**
 * Voice API Client
 * Handles REST session creation and WebSocket streaming for the DeepL Voice API.
 * Voice API always uses the Pro URL (api.deepl.com).
 */

import WebSocket from 'ws';
import { HttpClient, type DeepLClientOptions } from './http-client.js';
import type {
  VoiceSessionRequest,
  VoiceSessionResponse,
  VoiceServerMessage,
  VoiceStreamCallbacks,
} from '../types/voice.js';
import { VoiceError } from '../utils/errors.js';

const PRO_API_URL = 'https://api.deepl.com';

export class VoiceClient extends HttpClient {
  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    super(apiKey, { ...options, baseUrl: options.baseUrl ?? PRO_API_URL });
  }

  async createSession(request: VoiceSessionRequest): Promise<VoiceSessionResponse> {
    try {
      return await this.makeJsonRequest<VoiceSessionResponse>(
        'POST',
        '/v3/voice/realtime',
        request as unknown as Record<string, unknown>,
      );
    } catch (error) {
      throw this.handleVoiceError(error);
    }
  }

  createWebSocket(streamingUrl: string, token: string, callbacks: VoiceStreamCallbacks): WebSocket {
    const url = `${streamingUrl}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const text = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf-8');
        const message = JSON.parse(text) as VoiceServerMessage;
        this.dispatchMessage(message, callbacks);
      } catch {
        // Ignore unparseable messages
      }
    });

    ws.on('error', (error: Error) => {
      callbacks.onError?.({
        type: 'error',
        code: 'websocket_error',
        message: error.message,
      });
    });

    return ws;
  }

  sendAudioChunk(ws: WebSocket, base64Data: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'audio_chunk', data: base64Data }));
    }
  }

  sendEndOfSource(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end_of_source_media' }));
    }
  }

  private dispatchMessage(message: VoiceServerMessage, callbacks: VoiceStreamCallbacks): void {
    switch (message.type) {
      case 'source_transcript_update':
        callbacks.onSourceTranscript?.(message);
        break;
      case 'target_transcript_update':
        callbacks.onTargetTranscript?.(message);
        break;
      case 'end_of_source_transcript':
        callbacks.onEndOfSourceTranscript?.();
        break;
      case 'end_of_target_transcript':
        callbacks.onEndOfTargetTranscript?.(message.lang);
        break;
      case 'end_of_stream':
        callbacks.onEndOfStream?.();
        break;
      case 'error':
        callbacks.onError?.(message);
        break;
    }
  }

  private handleVoiceError(error: unknown): Error {
    const baseError = this.handleError(error);

    if (this.isAxiosError(error)) {
      const status = error.response?.status;
      const responseData = error.response?.data as { message?: string } | undefined;

      if (status === 403) {
        return new VoiceError(
          'Voice API access denied. Your plan may not include Voice API access.',
          'The Voice API requires a DeepL Pro or Enterprise plan. Visit https://www.deepl.com/pro to upgrade.',
        );
      }

      if (status === 400) {
        return new VoiceError(
          `Voice session creation failed: ${responseData?.message ?? 'Bad request'}`,
        );
      }
    }

    return baseError;
  }
}
