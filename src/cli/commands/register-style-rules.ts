import { Command, Option } from 'commander';
import { Logger } from '../../utils/logger.js';
import { createStyleRulesCommand, type CreateDeepLClient } from './service-factory.js';

export function registerStyleRules(
  program: Command,
  deps: {
    createDeepLClient: CreateDeepLClient;
    handleError: (error: unknown) => never;
  },
): void {
  const { createDeepLClient, handleError } = deps;

  program
    .command('style-rules')
    .description('Manage DeepL style rules (Pro API only)')
    .addHelpText('after', `
Examples:
  $ deepl style-rules list
  $ deepl style-rules list --detailed
  $ deepl style-rules list --format json
  $ deepl style-rules list --page 2 --page-size 10
`)
    .addCommand(
      new Command('list')
        .description('List all style rules')
        .option('--detailed', 'Show detailed information including configured rules and custom instructions')
        .option('--page <number>', 'Page number for pagination', parseInt)
        .option('--page-size <number>', 'Number of results per page (1-25)', parseInt)
        .addOption(new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text'))
        .action(async (options: {
          detailed?: boolean;
          page?: number;
          pageSize?: number;
          format?: string;
        }) => {
          try {
            const styleRulesCommand = await createStyleRulesCommand(createDeepLClient);

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
