import { ValidationError } from '../../../utils/errors.js';
import { readStdin } from '../../../utils/read-stdin.js';
import type { TranslateOptions } from './types.js';
import type { TextTranslationHandler } from './text-translation-handler.js';

export class StdinTranslationHandler {
  constructor(private textHandler: TextTranslationHandler) {}

  async translateFromStdin(options: TranslateOptions): Promise<string> {
    const stdin = await readStdin();

    if (!stdin || stdin.trim() === '') {
      throw new ValidationError('No input provided from stdin');
    }

    return this.textHandler.translateText(stdin, options);
  }
}
