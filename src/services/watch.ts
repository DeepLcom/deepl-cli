/**
 * Watch Service
 * Monitors files/directories for changes and auto-translates
 */

import * as fs from 'fs';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { minimatch } from 'minimatch';
import pLimit, { type LimitFunction } from 'p-limit';
import { FileTranslationService } from './file-translation.js';
import { Language, TranslationOptions } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';
import { errorMessage } from '../utils/error-message.js';
import { isWithinDirectory } from '../utils/paths.js';

export interface FileTranslationResult {
  targetLang: Language;
  text: string;
  outputPath?: string;
}

export type WatchTranslationResult =
  FileTranslationResult | FileTranslationResult[];

export interface WatchOptions {
  targetLangs: readonly Language[];
  outputDir: string;
  sourceLang?: Language;
  formality?:
    | 'default'
    | 'more'
    | 'less'
    | 'prefer_more'
    | 'prefer_less'
    | 'formal'
    | 'informal';
  glossaryId?: string;
  preserveCode?: boolean;
  pattern?: string;
  recursive?: boolean;
  abortSignal?: AbortSignal;
  onReady?: () => void;
  onChange?: (filePath: string) => void;
  /**
   * Called once a file's translations are on disk. A promise returned here is
   * awaited before the path is considered done, so follow-up work such as
   * `--auto-commit` runs inside the translation's slot and its failure is
   * reported instead of being dropped.
   */
  onTranslate?: (
    filePath: string,
    result: WatchTranslationResult
  ) => void | Promise<void>;
  onError?: (filePath: string, error: Error) => void;
}

export interface WatchServiceOptions {
  debounceMs?: number;
  concurrency?: number;
  pattern?: string;
  stagedFiles?: Set<string>;
}

export interface WatchStats {
  isWatching: boolean;
  filesWatched: number;
  translationsCount: number;
  errorsCount: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

const DEFAULT_CONCURRENCY = 5;

export class WatchService {
  private fileTranslationService: FileTranslationService;
  private watcher: FSWatcher | null = null;
  private options: WatchServiceOptions;
  private watchOptions: WatchOptions | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private activeTranslations: Set<string> = new Set();
  private pendingTranslations: Set<string> = new Set();
  private writtenOutputs: Set<string> = new Set();
  private warnedOutputs: Set<string> = new Set();
  private limit: LimitFunction;
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
      debounceMs: DEFAULT_DEBOUNCE_MS,
      ...options,
    };
    this.limit = pLimit(options.concurrency ?? DEFAULT_CONCURRENCY);
  }

  /**
   * Start watching a file or directory
   */
  watch(watchPath: string, options: WatchOptions): void {
    // Validate path exists
    if (!fs.existsSync(watchPath)) {
      throw new ValidationError(`Path not found: ${watchPath}`);
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

    if (this.options.pattern ?? options.pattern) {
      watcherOptions.ignored = (filePath: string) => {
        const pattern = options.pattern ?? this.options.pattern;
        if (!pattern) {
          return false;
        }

        const basename = path.basename(filePath);
        return !minimatch(basename, pattern);
      };
    }

    this.watcher = chokidar.watch(watchPath, watcherOptions);
    this.stats.filesWatched = 0;

    // With ignoreInitial: true the initial scan emits no 'add' events, so the
    // authoritative file count comes from getWatched() once 'ready' fires.
    this.watcher.on('ready', () => {
      this.stats.filesWatched = this.countWatchedFiles();
      this.watchOptions?.onReady?.();
    });

    this.watcher.on('change', (filePath: string) => {
      try {
        this.handleFileChange(filePath);
      } catch (error) {
        Logger.error(
          `Error handling file change for ${filePath}:`,
          errorMessage(error)
        );
      }
    });

    this.watcher.on('add', (filePath: string) => {
      this.stats.filesWatched++;
      try {
        this.handleFileChange(filePath);
      } catch (error) {
        Logger.error(
          `Error handling file add for ${filePath}:`,
          errorMessage(error)
        );
      }
    });

    this.watcher.on('unlink', () => {
      if (this.stats.filesWatched > 0) {
        this.stats.filesWatched--;
      }
    });

    this.stats.isWatching = true;
  }

  /**
   * Count files currently tracked by the watcher.
   * getWatched() maps each watched directory to its entries; an entry is a
   * directory (not a file) exactly when its full path is itself a key.
   */
  private countWatchedFiles(): number {
    if (!this.watcher) {
      return 0;
    }

    const watched = this.watcher.getWatched();
    let count = 0;
    for (const [dir, entries] of Object.entries(watched)) {
      for (const entry of entries) {
        if (!(path.join(dir, entry) in watched)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Handle file change event
   * Uses isWatching flag to prevent race conditions with stop()
   */
  handleFileChange(filePath: string): void {
    // Check if watch has been started at least once
    if (!this.watchOptions) {
      throw new ValidationError('Watch not started');
    }

    // Early check: Don't schedule new timers if watch is being stopped or has stopped
    // This prevents race conditions where stop() is called between the check above
    // and scheduling the timer below
    if (!this.stats.isWatching) {
      return;
    }

    // Check if file is a translated output file to prevent infinite loops
    if (this.isTranslatedOutputFile(filePath)) {
      this.warnOnceAboutSkippedOutput(filePath);
      return;
    }

    // Check if file is supported
    if (!this.fileTranslationService.isSupportedFile(filePath)) {
      return;
    }

    // Check if file is in the git-staged set
    if (
      this.options.stagedFiles &&
      !this.options.stagedFiles.has(path.resolve(filePath))
    ) {
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
      // Drop the bookkeeping as soon as the timer fires, not after the
      // translation finishes, and only if this timer is still the current one.
      // Deleting unconditionally later would drop a NEWER pending timer for the
      // same file, making it uncancellable and letting two translations race to
      // write the same output path.
      if (this.debounceTimers.get(filePath) === timer) {
        this.debounceTimers.delete(filePath);
      }
      // Wrap async code to handle Promise properly (void operator tells TypeScript we intentionally ignore the Promise)
      void this.runTranslation(filePath);
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Translate one path, reporting any failure through onError.
   *
   * At most one translation per path is in flight. A change arriving while one
   * runs records a single re-run instead of starting a second translation:
   * two concurrent runs write the same output path in API-completion order, so
   * a slower translation of older content would overwrite a newer one and the
   * output would stay stale until the next edit. Coalescing also collapses an
   * edit storm into one re-translation rather than one per event.
   *
   * The re-run is dispatched from `finally` so a failed translation still picks
   * up the edit that arrived while it was running.
   */
  private async runTranslation(filePath: string): Promise<void> {
    if (this.activeTranslations.has(filePath)) {
      this.pendingTranslations.add(filePath);
      return;
    }

    this.activeTranslations.add(filePath);
    try {
      if (!this.stats.isWatching) {
        return;
      }

      if (this.watchOptions?.abortSignal?.aborted) {
        return;
      }

      await this.limit(() => this.translateFile(filePath));
    } catch (error) {
      this.stats.errorsCount++;
      if (this.watchOptions?.onError) {
        this.watchOptions.onError(filePath, error as Error);
      }
      Logger.error(`Translation failed for ${filePath}:`, errorMessage(error));
    } finally {
      this.activeTranslations.delete(filePath);
      const hadPending = this.pendingTranslations.delete(filePath);
      if (
        hadPending &&
        this.stats.isWatching &&
        !this.watchOptions?.abortSignal?.aborted
      ) {
        void this.runTranslation(filePath);
      }
    }
  }

  /**
   * Check if a file looks like a translated output file.
   * Detects patterns like name.{langCode}.ext where langCode matches a
   * configured target language, and only inside the output directory — every
   * file this service writes lands there, so requiring containment keeps the
   * loop guard complete while letting a source file that merely carries a
   * target-language segment in its name (pricing.es.md with --to es) be
   * translated instead of skipped for the lifetime of the session.
   */
  private isTranslatedOutputFile(filePath: string): boolean {
    if (!this.watchOptions) {
      return false;
    }

    if (!isWithinDirectory(this.watchOptions.outputDir, filePath)) {
      return false;
    }

    const basename = path.basename(filePath);
    const parts = basename.split('.');
    // Need at least 3 parts: name, langCode, extension
    if (parts.length < 3) {
      return false;
    }

    const targetLangs = this.watchOptions.targetLangs;
    // Check any segment between the first and last could be a target language code
    for (let i = 1; i < parts.length - 1; i++) {
      const segment = parts[i]!.toLowerCase();
      if (targetLangs.some((lang) => lang.toLowerCase() === segment)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Say once why a file inside the output directory is being left alone.
   *
   * A file this session wrote is skipped in silence — that is the loop guard
   * working. Any other match is a file the user put there, and skipping it
   * without a word is indistinguishable from the watcher not seeing it.
   */
  private warnOnceAboutSkippedOutput(filePath: string): void {
    const resolved = path.resolve(filePath);
    if (this.writtenOutputs.has(resolved) || this.warnedOutputs.has(resolved)) {
      return;
    }
    this.warnedOutputs.add(resolved);
    Logger.warn(
      `Skipping ${filePath}: it is inside the output directory and named like a translated output, so it is read as a translation rather than a source. Move it outside ${this.watchOptions?.outputDir ?? 'the output directory'} to have it translated.`
    );
  }

  /**
   * Translate a file with the configured options
   */
  private async translateFile(filePath: string): Promise<void> {
    if (!this.watchOptions) {
      throw new ValidationError('Watch not started');
    }

    const {
      targetLangs,
      outputDir,
      sourceLang,
      formality,
      glossaryId,
      preserveCode,
    } = this.watchOptions;

    // Build translation options base (targetLang will be set per operation)
    const baseOptions: Partial<TranslationOptions> = {};

    if (sourceLang) {
      baseOptions.sourceLang = sourceLang;
    }

    if (formality) {
      baseOptions.formality = formality;
    }

    if (glossaryId) {
      baseOptions.glossaryId = glossaryId;
    }

    // Determine output path(s)
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);

    if (targetLangs.length === 1) {
      // Single target language (length === 1 guarantees targetLangs[0] exists)
      const targetLang = targetLangs[0]!;
      const outputPath = path.join(
        outputDir,
        `${fileName}.${targetLang}${ext}`
      );

      await this.fileTranslationService.translateFile(
        filePath,
        outputPath,
        { ...baseOptions, targetLang },
        { preserveCode }
      );

      this.writtenOutputs.add(path.resolve(outputPath));
      this.stats.translationsCount++;

      if (this.watchOptions.onTranslate) {
        await this.watchOptions.onTranslate(filePath, {
          text: '',
          outputPath,
          targetLang,
        });
      }
    } else {
      // Multiple target languages
      const results = await this.fileTranslationService.translateFileToMultiple(
        filePath,
        targetLangs as Language[],
        { ...baseOptions, outputDir, preserveCode }
      );

      for (const result of results) {
        if (result.outputPath) {
          this.writtenOutputs.add(path.resolve(result.outputPath));
        }
      }
      this.stats.translationsCount += results.length;

      if (this.watchOptions.onTranslate) {
        await this.watchOptions.onTranslate(filePath, results);
      }
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    this.stats.isWatching = false;
    this.watchOptions = null;

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    // A translation already in flight keeps its slot in activeTranslations so
    // its own cleanup runs; only the queued re-run is abandoned.
    this.pendingTranslations.clear();
    this.writtenOutputs.clear();
    this.warnedOutputs.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
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
