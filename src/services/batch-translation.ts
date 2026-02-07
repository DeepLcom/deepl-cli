/**
 * Batch Translation Service
 * Handles parallel translation of multiple files with progress tracking and error recovery
 */

import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import fg from 'fast-glob';
import { FileTranslationService } from './file-translation.js';
import { TranslationOptions } from '../types/index.js';

interface BatchOptions {
  outputDir: string;
  outputPattern?: string;
  recursive?: boolean;
  pattern?: string;
  baseDir?: string;
  onProgress?: (progress: ProgressInfo) => void;
}

interface ProgressInfo {
  completed: number;
  total: number;
  current?: string;
}

interface BatchResult {
  successful: Array<{ file: string; outputPath: string }>;
  failed: Array<{ file: string; error: string }>;
  skipped: Array<{ file: string; reason: string }>;
}

interface BatchStatistics {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
}

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 100;

export class BatchTranslationService {
  private fileTranslationService: FileTranslationService;
  private concurrency: number;

  constructor(
    fileTranslationService: FileTranslationService,
    options: { concurrency?: number } = {}
  ) {
    this.fileTranslationService = fileTranslationService;

    // Validate concurrency parameter
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    if (concurrency < 1) {
      throw new Error('Concurrency must be at least 1');
    }
    if (concurrency > MAX_CONCURRENCY) {
      throw new Error('Concurrency cannot exceed 100');
    }

    this.concurrency = concurrency;
  }

  /**
   * Translate multiple files in parallel
   */
  async translateFiles(
    files: string[],
    translationOptions: TranslationOptions,
    batchOptions: Partial<BatchOptions> = {}
  ): Promise<BatchResult> {
    const result: BatchResult = {
      successful: [],
      failed: [],
      skipped: [],
    };

    if (files.length === 0) {
      return result;
    }

    const limit = pLimit(this.concurrency);
    let completed = 0;

    const tasks = files.map(file =>
      limit(async () => {
        try {
          // Check if file type is supported
          if (!this.fileTranslationService.isSupportedFile(file)) {
            result.skipped.push({
              file,
              reason: 'Unsupported file type',
            });
            completed++;
            batchOptions.onProgress?.({
              completed,
              total: files.length,
              current: file,
            });
            return;
          }

          // Generate output path
          const outputPath = this.generateOutputPath(
            file,
            translationOptions.targetLang,
            batchOptions
          );

          // Translate file
          await this.fileTranslationService.translateFile(
            file,
            outputPath,
            translationOptions,
            { preserveCode: true }
          );

          result.successful.push({ file, outputPath });
          completed++;

          // Call progress callback once after completion
          batchOptions.onProgress?.({
            completed,
            total: files.length,
            current: file,
          });
        } catch (error) {
          result.failed.push({
            file,
            error: error instanceof Error ? error.message : String(error),
          });
          completed++;

          // Call progress callback once after error
          batchOptions.onProgress?.({
            completed,
            total: files.length,
            current: file,
          });
        }
      })
    );

    await Promise.all(tasks);

    return result;
  }

  /**
   * Translate all files in a directory
   */
  async translateDirectory(
    inputDir: string,
    translationOptions: TranslationOptions,
    batchOptions: Partial<BatchOptions> = {}
  ): Promise<BatchResult> {
    // Check if directory exists
    if (!fs.existsSync(inputDir)) {
      throw new Error(`Directory not found: ${inputDir}`);
    }

    const stats = fs.statSync(inputDir);
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${inputDir}`);
    }

    // Build glob pattern
    const pattern = batchOptions.pattern ?? '*';
    const depth = batchOptions.recursive === false ? 1 : undefined;
    const globPattern = batchOptions.recursive === false
      ? path.join(inputDir, pattern)
      : path.join(inputDir, '**', pattern);

    // Find all files
    const files = await fg(globPattern, {
      onlyFiles: true,
      absolute: true,
      dot: false,
      deep: depth,
    });

    // Filter to only supported files
    const supportedFiles = files.filter(file =>
      this.fileTranslationService.isSupportedFile(file)
    );

    // Translate files with preserved directory structure
    return this.translateFiles(
      supportedFiles,
      translationOptions,
      {
        ...batchOptions,
        outputDir: batchOptions.outputDir ?? inputDir,
        baseDir: inputDir,
      }
    );
  }

  /**
   * Get statistics from batch results
   */
  getStatistics(result: BatchResult): BatchStatistics {
    return {
      total: result.successful.length + result.failed.length + result.skipped.length,
      successful: result.successful.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
    };
  }

  /**
   * Generate output path for a file
   */
  private generateOutputPath(
    inputPath: string,
    targetLang: string,
    options: Partial<BatchOptions>
  ): string {
    const outputDir = options.outputDir ?? path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const basename = path.basename(inputPath, ext);

    // Apply custom pattern if provided
    if (options.outputPattern) {
      const outputFilename = options.outputPattern
        .replace('{name}', basename)
        .replace('{lang}', targetLang)
        .replace('{ext}', ext);

      return path.join(outputDir, outputFilename);
    }

    // Default pattern: name.lang.ext
    const outputFilename = `${basename}.${targetLang}${ext}`;

    // Preserve directory structure if baseDir is provided
    if (options.baseDir) {
      const relativePath = path.relative(options.baseDir, inputPath);
      const relativeDir = path.dirname(relativePath);
      return path.join(outputDir, relativeDir, outputFilename);
    }

    return path.join(outputDir, outputFilename);
  }
}
