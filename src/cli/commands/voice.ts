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
  VoiceSourceMediaContentType,
} from '../../types/voice.js';

interface VoiceCommandOptions {
  to: string;
  from?: string;
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

    const result = await this.voiceService.translateFile(filePath, translateOptions, callbacks);

    if (isTTY) {
      // Clear the live display lines
      this.clearTTYDisplay(translateOptions.targetLangs.length);
    }

    return this.formatResult(result, options.format);
  }

  async translateFromStdin(options: VoiceCommandOptions): Promise<string> {
    const translateOptions = this.buildOptions(options);
    const isTTY = process.stdout.isTTY && options.stream !== false;

    let callbacks: VoiceStreamCallbacks | undefined;
    if (isTTY) {
      callbacks = this.createTTYCallbacks(translateOptions.targetLangs, translateOptions.maxReconnectAttempts);
    }

    const result = await this.voiceService.translateStdin(translateOptions, callbacks);

    if (isTTY) {
      this.clearTTYDisplay(translateOptions.targetLangs.length);
    }

    return this.formatResult(result, options.format);
  }

  private buildOptions(options: VoiceCommandOptions): VoiceTranslateOptions {
    const targetLangs = options.to.split(',').map((l) => l.trim()) as VoiceTargetLanguage[];

    return {
      targetLangs,
      sourceLang: options.from as VoiceTranslateOptions['sourceLang'],
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

    // Initialize state for source + each target
    state['source'] = { concluded: '', tentative: '' };
    for (const lang of targetLangs) {
      state[lang] = { concluded: '', tentative: '' };
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
        render();
      },
      onTargetTranscript: (update) => {
        const tgt = state[update.lang];
        if (!tgt) return;
        const concludedText = update.concluded.map((s) => s.text).join(' ');
        if (concludedText) {
          tgt.concluded += (tgt.concluded ? ' ' : '') + concludedText;
        }
        tgt.tentative = update.tentative.map((s) => s.text).join(' ');
        if (tgt.tentative) {
          tgt.tentative = ' ' + tgt.tentative;
        }
        render();
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
