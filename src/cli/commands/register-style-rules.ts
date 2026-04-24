import { Command, Option } from 'commander';
import chalk from 'chalk';
import { Logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { createStyleRulesCommand, type CreateDeepLClient } from './service-factory.js';

function parseRulesArg(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed) || !parsed.every(r => typeof r === 'string')) {
        throw new ValidationError('--rules JSON must be an array of strings');
      }
      return parsed;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(`--rules JSON is malformed: ${(error as Error).message}`);
    }
  }
  return trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

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
  $ deepl style-rules create --name "Corporate" --language en
  $ deepl style-rules show sr-abc123 --detailed
  $ deepl style-rules update sr-abc123 --name "Renamed"
  $ deepl style-rules update sr-abc123 --rules rule_a,rule_b
  $ deepl style-rules delete sr-abc123 --yes
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
    )
    .addCommand(
      new Command('create')
        .description('Create a new style rule list')
        .requiredOption('--name <name>', 'Style rule list name')
        .requiredOption('--language <lang>', 'Target language (e.g. en, de, es)')
        .option('--rules <rules>', 'Configured rule ids (comma-separated or JSON array)')
        .addOption(new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text'))
        .action(async (options: {
          name: string;
          language: string;
          rules?: string;
          format?: string;
        }) => {
          try {
            const styleRulesCommand = await createStyleRulesCommand(createDeepLClient);

            const createOpts: { name: string; language: string; configuredRules?: string[] } = {
              name: options.name,
              language: options.language,
            };
            if (options.rules !== undefined) {
              createOpts.configuredRules = parseRulesArg(options.rules);
            }

            const rule = await styleRulesCommand.create(createOpts);
            if (options.format === 'json') {
              Logger.output(styleRulesCommand.formatStyleRuleJson(rule));
            } else {
              Logger.success(chalk.green(`\u2713 Style rule created: ${rule.styleId}`));
              Logger.output(styleRulesCommand.formatStyleRule(rule));
            }
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('show')
        .description('Show a single style rule list')
        .argument('<id>', 'Style rule ID')
        .option('--detailed', 'Include configured rules and custom instructions')
        .addOption(new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text'))
        .action(async (id: string, options: { detailed?: boolean; format?: string }) => {
          try {
            const styleRulesCommand = await createStyleRulesCommand(createDeepLClient);

            const rule = await styleRulesCommand.show(id, options.detailed ?? false);
            if (options.format === 'json') {
              Logger.output(styleRulesCommand.formatStyleRuleJson(rule));
            } else {
              Logger.output(styleRulesCommand.formatStyleRule(rule));
            }
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('update')
        .description('Update a style rule list (rename and/or replace configured rules)')
        .argument('<id>', 'Style rule ID')
        .option('--name <name>', 'New name')
        .option('--rules <rules>', 'Replace configured rule ids (comma-separated or JSON array)')
        .addOption(new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text'))
        .action(async (id: string, options: { name?: string; rules?: string; format?: string }) => {
          try {
            if (options.name === undefined && options.rules === undefined) {
              throw new ValidationError('Specify at least one of --name or --rules');
            }

            const styleRulesCommand = await createStyleRulesCommand(createDeepLClient);

            if (options.name !== undefined) {
              await styleRulesCommand.update(id, { name: options.name });
            }

            let finalRule;
            if (options.rules !== undefined) {
              finalRule = await styleRulesCommand.replaceRules(id, parseRulesArg(options.rules));
            } else {
              finalRule = await styleRulesCommand.show(id);
            }

            if (options.format === 'json') {
              Logger.output(styleRulesCommand.formatStyleRuleJson(finalRule));
            } else {
              Logger.success(chalk.green(`\u2713 Style rule updated: ${id}`));
              Logger.output(styleRulesCommand.formatStyleRule(finalRule));
            }
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('delete')
        .description('Delete a style rule list')
        .argument('<id>', 'Style rule ID')
        .option('-y, --yes', 'Skip confirmation prompt')
        .option('--dry-run', 'Show what would be deleted without performing the operation')
        .action(async (id: string, options: { yes?: boolean; dryRun?: boolean }) => {
          try {
            if (options.dryRun) {
              Logger.output(chalk.yellow(`[dry-run] No deletions will be performed.`));
              Logger.output(chalk.yellow(`[dry-run] Would delete style rule: "${id}"`));
              return;
            }

            if (!options.yes) {
              const { confirm } = await import('../../utils/confirm.js');
              const confirmed = await confirm({ message: `Delete style rule "${id}"?` });
              if (!confirmed) {
                Logger.info('Aborted.');
                return;
              }
            }

            const styleRulesCommand = await createStyleRulesCommand(createDeepLClient);
            await styleRulesCommand.delete(id);
            Logger.success(chalk.green(`\u2713 Style rule deleted: ${id}`));
          } catch (error) {
            handleError(error);
          }
        })
    );
}
