/**
 * Voice Service
 * Business logic for real-time speech translation using the DeepL Voice API.
 */

import { createReadStream } from 'fs';
import { lstat } from 'fs/promises';
import { extname, resolve } from 'path';
import WebSocket from 'ws';
import { VoiceClient } from '../api/voice-client.js';
import { ValidationError, VoiceError } from '../utils/errors.js';
import type {
  VoiceSourceMediaContentType,
  VoiceTranslateOptions,
  VoiceSessionResult,
  VoiceTranscript,
  VoiceStreamCallbacks,
  VoiceTranscriptSegment,
  VoiceSourceTranscriptUpdate,
  VoiceTargetTranscriptUpdate,
  VoiceTargetLanguage,
} from '../types/voice.js';

const MAX_TARGET_LANGS = 5;
const DEFAULT_CHUNK_SIZE = 6400;
const DEFAULT_CHUNK_INTERVAL = 200;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;

const EXTENSION_CONTENT_TYPE_MAP: Record<string, VoiceSourceMediaContentType> = {
  '.ogg': 'audio/opus;container=ogg',
  '.opus': 'audio/opus;container=ogg',
  '.webm': 'audio/opus;container=webm',
  '.mka': 'audio/opus;container=matroska',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.pcm': 'audio/pcm;encoding=s16le;rate=16000',
  '.raw': 'audio/pcm;encoding=s16le;rate=16000',
};

export class VoiceService {
  private client: VoiceClient;

  constructor(client: VoiceClient) {
    if (!client) {
      throw new Error('VoiceClient is required');
    }
    this.client = client;
  }

  async translateFile(
    filePath: string,
    options: VoiceTranslateOptions,
    callbacks?: VoiceStreamCallbacks,
  ): Promise<VoiceSessionResult> {
    this.validateOptions(options);

    const resolvedPath = resolve(filePath);
    const contentType = options.contentType ?? this.detectContentType(resolvedPath);
    if (!contentType) {
      throw new ValidationError(
        `Cannot detect audio format for "${resolvedPath}". Use --content-type to specify explicitly.`,
      );
    }

    const fileStat = await lstat(resolvedPath);
    if (fileStat.isSymbolicLink()) {
      throw new ValidationError(
        `Symlinks are not supported for security reasons: ${resolvedPath}`,
      );
    }

    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunkInterval = options.chunkInterval ?? DEFAULT_CHUNK_INTERVAL;

    return this.streamAudio(
      this.readFileInChunks(resolvedPath, chunkSize),
      { ...options, contentType },
      chunkInterval,
      callbacks,
    );
  }

  async translateStdin(
    options: VoiceTranslateOptions,
    callbacks?: VoiceStreamCallbacks,
  ): Promise<VoiceSessionResult> {
    this.validateOptions(options);

    if (!options.contentType) {
      throw new ValidationError(
        'Content type is required when reading from stdin. Use --content-type to specify the audio format.',
      );
    }

    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunkInterval = options.chunkInterval ?? DEFAULT_CHUNK_INTERVAL;

    return this.streamAudio(
      this.readStdinInChunks(chunkSize),
      options,
      chunkInterval,
      callbacks,
    );
  }

  detectContentType(filePath: string): VoiceSourceMediaContentType | undefined {
    const ext = extname(filePath).toLowerCase();
    return EXTENSION_CONTENT_TYPE_MAP[ext];
  }

  validateOptions(options: VoiceTranslateOptions): void {
    if (!options.targetLangs || options.targetLangs.length === 0) {
      throw new ValidationError('At least one target language is required.');
    }

    if (options.targetLangs.length > MAX_TARGET_LANGS) {
      throw new ValidationError(
        `Maximum ${MAX_TARGET_LANGS} target languages allowed, got ${options.targetLangs.length}.`,
      );
    }
  }

  private async streamAudio(
    chunks: AsyncGenerator<Buffer>,
    options: VoiceTranslateOptions,
    chunkInterval: number,
    callbacks?: VoiceStreamCallbacks,
  ): Promise<VoiceSessionResult> {
    const session = await this.client.createSession({
      source_language: options.sourceLang,
      target_languages: options.targetLangs,
      source_media_content_type: options.contentType!,
    });

    const reconnectEnabled = options.reconnect !== false;
    const maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;

    return new Promise<VoiceSessionResult>((resolve, reject) => {
      const sourceTranscript: VoiceTranscript = { lang: options.sourceLang ?? 'auto', text: '', segments: [] };
      const targetTranscripts = new Map<string, VoiceTranscript>();
      const textParts = new Map<VoiceTranscript, string[]>();
      textParts.set(sourceTranscript, []);

      for (const lang of options.targetLangs) {
        const transcript: VoiceTranscript = { lang, text: '', segments: [] };
        targetTranscripts.set(lang, transcript);
        textParts.set(transcript, []);
      }

      let streamEnded = false;
      let reconnectAttempts = 0;
      let currentToken = session.token;
      let ws: WebSocket;
      let sigintHandler: () => void;
      let chunkStreamingResolve: (() => void) | null = null;

      const internalCallbacks: VoiceStreamCallbacks = {
        onSourceTranscript: (update: VoiceSourceTranscriptUpdate) => {
          this.accumulateTranscript(sourceTranscript, update.concluded, textParts);
          const detectedLang = update.concluded[0]?.language ?? update.tentative[0]?.language;
          if (detectedLang) {
            sourceTranscript.lang = detectedLang;
          }
          callbacks?.onSourceTranscript?.(update);
        },
        onTargetTranscript: (update: VoiceTargetTranscriptUpdate) => {
          const target = targetTranscripts.get(update.language);
          if (target) {
            this.accumulateTranscript(target, update.concluded, textParts);
          }
          callbacks?.onTargetTranscript?.(update);
        },
        onEndOfSourceTranscript: () => {
          callbacks?.onEndOfSourceTranscript?.();
        },
        onEndOfTargetTranscript: (language: VoiceTargetLanguage) => {
          callbacks?.onEndOfTargetTranscript?.(language);
        },
        onEndOfStream: () => {
          streamEnded = true;
          callbacks?.onEndOfStream?.();
          process.removeListener('SIGINT', sigintHandler);
          ws.close();
          for (const [transcript, parts] of textParts) {
            transcript.text = parts.join(' ');
          }
          resolve({
            sessionId: session.session_id,
            source: sourceTranscript,
            targets: Array.from(targetTranscripts.values()),
          });
        },
        onError: (error) => {
          streamEnded = true;
          callbacks?.onError?.(error);
          process.removeListener('SIGINT', sigintHandler);
          ws.close();
          reject(new VoiceError(`Voice streaming error: ${error.error_message} (${error.error_code})`));
        },
      };

      const handleClose = () => {
        process.removeListener('SIGINT', sigintHandler);

        if (streamEnded) {
          return;
        }

        if (reconnectEnabled && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          callbacks?.onReconnecting?.(reconnectAttempts);

          void (async () => {
            try {
              const reconnect = await this.client.reconnectSession(currentToken);
              currentToken = reconnect.token;

              ws = this.client.createWebSocket(reconnect.streaming_url, reconnect.token, internalCallbacks);

              sigintHandler = () => { this.client.sendEndOfSource(ws); };
              process.on('SIGINT', sigintHandler);

              ws.on('close', handleClose);
              ws.on('error', handleError);

              ws.on('open', () => {
                if (chunkStreamingResolve) {
                  chunkStreamingResolve();
                  chunkStreamingResolve = null;
                }
              });
            } catch (error) {
              reject(error instanceof Error ? error : new VoiceError(String(error)));
            }
          })();
        } else if (!streamEnded) {
          reject(new VoiceError('WebSocket closed unexpectedly'));
        }
      };

      const handleError = (error: Error) => {
        process.removeListener('SIGINT', sigintHandler);
        reject(new VoiceError(`WebSocket connection failed: ${error.message}`));
      };

      ws = this.client.createWebSocket(session.streaming_url, session.token, internalCallbacks);

      sigintHandler = () => { this.client.sendEndOfSource(ws); };
      process.on('SIGINT', sigintHandler);

      ws.on('open', () => {
        void (async () => {
          try {
            for await (const chunk of this.paceChunks(chunks, chunkInterval)) {
              while (ws.readyState !== WebSocket.OPEN) {
                if (streamEnded) {
                  return;
                }
                await new Promise<void>((r) => { chunkStreamingResolve = r; });
              }
              this.client.sendAudioChunk(ws, chunk.toString('base64'));
            }
            this.client.sendEndOfSource(ws);
          } catch (error) {
            ws.close();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      });

      ws.on('close', handleClose);
      ws.on('error', handleError);
    });
  }

  private accumulateTranscript(
    transcript: VoiceTranscript,
    concluded: VoiceTranscriptSegment[],
    textParts: Map<VoiceTranscript, string[]>,
  ): void {
    const parts = textParts.get(transcript)!;
    for (const segment of concluded) {
      transcript.segments.push(segment);
      parts.push(segment.text);
    }
  }

  private async *readFileInChunks(filePath: string, chunkSize: number): AsyncGenerator<Buffer> {
    const stream = createReadStream(filePath, { highWaterMark: chunkSize });
    for await (const chunk of stream) {
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    }
  }

  private async *readStdinInChunks(chunkSize: number): AsyncGenerator<Buffer> {
    const stdin = process.stdin;
    stdin.resume();

    let buffer = Buffer.alloc(0);

    for await (const data of stdin) {
      buffer = Buffer.concat([buffer, Buffer.isBuffer(data) ? data : Buffer.from(data as string)]);

      while (buffer.length >= chunkSize) {
        yield buffer.subarray(0, chunkSize);
        buffer = buffer.subarray(chunkSize);
      }
    }

    if (buffer.length > 0) {
      yield buffer;
    }
  }

  private async *paceChunks(chunks: AsyncGenerator<Buffer>, intervalMs: number): AsyncGenerator<Buffer> {
    for await (const chunk of chunks) {
      yield chunk;
      if (intervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }
}
