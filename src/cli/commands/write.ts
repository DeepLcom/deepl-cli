/**
 * Write Command
 * Handles text improvement operations using DeepL Write API
 */

import { WriteService } from '../../services/write.js';
import { ConfigService } from '../../storage/config.js';
import { WriteLanguage, WritingStyle, WriteTone } from '../../types/index.js';

interface WriteOptions {
  lang: WriteLanguage;
  style?: WritingStyle;
  tone?: WriteTone;
  showAlternatives?: boolean;
}

export class WriteCommand {
  private writeService: WriteService;

  constructor(writeService: WriteService, config: ConfigService) {
    if (!config) {
      throw new Error('Config service is required');
    }
    this.writeService = writeService;
  }

  /**
   * Improve text using DeepL Write API
   */
  async improve(text: string, options: WriteOptions): Promise<string> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    if (!options.lang) {
      throw new Error('Language is required');
    }

    if (options.style && options.tone) {
      throw new Error('Cannot specify both style and tone in a single request');
    }

    const writeOptions: {
      targetLang: WriteLanguage;
      writingStyle?: WritingStyle;
      tone?: WriteTone;
    } = {
      targetLang: options.lang,
    };

    if (options.style) {
      writeOptions.writingStyle = options.style;
    }

    if (options.tone) {
      writeOptions.tone = options.tone;
    }

    if (options.showAlternatives) {
      const improvements = await this.writeService.improve(text, writeOptions);
      return this.formatAlternatives(improvements.map(i => i.text));
    }

    const improvement = await this.writeService.getBestImprovement(text, writeOptions);
    return improvement.text;
  }

  /**
   * Format alternatives with numbering
   */
  private formatAlternatives(alternatives: string[]): string {
    return alternatives.map((alt, index) => `${index + 1}. ${alt}`).join('\n\n');
  }
}
