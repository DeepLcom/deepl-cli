/**
 * Voice Service
 * Business logic for real-time speech translation using the DeepL Voice API.
 */

import { createReadStream } from 'fs';
import { lstat } from 'fs/promises';
import { extname, resolve } from 'path';
import { VoiceClient } from '../api/voice-client.js';
import { ValidationError } from '../utils/errors.js';
import { VoiceStreamSession } from './voice-stream-session.js';
import type {
  VoiceSourceMediaContentType,
  VoiceTranslateOptions,
  VoiceSessionResult,
  VoiceStreamCallbacks,
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
  private activeSession: VoiceStreamSession | null = null;

  constructor(client: VoiceClient) {
    if (!client) {
      throw new Error('VoiceClient is required');
    }
    this.client = client;
  }

  cancel(): void {
    this.activeSession?.cancel();
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
      contentType,
      options,
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
      options.contentType,
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
    contentType: VoiceSourceMediaContentType,
    options: VoiceTranslateOptions,
    chunkInterval: number,
    callbacks?: VoiceStreamCallbacks,
  ): Promise<VoiceSessionResult> {
    const session = await this.client.createSession({
      source_language: options.sourceLang,
      source_language_mode: options.sourceLanguageMode,
      target_languages: options.targetLangs,
      source_media_content_type: contentType,
      formality: options.formality,
      glossary_id: options.glossaryId,
    });

    const streamSession = new VoiceStreamSession(this.client, session, options, callbacks);
    this.activeSession = streamSession;
    try {
      return await streamSession.run(this.paceChunks(chunks, chunkInterval));
    } finally {
      this.activeSession = null;
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
