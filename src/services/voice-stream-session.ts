/**
 * VoiceStreamSession
 * Encapsulates WebSocket session state for real-time voice streaming:
 * reconnection, SIGINT handling, chunk streaming, and transcript accumulation.
 */

import WebSocket from 'ws';
import { VoiceClient } from '../api/voice-client.js';
import { VoiceError } from '../utils/errors.js';
import type {
  VoiceTranslateOptions,
  VoiceSessionResponse,
  VoiceSessionResult,
  VoiceTranscript,
  VoiceStreamCallbacks,
  VoiceTranscriptSegment,
  VoiceSourceTranscriptUpdate,
  VoiceTargetTranscriptUpdate,
  VoiceTargetLanguage,
} from '../types/voice.js';

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;

export class VoiceStreamSession {
  private readonly client: VoiceClient;
  private readonly session: VoiceSessionResponse;
  private readonly callbacks: VoiceStreamCallbacks | undefined;

  private readonly reconnectEnabled: boolean;
  private readonly maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private currentToken: string;

  private readonly sourceTranscript: VoiceTranscript;
  private readonly targetTranscripts = new Map<string, VoiceTranscript>();
  private readonly textParts = new Map<VoiceTranscript, string[]>();

  private streamEnded = false;
  private ws!: WebSocket;
  private sigintHandler!: () => void;
  private chunkStreamingResolve: (() => void) | null = null;

  constructor(
    client: VoiceClient,
    session: VoiceSessionResponse,
    options: VoiceTranslateOptions,
    callbacks?: VoiceStreamCallbacks,
  ) {
    this.client = client;
    this.session = session;
    this.callbacks = callbacks;

    this.reconnectEnabled = options.reconnect !== false;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.currentToken = session.token;

    this.sourceTranscript = { lang: options.sourceLang ?? 'auto', text: '', segments: [] };
    this.textParts.set(this.sourceTranscript, []);

    for (const lang of options.targetLangs) {
      const transcript: VoiceTranscript = { lang, text: '', segments: [] };
      this.targetTranscripts.set(lang, transcript);
      this.textParts.set(transcript, []);
    }
  }

  run(chunks: AsyncGenerator<Buffer>): Promise<VoiceSessionResult> {
    return new Promise<VoiceSessionResult>((resolve, reject) => {
      const internalCallbacks = this.createInternalCallbacks(resolve, reject);

      this.ws = this.client.createWebSocket(
        this.session.streaming_url,
        this.session.token,
        internalCallbacks,
      );

      this.sigintHandler = () => { this.client.sendEndOfSource(this.ws); };
      process.on('SIGINT', this.sigintHandler);

      this.ws.on('open', () => {
        this.streamChunks(chunks, reject);
      });

      this.ws.on('close', () => { this.handleClose(internalCallbacks, reject); });
      this.ws.on('error', (error: Error) => { this.handleError(error, reject); });
    });
  }

  private createInternalCallbacks(
    resolve: (value: VoiceSessionResult) => void,
    reject: (reason: unknown) => void,
  ): VoiceStreamCallbacks {
    return {
      onSourceTranscript: (update: VoiceSourceTranscriptUpdate) => {
        this.accumulateTranscript(this.sourceTranscript, update.concluded);
        const detectedLang = update.concluded[0]?.language ?? update.tentative[0]?.language;
        if (detectedLang) {
          this.sourceTranscript.lang = detectedLang;
        }
        this.callbacks?.onSourceTranscript?.(update);
      },
      onTargetTranscript: (update: VoiceTargetTranscriptUpdate) => {
        const target = this.targetTranscripts.get(update.language);
        if (target) {
          this.accumulateTranscript(target, update.concluded);
        }
        this.callbacks?.onTargetTranscript?.(update);
      },
      onEndOfSourceTranscript: () => {
        this.callbacks?.onEndOfSourceTranscript?.();
      },
      onEndOfTargetTranscript: (language: VoiceTargetLanguage) => {
        this.callbacks?.onEndOfTargetTranscript?.(language);
      },
      onEndOfStream: () => {
        this.streamEnded = true;
        this.callbacks?.onEndOfStream?.();
        process.removeListener('SIGINT', this.sigintHandler);
        this.ws.close();
        this.finalizeTranscripts();
        resolve({
          sessionId: this.session.session_id,
          source: this.sourceTranscript,
          targets: Array.from(this.targetTranscripts.values()),
        });
      },
      onError: (error) => {
        this.streamEnded = true;
        this.callbacks?.onError?.(error);
        process.removeListener('SIGINT', this.sigintHandler);
        this.ws.close();
        reject(new VoiceError(`Voice streaming error: ${error.error_message} (${error.error_code})`));
      },
    };
  }

  private handleClose(
    internalCallbacks: VoiceStreamCallbacks,
    reject: (reason: unknown) => void,
  ): void {
    process.removeListener('SIGINT', this.sigintHandler);

    if (this.streamEnded) {
      return;
    }

    if (this.reconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.callbacks?.onReconnecting?.(this.reconnectAttempts);

      void this.reconnect(internalCallbacks, reject);
    } else if (!this.streamEnded) {
      reject(new VoiceError('WebSocket closed unexpectedly'));
    }
  }

  private async reconnect(
    internalCallbacks: VoiceStreamCallbacks,
    reject: (reason: unknown) => void,
  ): Promise<void> {
    try {
      const reconnectResponse = await this.client.reconnectSession(this.currentToken);
      this.currentToken = reconnectResponse.token;

      this.ws = this.client.createWebSocket(
        reconnectResponse.streaming_url,
        reconnectResponse.token,
        internalCallbacks,
      );

      this.sigintHandler = () => { this.client.sendEndOfSource(this.ws); };
      process.on('SIGINT', this.sigintHandler);

      this.ws.on('close', () => { this.handleClose(internalCallbacks, reject); });
      this.ws.on('error', (error: Error) => { this.handleError(error, reject); });

      this.ws.on('open', () => {
        if (this.chunkStreamingResolve) {
          this.chunkStreamingResolve();
          this.chunkStreamingResolve = null;
        }
      });
    } catch (error) {
      reject(error instanceof Error ? error : new VoiceError(String(error)));
    }
  }

  private handleError(error: Error, reject: (reason: unknown) => void): void {
    process.removeListener('SIGINT', this.sigintHandler);
    reject(new VoiceError(`WebSocket connection failed: ${error.message}`));
  }

  private streamChunks(
    chunks: AsyncGenerator<Buffer>,
    reject: (reason: unknown) => void,
  ): void {
    void (async () => {
      try {
        for await (const chunk of chunks) {
          while (this.ws.readyState !== WebSocket.OPEN) {
            if (this.streamEnded) {
              return;
            }
            await new Promise<void>((r) => { this.chunkStreamingResolve = r; });
          }
          this.client.sendAudioChunk(this.ws, chunk.toString('base64'));
        }
        this.client.sendEndOfSource(this.ws);
      } catch (error) {
        this.ws.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  }

  private accumulateTranscript(
    transcript: VoiceTranscript,
    concluded: VoiceTranscriptSegment[],
  ): void {
    const parts = this.textParts.get(transcript)!;
    for (const segment of concluded) {
      transcript.segments.push(segment);
      parts.push(segment.text);
    }
  }

  private finalizeTranscripts(): void {
    for (const [transcript, parts] of this.textParts) {
      transcript.text = parts.join(' ');
    }
  }
}
