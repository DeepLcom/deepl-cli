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
import { canonicalPathKey, isWithinDirectory } from '../utils/paths.js';
import { isAtomicWriteTempPath } from '../utils/atomic-write.js';

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
   * reported.
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
  private watchRoot = '';
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
    if (!fs.existsSync(watchPath)) {
      throw new ValidationError(`Path not found: ${watchPath}`);
    }

    this.watchOptions = options;
    // The root every source path is made relative to when its output directory
    // is built. A watched file has no tree of its own, so its directory is the
    // root and its output stays at the top of the output directory.
    const resolvedWatchPath = path.resolve(watchPath);
    this.watchRoot = fs.statSync(resolvedWatchPath).isDirectory()
      ? resolvedWatchPath
      : path.dirname(resolvedWatchPath);

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
   */
  handleFileChange(filePath: string): void {
    if (!this.watchOptions) {
      throw new ValidationError('Watch not started');
    }

    // Checked before the timer is scheduled below, so a stop() that lands
    // between the two never leaves a timer behind.
    if (!this.stats.isWatching) {
      return;
    }

    // A temp sibling of an in-flight atomic write is this process mid-write. It
    // carries the output file's name plus a suffix, so the output-file check
    // below would match it and warn about a file that is already gone.
    if (isAtomicWriteTempPath(filePath)) {
      return;
    }

    // Check if file is a translated output file to prevent infinite loops
    if (this.isTranslatedOutputFile(filePath)) {
      this.warnOnceAboutSkippedOutput(filePath);
      return;
    }

    if (!this.fileTranslationService.isSupportedFile(filePath)) {
      return;
    }

    // Both sides of the git-staged check are keyed through their symlinked
    // ancestors: the set comes from git, which reports the repository's real
    // path, while a watched path is spelled the way the user gave it.
    if (
      this.options.stagedFiles &&
      !this.options.stagedFiles.has(canonicalPathKey(filePath))
    ) {
      return;
    }

    if (this.watchOptions.onChange) {
      this.watchOptions.onChange(filePath);
    }

    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      // Drop the bookkeeping as soon as the timer fires, and only while this
      // timer is still the current one: deleting unconditionally would drop a
      // newer pending timer for the same file, making it uncancellable and
      // letting two translations race to write the same output path.
      if (this.debounceTimers.get(filePath) === timer) {
        this.debounceTimers.delete(filePath);
      }
      void this.runTranslation(filePath);
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Translate one path, reporting any failure through onError.
   *
   * At most one translation per path is in flight. A change arriving while one
   * runs records a single re-run instead of starting a second translation: two
   * concurrent runs write the same output path in API-completion order, so a
   * slower translation of older content can overwrite a newer one. Coalescing
   * also collapses an edit storm into one re-translation rather than one per
   * event.
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
   * loop guard complete while still translating a source file that merely
   * carries a target-language segment in its name (pricing.es.md with --to es).
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
    const key = canonicalPathKey(filePath);
    if (this.writtenOutputs.has(key) || this.warnedOutputs.has(key)) {
      return;
    }
    this.warnedOutputs.add(key);
    Logger.warn(
      `Skipping ${filePath}: it is inside the output directory and named like a translated output, so it is read as a translation rather than a source. Move it outside ${this.watchOptions?.outputDir ?? 'the output directory'} to have it translated.`
    );
  }

  /**
   * Output directory for one source file.
   *
   * Every translation a session writes lands under the one output directory, so
   * the source's directory relative to the watched root is carried over: named
   * by basename alone, two same-named files in different directories write the
   * same output path and the second translation replaces the first. This is the
   * layout `deepl translate <dir> --output <dir>` already produces. A path
   * outside the watched root has no directory to mirror, so it stays at the top.
   */
  private outputDirFor(filePath: string, outputDir: string): string {
    const relativeDir = path.dirname(
      path.relative(this.watchRoot, path.resolve(filePath))
    );
    if (relativeDir === '.' || relativeDir.startsWith('..')) {
      return outputDir;
    }
    return path.join(outputDir, relativeDir);
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

    // targetLang is set per operation below.
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

    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const fileOutputDir = this.outputDirFor(filePath, outputDir);

    if (targetLangs.length === 1) {
      // length === 1 guarantees targetLangs[0] exists
      const targetLang = targetLangs[0]!;
      const outputPath = path.join(
        fileOutputDir,
        `${fileName}.${targetLang}${ext}`
      );

      await this.fileTranslationService.translateFile(
        filePath,
        outputPath,
        { ...baseOptions, targetLang },
        { preserveCode }
      );

      this.writtenOutputs.add(canonicalPathKey(outputPath));
      this.stats.translationsCount++;

      if (this.watchOptions.onTranslate) {
        await this.watchOptions.onTranslate(filePath, {
          text: '',
          outputPath,
          targetLang,
        });
      }
    } else {
      const results = await this.fileTranslationService.translateFileToMultiple(
        filePath,
        targetLangs as Language[],
        { ...baseOptions, outputDir: fileOutputDir, preserveCode }
      );

      for (const result of results) {
        if (result.outputPath) {
          this.writtenOutputs.add(canonicalPathKey(result.outputPath));
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
    this.watchRoot = '';

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
