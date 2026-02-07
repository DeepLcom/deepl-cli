import { Command } from 'commander';
import type { DeepLClient } from '../../api/deepl-client.js';
import { Logger } from '../../utils/logger.js';

export function registerStyleRules(
  program: Command,
  deps: {
    createDeepLClient: (overrideBaseUrl?: string) => Promise<DeepLClient>;
    handleError: (error: unknown) => never;
  },
): void {
  const { createDeepLClient, handleError } = deps;

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
            const client = await createDeepLClient();
            const { StyleRulesCommand } = await import('./style-rules.js');
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
}
