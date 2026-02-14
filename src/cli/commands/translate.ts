import * as fs from 'fs';
import { TranslationService } from '../../services/translation.js';
import { FileTranslationService } from '../../services/file-translation.js';
import { BatchTranslationService } from '../../services/batch-translation.js';
import { DocumentTranslationService } from '../../services/document-translation.js';
import { GlossaryService } from '../../services/glossary.js';
import { ConfigService } from '../../storage/config.js';
import { ValidationError } from '../../utils/errors.js';
import { isFilePath } from './translate/translate-utils.js';
import { TextTranslationHandler } from './translate/text-translation-handler.js';
import { FileTranslationHandler } from './translate/file-translation-handler.js';
import { DirectoryTranslationHandler } from './translate/directory-translation-handler.js';
import { DocumentTranslationHandler } from './translate/document-translation-handler.js';
import { StdinTranslationHandler } from './translate/stdin-translation-handler.js';
import type { HandlerContext, TranslateOptions } from './translate/types.js';

export type { TranslateOptions } from './translate/types.js';

export class TranslateCommand {
  public ctx: HandlerContext;
  public textHandler: TextTranslationHandler;
  public fileHandler: FileTranslationHandler;
  public directoryHandler: DirectoryTranslationHandler;
  public stdinHandler: StdinTranslationHandler;

  constructor(
    translationService: TranslationService,
    documentTranslationService: DocumentTranslationService,
    glossaryService: GlossaryService,
    config: ConfigService
  ) {
    const fileTranslationService = new FileTranslationService(translationService);
    const batchTranslationService = new BatchTranslationService(
      fileTranslationService,
      { concurrency: 5, translationService }
    );

    this.ctx = {
      translationService,
      fileTranslationService,
      documentTranslationService,
      batchTranslationService,
      glossaryService,
      config,
    };

    const documentHandler = new DocumentTranslationHandler(this.ctx);
    this.textHandler = new TextTranslationHandler(this.ctx);
    this.fileHandler = new FileTranslationHandler(this.ctx, documentHandler);
    this.directoryHandler = new DirectoryTranslationHandler(this.ctx);
    this.stdinHandler = new StdinTranslationHandler(this.textHandler);
  }

  async translate(textOrPath: string, options: TranslateOptions): Promise<string> {
    if (options.to) {
      options.to = options.to.toLowerCase();
    }
    if (options.from) {
      options.from = options.from.toLowerCase();
    }

    let stats: fs.Stats | null = null;
    try {
      const lstat = fs.lstatSync(textOrPath);
      if (lstat.isSymbolicLink()) {
        throw new ValidationError(`Symlinks are not supported for security reasons: ${textOrPath}`);
      }

      stats = fs.statSync(textOrPath);
      if (stats.isDirectory()) {
        return this.directoryHandler.translateDirectory(textOrPath, options);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Symlinks are not supported')) {
        throw error;
      }
    }

    if (isFilePath(textOrPath, stats, this.ctx.fileTranslationService)) {
      return this.fileHandler.translateFile(textOrPath, options, stats);
    }

    return this.textHandler.translateText(textOrPath, options);
  }

  async translateText(text: string, options: TranslateOptions): Promise<string> {
    return this.textHandler.translateText(text, options);
  }

  async translateFromStdin(options: TranslateOptions): Promise<string> {
    return this.stdinHandler.translateFromStdin(options);
  }
}
