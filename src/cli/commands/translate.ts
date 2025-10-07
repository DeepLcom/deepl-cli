/**
 * Translate Command
 * Handles text translation operations
 */

import { TranslationService } from '../../services/translation.js';
import { ConfigService } from '../../storage/config.js';
import { Language } from '../../types/index.js';

interface TranslateOptions {
  to: string;
  from?: string;
  formality?: string;
  preserveCode?: boolean;
}

export class TranslateCommand {
  private translationService: TranslationService;
  private config: ConfigService;

  constructor(translationService: TranslationService, config: ConfigService) {
    this.translationService = translationService;
    this.config = config;
  }

  /**
   * Translate text
   */
  async translateText(text: string, options: TranslateOptions): Promise<string> {
    // Validate input
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    // Check if API key is set
    const apiKey = this.config.getValue('auth.apiKey') as string | undefined;
    const envKey = process.env['DEEPL_API_KEY'];
    if (!apiKey && !envKey) {
      throw new Error('API key not set. Run: deepl auth set-key <your-api-key>');
    }

    // Check if translating to multiple languages
    if (options.to.includes(',')) {
      return this.translateToMultiple(text, options);
    }

    // Build translation options
    const translationOptions: {
      targetLang: Language;
      sourceLang?: Language;
      formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    } = {
      targetLang: options.to as Language,
    };

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    }

    // Translate
    const result = await this.translationService.translate(
      text,
      translationOptions,
      { preserveCode: options.preserveCode }
    );

    return result.text;
  }

  /**
   * Translate to multiple target languages
   */
  private async translateToMultiple(text: string, options: TranslateOptions): Promise<string> {
    const targetLangs = options.to.split(',').map(lang => lang.trim()) as Language[];

    const translationOptions: {
      sourceLang?: Language;
      formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    } = {};

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    }

    const results = await this.translationService.translateToMultiple(
      text,
      targetLangs,
      translationOptions
    );

    // Format output for multiple languages
    return results
      .map(result => `[${result.targetLang}] ${result.text}`)
      .join('\n');
  }

  /**
   * Translate from stdin
   */
  async translateFromStdin(options: TranslateOptions): Promise<string> {
    // Read from stdin
    const stdin = await this.readStdin();

    if (!stdin || stdin.trim() === '') {
      throw new Error('No input provided from stdin');
    }

    return this.translateText(stdin, options);
  }

  /**
   * Read from stdin
   */
  private async readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';

      process.stdin.setEncoding('utf8');

      process.stdin.on('data', (chunk) => {
        data += chunk;
      });

      process.stdin.on('end', () => {
        resolve(data);
      });

      process.stdin.on('error', (error) => {
        reject(error);
      });
    });
  }
}
