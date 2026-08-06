import * as fs from 'fs';
import * as path from 'path';
import { Language } from '../../../types/index.js';
import { ValidationError } from '../../../utils/errors.js';
import { atomicWriteFileSync } from '../../../utils/atomic-write.js';
import { Logger } from '../../../utils/logger.js';
import { safeReadFileSync } from '../../../utils/safe-read-file.js';
import type { HandlerContext, TranslateOptions } from './types.js';
import {
  validateTranslationLanguages,
  isTextBasedFile,
  isStructuredFile,
  getFileSize,
  resolveFileOutputPath,
  SAFE_TEXT_SIZE_LIMIT,
} from './translate-utils.js';
import {
  buildBaseTranslationOptions,
  applySharedTmAndGlossary,
} from './translation-options-factory.js';
import { applyGlossarySourceLang } from '../../../utils/glossary-params.js';
import type { DocumentTranslationHandler } from './document-translation-handler.js';

export class FileTranslationHandler {
  constructor(
    public ctx: HandlerContext,
    public documentHandler: DocumentTranslationHandler
  ) {}

  async translateFile(
    filePath: string,
    options: TranslateOptions,
    cachedStats?: fs.Stats | null
  ): Promise<string> {
    const requestedOutput = options.output;
    if (!requestedOutput) {
      throw new ValidationError(
        'Output file path is required for file translation. Use --output <path>'
      );
    }

    const stdoutMode = requestedOutput === '-';

    if (options.to.includes(',') && stdoutMode) {
      throw new ValidationError(
        'Cannot use --output - with multiple target languages. Use a directory path instead.'
      );
    }

    if (options.to.includes(',')) {
      const targetLangs = options.to.split(',').map((lang) => lang.trim());
      validateTranslationLanguages(targetLangs, options);

      const validTargetLangs = targetLangs as Language[];

      applyGlossarySourceLang(
        options,
        this.ctx.config.getValue<string>('defaults.sourceLang'),
        'Example: deepl translate --from en --to en,fr,es --glossary my-glossary file.txt'
      );

      if (options.translationMemory) {
        if (!options.from) {
          throw new ValidationError(
            '--from is required when using --translation-memory',
            'Example: deepl translate --from en --to en,fr,es --translation-memory my-tm file.txt'
          );
        }
        if (options.modelType && options.modelType !== 'quality_optimized') {
          throw new ValidationError(
            '--translation-memory requires quality_optimized model type',
            'Remove --model-type or set --model-type quality_optimized'
          );
        }
      }

      const translationOptions = {
        ...buildBaseTranslationOptions(options),
        outputDir: options.output,
      };

      await applySharedTmAndGlossary(translationOptions, options, {
        glossaryService: this.ctx.glossaryService,
        translationService: this.ctx.translationService,
        targets: validTargetLangs,
      });

      const results =
        await this.ctx.fileTranslationService.translateFileToMultiple(
          filePath,
          validTargetLangs,
          translationOptions,
          { skipCache: !options.cache }
        );

      return (
        `Translated ${filePath} to ${validTargetLangs.length} languages:\n` +
        results.map((r) => `  [${r.targetLang}] ${r.outputPath}`).join('\n')
      );
    }

    let useTextTranslation = false;
    let oversizeWarning: string | null = null;

    if (isTextBasedFile(filePath)) {
      const fileSize = cachedStats ? cachedStats.size : getFileSize(filePath);

      if (fileSize === null) {
        throw new ValidationError(
          `File not found or cannot be accessed: ${filePath}`
        );
      }

      if (fileSize <= SAFE_TEXT_SIZE_LIMIT) {
        useTextTranslation = true;
      } else if (
        this.ctx.documentTranslationService.isDocumentSupported(filePath)
      ) {
        const fileSizeKiB = (fileSize / 1024).toFixed(1);
        oversizeWarning = `⚠ File exceeds 100 KiB limit for cached translation (${fileSizeKiB} KiB), using document API instead`;
      }
    }

    const useDocumentApi =
      !useTextTranslation &&
      this.ctx.documentTranslationService.isDocumentSupported(filePath);

    // Resolved once, ahead of every branch below: each of them writes to
    // options.output, so deciding this per branch is what let a directory
    // destination reach the write unnoticed.
    const outputPath = resolveFileOutputPath(
      filePath,
      requestedOutput,
      options.to,
      useDocumentApi ? options.outputFormat : undefined
    );
    options = { ...options, output: outputPath };

    if (useTextTranslation) {
      return this.translateTextFile(filePath, options);
    }

    if (oversizeWarning) {
      Logger.warn(oversizeWarning);
      const result = await this.documentHandler.translateDocument(
        filePath,
        options
      );
      return `${oversizeWarning}\n${result}`;
    }

    if (useDocumentApi) {
      return this.documentHandler.translateDocument(filePath, options);
    }

    // This path resolves no glossary, so the glossary arm is left out: rejecting
    // over a flag the request never carries would refuse a run that works.
    validateTranslationLanguages([options.to], {
      from: options.from,
      formality: options.formality,
      modelType: options.modelType,
    });

    const translationOptions = buildBaseTranslationOptions(options);

    await this.ctx.fileTranslationService.translateFile(
      filePath,
      outputPath,
      translationOptions,
      { preserveCode: options.preserveCode }
    );

    return `Translated ${filePath} -> ${outputPath}`;
  }

  async translateTextFile(
    filePath: string,
    options: TranslateOptions
  ): Promise<string> {
    validateTranslationLanguages([options.to], options);

    applyGlossarySourceLang(
      options,
      this.ctx.config.getValue<string>('defaults.sourceLang'),
      'Example: deepl translate --from en --to es --glossary my-glossary file.txt'
    );

    if (options.translationMemory) {
      if (!options.from) {
        throw new ValidationError(
          '--from is required when using --translation-memory',
          'Example: deepl translate --from en --to de --translation-memory my-tm file.txt'
        );
      }
      if (options.modelType && options.modelType !== 'quality_optimized') {
        throw new ValidationError(
          '--translation-memory requires quality_optimized model type',
          'Remove --model-type or set --model-type quality_optimized'
        );
      }
    }

    const tmCache = new Map<string, string>();

    if (isStructuredFile(filePath)) {
      if (options.output === '-') {
        throw new ValidationError(
          'Cannot stream structured file (JSON/YAML) translation to stdout. Use --output <file> instead.'
        );
      }

      const translationOptions = buildBaseTranslationOptions(options);
      await applySharedTmAndGlossary(translationOptions, options, {
        glossaryService: this.ctx.glossaryService,
        translationService: this.ctx.translationService,
        targets: [options.to as Language],
        tmCache,
      });

      await this.ctx.fileTranslationService.translateFile(
        filePath,
        options.output!,
        translationOptions,
        { preserveCode: options.preserveCode, skipCache: !options.cache }
      );

      return `Translated ${filePath} -> ${options.output}`;
    }

    const content = safeReadFileSync(filePath, 'utf-8');

    const translationOptions = buildBaseTranslationOptions(options);
    await applySharedTmAndGlossary(translationOptions, options, {
      glossaryService: this.ctx.glossaryService,
      translationService: this.ctx.translationService,
      targets: [options.to as Language],
      tmCache,
    });

    const result = await this.ctx.translationService.translate(
      content,
      translationOptions,
      {
        preserveCode: options.preserveCode,
        skipCache: !options.cache,
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

    atomicWriteFileSync(options.output!, result.text, 'utf-8');

    return `Translated ${filePath} -> ${options.output}`;
  }
}
