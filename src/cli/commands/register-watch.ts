import * as fs from 'fs';
import { Command, Option } from 'commander';
import chalk from 'chalk';
import { Logger } from '../../utils/logger.js';
import { createWatchCommand, type ServiceDeps } from './service-factory.js';

export function registerWatch(
  program: Command,
  deps: ServiceDeps,
): void {
  const { handleError } = deps;

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
    .option('--dry-run', 'Show what would be watched without starting the watcher')
    .addHelpText('after', `
Examples:
  $ deepl watch ./docs --targets es,fr
  $ deepl watch ./src/i18n --targets de --pattern "*.json" --auto-commit
  $ deepl watch README.md --targets ja --debounce 500
`)
    .action(async (watchPath: string, options: {
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
      dryRun?: boolean;
    }) => {
      try {
        if (options.dryRun) {
          const targetLangs = options.targets.split(',').map(l => l.trim()).filter(l => l.length > 0);
          const isDirectory = fs.existsSync(watchPath) && fs.statSync(watchPath).isDirectory();
          let outputDir: string;
          if (options.output) {
            outputDir = options.output;
          } else if (isDirectory) {
            outputDir = `${watchPath}/translations`;
          } else {
            const parts = watchPath.split('/');
            parts.pop();
            outputDir = parts.join('/') || '.';
          }

          const lines = [
            chalk.yellow('[dry-run] Watch mode will not be started.'),
            chalk.yellow(`[dry-run] Would watch: ${watchPath}`),
            chalk.yellow(`[dry-run] Target language(s): ${targetLangs.join(', ')}`),
            chalk.yellow(`[dry-run] Output directory: ${outputDir}`),
          ];
          if (options.pattern) {
            lines.push(chalk.yellow(`[dry-run] File pattern: ${options.pattern}`));
          }
          if (options.from) {
            lines.push(chalk.yellow(`[dry-run] Source language: ${options.from}`));
          }
          if (options.autoCommit) {
            lines.push(chalk.yellow(`[dry-run] Auto-commit: enabled`));
          }
          if (options.debounce) {
            lines.push(chalk.yellow(`[dry-run] Debounce: ${options.debounce}ms`));
          }
          lines.push(chalk.yellow('[dry-run] On file change, translations would be triggered for the above target languages.'));
          Logger.output(lines.join('\n'));
          return;
        }

        if (options.gitStaged) {
          Logger.warn(chalk.yellow('Warning: --git-staged is not yet implemented'));
        }

        const watchCommand = await createWatchCommand(deps);

        await watchCommand.watch(watchPath, options);
      } catch (error) {
        handleError(error);
      }
    });
}
