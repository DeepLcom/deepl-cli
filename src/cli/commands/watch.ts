/**
 * Watch Command
 * Monitors files/directories for changes and auto-translates
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import pLimit, { type LimitFunction } from 'p-limit';
import { WatchService } from '../../services/watch.js';
import { FileTranslationService } from '../../services/file-translation.js';
import { TranslationService } from '../../services/translation.js';
import { GlossaryService } from '../../services/glossary.js';
import { Language, Formality } from '../../types/index.js';
import {
  FileTranslationResult,
  WatchTranslationResult,
} from '../../services/watch.js';
import { Logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { canonicalPathKey } from '../../utils/paths.js';
import {
  applyGlossarySourceLang,
  hasGlossarySelection,
} from '../../utils/glossary-params.js';
import type { ConfigService } from '../../storage/config.js';
import { DEFAULT_DEBOUNCE_MS } from '../../storage/config.js';

interface WatchOptions {
  to: string;
  from?: string;
  formality?: string;
  glossary?: string;
  preserveCode?: boolean;
  preserveFormatting?: boolean;
  pattern?: string;
  debounce?: number;
  concurrency?: number;
  output?: string;
  autoCommit?: boolean;
  gitStaged?: boolean;
}

/**
 * The directory a git command about `target` must run in: the watched path
 * itself when it is a directory, and its parent when it is a single file.
 */
function watchedDirectory(target: string): string {
  const isDirectory =
    fs.existsSync(target) && fs.statSync(target).isDirectory();
  return isDirectory ? target : path.dirname(target);
}

/**
 * What git said, rather than only that a command failed.
 *
 * `execFile` puts the exit status in `message` and the diagnosis in `stderr`, so
 * reporting `message` alone discarded the one part that tells the user what to
 * fix.
 */
function gitFailureDetail(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const stderr = (error as { stderr?: unknown }).stderr;
    const text = typeof stderr === 'string' ? stderr.trim() : '';
    if (text) return text;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

export class WatchCommand {
  private fileTranslationService: FileTranslationService;
  private glossaryService: GlossaryService;
  private config?: ConfigService;
  private watchService?: WatchService;
  /**
   * git takes `.git/index.lock` for the duration of an `add` or a `commit`, so
   * two auto-commits running at once make one of them fail. Translations of
   * different files do run in parallel, so the git work is queued one at a
   * time behind this.
   */
  private gitLimit: LimitFunction = pLimit(1);
  private autoCommitFailures = 0;

  /**
   * `config` supplies `defaults.sourceLang` for the glossary requirement below.
   * Optional so a caller that has no configuration still gets the requirement,
   * just without a default to satisfy it from.
   */
  constructor(
    translationService: TranslationService,
    glossaryService: GlossaryService,
    config?: ConfigService
  ) {
    this.fileTranslationService = new FileTranslationService(
      translationService
    );
    this.glossaryService = glossaryService;
    this.config = config;
  }

  private async resolveGlossaryId(
    nameOrId: string,
    expected?: { from: Language; targets: Language[] }
  ): Promise<string> {
    return this.glossaryService.resolveGlossaryId(nameOrId, expected);
  }

  /**
   * The working tree root of the repository containing `anchorDir`, or null
   * when that directory is not inside one.
   *
   * git resolves a relative pathspec against its own working directory and
   * refuses one that lies outside its working tree, so every git invocation is
   * anchored on the files it acts on rather than on the directory the CLI
   * happens to have been started in.
   */
  private async gitWorktreeRoot(anchorDir: string): Promise<string | null> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-parse', '--show-toplevel'],
        { cwd: anchorDir }
      );
      const root = stdout.trim();
      return root.length > 0 ? root : null;
    } catch {
      return null;
    }
  }

  /**
   * Get the set of git-staged file paths (absolute).
   *
   * The index that matters is the one belonging to the path being watched, and
   * `git diff --cached` names its files relative to that repository's root, so
   * both the query and the paths it returns are anchored there.
   *
   * SECURITY: Uses execFile instead of exec to prevent command injection
   */
  async getStagedFiles(pathToWatch: string): Promise<Set<string>> {
    const root = await this.gitWorktreeRoot(watchedDirectory(pathToWatch));
    if (root === null) {
      throw new ValidationError('--git-staged requires a git repository');
    }

    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
      { cwd: root }
    );
    const files = stdout
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);
    return new Set(files.map((f) => canonicalPathKey(path.resolve(root, f))));
  }

  /**
   * Start watching a file or directory
   */
  async watch(pathToWatch: string, options: WatchOptions): Promise<void> {
    // Validate path exists
    if (!fs.existsSync(pathToWatch)) {
      throw new ValidationError(`Path not found: ${pathToWatch}`);
    }

    // Parse target languages
    const targetLangs = options.to
      .split(',')
      .map((lang) => lang.trim())
      .filter((lang) => lang.length > 0) as Language[];

    if (targetLangs.length === 0) {
      throw new ValidationError(
        'No target language specified.',
        'Use --to <lang>:   deepl watch ./docs --to es,fr,de\n  Set a default:     deepl init'
      );
    }

    // The API rejects any translation naming a glossary without source_lang, so
    // an unguarded watch session fails once per file change instead of at launch.
    // Settled from `defaults.sourceLang` when the flag is absent, the same way
    // every other command does it, so a direct call and the CLI agree on what is
    // runnable.
    if (hasGlossarySelection(options)) {
      applyGlossarySourceLang(
        options,
        this.config?.getValue<string>('defaults.sourceLang'),
        'Example: deepl watch ./docs --from en --to es --glossary my-glossary'
      );
    }

    // Get git-staged files if requested
    let stagedFiles: Set<string> | undefined;
    if (options.gitStaged) {
      stagedFiles = await this.getStagedFiles(pathToWatch);
      if (stagedFiles.size === 0) {
        Logger.warn(
          chalk.yellow('No git-staged files found. Nothing to watch.')
        );
        return;
      }
      Logger.info(chalk.gray(`Git-staged files: ${stagedFiles.size}`));
    }

    // Resolve glossary ID if provided. The pair is known at launch, so the
    // coverage check happens here rather than once per file change.
    let glossaryId: string | undefined;
    if (options.glossary) {
      glossaryId = await this.resolveGlossaryId(
        options.glossary,
        options.from
          ? { from: options.from as Language, targets: targetLangs }
          : undefined
      );
    }

    // Determine output directory
    let outputDir: string;
    if (options.output) {
      outputDir = options.output;
    } else {
      // Default: create translations/ subdirectory
      const isDirectory = fs.statSync(pathToWatch).isDirectory();
      if (isDirectory) {
        outputDir = `${pathToWatch}/translations`;
      } else {
        // For files, use same directory
        const pathParts = pathToWatch.split('/');
        pathParts.pop();
        outputDir = pathParts.join('/') || '.';
      }
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // git can only commit files inside its own working tree, so --auto-commit
    // is answerable only by the repository holding the output directory. Asked
    // here, before the first translation is billed, so a session that could
    // never commit anything says so once instead of once per translated file.
    if (options.autoCommit) {
      const repoRoot = await this.gitWorktreeRoot(outputDir);
      if (repoRoot === null) {
        throw new ValidationError(
          `--auto-commit needs a git repository, but the output directory "${outputDir}" is not inside one.`,
          'Point --output at a path inside the repository the translations belong to, or drop --auto-commit.'
        );
      }
    }

    // Create watch service with optional debounce and concurrency
    const watchServiceOptions: {
      debounceMs?: number;
      concurrency?: number;
      pattern?: string;
      stagedFiles?: Set<string>;
    } = { pattern: options.pattern, stagedFiles };

    // The default is applied here rather than left to WatchService so that the
    // documented value holds and `watch.debounceMs` takes effect: the flag wins,
    // then configuration, then the documented default.
    watchServiceOptions.debounceMs =
      options.debounce ??
      this.config?.getValue<number>('watch.debounceMs') ??
      DEFAULT_DEBOUNCE_MS;
    if (options.concurrency) {
      watchServiceOptions.concurrency = options.concurrency;
    }

    this.watchService = new WatchService(
      this.fileTranslationService,
      watchServiceOptions
    );

    // Create abort controller for cancellation
    const controller = new AbortController();

    // Build watch options
    const watchOpts = {
      targetLangs,
      outputDir,
      sourceLang: options.from as Language | undefined,
      formality: options.formality as Formality | undefined,
      glossaryId,
      preserveCode: options.preserveCode,
      preserveFormatting: options.preserveFormatting,
      abortSignal: controller.signal,
      onChange: (filePath: string) => {
        Logger.info(chalk.blue('📝 Change detected:'), filePath);
      },
      onTranslate: async (filePath: string, result: WatchTranslationResult) => {
        if (Array.isArray(result)) {
          // Multiple languages
          Logger.success(
            chalk.green(
              `✓ Translated ${filePath} to ${result.length} languages`
            )
          );
          result.forEach((r: FileTranslationResult) => {
            Logger.info(chalk.gray(`  → [${r.targetLang}] ${r.outputPath}`));
          });
        } else {
          // Single language
          Logger.success(chalk.green(`✓ Translated ${filePath}`));
          Logger.info(chalk.gray(`  → ${result.outputPath}`));
        }

        // Auto-commit if enabled
        if (options.autoCommit) {
          await this.autoCommit(filePath, result);
        }
      },
      onError: (filePath: string, error: Error) => {
        Logger.error(
          chalk.red(`✗ Translation failed for ${filePath}:`),
          error.message
        );
      },
    };

    // Start watching
    this.watchService.watch(pathToWatch, watchOpts);

    // Display initial message
    Logger.success(chalk.green('👀 Watching for changes...'));
    Logger.info(chalk.gray(`Path: ${pathToWatch}`));
    Logger.info(chalk.gray(`Targets: ${targetLangs.join(', ')}`));
    Logger.info(chalk.gray(`Output: ${outputDir}`));
    if (options.pattern) {
      Logger.info(chalk.gray(`Pattern: ${options.pattern}`));
    }
    if (stagedFiles) {
      Logger.info(chalk.gray(`Git-staged: ${stagedFiles.size} file(s)`));
    }
    if (options.autoCommit) {
      Logger.warn(chalk.yellow('⚠️  Auto-commit enabled'));
    }
    Logger.info(chalk.gray('Press Ctrl+C to stop\n'));

    // Handle graceful shutdown
    const cleanup = async () => {
      Logger.warn(chalk.yellow('\n\n🛑 Stopping watch...'));
      controller.abort();
      if (this.watchService) {
        await this.watchService.stop();
        const stats = this.watchService.getStats();
        Logger.info(chalk.gray(`Translations: ${stats.translationsCount}`));
        Logger.info(chalk.gray(`Errors: ${stats.errorsCount}`));
      }
      if (this.autoCommitFailures > 0) {
        Logger.info(
          chalk.gray(`Auto-commit failures: ${this.autoCommitFailures}`)
        );
      }
      Logger.success(chalk.green('✓ Watch stopped'));
      process.exit(this.sessionExitCode());
    };

    process.on('SIGINT', () => void cleanup());
    process.on('SIGTERM', () => void cleanup());

    // Keep process alive
    await new Promise(() => {
      // Intentionally never resolves - will exit via signal handlers
    });
  }

  /**
   * Auto-commit translated files to git
   * SECURITY: Uses execFile instead of exec to prevent command injection
   */
  private async autoCommit(
    sourceFile: string,
    result: WatchTranslationResult
  ): Promise<void> {
    return this.gitLimit(() => this.commitTranslations(sourceFile, result));
  }

  private async commitTranslations(
    sourceFile: string,
    result: WatchTranslationResult
  ): Promise<void> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      // Collect output files. Resolved here, while the process working
      // directory is still the one they were written relative to.
      const outputFiles: string[] = [];
      if (Array.isArray(result)) {
        result.forEach((r: FileTranslationResult) => {
          if (r.outputPath) {
            outputFiles.push(path.resolve(r.outputPath));
          }
        });
      } else if (result.outputPath) {
        outputFiles.push(path.resolve(result.outputPath));
      }

      if (outputFiles.length === 0) {
        return;
      }

      // The translations decide which repository receives them: git can only
      // commit files inside its own working tree, so the commit belongs to the
      // repository holding the output directory.
      const cwd = await this.gitWorktreeRoot(path.dirname(outputFiles[0]!));
      if (cwd === null) {
        Logger.warn(
          chalk.yellow('⚠️  Not a git repository, skipping auto-commit')
        );
        return;
      }

      // `--` stops git reading an output path that begins with a dash as an
      // option: execFile prevents shell injection, not git's own option parsing.
      for (const file of outputFiles) {
        await execFileAsync('git', ['add', '--', file], { cwd });
      }

      // Create commit message
      const langs = Array.isArray(result)
        ? result.map((r: FileTranslationResult) => r.targetLang).join(', ')
        : result.targetLang;

      const commitMsg = `chore(i18n): auto-translate ${sourceFile} to ${langs}`;

      // A re-save whose bytes are unchanged stages nothing, and `git commit`
      // then exits non-zero. That is not a failure — nothing needed committing —
      // but the catch below counted it as one, which made `sessionExitCode()`
      // report 12 for a session in which nothing had gone wrong. Asked as a
      // diff rather than by matching git's "nothing to commit" wording, which is
      // translated in a localized git.
      const nothingStaged = await execFileAsync(
        'git',
        ['diff', '--cached', '--quiet', '--', ...outputFiles],
        { cwd }
      ).then(
        () => true,
        () => false
      );
      if (nothingStaged) {
        Logger.info(
          'Auto-commit: translated output unchanged, nothing to commit'
        );
        return;
      }

      // --only restricts the commit to the translated outputs, so anything else
      // already staged in the index is not swept into an i18n commit.
      await execFileAsync(
        'git',
        ['commit', '--only', '-m', commitMsg, '--', ...outputFiles],
        { cwd }
      );

      Logger.success(chalk.green('✓ Auto-committed translations'));
    } catch (error) {
      this.autoCommitFailures++;
      Logger.error(chalk.red('✗ Auto-commit failed:'), gitFailureDetail(error));
    }
  }

  /**
   * Exit code for a watch session ending on SIGINT/SIGTERM. A translation or an
   * auto-commit that failed during the session is a partial failure, not a
   * clean run: the session used to report exit 0 with the failures only logged,
   * so a script driving `deepl watch` had no way to notice.
   */
  private sessionExitCode(): number {
    const errors = this.watchService?.getStats().errorsCount ?? 0;
    return errors > 0 || this.autoCommitFailures > 0 ? 12 : 0;
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watchService) {
      await this.watchService.stop();
    }
  }
}
