import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { createAdminCommand, type CreateDeepLClient, type GetApiKeyAndOptions } from './service-factory.js';

export function registerAdmin(
  program: Command,
  deps: {
    createDeepLClient: CreateDeepLClient;
    getApiKeyAndOptions?: GetApiKeyAndOptions;
    handleError: (error: unknown) => never;
  },
): void {
  const { createDeepLClient, handleError } = deps;

  const adminCmd = program
    .command('admin')
    .description('Admin API: manage API keys and view organization usage (requires admin key)')
    .addHelpText('after', `
Examples:
  $ deepl admin keys list
  $ deepl admin keys create --label "CI/CD key"
  $ deepl admin keys rename <key-id> "Production key"
  $ deepl admin keys set-limit <key-id> 1000000
  $ deepl admin keys deactivate <key-id> --yes
  $ deepl admin usage --start 2024-01-01 --end 2024-01-31
  $ deepl admin usage --start 2024-01-01 --end 2024-01-31 --group-by key
  $ deepl admin keys list --format json
`);

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
            const admin = await createAdminCommand(createDeepLClient);
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
            const admin = await createAdminCommand(createDeepLClient);
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

            const admin = await createAdminCommand(createDeepLClient);
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
            const admin = await createAdminCommand(createDeepLClient);
            await admin.renameKey(keyId, label);
            Logger.success(chalk.green(`\u2713 API key ${keyId} renamed to "${label}"`));
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('set-limit')
        .description('Set usage limits for an API key')
        .argument('<key-id>', 'Key ID')
        .argument('<characters>', 'Character limit (number or "unlimited")')
        .option('--stt-limit <milliseconds>', 'Speech-to-text milliseconds limit (number or "unlimited")')
        .action(async (keyId: string, characters: string, options: { sttLimit?: string }) => {
          try {
            const limit = characters === 'unlimited' ? null : parseInt(characters, 10);
            if (limit !== null && isNaN(limit)) {
              throw new ValidationError('Characters must be a number or "unlimited"');
            }

            let sttLimit: number | null | undefined;
            if (options.sttLimit !== undefined) {
              sttLimit = options.sttLimit === 'unlimited' ? null : parseInt(options.sttLimit, 10);
              if (sttLimit !== null && isNaN(sttLimit)) {
                throw new ValidationError('STT limit must be a number or "unlimited"');
              }
            }

            const admin = await createAdminCommand(createDeepLClient, deps.getApiKeyAndOptions);
            await admin.setKeyLimit(keyId, limit, sttLimit);

            const limitStr = limit === null ? 'unlimited' : limit.toLocaleString();
            const parts = [`${limitStr} characters`];
            if (sttLimit !== undefined) {
              const sttStr = sttLimit === null ? 'unlimited' : sttLimit.toLocaleString();
              parts.push(`${sttStr} STT ms`);
            }
            Logger.success(chalk.green(`\u2713 Usage limit for ${keyId} set to ${parts.join(', ')}`));
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
            const admin = await createAdminCommand(createDeepLClient);
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
