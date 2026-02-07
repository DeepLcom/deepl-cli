import { Command, Option } from 'commander';
import chalk from 'chalk';
import type { ConfigService } from '../../storage/config.js';
import type { CacheService } from '../../storage/cache.js';
import type { DeepLClient } from '../../api/deepl-client.js';
import { Logger } from '../../utils/logger.js';

export function registerWatch(
  program: Command,
  deps: {
    getConfigService: () => ConfigService;
    getCacheService: () => Promise<CacheService>;
    createDeepLClient: (overrideBaseUrl?: string) => Promise<DeepLClient>;
    handleError: (error: unknown) => never;
  },
): void {
  const { getConfigService, getCacheService, createDeepLClient, handleError } = deps;

  program
    .command('watch')
    .description('Watch files/directories for changes and auto-translate')
    .argument('<path>', 'File or directory path to watch')
    .requiredOption('-t, --targets <languages>', 'Target language(s), comma-separated')
    .option('-f, --from <language>', 'Source language (auto-detect if not specified)')
    .option('-o, --output <path>', 'Output directory (default: <path>/translations or same dir for files)')
    .addOption(new Option('--formality <level>', 'Formality level').choices(['default', 'more', 'less', 'prefer_more', 'prefer_less']))
    .option('--preserve-code', 'Preserve code blocks and variables during translation')
    .option('--preserve-formatting', 'Preserve line breaks and whitespace formatting')
    .option('--pattern <pattern>', 'Glob pattern for file filtering (e.g., "*.md")')
    .option('--debounce <ms>', 'Debounce delay in milliseconds (default: 300)', parseInt)
    .option('--glossary <name-or-id>', 'Use glossary by name or ID')
    .option('--auto-commit', 'Automatically commit translations to git')
    .option('--git-staged', 'Only watch git-staged files (coming soon)')
    .addHelpText('after', `
Examples:
  $ deepl watch ./docs --targets es,fr
  $ deepl watch ./src/i18n --targets de --pattern "*.json" --auto-commit
  $ deepl watch README.md --targets ja --debounce 500
`)
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

        const client = await createDeepLClient();
        const { TranslationService } = await import('../../services/translation.js');
        const { GlossaryService } = await import('../../services/glossary.js');
        const { WatchCommand } = await import('./watch.js');
        const translationService = new TranslationService(client, getConfigService(), await getCacheService());
        const glossaryService = new GlossaryService(client);
        const watchCommand = new WatchCommand(translationService, glossaryService);

        await watchCommand.watch(path, options);
      } catch (error) {
        handleError(error);
      }
    });
}
