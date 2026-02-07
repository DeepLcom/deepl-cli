import { Command } from 'commander';
import chalk from 'chalk';
import type { DeepLClient } from '../../api/deepl-client.js';
import { Logger } from '../../utils/logger.js';

export function registerAdmin(
  program: Command,
  deps: {
    createDeepLClient: (overrideBaseUrl?: string) => Promise<DeepLClient>;
    handleError: (error: unknown) => never;
  },
): void {
  const { createDeepLClient, handleError } = deps;

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
            const client = await createDeepLClient();
            const { AdminCommand } = await import('./admin.js');
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
            const client = await createDeepLClient();
            const { AdminCommand } = await import('./admin.js');
            const admin = new AdminCommand(client);
            const key = await admin.createKey(options.label);
            if (options.format === 'json') {
              Logger.output(admin.formatJson(key));
            } else {
              Logger.success(chalk.green('\u2713 API key created'));
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
        .option('-y, --yes', 'Skip confirmation prompt')
        .action(async (keyId: string, options: { yes?: boolean }) => {
          try {
            if (!options.yes) {
              const { confirm } = await import('../../utils/confirm.js');
              const confirmed = await confirm({ message: `Deactivate API key "${keyId}"? This action is permanent.` });
              if (!confirmed) {
                Logger.info('Aborted.');
                return;
              }
            }

            const client = await createDeepLClient();
            const { AdminCommand } = await import('./admin.js');
            const admin = new AdminCommand(client);
            await admin.deactivateKey(keyId);
            Logger.success(chalk.green(`\u2713 API key ${keyId} deactivated`));
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
            const client = await createDeepLClient();
            const { AdminCommand } = await import('./admin.js');
            const admin = new AdminCommand(client);
            await admin.renameKey(keyId, label);
            Logger.success(chalk.green(`\u2713 API key ${keyId} renamed to "${label}"`));
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
            const client = await createDeepLClient();
            const { AdminCommand } = await import('./admin.js');
            const admin = new AdminCommand(client);
            const limit = characters === 'unlimited' ? null : parseInt(characters, 10);
            if (limit !== null && isNaN(limit)) {
              throw new Error('Characters must be a number or "unlimited"');
            }
            await admin.setKeyLimit(keyId, limit);
            const limitStr = limit === null ? 'unlimited' : limit.toLocaleString();
            Logger.success(chalk.green(`\u2713 Usage limit for ${keyId} set to ${limitStr} characters`));
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
            const client = await createDeepLClient();
            const { AdminCommand } = await import('./admin.js');
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
}
