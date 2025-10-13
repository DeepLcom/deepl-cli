/**
 * Watch Command
 * Monitors files/directories for changes and auto-translates
 */

import * as fs from 'fs';
import chalk from 'chalk';
import { WatchService } from '../../services/watch.js';
import { FileTranslationService } from '../../services/file-translation.js';
import { TranslationService } from '../../services/translation.js';
import { GlossaryService } from '../../services/glossary.js';
import { Language } from '../../types/index.js';
import { Logger } from '../../utils/logger.js';

interface WatchOptions {
  targets: string;
  from?: string;
  formality?: string;
  glossary?: string;
  preserveCode?: boolean;
  preserveFormatting?: boolean;
  pattern?: string;
  debounce?: number;
  output?: string;
  autoCommit?: boolean;
  gitStaged?: boolean;
}

export class WatchCommand {
  private fileTranslationService: FileTranslationService;
  private glossaryService: GlossaryService;
  private watchService?: WatchService;

  constructor(translationService: TranslationService, glossaryService: GlossaryService) {
    this.fileTranslationService = new FileTranslationService(translationService);
    this.glossaryService = glossaryService;
  }

  /**
   * Resolve glossary ID from name or ID
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
   * Start watching a file or directory
   */
  async watch(pathToWatch: string, options: WatchOptions): Promise<void> {
    // Validate path exists
    if (!fs.existsSync(pathToWatch)) {
      throw new Error(`Path not found: ${pathToWatch}`);
    }

    // Parse target languages
    const targetLangs = options.targets.split(',').map(lang => lang.trim()).filter(lang => lang.length > 0) as Language[];

    if (targetLangs.length === 0) {
      throw new Error('At least one target language is required. Use --targets es,fr,de');
    }

    // Resolve glossary ID if provided
    let glossaryId: string | undefined;
    if (options.glossary) {
      glossaryId = await this.resolveGlossaryId(options.glossary);
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

    // Create watch service with optional debounce
    const watchServiceOptions = options.debounce
      ? { debounceMs: options.debounce, pattern: options.pattern }
      : { pattern: options.pattern };

    this.watchService = new WatchService(this.fileTranslationService, watchServiceOptions);

    // Build watch options
    const watchOpts = {
      targetLangs,
      outputDir,
      sourceLang: options.from as Language | undefined,
      formality: options.formality as 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less' | undefined,
      glossaryId,
      preserveCode: options.preserveCode,
      preserveFormatting: options.preserveFormatting,
      onChange: (filePath: string) => {
        Logger.info(chalk.blue('📝 Change detected:'), filePath);
      },
      onTranslate: async (filePath: string, result: any) => {
        if (Array.isArray(result)) {
          // Multiple languages
          Logger.success(chalk.green(`✓ Translated ${filePath} to ${result.length} languages`));
          result.forEach((r: any) => {
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
        Logger.error(chalk.red(`✗ Translation failed for ${filePath}:`), error.message);
      },
    };

    // Start watching
    await this.watchService.watch(pathToWatch, watchOpts);

    // Display initial message
    Logger.success(chalk.green('👀 Watching for changes...'));
    Logger.info(chalk.gray(`Path: ${pathToWatch}`));
    Logger.info(chalk.gray(`Targets: ${targetLangs.join(', ')}`));
    Logger.info(chalk.gray(`Output: ${outputDir}`));
    if (options.pattern) {
      Logger.info(chalk.gray(`Pattern: ${options.pattern}`));
    }
    if (options.autoCommit) {
      Logger.warn(chalk.yellow('⚠️  Auto-commit enabled'));
    }
    Logger.info(chalk.gray('Press Ctrl+C to stop\n'));

    // Handle graceful shutdown
    const cleanup = async () => {
      Logger.warn(chalk.yellow('\n\n🛑 Stopping watch...'));
      if (this.watchService) {
        await this.watchService.stop();
        const stats = this.watchService.getStats();
        Logger.info(chalk.gray(`Translations: ${stats.translationsCount}`));
        Logger.info(chalk.gray(`Errors: ${stats.errorsCount}`));
      }
      Logger.success(chalk.green('✓ Watch stopped'));
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep process alive
    await new Promise(() => {
      // Intentionally never resolves - will exit via signal handlers
    });
  }

  /**
   * Auto-commit translated files to git
   * SECURITY: Uses execFile instead of exec to prevent command injection
   */
  private async autoCommit(sourceFile: string, result: any): Promise<void> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      // Check if in a git repository
      try {
        await execFileAsync('git', ['rev-parse', '--git-dir']);
      } catch {
        Logger.warn(chalk.yellow('⚠️  Not a git repository, skipping auto-commit'));
        return;
      }

      // Collect output files
      const outputFiles: string[] = [];
      if (Array.isArray(result)) {
        result.forEach((r: any) => {
          if (r.outputPath) {
            outputFiles.push(r.outputPath);
          }
        });
      } else if (result.outputPath) {
        outputFiles.push(result.outputPath);
      }

      if (outputFiles.length === 0) {
        return;
      }

      // Stage files - execFile passes arguments as array, preventing injection
      for (const file of outputFiles) {
        await execFileAsync('git', ['add', file]);
      }

      // Create commit message
      const langs = Array.isArray(result)
        ? result.map((r: any) => r.targetLang).join(', ')
        : result.targetLang;

      const commitMsg = `chore(i18n): auto-translate ${sourceFile} to ${langs}`;

      // Commit - commit message is passed as array argument, preventing injection
      await execFileAsync('git', ['commit', '-m', commitMsg]);

      Logger.success(chalk.green('✓ Auto-committed translations'));
    } catch (error) {
      Logger.error(chalk.red('✗ Auto-commit failed:'), error instanceof Error ? error.message : 'Unknown error');
    }
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
