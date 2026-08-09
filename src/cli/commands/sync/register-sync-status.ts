import { Command, Option } from 'commander';
import { Logger } from '../../../utils/logger.js';
import type { ServiceDeps } from '../service-factory.js';
import {
  emitJsonErrorAndExit,
  parseLocaleFilter,
  resolveFormat,
  resolveLocale,
  resolveSyncConfig,
} from './sync-options.js';

interface StatusOptions {
  locale?: string;
  format?: string;
  syncConfig?: string;
}

export function registerSyncStatus(
  parent: Command,
  deps: Pick<ServiceDeps, 'handleError'>
): Command {
  return parent
    .command('status')
    .description('Show translation coverage status')
    .option('--locale <locales>', 'Filter by locale (comma-separated)')
    .addOption(
      new Option('--format <format>', 'Output format')
        .choices(['text', 'json'])
        .default('text')
    )
    .option('--sync-config <path>', 'Path to .deepl-sync.yaml')
    .action((options: StatusOptions, command: Command) =>
      handleSyncStatus(options, command, deps)
    );
}

async function handleSyncStatus(
  options: StatusOptions,
  command: Command,
  deps: Pick<ServiceDeps, 'handleError'>
): Promise<void> {
  options.format = resolveFormat(options, command);
  try {
    const { loadSyncConfig } = await import('../../../sync/sync-config.js');
    const { createDefaultRegistry } = await import('../../../formats/index.js');
    const { computeSyncStatus } = await import('../../../sync/sync-status.js');

    const localeFilter = parseLocaleFilter(resolveLocale(options, command));
    const config = await loadSyncConfig(process.cwd(), {
      configPath: resolveSyncConfig(options, command),
      localeFilter,
    });
    const registry = await createDefaultRegistry();
    const status = await computeSyncStatus(config, registry);

    const locales = localeFilter
      ? status.locales.filter((l) => localeFilter.includes(l.locale))
      : status.locales;

    if (options.format === 'json') {
      process.stdout.write(
        JSON.stringify({ ...status, locales }, null, 2) + '\n'
      );
    } else {
      const skippedSuffix =
        status.skippedKeys > 0
          ? `, ${status.skippedKeys} skipped (pipe pluralization)`
          : '';
      Logger.output(
        `Source: ${status.sourceLocale} (${status.totalKeys} keys${skippedSuffix})\n`
      );
      for (const locale of locales) {
        const bar = `${'#'.repeat(Math.floor(locale.coverage / 5))}${'.'.repeat(
          20 - Math.floor(locale.coverage / 5)
        )}`;
        const unwrittenSuffix =
          locale.unwritten > 0 ? `, ${locale.unwritten} unwritten` : '';
        const needsReviewSuffix =
          locale.needsReview > 0 ? `, ${locale.needsReview} needs review` : '';
        Logger.output(
          `  ${locale.locale}  [${bar}] ${locale.coverage}%  (${locale.missing} missing, ${locale.outdated} outdated${unwrittenSuffix}${needsReviewSuffix})`
        );
      }
      const unwritten = status.unwrittenByLocale.filter(
        (u) => !localeFilter || localeFilter.includes(u.locale)
      );
      if (unwritten.length > 0) {
        const { targetGapsWarning } =
          await import('../../../sync/sync-target-audit.js');
        Logger.output('');
        Logger.warn(targetGapsWarning(unwritten));
      }
      const needingReview = locales.reduce((sum, l) => sum + l.needsReview, 0);
      if (needingReview > 0) {
        const one = needingReview === 1;
        Logger.output('');
        Logger.warn(
          `${needingReview} ${one ? 'key holds' : 'keys hold'} a translation its target file marks as needing ` +
            'review — a gettext `#, fuzzy` msgstr, which `msgfmt` leaves out of the compiled ' +
            'catalog so the application shows the source string instead, or an XLIFF review ' +
            '`state` such as `needs-review-translation`. ' +
            `\`deepl sync\` carries ${one ? 'it' : 'them'} forward untouched and never re-translates ` +
            `${one ? 'it' : 'them'}: clear the marker once the translation has been checked, or empty the ` +
            `translation to have ${one ? 'it' : 'them'} made again.`
        );
      }
    }
  } catch (error) {
    if (options.format === 'json') {
      emitJsonErrorAndExit(error);
    }
    deps.handleError(error);
  }
}
