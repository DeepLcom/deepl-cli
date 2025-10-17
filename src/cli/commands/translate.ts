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
import { Language } from '../../types/index.js';
import { formatTranslationJson, formatMultiTranslationJson, formatMultiTranslationTable } from '../../utils/formatters.js';
import { Logger } from '../../utils/logger.js';

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
    // Use statSync() directly to avoid duplicate syscalls (existsSync + statSync)
    try {
      const stats = fs.statSync(textOrPath);
      if (stats.isDirectory()) {
        return this.translateDirectory(textOrPath, options);
      }
    } catch {
      // Not a file/directory, treat as text
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

  /**
   * Translate file
   */
  private async translateFile(filePath: string, options: TranslateOptions): Promise<string> {
    if (!options.output) {
      throw new Error('Output file path is required for file translation. Use --output <path>');
    }

    // Check if translating to multiple languages (must be done BEFORE text file optimization)
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

    // Smart routing for text-based files
    // Use text API (cached) for small text files, document API for large files or binaries
    if (this.isTextBasedFile(filePath)) {
      // Get file size once to avoid duplicate stat() calls
      const fileSize = this.getFileSize(filePath);

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
    const targetLangs = options.to.split(',').map(lang => lang.trim()) as Language[];

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
      translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
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
      targetLangs,
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
   * Translate text-based file using text API (with caching)
   * Used for small .txt, .md, .html, .srt, .xlf files
   */
  private async translateTextFile(filePath: string, options: TranslateOptions): Promise<string> {
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
      translationOptions.formality = options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
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
      enableDocumentMinification?: boolean;
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
