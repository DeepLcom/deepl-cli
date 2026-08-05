import ora from 'ora';
import { Logger } from '../../../utils/logger.js';
import { ValidationError } from '../../../utils/errors.js';
import type { Language } from '../../../types/index.js';
import type { DocumentTranslationOptions } from '../../../types/api.js';
import type { HandlerContext, TranslateOptions } from './types.js';
import {
  warnIgnoredOptions,
  validateTranslationLanguages,
} from './translate-utils.js';
import {
  buildBaseTranslationOptions,
  applyGlossarySelection,
} from './translation-options-factory.js';
import { applyGlossarySourceLang } from '../../../utils/glossary-params.js';

export class DocumentTranslationHandler {
  constructor(public ctx: HandlerContext) {}

  async translateDocument(
    filePath: string,
    options: TranslateOptions
  ): Promise<string> {
    if (options.output === '-') {
      throw new ValidationError(
        'Cannot stream binary document translation to stdout. Use --output <file> instead.'
      );
    }

    const supported = new Set([
      'from',
      'formality',
      'glossary',
      'outputFormat',
      'enableMinification',
    ]);
    warnIgnoredOptions('document', options, supported);
    // Actually ignored, not just announced: leaving them set let shared
    // validation reject a command over a flag this mode has just said it would
    // disregard.
    const {
      modelType: _model,
      tagHandling: _tags,
      tagHandlingVersion: _version,
      ...rest
    } = options;
    options = rest;

    // Documents accept glossaries, so the extended-tier constraint applies here
    // too: checked before the upload rather than left to the API. After the strip
    // above, so the flags this mode discards cannot fail a command it accepts.
    validateTranslationLanguages([options.to], options);

    // The API rejects a document glossary without source_lang: "source_lang has
    // to be specified in order to use a glossary."
    applyGlossarySourceLang(
      options,
      this.ctx.config.getValue<string>('defaults.sourceLang'),
      'Example: deepl translate --from en --to es --glossary my-glossary report.pdf --output report.es.pdf'
    );

    const outputPath = options.output!;

    const translationOptions = buildBaseTranslationOptions(options);

    await applyGlossarySelection(
      translationOptions,
      options,
      this.ctx.glossaryService,
      [options.to as Language]
    );

    if (options.outputFormat) {
      translationOptions.outputFormat = options.outputFormat;
    }

    if (options.enableMinification) {
      translationOptions.enableDocumentMinification = true;
    }

    const spinner = Logger.shouldShowSpinner()
      ? ora('Uploading document...').start()
      : null;

    try {
      const result =
        await this.ctx.documentTranslationService.translateDocument(
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

      const output: string[] = [`Translated ${filePath} -> ${outputPath}`];

      if (result.billedCharacters) {
        output.push(
          `Billed characters: ${result.billedCharacters.toLocaleString()}`
        );
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
