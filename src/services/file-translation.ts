/**
 * File Translation Service
 * Handles translation of files with format preservation
 */

import * as fs from 'fs';
import * as path from 'path';
import { TranslationService } from './translation.js';
import { TranslationOptions, Language } from '../types/index.js';
import { ValidationError } from '../utils/errors.js';
import { safeReadFile } from '../utils/safe-read-file.js';

interface NodeErrno extends Error {
  code?: string;
}

interface FileTranslationOptions {
  preserveCode?: boolean;
}

interface MultipleFileOptions {
  outputDir?: string;
}

interface FileMultiTargetResult {
  targetLang: Language;
  text: string;
  outputPath?: string;
}

export class FileTranslationService {
  private translationService: TranslationService;
  private supportedExtensions = ['.txt', '.md'];

  constructor(translationService: TranslationService) {
    this.translationService = translationService;
  }

  /**
   * Translate a single file
   */
  async translateFile(
    inputPath: string,
    outputPath: string,
    options: TranslationOptions,
    fileOptions: FileTranslationOptions = {}
  ): Promise<void> {
    // Check file type is supported
    if (!this.isSupportedFile(inputPath)) {
      throw new ValidationError(
        `Unsupported file type: ${path.extname(inputPath)}`,
        'Run: deepl languages --type document  to see supported document formats'
      );
    }

    // Read file content using safeReadFile (rejects symlinks for security)
    let content: string;
    try {
      content = await safeReadFile(inputPath, 'utf-8');
    } catch (err: unknown) {
      const nodeErr = err as NodeErrno;
      if (nodeErr.code === 'ENOENT') {
        throw new Error(`Input file not found: ${inputPath}`);
      }
      throw err;
    }

    // Check for empty files
    if (!content || content.trim() === '') {
      throw new Error('Cannot translate empty file');
    }

    // Translate content
    const result = await this.translationService.translate(
      content,
      options,
      fileOptions
    );

    // Create output directory if needed
    const outputDir = path.dirname(outputPath);
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Write translated content
    await fs.promises.writeFile(outputPath, result.text, 'utf-8');
  }

  /**
   * Translate file to multiple target languages
   */
  async translateFileToMultiple(
    inputPath: string,
    targetLangs: Language[],
    options: Omit<TranslationOptions, 'targetLang'> & MultipleFileOptions = {}
  ): Promise<FileMultiTargetResult[]> {
    if (!this.isSupportedFile(inputPath)) {
      throw new ValidationError(
        `Unsupported file type: ${path.extname(inputPath)}`,
        'Run: deepl languages --type document  to see supported document formats'
      );
    }

    // Read file content using safeReadFile (rejects symlinks for security)
    let content: string;
    try {
      content = await safeReadFile(inputPath, 'utf-8');
    } catch (err: unknown) {
      const nodeErr = err as NodeErrno;
      if (nodeErr.code === 'ENOENT') {
        throw new Error(`Input file not found: ${inputPath}`);
      }
      throw err;
    }

    if (!content || content.trim() === '') {
      throw new Error('Cannot translate empty file');
    }

    // Translate to multiple languages
    const translationResults = await this.translationService.translateToMultiple(
      content,
      targetLangs,
      options
    );

    // Convert to FileMultiTargetResult
    const results: FileMultiTargetResult[] = translationResults.map(r => ({
      targetLang: r.targetLang,
      text: r.text,
    }));

    // If outputDir is specified, write files
    if (options.outputDir) {
      const outputDir = options.outputDir;
      await fs.promises.mkdir(outputDir, { recursive: true });

      const inputFilename = path.basename(inputPath);
      const ext = path.extname(inputFilename);
      const basename = path.basename(inputFilename, ext);

      for (const result of results) {
        const outputFilename = `${basename}.${result.targetLang}${ext}`;
        const outputPath = path.join(outputDir, outputFilename);
        await fs.promises.writeFile(outputPath, result.text, 'utf-8');
        result.outputPath = outputPath;
      }
    }

    return results;
  }

  /**
   * Get list of supported file extensions
   * Returns a readonly array to avoid unnecessary copies
   */
  getSupportedFileTypes(): readonly string[] {
    return this.supportedExtensions;
  }

  /**
   * Check if file type is supported
   * SECURITY: Validates file type, resolves symlinks if file exists, and checks file is regular file
   */
  isSupportedFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();

    // Check extension first (works even if file doesn't exist)
    if (!this.supportedExtensions.includes(ext)) {
      return false;
    }

    // If file doesn't exist, extension check is sufficient (e.g., for validation before creation)
    if (!fs.existsSync(filePath)) {
      return true;
    }

    // For existing files, perform security checks
    try {
      // Resolve symlinks to get real path
      const realPath = fs.realpathSync(filePath);
      const realExt = path.extname(realPath).toLowerCase();

      // Verify real extension matches (prevents symlink to non-text file)
      if (!this.supportedExtensions.includes(realExt)) {
        return false;
      }

      // Check if file is a regular file (not device, socket, etc.)
      const stats = fs.lstatSync(filePath);
      if (!stats.isFile()) {
        return false;
      }

      return true;
    } catch {
      // If security check fails (permission denied, etc.), reject
      return false;
    }
  }
}
