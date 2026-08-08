import { Command, Option } from 'commander';
import { Logger } from '../../../utils/logger.js';
import { ConfigError } from '../../../utils/errors.js';
import type { ServiceDeps } from '../service-factory.js';
import {
  emitJsonErrorAndExit,
  parseLocaleFilter,
  resolveFormat,
  resolveLocale,
  resolveSyncConfig,
} from './sync-options.js';

interface PullOptions {
  locale?: string;
  syncConfig?: string;
  format?: string;
  dryRun?: boolean;
}

export function registerSyncPull(
  parent: Command,
  deps: Pick<ServiceDeps, 'handleError'>
): Command {
  return parent
    .command('pull')
    .description('Pull approved translations from a TMS')
    .option('--locale <locales>', 'Filter by locale (comma-separated)')
    .addOption(
      new Option('--format <format>', 'Output format')
        .choices(['text', 'json'])
        .default('text')
    )
    .option('--sync-config <path>', 'Path to .deepl-sync.yaml')
    .option(
      '--dry-run',
      'Preview what the pull would change without writing any file'
    )
    .addHelpText(
      'after',
      `
Requires TMS integration. Add a tms: block to .deepl-sync.yaml:

  tms:
    enabled: true
    server: https://tms.example.com
    project_id: my-project

Credentials: prefer the TMS_API_KEY (or TMS_TOKEN) env var over inlining
'api_key'/'token' in the YAML. See docs/SYNC.md#tms-rest-contract for the
full field list and REST contract.
`
    )
    .action((options: PullOptions, command: Command) => {
      options.format = resolveFormat(options, command);
      options.locale = resolveLocale(options, command);
      options.syncConfig = resolveSyncConfig(options, command);
      // Commander routes --dry-run on the invocation line to the parent `sync`
      // command (which also defines --dry-run). Fall back to the parent's value.
      const parentDryRun = command.parent?.opts()['dryRun'] as
        boolean | undefined;
      options.dryRun = options.dryRun ?? parentDryRun ?? false;
      return handleSyncPull(options, deps.handleError);
    });
}

function plural(count: number): string {
  return count === 1 ? 'translation' : 'translations';
}

export async function handleSyncPull(
  options: PullOptions,
  handleError: (err: Error) => void
): Promise<void> {
  try {
    const { loadSyncConfig } = await import('../../../sync/sync-config.js');
    const { createTmsClient } = await import('../../../sync/tms-client.js');
    const { createDefaultRegistry } = await import('../../../formats/index.js');
    const { pullTranslations, formatSkippedSummary } =
      await import('../../../sync/sync-tms.js');
    const { acquireSyncProcessLock } =
      await import('../../../sync/sync-process-lock.js');

    const localeFilter = parseLocaleFilter(options.locale);
    const config = await loadSyncConfig(process.cwd(), {
      configPath: options.syncConfig,
      localeFilter,
    });
    if (!config.tms?.enabled) {
      throw new ConfigError(
        'TMS integration not configured',
        'Add a "tms:" block with "enabled: true" to .deepl-sync.yaml'
      );
    }

    const processLock = acquireSyncProcessLock(config.projectRoot);
    try {
      const client = await createTmsClient(config.tms);
      const { tmsServerOrigin } =
        await import('../../../sync/tms-server-trust.js');
      const server = tmsServerOrigin(config.tms.server);

      const dryRun = options.dryRun ?? false;
      const registry = await createDefaultRegistry();
      const result = await pullTranslations(config, client, registry, {
        localeFilter,
        dryRun,
      });
      if (options.format === 'json') {
        process.stdout.write(
          JSON.stringify({
            ok: true,
            pulled: result.pulled,
            replaced: result.replaced,
            skipped: result.skipped,
            server,
            dryRun,
          }) + '\n'
        );
      } else {
        const verb = dryRun ? 'Would pull' : 'Pulled';
        const suffix = dryRun ? ' (dry-run: no files written)' : '';
        Logger.info(
          `${verb} ${result.pulled} translations from TMS at ${server}${formatSkippedSummary(result.skipped)}${suffix}`
        );
        if (result.replaced > 0) {
          Logger.info(
            dryRun
              ? `Would replace ${result.replaced} existing local ${plural(result.replaced)} with the TMS version.`
              : `Replaced ${result.replaced} existing local ${plural(result.replaced)} with the TMS version. Use --dry-run to preview a pull before it overwrites local edits.`
          );
        }
      }
    } finally {
      processLock.release();
    }
  } catch (error) {
    if (options.format === 'json') {
      emitJsonErrorAndExit(error);
    }
    handleError(error as Error);
  }
}
