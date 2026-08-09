import { Command, Option } from 'commander';
import { Logger } from '../../../utils/logger.js';
import { ValidationError } from '../../../utils/errors.js';
import type { ServiceDeps } from '../service-factory.js';
import type { TargetTranslationIndex } from '../../../sync/sync-glossary-report.js';
import {
  emitJsonErrorAndExit,
  resolveFormat,
  resolveSyncConfig,
} from './sync-options.js';

interface AuditOptions {
  format?: string;
  syncConfig?: string;
}

export function registerSyncAudit(
  parent: Command,
  deps: Pick<ServiceDeps, 'handleError'>
): Command {
  parent
    .command('glossary-report', { hidden: true })
    .allowUnknownOption(true)
    .action((_options: unknown, command: Command) =>
      handleLegacyGlossaryReport(command, deps)
    );

  return parent
    .command('audit')
    .description(
      'Analyze translation consistency and detect terminology inconsistencies'
    )
    .addOption(
      new Option('--format <format>', 'Output format')
        .choices(['text', 'json'])
        .default('text')
    )
    .option('--sync-config <path>', 'Path to .deepl-sync.yaml')
    .action((options: AuditOptions, command: Command) =>
      handleSyncAudit(options, command, deps)
    );
}

function handleLegacyGlossaryReport(
  command: Command,
  deps: Pick<ServiceDeps, 'handleError'>
): void {
  const error = new ValidationError(
    "'deepl sync glossary-report' has been renamed to 'deepl sync audit'.",
    'Use `deepl sync audit` — the subcommand detects terminology inconsistencies across locales (translation-consistency audit), not security auditing in the npm-audit sense.'
  );
  const parentFormat = command.parent?.opts()['format'] as string | undefined;
  if (parentFormat === 'json') {
    emitJsonErrorAndExit(error);
  }
  deps.handleError(error);
}

async function handleSyncAudit(
  options: AuditOptions,
  command: Command,
  deps: Pick<ServiceDeps, 'handleError'>
): Promise<void> {
  options.format = resolveFormat(options, command);
  try {
    const { loadSyncConfig } = await import('../../../sync/sync-config.js');
    const { SyncLockManager } = await import('../../../sync/sync-lock.js');
    const { LOCK_FILE_NAME } = await import('../../../sync/types.js');
    const { generateGlossaryReport } =
      await import('../../../sync/sync-glossary-report.js');
    const { extractExistingTranslations } =
      await import('../../../sync/sync-bucket-walker.js');
    const { createDefaultRegistry } = await import('../../../formats/index.js');
    const { resolveTargetPath, assertPathWithinRoot } =
      await import('../../../sync/sync-utils.js');
    const pathMod = await import('path');
    const fsMod = await import('fs');

    const config = await loadSyncConfig(process.cwd(), {
      configPath: resolveSyncConfig(options, command),
    });
    const lockPath = pathMod.join(config.projectRoot, LOCK_FILE_NAME);
    const lockManager = new SyncLockManager(lockPath);
    const lockFile = await lockManager.read();

    const registry = await createDefaultRegistry();
    const targetTranslations: TargetTranslationIndex = new Map();
    for (const [formatKey, bucketConfig] of Object.entries(config.buckets)) {
      const parser = registry.getParserByFormatKey(formatKey);
      if (!parser) continue;
      for (const relPath of Object.keys(lockFile.entries)) {
        const fileLocaleMap = new Map<string, Map<string, string>>();
        for (const locale of config.target_locales) {
          let targetAbs: string;
          try {
            const targetRel = resolveTargetPath(
              relPath,
              config.source_locale,
              locale,
              bucketConfig.target_path_pattern
            );
            targetAbs = pathMod.join(config.projectRoot, targetRel);
          } catch {
            // A lockfile entry whose path no longer resolves for this locale.
            continue;
          }
          // Audit is the only sync read driven by lockfile keys rather than
          // globbed source paths, and a lockfile arrives with a clone like any
          // other committed file — so its keys are untrusted input, and a key
          // like `../secret/en.json` would otherwise have its string values
          // printed in the report. Thrown rather than skipped, matching how a
          // sync run treats a containment violation: it is a problem with the
          // project, not with one locale.
          assertPathWithinRoot(targetAbs, config.projectRoot);
          if (!fsMod.existsSync(targetAbs)) continue;
          try {
            const content = await fsMod.promises.readFile(targetAbs, 'utf-8');
            fileLocaleMap.set(
              locale,
              extractExistingTranslations(parser, content, locale)
            );
          } catch {
            // Unreadable / unparseable target file — reported as a missing target.
          }
        }
        if (fileLocaleMap.size > 0)
          targetTranslations.set(relPath, fileLocaleMap);
      }
    }

    const report = generateGlossaryReport(lockFile, targetTranslations);

    if (options.format === 'json') {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      Logger.output(`Audit: ${report.totalTerms} unique source terms\n`);
      if (report.inconsistencies.length === 0) {
        Logger.output('No terminology inconsistencies found.');
      } else {
        Logger.output(
          `${report.inconsistencies.length} inconsistency(ies) found:\n`
        );
        for (const inc of report.inconsistencies) {
          Logger.output(
            `  "${inc.sourceText}" [${inc.locale}]: ${inc.translations.length} different translations`
          );
          Logger.output(`    Files: ${inc.files.join(', ')}`);
        }
      }

      if (report.missingTargets.length > 0) {
        Logger.output(
          `\n${report.missingTargets.length} target(s) could not be read and were excluded from the comparison:`
        );
        for (const target of report.missingTargets) {
          Logger.output(`  ${target.filePath} [${target.locale}]`);
        }
      }
    }
  } catch (error) {
    if (options.format === 'json') {
      emitJsonErrorAndExit(error);
    }
    deps.handleError(error);
  }
}
