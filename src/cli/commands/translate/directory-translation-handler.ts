import ora from 'ora';
import { BatchTranslationService } from '../../../services/batch-translation.js';
import { ValidationError } from '../../../utils/errors.js';
import { Logger } from '../../../utils/logger.js';
import type { HandlerContext, TranslateOptions } from './types.js';
import { warnIgnoredOptions, validateLanguageCodes, buildTranslationOptions } from './translate-utils.js';

export class DirectoryTranslationHandler {
  constructor(public ctx: HandlerContext) {}

  async translateDirectory(dirPath: string, options: TranslateOptions): Promise<string> {
    if (!options.output) {
      throw new ValidationError('Output directory is required for batch translation. Use --output <dir>');
    }

    const supported = new Set(['from', 'formality']);
    warnIgnoredOptions('directory', options, supported);

    validateLanguageCodes([options.to]);

    const translationOptions = buildTranslationOptions(options);

    const spinner = Logger.shouldShowSpinner() ? ora('Scanning files...').start() : null;

    const controller = new AbortController();
    const onAbort = () => { controller.abort(); };
    process.on('SIGINT', onAbort);

    const batchOptions = {
      outputDir: options.output,
      recursive: options.recursive !== false,
      pattern: options.pattern,
      abortSignal: controller.signal,
      onProgress: (progress: { completed: number; total: number; current?: string }) => {
        if (spinner) {
          spinner.text = `Translating files: ${progress.completed}/${progress.total}`;
        }
      },
    };

    try {
      if (options.concurrency) {
        this.ctx.batchTranslationService = new BatchTranslationService(
          this.ctx.fileTranslationService,
          { concurrency: options.concurrency, translationService: this.ctx.translationService }
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
        result.failed.forEach(f => {
          output.push(`  - ${f.file}: ${f.error}`);
        });
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
