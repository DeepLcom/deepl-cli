import ora from 'ora';
import { BatchTranslationService } from '../../../services/batch-translation.js';
import { ValidationError } from '../../../utils/errors.js';
import { Logger } from '../../../utils/logger.js';
import { ExitCode, exitCodeForError } from '../../../utils/exit-codes.js';
import type { HandlerContext, TranslateOptions } from './types.js';
import {
  warnIgnoredOptions,
  validateTranslationLanguages,
  type TranslationLanguageConstraints,
} from './translate-utils.js';
import { buildBaseTranslationOptions } from './translation-options-factory.js';

/**
 * The constrained flags this mode passes on to the request. `--glossary` is not
 * one of them — directory mode announces it as ignored and resolves no glossary —
 * so a glossary must not fail a directory run the way it fails a text one.
 */
function honouredConstraints(
  options: TranslateOptions
): TranslationLanguageConstraints {
  return {
    from: options.from,
    formality: options.formality,
    modelType: options.modelType,
  };
}

export class DirectoryTranslationHandler {
  constructor(public ctx: HandlerContext) {}

  async translateDirectory(
    dirPath: string,
    options: TranslateOptions
  ): Promise<string> {
    if (!options.output) {
      throw new ValidationError(
        'Output directory is required for batch translation. Use --output <dir>'
      );
    }

    const supported = new Set(['from', 'formality']);
    warnIgnoredOptions('directory', options, supported);

    if (options.to.includes(',')) {
      const targetLangs = options.to.split(',').map((lang) => lang.trim());
      validateTranslationLanguages(targetLangs, honouredConstraints(options));

      const allOutputs: string[] = [];

      for (const lang of targetLangs) {
        const singleOptions = { ...options, to: lang };
        const result = await this.translateSingleTarget(dirPath, singleOptions);
        allOutputs.push(`[${lang}]\n${result}`);
      }

      return allOutputs.join('\n\n');
    }

    return this.translateSingleTarget(dirPath, options);
  }

  private async translateSingleTarget(
    dirPath: string,
    options: TranslateOptions
  ): Promise<string> {
    validateTranslationLanguages([options.to], honouredConstraints(options));

    const translationOptions = buildBaseTranslationOptions(options);

    const spinner = Logger.shouldShowSpinner()
      ? ora('Scanning files...').start()
      : null;

    const controller = new AbortController();
    const onAbort = () => {
      controller.abort();
    };
    process.on('SIGINT', onAbort);

    const batchOptions = {
      outputDir: options.output!,
      recursive: options.recursive !== false,
      pattern: options.pattern,
      abortSignal: controller.signal,
      onProgress: (progress: {
        completed: number;
        total: number;
        current?: string;
      }) => {
        if (spinner) {
          spinner.text = `Translating files: ${progress.completed}/${progress.total}`;
        }
      },
    };

    try {
      if (options.concurrency) {
        this.ctx.batchTranslationService = new BatchTranslationService(
          this.ctx.fileTranslationService,
          {
            concurrency: options.concurrency,
            translationService: this.ctx.translationService,
          }
        );
      }

      const result = await this.ctx.batchTranslationService.translateDirectory(
        dirPath,
        translationOptions,
        batchOptions
      );

      const stats = this.ctx.batchTranslationService.getStatistics(result);

      if (spinner) {
        spinner.succeed(`Translation complete!`);
      }

      const output: string[] = [
        `\nTranslation Statistics:`,
        `  Total files: ${stats.total}`,
        `  ✓ Successful: ${stats.successful}`,
      ];

      if (stats.failed > 0) {
        output.push(`  ✗ Failed: ${stats.failed}`);
        output.push(`\nFailed files:`);
        result.failed.forEach((f) => {
          output.push(`  - ${f.file}: ${f.error}`);
        });
        // Reported in the exit code as well as the summary: a run where nothing
        // translated must not look like success to a script or a CI job, and
        // language validation defers to the API, so a bad --to surfaces here
        // rather than as a local rejection.
        //
        // When one rejection stopped the whole run, its own code is reported
        // instead of the generic failure — a refused `target_lang` is invalid
        // input (6) and an exhausted quota is a quota error (4), which a script
        // can act on differently from a file that happened to fail.
        if (result.requestRejected !== undefined) {
          process.exitCode = exitCodeForError(result.requestRejected);
        } else {
          process.exitCode =
            stats.successful === 0
              ? ExitCode.GeneralError
              : ExitCode.PartialFailure;
        }
      }

      if (stats.skipped > 0) {
        output.push(`  ⊘ Skipped: ${stats.skipped}`);
      }

      return output.join('\n');
    } catch (error) {
      if (spinner) {
        spinner.fail('Translation failed');
      }
      throw error;
    } finally {
      process.removeListener('SIGINT', onAbort);
    }
  }
}
