/**
 * Voice Command
 * Handles real-time speech translation using DeepL Voice API.
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { VoiceService } from '../../services/voice.js';
import { formatVoiceJson } from '../../utils/formatters.js';
import type {
  VoiceTranslateOptions,
  VoiceSessionResult,
  VoiceStreamCallbacks,
  VoiceTargetLanguage,
  VoiceSourceLanguage,
  VoiceSourceLanguageMode,
  VoiceSourceMediaContentType,
} from '../../types/index.js';
import { ValidationError } from '../../utils/errors.js';
import { Logger } from '../../utils/logger.js';
import { VoicePartialResultError } from '../../services/voice-stream-session.js';

const VALID_VOICE_TARGET_LANGS: ReadonlySet<string> = new Set<VoiceTargetLanguage>([
  'ar','bg','cs','da','de','el','en','en-GB','en-US','es','et','fi','fr',
  'he','hu','id','it','ja','ko','lt','lv','nb','nl','pl','pt','pt-BR','pt-PT',
  'ro','ru','sk','sl','sv','th','tr','uk','vi','zh','zh-HANS','zh-HANT',
]);

const VALID_VOICE_SOURCE_LANGS: ReadonlySet<string> = new Set<VoiceSourceLanguage>([
  'ar','bg','cs','da','de','el','en','es','et','fi','fr','hu','id','it',
  'ja','ko','lt','lv','nb','nl','pl','pt','ro','ru','sk','sl','sv','tr','uk','zh',
]);

const VALID_VOICE_CONTENT_TYPES: ReadonlySet<string> = new Set<VoiceSourceMediaContentType>([
  'audio/auto',
  'audio/pcm;encoding=s16le;rate=8000','audio/pcm;encoding=s16le;rate=16000',
  'audio/pcm;encoding=s16le;rate=44100','audio/pcm;encoding=s16le;rate=48000',
  'audio/opus;container=ogg','audio/opus;container=webm','audio/opus;container=matroska',
  'audio/ogg','audio/ogg;codecs=flac','audio/ogg;codecs=opus',
  'audio/webm','audio/webm;codecs=opus',
  'audio/x-matroska','audio/x-matroska;codecs=aac','audio/x-matroska;codecs=flac',
  'audio/x-matroska;codecs=mp3','audio/x-matroska;codecs=opus',
  'audio/flac','audio/mpeg',
]);

interface VoiceCommandOptions {
  to: string;
  from?: string;
  sourceLanguageMode?: string;
  formality?: string;
  glossary?: string;
  contentType?: string;
  chunkSize?: number;
  chunkInterval?: number;
  stream?: boolean;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  format?: string;
}

export class VoiceCommand {
  private voiceService: VoiceService;

  constructor(voiceService: VoiceService) {
    this.voiceService = voiceService;
  }

  async translate(filePath: string, options: VoiceCommandOptions): Promise<string> {
    const translateOptions = this.buildOptions(options);
    const isTTY = process.stdout.isTTY && options.stream !== false;

    let callbacks: VoiceStreamCallbacks | undefined;
    if (isTTY) {
      callbacks = this.createTTYCallbacks(translateOptions.targetLangs, translateOptions.maxReconnectAttempts);
    }

    const sigintHandler = () => { this.voiceService.cancel(); };
    process.on('SIGINT', sigintHandler);

    try {
      const result = await this.voiceService.translateFile(filePath, translateOptions, callbacks);

      if (isTTY) {
        this.clearTTYDisplay(translateOptions.targetLangs.length);
      }

      return this.formatResult(result, options.format);
    } catch (error) {
      this.reportPartialResult(
        error,
        translateOptions.targetLangs.length,
        isTTY,
        options.format,
      );
      throw error;
    } finally {
      process.removeListener('SIGINT', sigintHandler);
    }
  }

  async translateFromStdin(options: VoiceCommandOptions): Promise<string> {
    const translateOptions = this.buildOptions(options);
    const isTTY = process.stdout.isTTY && options.stream !== false;

    let callbacks: VoiceStreamCallbacks | undefined;
    if (isTTY) {
      callbacks = this.createTTYCallbacks(translateOptions.targetLangs, translateOptions.maxReconnectAttempts);
    }

    const sigintHandler = () => { this.voiceService.cancel(); };
    process.on('SIGINT', sigintHandler);

    try {
      const result = await this.voiceService.translateStdin(translateOptions, callbacks);

      if (isTTY) {
        this.clearTTYDisplay(translateOptions.targetLangs.length);
      }

      return this.formatResult(result, options.format);
    } catch (error) {
      this.reportPartialResult(
        error,
        translateOptions.targetLangs.length,
        isTTY,
        options.format,
      );
      throw error;
    } finally {
      process.removeListener('SIGINT', sigintHandler);
    }
  }

  private buildOptions(options: VoiceCommandOptions): VoiceTranslateOptions {
    const targetLangs = options.to.split(',').map((l) => l.trim());

    for (const lang of targetLangs) {
      if (!VALID_VOICE_TARGET_LANGS.has(lang)) {
        throw new ValidationError(
          `Invalid voice target language: "${lang}". Valid codes: ${Array.from(VALID_VOICE_TARGET_LANGS).sort().join(', ')}`,
        );
      }
    }

    if (options.from && !VALID_VOICE_SOURCE_LANGS.has(options.from)) {
      throw new ValidationError(
        `Invalid voice source language: "${options.from}". Valid codes: ${Array.from(VALID_VOICE_SOURCE_LANGS).sort().join(', ')}`,
      );
    }

    if (options.contentType && !VALID_VOICE_CONTENT_TYPES.has(options.contentType)) {
      throw new ValidationError(
        `Invalid voice content type: "${options.contentType}". Valid types: ${Array.from(VALID_VOICE_CONTENT_TYPES).sort().join(', ')}`,
      );
    }

    if (options.glossary && targetLangs.length > 1) {
      process.stderr.write(
        `Warning: --glossary applies a single glossary ID to all target languages. ` +
        `DeepL glossaries are language-pair-specific, so the glossary may not be compatible ` +
        `with all targets (${targetLangs.join(', ')}). ` +
        `Consider translating each target language separately with its own glossary.\n`,
      );
    }

    return {
      targetLangs: targetLangs as VoiceTargetLanguage[],
      sourceLang: options.from as VoiceSourceLanguage | undefined,
      sourceLanguageMode: options.sourceLanguageMode as VoiceSourceLanguageMode | undefined,
      formality: options.formality as VoiceTranslateOptions['formality'],
      glossaryId: options.glossary,
      contentType: options.contentType as VoiceSourceMediaContentType | undefined,
      chunkSize: options.chunkSize,
      chunkInterval: options.chunkInterval,
      reconnect: options.reconnect,
      maxReconnectAttempts: options.maxReconnectAttempts,
    };
  }

  private createTTYCallbacks(targetLangs: VoiceTargetLanguage[], maxReconnectAttempts?: number): VoiceStreamCallbacks {
    const state: Record<string, { concluded: string; tentative: string }> = {};

    // Initialize state for source + each target. Keyed lowercase for the same
    // reason the session is: the server may echo a different canonicalization of
    // a requested code, and an update matching no key renders nothing.
    state['source'] = { concluded: '', tentative: '' };
    for (const lang of targetLangs) {
      state[lang.toLowerCase()] = { concluded: '', tentative: '' };
    }

    const lineCount = 1 + targetLangs.length; // source + targets

    const render = () => {
      // Move cursor up to overwrite previous output
      readline.moveCursor(process.stdout, 0, -lineCount);

      // Render source line
      const src = state['source']!;
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`${chalk.bold('[source]')} ${src.concluded}${chalk.gray(src.tentative)}\n`);

      // Render each target language
      for (const lang of targetLangs) {
        const tgt = state[lang]!;
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`${chalk.bold(`[${lang}]`)} ${tgt.concluded}${chalk.gray(tgt.tentative)}\n`);
      }
    };

    let renderScheduled = false;
    const scheduleRender = () => {
      if (!renderScheduled) {
        renderScheduled = true;
        queueMicrotask(() => {
          renderScheduled = false;
          render();
        });
      }
    };

    // Print initial blank lines
    for (let i = 0; i < lineCount; i++) {
      process.stdout.write('\n');
    }

    const maxAttempts = maxReconnectAttempts ?? 3;

    return {
      onReconnecting: (attempt: number) => {
        process.stdout.write(chalk.yellow(`[reconnecting ${attempt}/${maxAttempts}...]\n`));
      },
      onSourceTranscript: (update) => {
        const src = state['source']!;
        const concludedText = update.concluded.map((s) => s.text).join(' ');
        if (concludedText) {
          src.concluded += (src.concluded ? ' ' : '') + concludedText;
        }
        src.tentative = update.tentative.map((s) => s.text).join(' ');
        if (src.tentative) {
          src.tentative = ' ' + src.tentative;
        }
        scheduleRender();
      },
      onTargetTranscript: (update) => {
        const tgt = state[update.language.toLowerCase()];
        if (!tgt) return;
        const concludedText = update.concluded.map((s) => s.text).join(' ');
        if (concludedText) {
          tgt.concluded += (tgt.concluded ? ' ' : '') + concludedText;
        }
        tgt.tentative = update.tentative.map((s) => s.text).join(' ');
        if (tgt.tentative) {
          tgt.tentative = ' ' + tgt.tentative;
        }
        scheduleRender();
      },
    };
  }

  private clearTTYDisplay(targetCount: number): void {
    const lineCount = 1 + targetCount;
    readline.moveCursor(process.stdout, 0, -lineCount);
    for (let i = 0; i < lineCount; i++) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      if (i < lineCount - 1) {
        readline.moveCursor(process.stdout, 0, 1);
      }
    }
    readline.moveCursor(process.stdout, 0, -(lineCount - 1));
  }

  /**
   * Print what a failed session did produce. The audio is transcribed and billed
   * before a missing translation is noticed, so discarding the transcripts would
   * cost another stream to see them. Written to stderr, so a partial result is
   * never mistaken for the command's output.
   */
  private reportPartialResult(
    error: unknown,
    targetCount: number,
    isTTY: boolean,
    format?: string,
  ): void {
    if (!(error instanceof VoicePartialResultError)) {
      return;
    }
    const salvaged = this.formatResult(error.result, format);
    if (salvaged.trim() === '') {
      return;
    }
    if (isTTY) {
      this.clearTTYDisplay(targetCount);
    }
    // Logger.error, not warn: warnings are suppressed under --quiet, and erasing
    // the live display without reprinting would leave the user with nothing for
    // audio that has already been transcribed and billed.
    Logger.error(chalk.yellow('Partial result before the session failed:'));
    Logger.error(salvaged);
  }

  private formatResult(result: VoiceSessionResult, format?: string): string {
    if (format === 'json') {
      return formatVoiceJson(result);
    }

    const lines: string[] = [];

    if (result.source.text) {
      lines.push(`[source] ${result.source.text}`);
    }

    for (const target of result.targets) {
      lines.push(`[${target.lang}] ${target.text}`);
    }

    return lines.join('\n');
  }
}
