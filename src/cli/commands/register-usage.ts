import type { Command } from 'commander';
import { Logger } from '../../utils/logger.js';
import { createUsageCommand, type CreateDeepLClient } from './service-factory.js';

export function registerUsage(
  program: Command,
  deps: {
    createDeepLClient: CreateDeepLClient;
    handleError: (error: unknown) => never;
  },
): void {
  const { createDeepLClient, handleError } = deps;

  program
    .command('usage')
    .description('Show API usage statistics')
    .action(async () => {
      try {
        const usageCommand = await createUsageCommand(createDeepLClient);

        const usage = await usageCommand.getUsage();
        const formatted = usageCommand.formatUsage(usage);
        Logger.output(formatted);
      } catch (error) {
        handleError(error);
      }
    });
}
