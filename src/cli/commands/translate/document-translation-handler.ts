import ora from 'ora';
import { Logger } from '../../../utils/logger.js';
import { ValidationError } from '../../../utils/errors.js';
import type { DocumentTranslationOptions } from '../../../types/api.js';
import type { HandlerContext, TranslateOptions } from './types.js';
import { warnIgnoredOptions, validateLanguageCodes, buildTranslationOptions } from './translate-utils.js';

export class DocumentTranslationHandler {
  constructor(public ctx: HandlerContext) {}

  async translateDocument(filePath: string, options: TranslateOptions): Promise<string> {
    if (options.output === '-') {
      throw new ValidationError(
        'Cannot stream binary document translation to stdout. Use --output <file> instead.'
      );
    }

    const supported = new Set(['from', 'formality', 'outputFormat', 'enableMinification']);
    warnIgnoredOptions('document', options, supported);

    validateLanguageCodes([options.to]);

    const outputPath = options.output!;

    const translationOptions = buildTranslationOptions(options);

    if (options.outputFormat) {
      translationOptions.outputFormat = options.outputFormat;
    }

    if (options.enableMinification) {
      translationOptions.enableDocumentMinification = true;
    }

    const spinner = Logger.shouldShowSpinner() ? ora('Uploading document...').start() : null;

    try {
      const result = await this.ctx.documentTranslationService.translateDocument(
        filePath,
        outputPath,
        translationOptions as DocumentTranslationOptions,
        (progress) => {
          if (spinner) {
            if (progress.status === 'queued') {
              spinner.text = 'Document queued for translation...';
            } else if (progress.status === 'translating') {
              const timeText = progress.secondsRemaining
                ? ` (est. ${progress.secondsRemaining}s remaining)`
                : '';
              spinner.text = `Translating document${timeText}...`;
            } else if (progress.status === 'done') {
              spinner.text = 'Downloading translated document...';
            }
          }
        }
      );

      if (spinner) {
        spinner.succeed(`Document translated successfully!`);
      }

      const output: string[] = [
        `Translated ${filePath} -> ${outputPath}`,
      ];

      if (result.billedCharacters) {
        output.push(`Billed characters: ${result.billedCharacters.toLocaleString()}`);
      }

      return output.join('\n');
    } catch (error) {
      if (spinner) {
        spinner.fail('Document translation failed');
      }
      throw error;
    }
  }
}
