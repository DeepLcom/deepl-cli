import type { Command } from 'commander';
import chalk from 'chalk';
import type { ConfigService } from '../../storage/config.js';
import type { DeepLClient } from '../../api/deepl-client.js';
import { Logger } from '../../utils/logger.js';
import type { CreateDeepLClient } from './service-factory.js';

export function registerLanguages(
  program: Command,
  deps: {
    getConfigService: () => ConfigService;
    createDeepLClient: CreateDeepLClient;
    handleError: (error: unknown) => never;
  },
): void {
  const { getConfigService, createDeepLClient, handleError } = deps;

  program
    .command('languages')
    .description('List supported source and target languages')
    .option('-s, --source', 'Show only source languages')
    .option('-t, --target', 'Show only target languages')
    .option('--format <format>', 'Output format: table, json (default: table)')
    .addHelpText('after', `
Examples:
  $ deepl languages
  $ deepl languages --source
  $ deepl languages --target
  $ deepl languages --format json
`)
    .action(async (options: { source?: boolean; target?: boolean; format?: string }) => {
      try {
        const apiKey = getConfigService().getValue<string>('auth.apiKey');
        const envKey = process.env['DEEPL_API_KEY'];
        const hasApiKey = !!(apiKey ?? envKey);

        let client: DeepLClient | null = null;
        if (hasApiKey) {
          client = await createDeepLClient();
        } else {
          Logger.warn(chalk.yellow('Note: No API key configured. Showing local language registry only.'));
          Logger.warn(chalk.yellow('Run: deepl auth set-key <your-api-key> for API-verified names.\n'));
        }

        const { LanguagesCommand } = await import('./languages.js');
        const languagesCommand = new LanguagesCommand(client);

        if (options.format === 'json') {
          if (options.source && !options.target) {
            const sourceLanguages = await languagesCommand.getSourceLanguages();
            Logger.output(JSON.stringify(sourceLanguages, null, 2));
          } else if (options.target && !options.source) {
            const targetLanguages = await languagesCommand.getTargetLanguages();
            Logger.output(JSON.stringify(targetLanguages, null, 2));
          } else {
            const [sourceLanguages, targetLanguages] = await Promise.all([
              languagesCommand.getSourceLanguages(),
              languagesCommand.getTargetLanguages(),
            ]);
            Logger.output(JSON.stringify({ source: sourceLanguages, target: targetLanguages }, null, 2));
          }
        } else {
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
        }
      } catch (error) {
        handleError(error);
      }
    });
}
