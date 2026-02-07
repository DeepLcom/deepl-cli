import { Command } from 'commander';
import chalk from 'chalk';
import type { ConfigService } from '../../storage/config.js';
import type { CacheService } from '../../storage/cache.js';
import { Logger } from '../../utils/logger.js';

export function registerCache(
  program: Command,
  deps: {
    getConfigService: () => ConfigService;
    getCacheService: () => Promise<CacheService>;
    handleError: (error: unknown) => never;
  },
): void {
  const { getConfigService, getCacheService, handleError } = deps;

  program
    .command('cache')
    .description('Manage translation cache')
    .addCommand(
      new Command('stats')
        .description('Show cache statistics')
        .action(async () => {
          try {
            const { CacheCommand } = await import('./cache.js');
            const cacheCommand = new CacheCommand(await getCacheService(), getConfigService());
            const stats = await cacheCommand.stats();
            const formatted = cacheCommand.formatStats(stats);
            Logger.output(formatted);
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('clear')
        .description('Clear all cached translations')
        .option('-y, --yes', 'Skip confirmation prompt')
        .action(async (options: { yes?: boolean }) => {
          try {
            if (!options.yes) {
              const { confirm } = await import('../../utils/confirm.js');
              const confirmed = await confirm({ message: 'Clear all cached translations?' });
              if (!confirmed) {
                Logger.info('Aborted.');
                return;
              }
            }

            const { CacheCommand } = await import('./cache.js');
            const cacheCommand = new CacheCommand(await getCacheService(), getConfigService());
            await cacheCommand.clear();
            Logger.success(chalk.green('\u2713 Cache cleared successfully'));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('enable')
        .description('Enable translation cache')
        .option('--max-size <size>', 'Maximum cache size (e.g., 100M, 1G, 500MB)')
        .action(async (options: { maxSize?: string }) => {
          try {
            let maxSizeBytes: number | undefined;

            if (options.maxSize) {
              const { parseSize } = await import('../../utils/parse-size.js');
              maxSizeBytes = parseSize(options.maxSize);
            }

            const { CacheCommand } = await import('./cache.js');
            const cacheCommand = new CacheCommand(await getCacheService(), getConfigService());
            await cacheCommand.enable(maxSizeBytes);
            Logger.success(chalk.green('\u2713 Cache enabled'));

            if (maxSizeBytes !== undefined) {
              const { formatSize } = await import('../../utils/parse-size.js');
              Logger.info(chalk.gray(`Max size: ${formatSize(maxSizeBytes)}`));
            }
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('disable')
        .description('Disable translation cache')
        .action(async () => {
          try {
            const { CacheCommand } = await import('./cache.js');
            const cacheCommand = new CacheCommand(await getCacheService(), getConfigService());
            await cacheCommand.disable();
            Logger.success(chalk.green('\u2713 Cache disabled'));
          } catch (error) {
            handleError(error);

          }
        })
    );
}
