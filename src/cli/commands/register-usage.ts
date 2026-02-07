import type { Command } from 'commander';
import type { DeepLClient } from '../../api/deepl-client.js';
import { Logger } from '../../utils/logger.js';

export function registerUsage(
  program: Command,
  deps: {
    createDeepLClient: (overrideBaseUrl?: string) => Promise<DeepLClient>;
    handleError: (error: unknown) => never;
  },
): void {
  const { createDeepLClient, handleError } = deps;

  program
    .command('usage')
    .description('Show API usage statistics')
    .action(async () => {
      try {
        const client = await createDeepLClient();
        const { UsageCommand } = await import('./usage.js');
        const usageCommand = new UsageCommand(client);

        const usage = await usageCommand.getUsage();
        const formatted = usageCommand.formatUsage(usage);
        Logger.output(formatted);
      } catch (error) {
        handleError(error);
      }
    });
}
