/**
 * VoiceStreamSession
 * Encapsulates WebSocket session state for real-time voice streaming:
 * reconnection, cancellation, chunk streaming, and transcript accumulation.
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
  VoiceSourceLanguage,
} from '../types/index.js';

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;

/**
 * A session that ended with at least one target untranslated, carrying whatever
 * did arrive. The audio is transcribed and billed by this point, so the partial
 * transcripts travel with the failure rather than being discarded.
 */
export class VoicePartialResultError extends VoiceError {
  constructor(
    message: string,
    suggestion: string,
    readonly result: VoiceSessionResult
  ) {
    super(message, suggestion);
  }
}

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
  private chunkStreamingResolve: (() => void) | null = null;
  private transportError: Error | undefined;
  private chunks: AsyncGenerator<Buffer> | undefined;

  constructor(
    client: VoiceClient,
    session: VoiceSessionResponse,
    options: VoiceTranslateOptions,
    callbacks?: VoiceStreamCallbacks
  ) {
    this.client = client;
    this.session = session;
    this.callbacks = callbacks;

    this.reconnectEnabled = options.reconnect !== false;
    this.maxReconnectAttempts =
      options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.currentToken = session.token;

    this.sourceTranscript = {
      lang: options.sourceLang ?? 'auto',
      text: '',
      segments: [],
    };
    this.textParts.set(this.sourceTranscript, []);

    for (const lang of options.targetLangs) {
      const transcript: VoiceTranscript = { lang, text: '', segments: [] };
      // Keyed lowercase: the requested spellings (zh-HANS, en-GB) are not the
      // only canonicalization the server may echo, and an update that matches no
      // target is dropped, which reads as a missing translation.
      this.targetTranscripts.set(lang.toLowerCase(), transcript);
      this.textParts.set(transcript, []);
    }
  }

  cancel(): void {
    if (!this.streamEnded && this.ws) {
      this.client.sendEndOfSource(this.ws);
    }
  }

  run(chunks: AsyncGenerator<Buffer>): Promise<VoiceSessionResult> {
    this.chunks = chunks;
    return new Promise<VoiceSessionResult>((resolve, reject) => {
      const internalCallbacks = this.createInternalCallbacks(resolve, reject);

      this.ws = this.client.createWebSocket(
        this.session.streaming_url,
        this.session.token,
        internalCallbacks
      );

      this.ws.on('open', () => {
        this.streamChunks(chunks, reject);
      });

      this.attachSocketHandlers(internalCallbacks, reject);
    });
  }

  /**
   * A socket error is recorded rather than acted on: `ws` always follows an
   * error with a close event, and only `handleClose` knows whether a
   * reconnect is still available.
   */
  private attachSocketHandlers(
    internalCallbacks: VoiceStreamCallbacks,
    reject: (reason: unknown) => void
  ): void {
    this.ws.on('close', () => {
      this.handleClose(internalCallbacks, reject);
    });
    this.ws.on('error', (error: Error) => {
      this.transportError = error;
    });
  }

  private createInternalCallbacks(
    resolve: (value: VoiceSessionResult) => void,
    reject: (reason: unknown) => void
  ): VoiceStreamCallbacks {
    return {
      onSourceTranscript: (update: VoiceSourceTranscriptUpdate) => {
        this.accumulateTranscript(this.sourceTranscript, update.concluded);
        const detectedLang =
          update.concluded[0]?.language ?? update.tentative[0]?.language;
        if (detectedLang) {
          this.sourceTranscript.lang = detectedLang as VoiceSourceLanguage;
        }
        this.callbacks?.onSourceTranscript?.(update);
      },
      onTargetTranscript: (update: VoiceTargetTranscriptUpdate) => {
        const target = this.targetTranscripts.get(
          update.language.toLowerCase()
        );
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
        this.ws.close();
        this.closeInput();
        this.finalizeTranscripts();

        const result: VoiceSessionResult = {
          sessionId: this.session.session_id,
          source: this.sourceTranscript,
          targets: Array.from(this.targetTranscripts.values()),
        };

        const untranslated = this.untranslatedTargets();
        if (untranslated.length > 0) {
          this.fail(
            reject,
            new VoicePartialResultError(
              `Voice session ended without a translation for: ${untranslated.join(', ')}.`,
              'The audio was transcribed but the server sent no translated text. Retry the request.',
              result
            )
          );
          return;
        }

        resolve(result);
      },
      onError: (error) => {
        this.callbacks?.onError?.(error);
        this.fail(
          reject,
          new VoiceError(
            `Voice streaming error: ${error.error_message} (${error.error_code})`
          )
        );
      },
    };
  }

  private handleClose(
    internalCallbacks: VoiceStreamCallbacks,
    reject: (reason: unknown) => void
  ): void {
    if (this.streamEnded) {
      return;
    }

    if (
      this.reconnectEnabled &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      this.reconnectAttempts++;
      this.callbacks?.onReconnecting?.(this.reconnectAttempts);

      void this.reconnect(internalCallbacks, reject);
      return;
    }

    this.fail(
      reject,
      this.transportError
        ? new VoiceError(
            `WebSocket connection failed: ${this.transportError.message}`
          )
        : new VoiceError('WebSocket closed unexpectedly')
    );
  }

  private async reconnect(
    internalCallbacks: VoiceStreamCallbacks,
    reject: (reason: unknown) => void
  ): Promise<void> {
    try {
      const reconnectResponse = await this.client.reconnectSession(
        this.currentToken
      );
      this.currentToken = reconnectResponse.token;
      this.transportError = undefined;

      this.ws = this.client.createWebSocket(
        reconnectResponse.streaming_url,
        reconnectResponse.token,
        internalCallbacks
      );

      this.attachSocketHandlers(internalCallbacks, reject);

      this.ws.on('open', () => {
        if (this.chunkStreamingResolve) {
          this.chunkStreamingResolve();
          this.chunkStreamingResolve = null;
        }
      });
    } catch (error) {
      this.fail(
        reject,
        error instanceof Error ? error : new VoiceError(String(error))
      );
    }
  }

  /**
   * Settle the session as failed. Waking the chunk pump and closing the
   * input generator are both required: without them a library consumer's
   * audio source stays suspended at a `yield` forever, holding its fd.
   */
  private fail(reject: (reason: unknown) => void, error: Error): void {
    this.streamEnded = true;
    this.ws.close();
    if (this.chunkStreamingResolve) {
      this.chunkStreamingResolve();
      this.chunkStreamingResolve = null;
    }
    this.closeInput();
    reject(error);
  }

  private closeInput(): void {
    const chunks = this.chunks;
    this.chunks = undefined;
    void chunks?.return(undefined).catch(() => undefined);
  }

  private streamChunks(
    chunks: AsyncGenerator<Buffer>,
    reject: (reason: unknown) => void
  ): void {
    void (async () => {
      try {
        for await (const chunk of chunks) {
          while (this.ws.readyState !== WebSocket.OPEN) {
            if (this.streamEnded) {
              return;
            }
            await new Promise<void>((r) => {
              this.chunkStreamingResolve = r;
            });
          }
          this.client.sendAudioChunk(this.ws, chunk.toString('base64'));
        }
        this.client.sendEndOfSource(this.ws);
      } catch (error) {
        this.fail(
          reject,
          error instanceof Error ? error : new VoiceError(String(error))
        );
      }
    })();
  }

  private accumulateTranscript(
    transcript: VoiceTranscript,
    concluded: VoiceTranscriptSegment[]
  ): void {
    const parts = this.textParts.get(transcript)!;
    for (const segment of concluded) {
      transcript.segments.push(segment);
      parts.push(segment.text);
    }
  }

  /**
   * Target languages the server ended the stream without translating. Audio
   * that contained no speech concludes no source text either and is not
   * treated as a failure; only a transcribed source with a missing
   * translation is, since that output would otherwise look successful.
   */
  private untranslatedTargets(): string[] {
    if (this.sourceTranscript.text.trim() === '') {
      return [];
    }
    return Array.from(this.targetTranscripts.values())
      .filter((transcript) => transcript.text.trim() === '')
      .map((transcript) => transcript.lang);
  }

  private finalizeTranscripts(): void {
    for (const [transcript, parts] of this.textParts) {
      transcript.text = parts.join(' ');
    }
  }
}
