/**
 * Translate Command
 * Handles text translation operations
 */

import * as fs from 'fs';
import ora from 'ora';
import { TranslationService } from '../../services/translation.js';
import { FileTranslationService } from '../../services/file-translation.js';
import { BatchTranslationService } from '../../services/batch-translation.js';
import { DocumentTranslationService } from '../../services/document-translation.js';
import { GlossaryService } from '../../services/glossary.js';
import { ConfigService } from '../../storage/config.js';
import { Language } from '../../types/index.js';
import { formatTranslationJson, formatMultiTranslationJson } from '../../utils/formatters.js';
import { Logger } from '../../utils/logger.js';

interface TranslateOptions {
  to: string;
  from?: string;
  formality?: string;
  outputFormat?: string;
  preserveCode?: boolean;
  preserveFormatting?: boolean;
  context?: string;
  splitSentences?: string;
  tagHandling?: string;
  modelType?: string;
  showBilledCharacters?: boolean;
  output?: string;
  recursive?: boolean;
  pattern?: string;
  concurrency?: number;
  glossary?: string;
  noCache?: boolean;
  format?: string;
}

export class TranslateCommand {
  private translationService: TranslationService;
  private fileTranslationService: FileTranslationService;
  private documentTranslationService: DocumentTranslationService;
  private batchTranslationService: BatchTranslationService;
  private glossaryService: GlossaryService;
  private config: ConfigService;

  constructor(
    translationService: TranslationService,
    documentTranslationService: DocumentTranslationService,
    glossaryService: GlossaryService,
    config: ConfigService
  ) {
    this.translationService = translationService;
    this.fileTranslationService = new FileTranslationService(translationService);
    this.documentTranslationService = documentTranslationService;
    this.batchTranslationService = new BatchTranslationService(
      this.fileTranslationService,
      { concurrency: 5 }
    );
    this.glossaryService = glossaryService;
    this.config = config;
  }

  /**
   * Resolve glossary ID from name or ID
   * If input looks like a UUID (glossary-*), use it directly as ID
   * Otherwise, lookup by name
   */
  private async resolveGlossaryId(nameOrId: string): Promise<string> {
    // If it looks like a glossary ID (UUID format), use it directly
    if (nameOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return nameOrId;
    }

    // Otherwise, lookup by name
    const glossary = await this.glossaryService.getGlossaryByName(nameOrId);
    if (!glossary) {
      throw new Error(`Glossary "${nameOrId}" not found`);
    }
    return glossary.glossary_id;
  }

  /**
   * Translate text, file, or directory
   */
  async translate(textOrPath: string, options: TranslateOptions): Promise<string> {
    // Check if input is a directory
    if (fs.existsSync(textOrPath) && fs.statSync(textOrPath).isDirectory()) {
      return this.translateDirectory(textOrPath, options);
    }

    // Check if input is a file path
    if (this.isFilePath(textOrPath)) {
      return this.translateFile(textOrPath, options);
    }

    return this.translateText(textOrPath, options);
  }

  /**
   * Check if input is a file path
   */
  private isFilePath(input: string): boolean {
    // Check if file exists
    if (fs.existsSync(input)) {
      return true;
    }

    // If input contains file extensions, might be a file
    return this.fileTranslationService.isSupportedFile(input) && input.includes('/');
  }

  /**
   * Translate file
   */
  private async translateFile(filePath: string, options: TranslateOptions): Promise<string> {
    if (!options.output) {
      throw new Error('Output file path is required for file translation. Use --output <path>');
    }

    // Check if it's a binary document (PDF, DOCX, etc.)
    if (this.documentTranslationService.isDocumentSupported(filePath)) {
      return this.translateDocument(filePath, options);
    }

    // Check if translating to multiple languages
    if (options.to.includes(',')) {
      const targetLangs = options.to.split(',').map(lang => lang.trim()) as Language[];

      const translationOptions: {
        sourceLang?: Language;
        formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
        outputDir?: string;
      } = {
        outputDir: options.output,
      };

      if (options.from) {
        translationOptions.sourceLang = options.from as Language;
      }

      if (options.formality) {
        translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
      }

      const results = await this.fileTranslationService.translateFileToMultiple(
        filePath,
        targetLangs,
        translationOptions
      );

      return `Translated ${filePath} to ${targetLangs.length} languages:\n` +
        results.map(r => `  [${r.targetLang}] ${r.outputPath}`).join('\n');
    }

    // Single language translation
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

    await this.fileTranslationService.translateFile(
      filePath,
      options.output,
      translationOptions,
      { preserveCode: options.preserveCode }
    );

    return `Translated ${filePath} -> ${options.output}`;
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
      context?: string;
      splitSentences?: 'on' | 'off' | 'nonewlines';
      tagHandling?: 'xml' | 'html';
      modelType?: 'quality_optimized' | 'prefer_quality_optimized' | 'latency_optimized';
      preserveFormatting?: boolean;
      glossaryId?: string;
      showBilledCharacters?: boolean;
    } = {
      targetLang: options.to as Language,
    };

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    }

    if (options.context) {
      translationOptions.context = options.context;
    }

    if (options.splitSentences) {
      translationOptions.splitSentences = options.splitSentences as 'on' | 'off' | 'nonewlines';
    }

    if (options.tagHandling) {
      translationOptions.tagHandling = options.tagHandling as 'xml' | 'html';
    }

    if (options.modelType) {
      translationOptions.modelType = options.modelType as 'quality_optimized' | 'prefer_quality_optimized' | 'latency_optimized';
    }

    if (options.preserveFormatting !== undefined) {
      translationOptions.preserveFormatting = options.preserveFormatting;
    }

    if (options.glossary) {
      translationOptions.glossaryId = await this.resolveGlossaryId(options.glossary);
    }

    if (options.showBilledCharacters) {
      translationOptions.showBilledCharacters = true;
    }

    // Translate
    const result = await this.translationService.translate(
      text,
      translationOptions,
      {
        preserveCode: options.preserveCode,
        skipCache: options.noCache
      }
    );

    // Format output based on format option
    if (options.format === 'json') {
      return formatTranslationJson(result, options.to as Language);
    }

    // Display billed characters if available
    if (result.billedCharacters !== undefined) {
      return `${result.text}\n\nBilled characters: ${result.billedCharacters.toLocaleString()}`;
    }

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
      context?: string;
      glossaryId?: string;
    } = {};

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    }

    if (options.context) {
      translationOptions.context = options.context;
    }

    if (options.glossary) {
      translationOptions.glossaryId = await this.resolveGlossaryId(options.glossary);
    }

    const results = await this.translationService.translateToMultiple(
      text,
      targetLangs,
      translationOptions
    );

    // Format output based on format option
    if (options.format === 'json') {
      return formatMultiTranslationJson(results);
    }

    // Format output for multiple languages (default: plain text)
    return results
      .map(result => `[${result.targetLang}] ${result.text}`)
      .join('\n');
  }

  /**
   * Translate directory (batch translation)
   */
  private async translateDirectory(dirPath: string, options: TranslateOptions): Promise<string> {
    if (!options.output) {
      throw new Error('Output directory is required for batch translation. Use --output <dir>');
    }

    // Build translation options
    const targetLang = options.to as Language;
    const translationOptions: {
      targetLang: Language;
      sourceLang?: Language;
      formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    } = {
      targetLang,
    };

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    }

    // Create spinner (conditional based on quiet mode)
    const spinner = Logger.shouldShowSpinner() ? ora('Scanning files...').start() : null;

    // Build batch options
    const batchOptions = {
      outputDir: options.output,
      recursive: options.recursive !== false,
      pattern: options.pattern,
      onProgress: (progress: { completed: number; total: number; current?: string }) => {
        if (spinner) {
          spinner.text = `Translating files: ${progress.completed}/${progress.total}`;
        }
      },
    };

    try {
      // Override concurrency if provided
      if (options.concurrency) {
        this.batchTranslationService = new BatchTranslationService(
          this.fileTranslationService,
          { concurrency: options.concurrency }
        );
      }

      // Translate directory
      const result = await this.batchTranslationService.translateDirectory(
        dirPath,
        translationOptions,
        batchOptions
      );

      const stats = this.batchTranslationService.getStatistics(result);

      if (spinner) {
        spinner.succeed(`Translation complete!`);
      }

      // Format output
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
    }
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

  /**
   * Translate binary document (PDF, DOCX, etc.)
   */
  private async translateDocument(filePath: string, options: TranslateOptions): Promise<string> {
    const outputPath = options.output!;

    // Build translation options
    const translationOptions: {
      targetLang: Language;
      sourceLang?: Language;
      formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
      glossaryId?: string;
      outputFormat?: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'html' | 'htm' | 'txt' | 'srt' | 'xlf' | 'xliff';
    } = {
      targetLang: options.to as Language,
    };

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    }

    if (options.outputFormat) {
      translationOptions.outputFormat = options.outputFormat as 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'html' | 'htm' | 'txt' | 'srt' | 'xlf' | 'xliff';
    }

    // Create spinner for progress (conditional based on quiet mode)
    const spinner = Logger.shouldShowSpinner() ? ora('Uploading document...').start() : null;

    try {
      const result = await this.documentTranslationService.translateDocument(
        filePath,
        outputPath,
        translationOptions,
        (progress) => {
          // Update spinner based on progress
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
