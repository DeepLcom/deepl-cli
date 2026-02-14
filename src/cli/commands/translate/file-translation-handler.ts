import * as fs from 'fs';
import * as path from 'path';
import { Language } from '../../../types/index.js';
import { ValidationError } from '../../../utils/errors.js';
import { Logger } from '../../../utils/logger.js';
import { safeReadFileSync } from '../../../utils/safe-read-file.js';
import type { HandlerContext, TranslateOptions } from './types.js';
import {
  validateLanguageCodes,
  buildTranslationOptions,
  resolveGlossaryId,
  isTextBasedFile,
  isStructuredFile,
  getFileSize,
  SAFE_TEXT_SIZE_LIMIT,
} from './translate-utils.js';
import type { DocumentTranslationHandler } from './document-translation-handler.js';

export class FileTranslationHandler {
  constructor(public ctx: HandlerContext, public documentHandler: DocumentTranslationHandler) {}

  async translateFile(filePath: string, options: TranslateOptions, cachedStats?: fs.Stats | null): Promise<string> {
    if (!options.output) {
      throw new ValidationError('Output file path is required for file translation. Use --output <path>');
    }

    const stdoutMode = options.output === '-';

    if (options.to.includes(',') && stdoutMode) {
      throw new ValidationError('Cannot use --output - with multiple target languages. Use a directory path instead.');
    }

    if (options.to.includes(',')) {
      const targetLangs = options.to.split(',').map(lang => lang.trim());
      validateLanguageCodes(targetLangs);

      const validTargetLangs = targetLangs as Language[];

      const translationOptions = {
        ...buildTranslationOptions(options),
        outputDir: options.output,
      };

      const results = await this.ctx.fileTranslationService.translateFileToMultiple(
        filePath,
        validTargetLangs,
        translationOptions
      );

      return `Translated ${filePath} to ${validTargetLangs.length} languages:\n` +
        results.map(r => `  [${r.targetLang}] ${r.outputPath}`).join('\n');
    }

    if (isTextBasedFile(filePath)) {
      let fileSize: number | null;
      if (cachedStats) {
        fileSize = cachedStats.size;
      } else {
        fileSize = getFileSize(filePath);
      }

      if (fileSize === null) {
        throw new ValidationError(`File not found or cannot be accessed: ${filePath}`);
      }

      if (fileSize <= SAFE_TEXT_SIZE_LIMIT) {
        return this.translateTextFile(filePath, options);
      } else if (this.ctx.documentTranslationService.isDocumentSupported(filePath)) {
        const fileSizeKiB = (fileSize / 1024).toFixed(1);
        const warning = `⚠ File exceeds 100 KiB limit for cached translation (${fileSizeKiB} KiB), using document API instead`;
        Logger.warn(warning);
        const result = await this.documentHandler.translateDocument(filePath, options);
        return `${warning}\n${result}`;
      }
    }

    if (this.ctx.documentTranslationService.isDocumentSupported(filePath)) {
      return this.documentHandler.translateDocument(filePath, options);
    }

    validateLanguageCodes([options.to]);

    const translationOptions = buildTranslationOptions(options);

    await this.ctx.fileTranslationService.translateFile(
      filePath,
      options.output,
      translationOptions,
      { preserveCode: options.preserveCode }
    );

    return `Translated ${filePath} -> ${options.output}`;
  }

  async translateTextFile(filePath: string, options: TranslateOptions): Promise<string> {
    validateLanguageCodes([options.to]);

    if (options.glossary && !options.from) {
      throw new ValidationError(
        'Source language (--from) is required when using a glossary',
        'Example: deepl translate --from en --to es --glossary my-glossary file.txt'
      );
    }

    if (isStructuredFile(filePath)) {
      if (options.output === '-') {
        throw new ValidationError('Cannot stream structured file (JSON/YAML) translation to stdout. Use --output <file> instead.');
      }

      const translationOptions = buildTranslationOptions(options);

      if (options.glossary) {
        translationOptions.glossaryId = await resolveGlossaryId(this.ctx.glossaryService, options.glossary);
      }

      await this.ctx.fileTranslationService.translateFile(
        filePath,
        options.output!,
        translationOptions,
        { preserveCode: options.preserveCode }
      );

      return `Translated ${filePath} -> ${options.output}`;
    }

    const content = safeReadFileSync(filePath, 'utf-8');

    const translationOptions = buildTranslationOptions(options);

    if (options.glossary) {
      translationOptions.glossaryId = await resolveGlossaryId(this.ctx.glossaryService, options.glossary);
    }

    const result = await this.ctx.translationService.translate(
      content,
      translationOptions,
      {
        preserveCode: options.preserveCode,
        skipCache: !options.cache
      }
    );

    if (options.output === '-') {
      process.stdout.write(result.text);
      return '';
    }

    const outputDir = path.dirname(options.output!);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(options.output!, result.text, 'utf-8');

    return `Translated ${filePath} -> ${options.output}`;
  }
}
