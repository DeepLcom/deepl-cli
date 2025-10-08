/**
 * Watch Service
 * Monitors files/directories for changes and auto-translates
 */

import * as fs from 'fs';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { FileTranslationService } from './file-translation.js';
import { Language, TranslationOptions } from '../types/index.js';

export interface FileTranslationResult {
  targetLang: Language;
  text: string;
  outputPath?: string;
}

export type WatchTranslationResult = FileTranslationResult | FileTranslationResult[];

export interface WatchOptions {
  targetLangs: readonly Language[];
  outputDir: string;
  sourceLang?: Language;
  formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
  preserveCode?: boolean;
  pattern?: string;
  recursive?: boolean;
  onChange?: (filePath: string) => void;
  onTranslate?: (filePath: string, result: WatchTranslationResult) => void;
  onError?: (filePath: string, error: Error) => void;
}

export interface WatchServiceOptions {
  debounceMs?: number;
  pattern?: string;
}

export interface WatchStats {
  isWatching: boolean;
  filesWatched: number;
  translationsCount: number;
  errorsCount: number;
}

export class WatchService {
  private fileTranslationService: FileTranslationService;
  private watcher: FSWatcher | null = null;
  private options: WatchServiceOptions;
  private watchOptions: WatchOptions | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private stats: WatchStats = {
    isWatching: false,
    filesWatched: 0,
    translationsCount: 0,
    errorsCount: 0,
  };

  constructor(
    fileTranslationService: FileTranslationService,
    options: WatchServiceOptions = {}
  ) {
    this.fileTranslationService = fileTranslationService;
    this.options = {
      debounceMs: 300,
      ...options,
    };
  }

  /**
   * Start watching a file or directory
   */
  watch(watchPath: string, options: WatchOptions): void {
    // Validate path exists
    if (!fs.existsSync(watchPath)) {
      throw new Error(`Path not found: ${watchPath}`);
    }

    this.watchOptions = options;

    // Create watcher
    const watcherOptions: {
      persistent: boolean;
      ignoreInitial: boolean;
      ignored?: (path: string) => boolean;
    } = {
      persistent: true,
      ignoreInitial: true,
    };

    // Apply pattern filter if specified
    if (this.options.pattern ?? options.pattern) {
      watcherOptions.ignored = (filePath: string) => {
        const pattern = options.pattern ?? this.options.pattern;
        if (!pattern) {
          return false;
        }

        const basename = path.basename(filePath);

        // Simple glob matching for extensions
        if (pattern.startsWith('*')) {
          return !basename.endsWith(pattern.slice(1));
        }

        return false;
      };
    }

    this.watcher = chokidar.watch(watchPath, watcherOptions);

    this.watcher.on('change', (filePath: string) => {
      try {
        this.handleFileChange(filePath);
      } catch (error) {
        console.error(`Error handling file change for ${filePath}:`, error);
      }
    });

    this.watcher.on('add', (filePath: string) => {
      try {
        this.handleFileChange(filePath);
      } catch (error) {
        console.error(`Error handling file add for ${filePath}:`, error);
      }
    });

    this.stats.isWatching = true;
  }

  /**
   * Handle file change event
   */
  handleFileChange(filePath: string): void {
    if (!this.watchOptions) {
      throw new Error('Watch not started');
    }

    // Check if file is supported
    if (!this.fileTranslationService.isSupportedFile(filePath)) {
      return;
    }

    // Call onChange callback
    if (this.watchOptions.onChange) {
      this.watchOptions.onChange(filePath);
    }

    // Debounce file changes
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          await this.translateFile(filePath);
          this.debounceTimers.delete(filePath);
        } catch (error) {
          this.stats.errorsCount++;
          if (this.watchOptions?.onError) {
            this.watchOptions.onError(filePath, error as Error);
          }
          console.error(`Translation failed for ${filePath}:`, error);
        }
      })();
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Translate a file with the configured options
   */
  private async translateFile(filePath: string): Promise<void> {
    if (!this.watchOptions) {
      throw new Error('Watch not started');
    }

    const { targetLangs, outputDir, sourceLang, formality, preserveCode } = this.watchOptions;

    // Build translation options base (targetLang will be set per operation)
    const baseOptions: Partial<TranslationOptions> = {};

    if (sourceLang) {
      baseOptions.sourceLang = sourceLang;
    }

    if (formality) {
      baseOptions.formality = formality;
    }

    // Determine output path(s)
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);

    if (targetLangs.length === 1) {
      // Single target language
      const outputPath = path.join(outputDir, `${fileName}.${targetLangs[0]}${ext}`);

      const targetLang = targetLangs[0];
      if (!targetLang) {
        throw new Error('No target language specified');
      }

      await this.fileTranslationService.translateFile(
        filePath,
        outputPath,
        { ...baseOptions, targetLang } as TranslationOptions,
        { preserveCode }
      );

      this.stats.translationsCount++;

      if (this.watchOptions.onTranslate) {
        this.watchOptions.onTranslate(filePath, { text: '', outputPath, targetLang });
      }
    } else {
      // Multiple target languages
      const results = await this.fileTranslationService.translateFileToMultiple(
        filePath,
        targetLangs as Language[],
        { ...baseOptions, outputDir, preserveCode }
      );

      this.stats.translationsCount += results.length;

      if (this.watchOptions.onTranslate) {
        this.watchOptions.onTranslate(filePath, results);
      }
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    // Clear all pending timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.stats.isWatching = false;
    this.watchOptions = null;
  }

  /**
   * Check if currently watching
   */
  isWatching(): boolean {
    return this.stats.isWatching;
  }

  /**
   * Get watch statistics
   */
  getStats(): WatchStats {
    return { ...this.stats };
  }
}
