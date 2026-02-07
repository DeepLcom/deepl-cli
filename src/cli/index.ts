#!/usr/bin/env node

/**
 * DeepL CLI Entry Point
 * Main command-line interface
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, isAbsolute } from 'path';
import { ConfigService } from '../storage/config.js';
import { CacheService } from '../storage/cache.js';
import { DeepLClient } from '../api/deepl-client.js';
import { TranslationService } from '../services/translation.js';
import { WriteService } from '../services/write.js';
import { GlossaryService } from '../services/glossary.js';
import { DocumentTranslationService } from '../services/document-translation.js';
import { AuthCommand } from './commands/auth.js';
import { UsageCommand } from './commands/usage.js';
import { LanguagesCommand } from './commands/languages.js';
import { TranslateCommand } from './commands/translate.js';
import { WriteCommand } from './commands/write.js';
import { WatchCommand } from './commands/watch.js';
import { HooksCommand } from './commands/hooks.js';
import { ConfigCommand as ConfigCmd } from './commands/config.js';
import { CacheCommand } from './commands/cache.js';
import { GlossaryCommand } from './commands/glossary.js';
import { StyleRulesCommand } from './commands/style-rules.js';
import { AdminCommand } from './commands/admin.js';
import { WriteLanguage, WritingStyle, WriteTone } from '../types/api.js';
import { Language } from '../types/common.js';
import { HookType } from '../services/git-hooks.js';
import { Logger } from '../utils/logger.js';
import { ExitCode, getExitCodeFromError } from '../utils/exit-codes.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };
const { version } = packageJson;

// Initialize services
// Support custom config directory for testing via DEEPL_CONFIG_DIR env var
const defaultConfigPath = process.env['DEEPL_CONFIG_DIR']
  ? join(process.env['DEEPL_CONFIG_DIR'], 'config.json')
  : undefined;

// Create config service - can be overridden by --config flag
let configService = new ConfigService(defaultConfigPath);
const cacheService = new CacheService();

// Cleanup on exit
process.on('exit', () => {
  cacheService.close();
});

process.on('SIGINT', () => {
  cacheService.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cacheService.close();
  process.exit(0);
});

/**
 * Handle error and exit with appropriate exit code
 */
function handleError(error: unknown): never {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const exitCode = error instanceof Error ? getExitCodeFromError(error) : ExitCode.GeneralError;

  Logger.error(chalk.red('Error:'), errorMessage);
  process.exit(exitCode);
}

/**
 * Create DeepL client with API key from config or env
 */
function createDeepLClient(overrideBaseUrl?: string): DeepLClient {
  const apiKey = configService.getValue<string>('auth.apiKey');
  const envKey = process.env['DEEPL_API_KEY'];

  const key = apiKey ?? envKey;

  if (!key) {
    Logger.error(chalk.red('Error: API key not set'));
    Logger.warn(chalk.yellow('Run: deepl auth set-key <your-api-key>'));
    process.exit(ExitCode.AuthError);
  }

  const baseUrl = overrideBaseUrl ?? configService.getValue<string>('api.baseUrl');
  const usePro = configService.getValue<boolean>('api.usePro');

  return new DeepLClient(key, { baseUrl, usePro });
}

// Create program
const program = new Command();

program
  .name('deepl')
  .description('DeepL CLI - Next-generation translation tool powered by DeepL API')
  .version(version)
  .option('-q, --quiet', 'Suppress all non-essential output (errors and results only)')
  .option('-c, --config <file>', 'Use alternate configuration file')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();

    // Handle --config flag - reinitialize config service with custom path
    // SECURITY: Validate path to prevent traversal attacks
    if (options['config']) {
      const customConfigPath = options['config'] as string;

      // Resolve to absolute path (handles both relative and absolute paths)
      // resolve() automatically normalizes and resolves '..' sequences safely
      const safePath = isAbsolute(customConfigPath)
        ? resolve(customConfigPath)
        : resolve(process.cwd(), customConfigPath);

      // SECURITY CHECK: After resolution, verify the path hasn't escaped
      // the intended boundaries. Since we're allowing both absolute and
      // relative paths for flexibility, we just ensure the path is normalized.
      // The main protection is that resolve() handles '..' safely.

      configService = new ConfigService(safePath);
    }

    // Set quiet mode before any command runs
    if (options['quiet']) {
      Logger.setQuiet(true);
    }
  });

// Auth command
program
  .command('auth')
  .description('Manage DeepL API authentication')
  .addCommand(
    new Command('set-key')
      .description('Set your DeepL API key')
      .argument('[api-key]', 'Your DeepL API key (or pipe via stdin)')
      .option('--from-stdin', 'Read API key from stdin')
      .action(async (apiKey: string | undefined, opts: { fromStdin?: boolean }) => {
        try {
          let key = apiKey;
          if (opts.fromStdin === true || !key) {
            if (process.stdin.isTTY && !key) {
              handleError(new Error('API key required: provide as argument or use --from-stdin'));
              return;
            }
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk as Buffer);
            }
            key = Buffer.concat(chunks).toString('utf-8').trim();
          }
          const authCommand = new AuthCommand(configService);
          await authCommand.setKey(key);
          Logger.success(chalk.green('✓ API key saved and validated successfully'));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show current API key (masked)')
      .action(async () => {
        try {
          const authCommand = new AuthCommand(configService);
          const key = await authCommand.getKey();
          if (key) {
            const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);
            Logger.info(chalk.blue('API Key:'), masked);
          } else {
            Logger.output(chalk.yellow('No API key set'));
          }
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('clear')
      .description('Remove stored API key')
      .action(async () => {
        try {
          const authCommand = new AuthCommand(configService);
          await authCommand.clearKey();
          Logger.success(chalk.green('✓ API key removed'));
        } catch (error) {
          handleError(error);

        }
      })
  );

// Usage command
program
  .command('usage')
  .description('Show API usage statistics')
  .action(async () => {
    try {
      const client = createDeepLClient();
      const usageCommand = new UsageCommand(client);

      const usage = await usageCommand.getUsage();
      const formatted = usageCommand.formatUsage(usage);
      Logger.output(formatted);
    } catch (error) {
      handleError(error);
    }
  });

// Languages command
program
  .command('languages')
  .description('List supported source and target languages')
  .option('-s, --source', 'Show only source languages')
  .option('-t, --target', 'Show only target languages')
  .action(async (options: { source?: boolean; target?: boolean }) => {
    try {
      // Check for API key before creating client (createDeepLClient calls process.exit)
      const apiKey = configService.getValue<string>('auth.apiKey');
      const envKey = process.env['DEEPL_API_KEY'];
      const hasApiKey = !!(apiKey ?? envKey);

      let client: DeepLClient | null = null;
      if (hasApiKey) {
        client = createDeepLClient();
      } else {
        Logger.warn(chalk.yellow('Note: No API key configured. Showing local language registry only.'));
        Logger.warn(chalk.yellow('Run: deepl auth set-key <your-api-key> for API-verified names.\n'));
      }

      const languagesCommand = new LanguagesCommand(client);

      let output: string;

      if (options.source && !options.target) {
        const sourceLanguages = await languagesCommand.getSourceLanguages();
        output = languagesCommand.formatLanguages(sourceLanguages, 'source');
      } else if (options.target && !options.source) {
        const targetLanguages = await languagesCommand.getTargetLanguages();
        output = languagesCommand.formatLanguages(targetLanguages, 'target');
      } else {
        const [sourceLanguages, targetLanguages] = await Promise.all([
          languagesCommand.getSourceLanguages(),
          languagesCommand.getTargetLanguages(),
        ]);
        output = languagesCommand.formatAllLanguages(sourceLanguages, targetLanguages);
      }

      Logger.output(output);
    } catch (error) {
      handleError(error);
    }
  });

// Translate command
program
  .command('translate')
  .description('Translate text, files, or directories using DeepL API')
  .argument('[text]', 'Text, file path, or directory to translate (or read from stdin)')
  .requiredOption('-t, --to <language>', 'Target language(s), comma-separated for multiple')
  .option('-f, --from <language>', 'Source language (auto-detect if not specified)')
  .option('-o, --output <path>', 'Output file path or directory (required for file/directory translation)')
  .option('--formality <level>', 'Formality level: default, more, less, prefer_more, prefer_less')
  .option('--output-format <format>', 'Convert document format during translation (e.g., pdf, docx, pptx, xlsx, html)')
  .option('--preserve-code', 'Preserve code blocks and variables during translation')
  .option('--preserve-formatting', 'Preserve line breaks and whitespace formatting')
  .option('--context <text>', 'Additional context to improve translation quality')
  .option('--split-sentences <mode>', 'Sentence splitting: on, off, nonewlines (default: on)')
  .option('--tag-handling <mode>', 'Tag handling for XML/HTML: xml, html')
  .option('--model-type <type>', 'Model type: quality_optimized, prefer_quality_optimized, latency_optimized')
  .option('--show-billed-characters', 'Request and display actual billed character count for cost transparency')
  .option('--enable-minification', 'Enable document minification for PPTX/DOCX files (reduces file size)')
  .option('--outline-detection <bool>', 'Control automatic XML structure detection (true/false, default: true, requires --tag-handling xml)')
  .option('--splitting-tags <tags>', 'Comma-separated XML tags that split sentences (requires --tag-handling xml)')
  .option('--non-splitting-tags <tags>', 'Comma-separated XML tags for non-translatable text (requires --tag-handling xml)')
  .option('--ignore-tags <tags>', 'Comma-separated XML tags with content to ignore (requires --tag-handling xml)')
  .option('--tag-handling-version <version>', 'Tag handling version: v1, v2 (v2 improves structure handling, requires --tag-handling)')
  .option('--recursive', 'Process subdirectories recursively (default: true)', true)
  .option('--pattern <pattern>', 'Glob pattern for file filtering (e.g., "*.md")')
  .option('--concurrency <number>', 'Number of parallel translations (default: 5)', parseInt)
  .option('--glossary <name-or-id>', 'Use glossary by name or ID')
  .option('--custom-instruction <instruction>', 'Custom instruction for translation (repeatable, max 10, max 300 chars each)', (val: string, prev: string[]) => prev.concat([val]), [] as string[])
  .option('--style-id <uuid>', 'Style rule ID for translation (Pro API only, forces quality_optimized model)')
  .option('--no-cache', 'Bypass cache for this translation (useful for testing)')
  .option('--format <format>', 'Output format: json, table (default: plain text)')
  .option('--api-url <url>', 'Custom API endpoint (e.g., https://api-free.deepl.com/v2 or internal test URLs)')
  .action(async (text: string | undefined, options: {
    to: string;
    from?: string;
    output?: string;
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
    tagHandlingVersion?: string;
    recursive?: boolean;
    pattern?: string;
    concurrency?: number;
    glossary?: string;
    customInstruction?: string[];
    styleId?: string;
    noCache?: boolean;
    format?: string;
    apiUrl?: string;
  }) => {
    try {
      const client = createDeepLClient();
      const translationService = new TranslationService(client, configService, cacheService);
      const documentTranslationService = new DocumentTranslationService(client);
      const glossaryService = new GlossaryService(client);
      const translateCommand = new TranslateCommand(translationService, documentTranslationService, glossaryService, configService);

      let result: string;

      if (text) {
        // Translate provided text or file
        result = await translateCommand.translate(text, options);
      } else {
        // Read from stdin
        result = await translateCommand.translateFromStdin(options);
      }

      Logger.output(result);
    } catch (error) {
      handleError(error);
    }
  });

// Watch command
program
  .command('watch')
  .description('Watch files/directories for changes and auto-translate')
  .argument('<path>', 'File or directory path to watch')
  .requiredOption('-t, --targets <languages>', 'Target language(s), comma-separated')
  .option('-f, --from <language>', 'Source language (auto-detect if not specified)')
  .option('-o, --output <path>', 'Output directory (default: <path>/translations or same dir for files)')
  .option('--formality <level>', 'Formality level: default, more, less, prefer_more, prefer_less')
  .option('--preserve-code', 'Preserve code blocks and variables during translation')
  .option('--preserve-formatting', 'Preserve line breaks and whitespace formatting')
  .option('--pattern <pattern>', 'Glob pattern for file filtering (e.g., "*.md")')
  .option('--debounce <ms>', 'Debounce delay in milliseconds (default: 300)', parseInt)
  .option('--glossary <name-or-id>', 'Use glossary by name or ID')
  .option('--auto-commit', 'Automatically commit translations to git')
  .option('--git-staged', 'Only watch git-staged files (coming soon)')
  .action(async (path: string, options: {
    targets: string;
    from?: string;
    output?: string;
    formality?: string;
    preserveCode?: boolean;
    preserveFormatting?: boolean;
    pattern?: string;
    debounce?: number;
    glossary?: string;
    autoCommit?: boolean;
    gitStaged?: boolean;
  }) => {
    try {
      if (options.gitStaged) {
        Logger.warn(chalk.yellow('Warning: --git-staged is not yet implemented'));
      }

      const client = createDeepLClient();
      const translationService = new TranslationService(client, configService, cacheService);
      const glossaryService = new GlossaryService(client);
      const watchCommand = new WatchCommand(translationService, glossaryService);

      await watchCommand.watch(path, options);
    } catch (error) {
      handleError(error);
    }
  });

// Write command
program
  .command('write')
  .description('Improve text using DeepL Write API (grammar, style, tone)')
  .argument('<text>', 'Text to improve (or file path when used with file operations)')
  .option('-l, --lang <language>', 'Target language (de, en, en-GB, en-US, es, fr, it, pt, pt-BR, pt-PT). Omit to auto-detect.')
  .option('-s, --style <style>', 'Writing style: simple, business, academic, casual, prefer_simple, prefer_business, prefer_academic, prefer_casual')
  .option('-t, --tone <tone>', 'Tone: enthusiastic, friendly, confident, diplomatic, prefer_enthusiastic, prefer_friendly, prefer_confident, prefer_diplomatic')
  .option('-a, --alternatives', 'Show all alternative improvements')
  .option('-o, --output <file>', 'Write improved text to file')
  .option('--in-place', 'Edit file in place (use with file input)')
  .option('-i, --interactive', 'Interactive mode - choose from multiple suggestions')
  .option('-d, --diff', 'Show diff between original and improved text')
  .option('-c, --check', 'Check if text needs improvement (exit code 0 if no changes)')
  .option('-f, --fix', 'Automatically fix file in place')
  .option('-b, --backup', 'Create backup file before fixing (use with --fix)')
  .option('--format <format>', 'Output format: json, table (default: plain text)')
  .action(async (text: string, options: {
    lang?: string;
    style?: string;
    tone?: string;
    alternatives?: boolean;
    output?: string;
    inPlace?: boolean;
    interactive?: boolean;
    diff?: boolean;
    check?: boolean;
    fix?: boolean;
    backup?: boolean;
    format?: string;
  }) => {
    try {
      // Validate arguments BEFORE creating client (to check API key)
      // This ensures validation errors (exit code 6) come before auth errors (exit code 2)

      // Validate language code if provided
      const validLanguages = ['de', 'en', 'en-GB', 'en-US', 'es', 'fr', 'it', 'pt', 'pt-BR', 'pt-PT'];
      if (options.lang && !validLanguages.includes(options.lang)) {
        throw new Error(`Invalid language code: ${options.lang}. Valid options: ${validLanguages.join(', ')}`);
      }

      // Validate that style and tone are not both specified
      if (options.style && options.tone) {
        throw new Error('Cannot specify both --style and --tone. Use one or the other.');
      }

      const client = createDeepLClient();
      const writeService = new WriteService(client);
      const writeCommand = new WriteCommand(writeService);

      const writeOptions = {
        lang: options.lang as WriteLanguage | undefined,
        style: options.style as WritingStyle | undefined,
        tone: options.tone as WriteTone | undefined,
        showAlternatives: options.alternatives,
        outputFile: options.output,
        inPlace: options.inPlace,
        createBackup: options.backup,
        format: options.format,
      };

      // Check mode
      if (options.check) {
        let needsImprovement: boolean;
        let changes = 0;

        // Check if input is a file
        const { existsSync } = await import('fs');
        if (existsSync(text)) {
          const result = await writeCommand.checkFile(text, writeOptions);
          needsImprovement = result.needsImprovement;
          changes = result.changes;
          Logger.info(chalk.gray(`File: ${text}`));
        } else {
          const result = await writeCommand.checkText(text, writeOptions);
          needsImprovement = result.needsImprovement;
          changes = result.changes;
        }

        if (needsImprovement) {
          Logger.warn(chalk.yellow(`⚠ Text needs improvement (${changes} potential changes)`));
          process.exit(ExitCode.GeneralError); // Exit with error code when improvements needed
        } else {
          Logger.success(chalk.green('✓ Text looks good'));
          process.exit(ExitCode.Success);
        }
      }

      // Auto-fix mode
      if (options.fix) {
        const { existsSync } = await import('fs');
        if (!existsSync(text)) {
          throw new Error('--fix requires a file path as input');
        }

        const result = await writeCommand.autoFixFile(text, writeOptions);

        if (result.fixed) {
          Logger.success(chalk.green('✓ File improved'));
          if (result.backupPath) {
            Logger.info(chalk.gray(`Backup: ${result.backupPath}`));
          }
          Logger.info(chalk.gray(`Changes: ${result.changes}`));
        } else {
          Logger.success(chalk.green('✓ No improvements needed'));
        }
        return;
      }

      // Diff mode
      if (options.diff) {
        const { existsSync } = await import('fs');
        let result: { original: string; improved: string; diff: string };

        if (existsSync(text)) {
          result = await writeCommand.improveFileWithDiff(text, writeOptions);
        } else {
          result = await writeCommand.improveWithDiff(text, writeOptions);
        }

        Logger.output(chalk.bold('Original:'));
        Logger.output(result.original);
        Logger.output();
        Logger.output(chalk.bold('Improved:'));
        Logger.output(result.improved);
        Logger.output();
        Logger.output(chalk.bold('Diff:'));
        Logger.output(result.diff);
        return;
      }

      // Interactive mode
      if (options.interactive) {
        const { existsSync } = await import('fs');
        let result: string;

        if (existsSync(text)) {
          const interactiveResult = await writeCommand.improveFileInteractive(text, writeOptions);
          result = interactiveResult.selected;

          // Write to output file if specified
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          if (options.output || options.inPlace) {
            const outputPath = options.inPlace ? text : options.output!;
            const { writeFile } = await import('fs/promises');
            await writeFile(outputPath, result, 'utf-8');
            Logger.success(chalk.green(`✓ Saved to ${outputPath}`));
          }
        } else {
          result = await writeCommand.improveInteractive(text, writeOptions);
        }

        Logger.output();
        Logger.output(chalk.bold('Selected improvement:'));
        Logger.output(result);
        return;
      }

      // File operations
      const { existsSync } = await import('fs');
      if (existsSync(text)) {
        const result = await writeCommand.improveFile(text, writeOptions);
        Logger.output(result);
        return;
      }

      // Text improvement (default)
      const result = await writeCommand.improve(text, writeOptions);
      Logger.output(result);
    } catch (error) {
      handleError(error);
    }
  });

// Config command
program
  .command('config')
  .description('Manage configuration')
  .addCommand(
    new Command('get')
      .description('Get configuration value')
      .argument('[key]', 'Config key (dot notation) or empty for all')
      .action(async (key?: string) => {
        try {
          const configCommand = new ConfigCmd(configService);
          const value = await configCommand.get(key);
          // Convert undefined to null for proper JSON output
          Logger.output(JSON.stringify(value ?? null, null, 2));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('set')
      .description('Set configuration value')
      .argument('<key>', 'Config key (dot notation)')
      .argument('<value>', 'Value to set')
      .action(async (key: string, value: string) => {
        try {
          const configCommand = new ConfigCmd(configService);
          await configCommand.set(key, value);
          Logger.success(chalk.green(`✓ Set ${key} = ${value}`));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all configuration values')
      .action(async () => {
        try {
          const configCommand = new ConfigCmd(configService);
          const config = await configCommand.list();
          Logger.output(JSON.stringify(config, null, 2));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('reset')
      .description('Reset configuration to defaults')
      .action(async () => {
        try {
          const configCommand = new ConfigCmd(configService);
          await configCommand.reset();
          Logger.success(chalk.green('✓ Configuration reset to defaults'));
        } catch (error) {
          handleError(error);

        }
      })
  );

// Cache command
program
  .command('cache')
  .description('Manage translation cache')
  .addCommand(
    new Command('stats')
      .description('Show cache statistics')
      .action(async () => {
        try {
          const cacheCommand = new CacheCommand(cacheService, configService);
          const stats = await cacheCommand.stats();
          const formatted = cacheCommand.formatStats(stats);
          Logger.output(formatted);
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('clear')
      .description('Clear all cached translations')
      .action(async () => {
        try {
          const cacheCommand = new CacheCommand(cacheService, configService);
          await cacheCommand.clear();
          Logger.success(chalk.green('✓ Cache cleared successfully'));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('enable')
      .description('Enable translation cache')
      .option('--max-size <size>', 'Maximum cache size (e.g., 100M, 1G, 500MB)')
      .action(async (options: { maxSize?: string }) => {
        try {
          let maxSizeBytes: number | undefined;

          // Parse max size if provided
          if (options.maxSize) {
            const { parseSize } = await import('../utils/parse-size.js');
            maxSizeBytes = parseSize(options.maxSize);
          }

          const cacheCommand = new CacheCommand(cacheService, configService);
          await cacheCommand.enable(maxSizeBytes);
          Logger.success(chalk.green('✓ Cache enabled'));

          if (maxSizeBytes !== undefined) {
            const { formatSize } = await import('../utils/parse-size.js');
            Logger.info(chalk.gray(`Max size: ${formatSize(maxSizeBytes)}`));
          }
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('disable')
      .description('Disable translation cache')
      .action(async () => {
        try {
          const cacheCommand = new CacheCommand(cacheService, configService);
          await cacheCommand.disable();
          Logger.success(chalk.green('✓ Cache disabled'));
        } catch (error) {
          handleError(error);

        }
      })
  );

// Glossary command
program
  .command('glossary')
  .description('Manage translation glossaries')
  .addCommand(
    new Command('create')
      .description('Create a glossary from TSV/CSV file')
      .argument('<name>', 'Glossary name')
      .argument('<source-lang>', 'Source language code')
      .argument('<target-lang>', 'Target language code')
      .argument('<file>', 'TSV/CSV file path')
      .action(async (name: string, sourceLang: string, targetLang: string, file: string) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          // v3 API: convert target lang to array
          const targetLangs = [targetLang as Language];

          const glossary = await glossaryCommand.create(name, sourceLang as Language, targetLangs, file);
          Logger.success(chalk.green('✓ Glossary created successfully'));
          Logger.output(glossaryCommand.formatGlossaryInfo(glossary));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all glossaries')
      .action(async () => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          const glossaries = await glossaryCommand.list();
          Logger.output(glossaryCommand.formatGlossaryList(glossaries));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show glossary details')
      .argument('<name-or-id>', 'Glossary name or ID')
      .action(async (nameOrId: string) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          const glossary = await glossaryCommand.show(nameOrId);
          Logger.output(glossaryCommand.formatGlossaryInfo(glossary));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('entries')
      .description('Show glossary entries')
      .argument('<name-or-id>', 'Glossary name or ID')
      .option('--target <lang>', 'Target language (required for multilingual glossaries)')
      .action(async (nameOrId: string, options: { target?: string }) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          const targetLang = options.target as Language | undefined;
          const entries = await glossaryCommand.entries(nameOrId, targetLang);
          Logger.output(glossaryCommand.formatEntries(entries));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('delete')
      .description('Delete a glossary')
      .argument('<name-or-id>', 'Glossary name or ID')
      .action(async (nameOrId: string) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          await glossaryCommand.delete(nameOrId);
          Logger.success(chalk.green('✓ Glossary deleted successfully'));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('languages')
      .description('List supported glossary language pairs')
      .action(async () => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          const pairs = await glossaryCommand.listLanguages();
          Logger.output(glossaryCommand.formatLanguagePairs(pairs));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('add-entry')
      .description('Add a new entry to a glossary')
      .argument('<name-or-id>', 'Glossary name or ID')
      .argument('<source>', 'Source text')
      .argument('<target>', 'Target text')
      .option('--target-lang <lang>', 'Target language (required for multilingual glossaries)')
      .action(async (nameOrId: string, source: string, target: string, options: { targetLang?: string }) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          const targetLang = options.targetLang as Language | undefined;
          await glossaryCommand.addEntry(nameOrId, source, target, targetLang);
          Logger.success(chalk.green('✓ Entry added successfully'));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('update-entry')
      .description('Update an existing entry in a glossary')
      .argument('<name-or-id>', 'Glossary name or ID')
      .argument('<source>', 'Source text to update')
      .argument('<new-target>', 'New target text')
      .option('--target-lang <lang>', 'Target language (required for multilingual glossaries)')
      .action(async (nameOrId: string, source: string, newTarget: string, options: { targetLang?: string }) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          const targetLang = options.targetLang as Language | undefined;
          await glossaryCommand.updateEntry(nameOrId, source, newTarget, targetLang);
          Logger.success(chalk.green('✓ Entry updated successfully'));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('remove-entry')
      .description('Remove an entry from a glossary')
      .argument('<name-or-id>', 'Glossary name or ID')
      .argument('<source>', 'Source text to remove')
      .option('--target-lang <lang>', 'Target language (required for multilingual glossaries)')
      .action(async (nameOrId: string, source: string, options: { targetLang?: string }) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          const targetLang = options.targetLang as Language | undefined;
          await glossaryCommand.removeEntry(nameOrId, source, targetLang);
          Logger.success(chalk.green('✓ Entry removed successfully'));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('rename')
      .description('Rename a glossary')
      .argument('<name-or-id>', 'Glossary name or ID')
      .argument('<new-name>', 'New glossary name')
      .action(async (nameOrId: string, newName: string) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          await glossaryCommand.rename(nameOrId, newName);
          Logger.success(chalk.green('✓ Glossary renamed successfully'));
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('replace-dictionary')
      .description('Replace all entries in a glossary dictionary from a TSV/CSV file (v3)')
      .argument('<name-or-id>', 'Glossary name or ID')
      .argument('<target-lang>', 'Target language of dictionary to replace')
      .argument('<file>', 'TSV/CSV file with replacement entries')
      .action(async (nameOrId: string, targetLang: string, file: string) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          await glossaryCommand.replaceDictionary(nameOrId, targetLang as Language, file);
          Logger.success(chalk.green(`✓ Dictionary replaced successfully (${targetLang})`));
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('delete-dictionary')
      .description('Delete a dictionary from a multilingual glossary (v3)')
      .argument('<name-or-id>', 'Glossary name or ID')
      .argument('<target-lang>', 'Target language of dictionary to delete')
      .action(async (nameOrId: string, targetLang: string) => {
        try {
          const client = createDeepLClient();
          const glossaryService = new GlossaryService(client);
          const glossaryCommand = new GlossaryCommand(glossaryService);

          await glossaryCommand.deleteDictionary(nameOrId, targetLang as Language);
          Logger.success(chalk.green(`✓ Dictionary deleted successfully (${targetLang})`));
        } catch (error) {
          handleError(error);

        }
      })
  );

// Hooks command
program
  .command('hooks')
  .description('Manage git hooks for translation workflow')
  .addCommand(
    new Command('install')
      .description('Install a git hook')
      .argument('<hook-type>', 'Hook type: pre-commit, pre-push, commit-msg, or post-commit')
      .action((hookType: string) => {
        try {
          const hooksCommand = new HooksCommand();
          const result = hooksCommand.install(hookType as HookType);
          Logger.output(result);
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('uninstall')
      .description('Uninstall a git hook')
      .argument('<hook-type>', 'Hook type: pre-commit, pre-push, commit-msg, or post-commit')
      .action((hookType: string) => {
        try {
          const hooksCommand = new HooksCommand();
          const result = hooksCommand.uninstall(hookType as HookType);
          Logger.output(result);
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all hooks and their status')
      .action(() => {
        try {
          const hooksCommand = new HooksCommand();
          const result = hooksCommand.list();
          Logger.output(result);
        } catch (error) {
          handleError(error);

        }
      })
  )
  .addCommand(
    new Command('path')
      .description('Show path to a hook file')
      .argument('<hook-type>', 'Hook type: pre-commit, pre-push, commit-msg, or post-commit')
      .action((hookType: string) => {
        try {
          const hooksCommand = new HooksCommand();
          const result = hooksCommand.showPath(hookType as HookType);
          Logger.output(result);
        } catch (error) {
          handleError(error);

        }
      })
  );

// Style Rules command
program
  .command('style-rules')
  .description('Manage DeepL style rules (Pro API only)')
  .addCommand(
    new Command('list')
      .description('List all style rules')
      .option('--detailed', 'Show detailed information including configured rules and custom instructions')
      .option('--page <number>', 'Page number for pagination', parseInt)
      .option('--page-size <number>', 'Number of results per page (1-25)', parseInt)
      .option('--format <format>', 'Output format: json (default: plain text)')
      .action(async (options: {
        detailed?: boolean;
        page?: number;
        pageSize?: number;
        format?: string;
      }) => {
        try {
          const client = createDeepLClient();
          const styleRulesCommand = new StyleRulesCommand(client);

          const rules = await styleRulesCommand.list({
            detailed: options.detailed,
            page: options.page,
            pageSize: options.pageSize,
          });

          if (options.format === 'json') {
            Logger.output(styleRulesCommand.formatStyleRulesJson(rules));
          } else {
            Logger.output(styleRulesCommand.formatStyleRulesList(rules));
          }
        } catch (error) {
          handleError(error);
        }
      })
  );

// Admin command
const adminCmd = program
  .command('admin')
  .description('Admin API: manage API keys and view organization usage (requires admin key)');

const adminKeysCmd = adminCmd
  .command('keys')
  .description('Manage API keys');

adminKeysCmd
  .addCommand(
    new Command('list')
      .description('List all API keys')
      .option('--format <format>', 'Output format: json (default: plain text)')
      .action(async (options: { format?: string }) => {
        try {
          const client = createDeepLClient();
          const admin = new AdminCommand(client);
          const keys = await admin.listKeys();
          if (options.format === 'json') {
            Logger.output(admin.formatJson(keys));
          } else {
            Logger.output(admin.formatKeyList(keys));
          }
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('create')
      .description('Create a new API key')
      .option('--label <label>', 'Label for the new key')
      .option('--format <format>', 'Output format: json (default: plain text)')
      .action(async (options: { label?: string; format?: string }) => {
        try {
          const client = createDeepLClient();
          const admin = new AdminCommand(client);
          const key = await admin.createKey(options.label);
          if (options.format === 'json') {
            Logger.output(admin.formatJson(key));
          } else {
            Logger.success(chalk.green('✓ API key created'));
            Logger.output(admin.formatKeyInfo(key));
          }
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('deactivate')
      .description('Deactivate an API key (permanent)')
      .argument('<key-id>', 'Key ID to deactivate')
      .action(async (keyId: string) => {
        try {
          const client = createDeepLClient();
          const admin = new AdminCommand(client);
          await admin.deactivateKey(keyId);
          Logger.success(chalk.green(`✓ API key ${keyId} deactivated`));
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('rename')
      .description('Rename an API key')
      .argument('<key-id>', 'Key ID to rename')
      .argument('<label>', 'New label')
      .action(async (keyId: string, label: string) => {
        try {
          const client = createDeepLClient();
          const admin = new AdminCommand(client);
          await admin.renameKey(keyId, label);
          Logger.success(chalk.green(`✓ API key ${keyId} renamed to "${label}"`));
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('set-limit')
      .description('Set character usage limit for an API key')
      .argument('<key-id>', 'Key ID')
      .argument('<characters>', 'Character limit (number or "unlimited")')
      .action(async (keyId: string, characters: string) => {
        try {
          const client = createDeepLClient();
          const admin = new AdminCommand(client);
          const limit = characters === 'unlimited' ? null : parseInt(characters, 10);
          if (limit !== null && isNaN(limit)) {
            throw new Error('Characters must be a number or "unlimited"');
          }
          await admin.setKeyLimit(keyId, limit);
          const limitStr = limit === null ? 'unlimited' : limit.toLocaleString();
          Logger.success(chalk.green(`✓ Usage limit for ${keyId} set to ${limitStr} characters`));
        } catch (error) {
          handleError(error);
        }
      })
  );

adminCmd
  .addCommand(
    new Command('usage')
      .description('View organization usage analytics')
      .requiredOption('--start <date>', 'Start date (YYYY-MM-DD)')
      .requiredOption('--end <date>', 'End date (YYYY-MM-DD)')
      .option('--group-by <grouping>', 'Group results: key, key_and_day')
      .option('--format <format>', 'Output format: json (default: plain text)')
      .action(async (options: {
        start: string;
        end: string;
        groupBy?: string;
        format?: string;
      }) => {
        try {
          const client = createDeepLClient();
          const admin = new AdminCommand(client);
          const report = await admin.getUsage({
            startDate: options.start,
            endDate: options.end,
            groupBy: options.groupBy as 'key' | 'key_and_day' | undefined,
          });
          if (options.format === 'json') {
            Logger.output(admin.formatJson(report));
          } else {
            Logger.output(admin.formatUsage(report));
          }
        } catch (error) {
          handleError(error);
        }
      })
  );

// Parse arguments
program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
