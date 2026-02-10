import { Command } from 'commander';
import chalk from 'chalk';
import type { ConfigService } from '../../storage/config.js';
import { Logger } from '../../utils/logger.js';

export function registerConfig(
  program: Command,
  deps: {
    getConfigService: () => ConfigService;
    handleError: (error: unknown) => never;
  },
): void {
  const { getConfigService, handleError } = deps;

  program
    .command('config')
    .description('Manage configuration')
    .addHelpText('after', `
Examples:
  $ deepl config set api.usePro true
  $ deepl config get auth.apiKey
  $ deepl config list
  $ deepl config reset
`)
    .addCommand(
      new Command('get')
        .description('Get configuration value')
        .argument('[key]', 'Config key (dot notation) or empty for all')
        .option('--format <format>', 'Output format: text, json (default: json)')
        .action(async (key?: string, options?: { format?: string }) => {
          try {
            const { ConfigCommand: ConfigCmd } = await import('./config.js');
            const configCommand = new ConfigCmd(getConfigService());
            const value = await configCommand.get(key);
            if (options?.format === 'text') {
              Logger.output(configCommand.formatValue(key, value));
            } else {
              Logger.output(JSON.stringify(value ?? null, null, 2));
            }
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
            const { ConfigCommand: ConfigCmd } = await import('./config.js');
            const configCommand = new ConfigCmd(getConfigService());
            await configCommand.set(key, value);
            Logger.success(chalk.green(`\u2713 Set ${key} = ${value}`));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('list')
        .description('List all configuration values')
        .option('--format <format>', 'Output format: text, json (default: json)')
        .action(async (options: { format?: string }) => {
          try {
            const { ConfigCommand: ConfigCmd } = await import('./config.js');
            const configCommand = new ConfigCmd(getConfigService());
            const config = await configCommand.list();
            if (options.format === 'text') {
              Logger.output(configCommand.formatConfig(config));
            } else {
              Logger.output(JSON.stringify(config, null, 2));
            }
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('reset')
        .description('Reset configuration to defaults')
        .option('-y, --yes', 'Skip confirmation prompt')
        .action(async (options: { yes?: boolean }) => {
          try {
            if (!options.yes) {
              const { confirm } = await import('../../utils/confirm.js');
              const confirmed = await confirm({ message: 'Reset all configuration to defaults?' });
              if (!confirmed) {
                Logger.info('Aborted.');
                return;
              }
            }

            const { ConfigCommand: ConfigCmd } = await import('./config.js');
            const configCommand = new ConfigCmd(getConfigService());
            await configCommand.reset();
            Logger.success(chalk.green('\u2713 Configuration reset to defaults'));
          } catch (error) {
            handleError(error);

          }
        })
    );
}
