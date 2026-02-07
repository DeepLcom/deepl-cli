/**
 * Voice Service
 * Business logic for real-time speech translation using the DeepL Voice API.
 */

import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { extname } from 'path';
import WebSocket from 'ws';
import { VoiceClient } from '../api/voice-client.js';
import { ValidationError, VoiceError } from '../utils/errors.js';
import type {
  VoiceSourceMediaContentType,
  VoiceTranslateOptions,
  VoiceSessionResult,
  VoiceTranscript,
  VoiceStreamCallbacks,
  VoiceSessionTarget,
  VoiceTranscriptSegment,
  VoiceSourceTranscriptUpdate,
  VoiceTargetTranscriptUpdate,
  VoiceTargetLanguage,
} from '../types/voice.js';

const MAX_TARGET_LANGS = 5;
const DEFAULT_CHUNK_SIZE = 6400;
const DEFAULT_CHUNK_INTERVAL = 200;

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

    const contentType = options.contentType ?? this.detectContentType(filePath);
    if (!contentType) {
      throw new ValidationError(
        `Cannot detect audio format for "${filePath}". Use --content-type to specify explicitly.`,
      );
    }

    await stat(filePath); // Verify file exists

    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunkInterval = options.chunkInterval ?? DEFAULT_CHUNK_INTERVAL;

    return this.streamAudio(
      this.readFileInChunks(filePath, chunkSize),
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
    const targetLangs: VoiceSessionTarget[] = options.targetLangs.map((lang) => ({
      lang,
      ...(options.formality && { formality: options.formality }),
      ...(options.glossaryId && { glossary_id: options.glossaryId }),
    }));

    const session = await this.client.createSession({
      source_lang: options.sourceLang,
      target_langs: targetLangs,
      source_media_content_type: options.contentType!,
    });

    return new Promise<VoiceSessionResult>((resolve, reject) => {
      const sourceTranscript: VoiceTranscript = { lang: options.sourceLang ?? 'auto', text: '', segments: [] };
      const targetTranscripts = new Map<string, VoiceTranscript>();

      for (const lang of options.targetLangs) {
        targetTranscripts.set(lang, { lang, text: '', segments: [] });
      }

      const internalCallbacks: VoiceStreamCallbacks = {
        onSourceTranscript: (update: VoiceSourceTranscriptUpdate) => {
          this.accumulateTranscript(sourceTranscript, update.concluded);
          sourceTranscript.lang = update.lang;
          callbacks?.onSourceTranscript?.(update);
        },
        onTargetTranscript: (update: VoiceTargetTranscriptUpdate) => {
          const target = targetTranscripts.get(update.lang);
          if (target) {
            this.accumulateTranscript(target, update.concluded);
          }
          callbacks?.onTargetTranscript?.(update);
        },
        onEndOfSourceTranscript: () => {
          callbacks?.onEndOfSourceTranscript?.();
        },
        onEndOfTargetTranscript: (lang: VoiceTargetLanguage) => {
          callbacks?.onEndOfTargetTranscript?.(lang);
        },
        onEndOfStream: () => {
          callbacks?.onEndOfStream?.();
          ws.close();
          resolve({
            sessionId: session.session_id,
            source: sourceTranscript,
            targets: Array.from(targetTranscripts.values()),
          });
        },
        onError: (error) => {
          callbacks?.onError?.(error);
          ws.close();
          reject(new VoiceError(`Voice streaming error: ${error.message} (${error.code})`));
        },
      };

      const ws = this.client.createWebSocket(session.streaming_url, session.token, internalCallbacks);

      const sigintHandler = () => {
        this.client.sendEndOfSource(ws);
      };
      process.on('SIGINT', sigintHandler);

      ws.on('open', () => {
        void (async () => {
          try {
            for await (const chunk of this.paceChunks(chunks, chunkInterval)) {
              if (ws.readyState !== WebSocket.OPEN) {
                break;
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

      ws.on('close', () => {
        process.removeListener('SIGINT', sigintHandler);
      });

      ws.on('error', (error: Error) => {
        process.removeListener('SIGINT', sigintHandler);
        reject(new VoiceError(`WebSocket connection failed: ${error.message}`));
      });
    });
  }

  private accumulateTranscript(transcript: VoiceTranscript, concluded: VoiceTranscriptSegment[]): void {
    for (const segment of concluded) {
      transcript.segments.push(segment);
      transcript.text += (transcript.text ? ' ' : '') + segment.text;
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
