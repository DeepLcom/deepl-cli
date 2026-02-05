/**
 * Translate Command
 * Handles text translation operations
 */

import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import { TranslationService } from '../../services/translation.js';
import { FileTranslationService } from '../../services/file-translation.js';
import { BatchTranslationService } from '../../services/batch-translation.js';
import { DocumentTranslationService } from '../../services/document-translation.js';
import { GlossaryService } from '../../services/glossary.js';
import { ConfigService } from '../../storage/config.js';
import { Language, Formality } from '../../types/index.js';
import { formatTranslationJson, formatMultiTranslationJson, formatMultiTranslationTable } from '../../utils/formatters.js';
import { Logger } from '../../utils/logger.js';

// Valid language codes supported by DeepL
const VALID_LANGUAGES: ReadonlySet<string> = new Set([
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr',
  'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl', 'pt',
  'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'zh'
]);

// Constants for text-based file caching
const TEXT_BASED_EXTENSIONS = ['.txt', '.md', '.html', '.htm', '.srt', '.xlf', '.xliff'];
const SAFE_TEXT_SIZE_LIMIT = 100 * 1024; // 100 KiB (safe threshold, API limit is 128 KiB)

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
  enableMinification?: boolean;
  outlineDetection?: string;
  splittingTags?: string;
  nonSplittingTags?: string;
  ignoreTags?: string;
  output?: string;
  recursive?: boolean;
  pattern?: string;
  concurrency?: number;
  glossary?: string;
  cache?: boolean;  // Commander.js converts --no-cache to cache: false
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

  private validateLanguageCodes(langCodes: string[]): void {
    for (const lang of langCodes) {
      if (!VALID_LANGUAGES.has(lang)) {
        throw new Error(`Invalid target language code: "${lang}". Valid codes: ${Array.from(VALID_LANGUAGES).sort().join(', ')}`);
      }
    }
  }

  private async resolveGlossaryId(nameOrId: string): Promise<string> {
    return this.glossaryService.resolveGlossaryId(nameOrId);
  }

  async translate(textOrPath: string, options: TranslateOptions): Promise<string> {
    let stats: fs.Stats | null = null;
    try {
      const lstat = fs.lstatSync(textOrPath);
      if (lstat.isSymbolicLink()) {
        throw new Error(`Symlinks are not supported for security reasons: ${textOrPath}`);
      }

      stats = fs.statSync(textOrPath);
      if (stats.isDirectory()) {
        return this.translateDirectory(textOrPath, options);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Symlinks are not supported')) {
        throw error;
      }
    }

    if (this.isFilePath(textOrPath, stats)) {
      return this.translateFile(textOrPath, options, stats);
    }

    return this.translateText(textOrPath, options);
  }

  private isFilePath(input: string, cachedStats?: fs.Stats | null): boolean {
    if (cachedStats && cachedStats.isFile()) {
      return true;
    }

    if (!cachedStats && fs.existsSync(input)) {
      return true;
    }

    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
      return false;
    }

    const hasPathSep = input.includes(path.sep) ||
                       input.includes('/') ||
                       input.includes('\\');

    return hasPathSep && this.fileTranslationService.isSupportedFile(input);
  }

  /**
   * Check if a file is text-based (can use text API with caching)
   */
  private isTextBasedFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return TEXT_BASED_EXTENSIONS.includes(ext);
  }

  /**
   * Validate XML tag names
   * Tags must start with a letter or underscore, contain only valid XML name characters,
   * and not start with "xml" (case-insensitive)
   */
  private validateXmlTags(tags: string[], paramName: string): void {
    const xmlNamePattern = /^[a-zA-Z_][\w.-]*$/;

    for (const tag of tags) {
      // Check if tag is empty
      if (!tag || tag.trim() === '') {
        throw new Error(`${paramName}: Tag name cannot be empty`);
      }

      // Check if tag starts with "xml" (case-insensitive)
      if (tag.toLowerCase().startsWith('xml')) {
        throw new Error(`${paramName}: Tag name "${tag}" cannot start with "xml" (reserved)`);
      }

      // Check if tag matches valid XML name pattern
      if (!xmlNamePattern.test(tag)) {
        throw new Error(`${paramName}: Invalid XML tag name "${tag}". Tags must start with a letter or underscore and contain only letters, digits, hyphens, underscores, or periods.`);
      }
    }
  }

  /**
   * Get file stats with caching to avoid duplicate syscalls
   * Returns file size in bytes, or null if file doesn't exist
   */
  private getFileSize(filePath: string): number | null {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      // If file doesn't exist or can't be accessed, return null
      return null;
    }
  }

  private async translateFile(filePath: string, options: TranslateOptions, cachedStats?: fs.Stats | null): Promise<string> {
    if (!options.output) {
      throw new Error('Output file path is required for file translation. Use --output <path>');
    }

    if (options.to.includes(',')) {
      const targetLangs = options.to.split(',').map(lang => lang.trim());
      this.validateLanguageCodes(targetLangs);

      // Now safe to cast as Language[]
      const validTargetLangs = targetLangs as Language[];

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
        translationOptions.formality = options.formality as Formality;
      }

      const results = await this.fileTranslationService.translateFileToMultiple(
        filePath,
        validTargetLangs,
        translationOptions
      );

      return `Translated ${filePath} to ${validTargetLangs.length} languages:\n` +
        results.map(r => `  [${r.targetLang}] ${r.outputPath}`).join('\n');
    }

    if (this.isTextBasedFile(filePath)) {
      let fileSize: number | null;
      if (cachedStats) {
        fileSize = cachedStats.size;
      } else {
        fileSize = this.getFileSize(filePath);
      }

      if (fileSize === null) {
        throw new Error(`File not found or cannot be accessed: ${filePath}`);
      }

      if (fileSize <= SAFE_TEXT_SIZE_LIMIT) {
        // Use text API with caching for small text-based files
        return this.translateTextFile(filePath, options);
      } else if (this.documentTranslationService.isDocumentSupported(filePath)) {
        // Text file too large for cached API, fall back to document API with warning
        const fileSizeKiB = (fileSize / 1024).toFixed(1);
        const warning = `⚠ File exceeds 100 KiB limit for cached translation (${fileSizeKiB} KiB), using document API instead`;
        Logger.warn(warning);
        const result = await this.translateDocument(filePath, options);
        return `${warning}\n${result}`;
      }
      // If text file is large and not supported by document API, fall through to file translation service
    }

    // Check if it's a binary document (PDF, DOCX, etc.)
    if (this.documentTranslationService.isDocumentSupported(filePath)) {
      return this.translateDocument(filePath, options);
    }

    this.validateLanguageCodes([options.to]);

    // Single language translation using file translation service
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
      translationOptions.formality = options.formality as Formality;
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

    this.validateLanguageCodes([options.to]);

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
      translationOptions.formality = options.formality as Formality;
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

    // XML tag handling parameters (only valid with --tag-handling xml)
    if (options.outlineDetection !== undefined || options.splittingTags || options.nonSplittingTags || options.ignoreTags) {
      if (options.tagHandling !== 'xml') {
        throw new Error('XML tag handling parameters (--outline-detection, --splitting-tags, --non-splitting-tags, --ignore-tags) require --tag-handling xml');
      }
    }

    if (options.outlineDetection !== undefined) {
      const boolValue = options.outlineDetection.toLowerCase();
      if (boolValue !== 'true' && boolValue !== 'false') {
        throw new Error('--outline-detection must be "true" or "false"');
      }
      (translationOptions as {outlineDetection?: boolean}).outlineDetection = boolValue === 'true';
    }

    if (options.splittingTags) {
      const tags = options.splittingTags.split(',').map(tag => tag.trim());
      this.validateXmlTags(tags, '--splitting-tags');
      (translationOptions as {splittingTags?: string[]}).splittingTags = tags;
    }

    if (options.nonSplittingTags) {
      const tags = options.nonSplittingTags.split(',').map(tag => tag.trim());
      this.validateXmlTags(tags, '--non-splitting-tags');
      (translationOptions as {nonSplittingTags?: string[]}).nonSplittingTags = tags;
    }

    if (options.ignoreTags) {
      const tags = options.ignoreTags.split(',').map(tag => tag.trim());
      this.validateXmlTags(tags, '--ignore-tags');
      (translationOptions as {ignoreTags?: string[]}).ignoreTags = tags;
    }

    // Translate
    const result = await this.translationService.translate(
      text,
      translationOptions,
      {
        preserveCode: options.preserveCode,
        skipCache: !options.cache
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
    const targetLangs = options.to.split(',').map(lang => lang.trim());
    this.validateLanguageCodes(targetLangs);

    // Now safe to cast as Language[]
    const validTargetLangs = targetLangs as Language[];

    const translationOptions: {
      sourceLang?: Language;
      formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
      context?: string;
      glossaryId?: string;
      showBilledCharacters?: boolean;
    } = {};

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as Formality;
    }

    if (options.context) {
      translationOptions.context = options.context;
    }

    if (options.glossary) {
      translationOptions.glossaryId = await this.resolveGlossaryId(options.glossary);
    }

    if (options.showBilledCharacters) {
      translationOptions.showBilledCharacters = true;
    }

    const results = await this.translationService.translateToMultiple(
      text,
      validTargetLangs,
      { ...translationOptions, skipCache: !options.cache }
    );

    // Format output based on format option
    if (options.format === 'json') {
      return formatMultiTranslationJson(results);
    }

    if (options.format === 'table') {
      return formatMultiTranslationTable(results);
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

    this.validateLanguageCodes([options.to]);

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
      translationOptions.formality = options.formality as Formality;
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

  private async translateTextFile(filePath: string, options: TranslateOptions): Promise<string> {
    this.validateLanguageCodes([options.to]);

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Build translation options
    const translationOptions: {
      targetLang: Language;
      sourceLang?: Language;
      formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
      context?: string;
      glossaryId?: string;
      preserveFormatting?: boolean;
    } = {
      targetLang: options.to as Language,
    };

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as Formality;
    }

    if (options.context) {
      translationOptions.context = options.context;
    }

    if (options.glossary) {
      translationOptions.glossaryId = await this.resolveGlossaryId(options.glossary);
    }

    if (options.preserveFormatting !== undefined) {
      translationOptions.preserveFormatting = options.preserveFormatting;
    }

    // Translate using text API (cached)
    const result = await this.translationService.translate(
      content,
      translationOptions,
      {
        preserveCode: options.preserveCode,
        skipCache: !options.cache
      }
    );

    // Ensure output directory exists
    const outputDir = path.dirname(options.output!);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write translated content to output file
    fs.writeFileSync(options.output!, result.text, 'utf-8');

    return `Translated ${filePath} -> ${options.output}`;
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

  private async translateDocument(filePath: string, options: TranslateOptions): Promise<string> {
    this.validateLanguageCodes([options.to]);

    const outputPath = options.output!;

    // Build translation options
    const translationOptions: {
      targetLang: Language;
      sourceLang?: Language;
      formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
      glossaryId?: string;
      outputFormat?: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'html' | 'htm' | 'txt' | 'srt' | 'xlf' | 'xliff';
      enableDocumentMinification?: boolean;
    } = {
      targetLang: options.to as Language,
    };

    if (options.from) {
      translationOptions.sourceLang = options.from as Language;
    }

    if (options.formality) {
      translationOptions.formality = options.formality as Formality;
    }

    if (options.outputFormat) {
      translationOptions.outputFormat = options.outputFormat as 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'html' | 'htm' | 'txt' | 'srt' | 'xlf' | 'xliff';
    }

    if (options.enableMinification) {
      translationOptions.enableDocumentMinification = true;
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
