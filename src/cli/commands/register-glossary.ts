import { Command } from 'commander';
import chalk from 'chalk';
import type { Language } from '../../types/common.js';
import { Logger } from '../../utils/logger.js';
import { createGlossaryCommand, type CreateDeepLClient } from './service-factory.js';

export function registerGlossary(
  program: Command,
  deps: {
    createDeepLClient: CreateDeepLClient;
    handleError: (error: unknown) => never;
  },
): void {
  const { createDeepLClient, handleError } = deps;

  program
    .command('glossary')
    .description('Manage translation glossaries')
    .addHelpText('after', `
Examples:
  $ deepl glossary create my-terms en de terms.tsv
  $ deepl glossary create my-terms en de,fr,es terms.tsv
  $ deepl glossary list
  $ deepl glossary show my-terms
  $ deepl glossary entries my-terms --target-lang de
  $ deepl glossary delete my-terms --yes
  $ deepl glossary languages
  $ deepl glossary add-entry my-terms "Hello" "Hallo" --target-lang de
  $ deepl glossary update-entry my-terms "Hello" "Hej" --target-lang de
  $ deepl glossary remove-entry my-terms "Hello" --target-lang de
  $ deepl glossary rename my-terms new-name
  $ deepl glossary replace-dictionary my-terms de updated.tsv
  $ deepl glossary delete-dictionary my-terms de --yes
`)
    .addCommand(
      new Command('create')
        .description('Create a glossary from TSV/CSV file')
        .argument('<name>', 'Glossary name')
        .argument('<source-lang>', 'Source language code')
        .argument('<target-lang>', 'Target language code (comma-separated for multiple, e.g. de,fr,es)')
        .argument('<file>', 'TSV/CSV file path')
        .action(async (name: string, sourceLang: string, targetLang: string, file: string) => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            const targetLangs = targetLang.split(',').map(l => l.trim()) as Language[];

            const glossary = await glossaryCommand.create(name, sourceLang as Language, targetLangs, file);
            Logger.success(chalk.green('\u2713 Glossary created successfully'));
            Logger.output(glossaryCommand.formatGlossaryInfo(glossary));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('list')
        .description('List all glossaries')
        .action(async () => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            const glossaries = await glossaryCommand.list();
            Logger.output(glossaryCommand.formatGlossaryList(glossaries));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('show')
        .description('Show glossary details')
        .argument('<name-or-id>', 'Glossary name or ID')
        .action(async (nameOrId: string) => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            const glossary = await glossaryCommand.show(nameOrId);
            Logger.output(glossaryCommand.formatGlossaryInfo(glossary));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('entries')
        .description('Show glossary entries')
        .argument('<name-or-id>', 'Glossary name or ID')
        .option('--target-lang <lang>', 'Target language (required for multilingual glossaries)')
        .action(async (nameOrId: string, options: { targetLang?: string }) => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            const targetLang = options.targetLang as Language | undefined;
            const entries = await glossaryCommand.entries(nameOrId, targetLang);
            Logger.output(glossaryCommand.formatEntries(entries));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('delete')
        .description('Delete a glossary')
        .argument('<name-or-id>', 'Glossary name or ID')
        .option('-y, --yes', 'Skip confirmation prompt')
        .option('--dry-run', 'Show what would be deleted without performing the operation')
        .action(async (nameOrId: string, options: { yes?: boolean; dryRun?: boolean }) => {
          try {
            if (options.dryRun) {
              const lines = [
                chalk.yellow(`[dry-run] No deletions will be performed.`),
                chalk.yellow(`[dry-run] Would delete glossary: "${nameOrId}"`),
              ];
              Logger.output(lines.join('\n'));
              return;
            }

            if (!options.yes) {
              const { confirm } = await import('../../utils/confirm.js');
              const confirmed = await confirm({ message: `Delete glossary "${nameOrId}"?` });
              if (!confirmed) {
                Logger.info('Aborted.');
                return;
              }
            }

            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            await glossaryCommand.delete(nameOrId);
            Logger.success(chalk.green('\u2713 Glossary deleted successfully'));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('languages')
        .description('List supported glossary language pairs')
        .action(async () => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            const pairs = await glossaryCommand.listLanguages();
            Logger.output(glossaryCommand.formatLanguagePairs(pairs));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('add-entry')
        .description('Add a new entry to a glossary')
        .argument('<name-or-id>', 'Glossary name or ID')
        .argument('<source>', 'Source text')
        .argument('<target>', 'Target text')
        .option('--target-lang <lang>', 'Target language (required for multilingual glossaries)')
        .action(async (nameOrId: string, source: string, target: string, options: { targetLang?: string }) => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            const targetLang = options.targetLang as Language | undefined;
            await glossaryCommand.addEntry(nameOrId, source, target, targetLang);
            Logger.success(chalk.green('\u2713 Entry added successfully'));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('update-entry')
        .description('Update an existing entry in a glossary')
        .argument('<name-or-id>', 'Glossary name or ID')
        .argument('<source>', 'Source text to update')
        .argument('<new-target>', 'New target text')
        .option('--target-lang <lang>', 'Target language (required for multilingual glossaries)')
        .action(async (nameOrId: string, source: string, newTarget: string, options: { targetLang?: string }) => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            const targetLang = options.targetLang as Language | undefined;
            await glossaryCommand.updateEntry(nameOrId, source, newTarget, targetLang);
            Logger.success(chalk.green('\u2713 Entry updated successfully'));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('remove-entry')
        .description('Remove an entry from a glossary')
        .argument('<name-or-id>', 'Glossary name or ID')
        .argument('<source>', 'Source text to remove')
        .option('--target-lang <lang>', 'Target language (required for multilingual glossaries)')
        .action(async (nameOrId: string, source: string, options: { targetLang?: string }) => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            const targetLang = options.targetLang as Language | undefined;
            await glossaryCommand.removeEntry(nameOrId, source, targetLang);
            Logger.success(chalk.green('\u2713 Entry removed successfully'));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('rename')
        .description('Rename a glossary')
        .argument('<name-or-id>', 'Glossary name or ID')
        .argument('<new-name>', 'New glossary name')
        .action(async (nameOrId: string, newName: string) => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            await glossaryCommand.rename(nameOrId, newName);
            Logger.success(chalk.green('\u2713 Glossary renamed successfully'));
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('replace-dictionary')
        .description('Replace all entries in a glossary dictionary from a TSV/CSV file (v3)')
        .argument('<name-or-id>', 'Glossary name or ID')
        .argument('<target-lang>', 'Target language of dictionary to replace')
        .argument('<file>', 'TSV/CSV file with replacement entries')
        .action(async (nameOrId: string, targetLang: string, file: string) => {
          try {
            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            await glossaryCommand.replaceDictionary(nameOrId, targetLang as Language, file);
            Logger.success(chalk.green(`\u2713 Dictionary replaced successfully (${targetLang})`));
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('delete-dictionary')
        .description('Delete a dictionary from a multilingual glossary (v3)')
        .argument('<name-or-id>', 'Glossary name or ID')
        .argument('<target-lang>', 'Target language of dictionary to delete')
        .option('-y, --yes', 'Skip confirmation prompt')
        .action(async (nameOrId: string, targetLang: string, options: { yes?: boolean }) => {
          try {
            if (!options.yes) {
              const { confirm } = await import('../../utils/confirm.js');
              const confirmed = await confirm({ message: `Delete dictionary "${targetLang}" from glossary "${nameOrId}"?` });
              if (!confirmed) {
                Logger.info('Aborted.');
                return;
              }
            }

            const glossaryCommand = await createGlossaryCommand(createDeepLClient);

            await glossaryCommand.deleteDictionary(nameOrId, targetLang as Language);
            Logger.success(chalk.green(`\u2713 Dictionary deleted successfully (${targetLang})`));
          } catch (error) {
            handleError(error);

          }
        })
    );
}
