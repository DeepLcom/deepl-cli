import { Command } from 'commander';
import chalk from 'chalk';
import type { DeepLClient } from '../../api/deepl-client.js';
import type { Language } from '../../types/common.js';
import { Logger } from '../../utils/logger.js';

export function registerGlossary(
  program: Command,
  deps: {
    createDeepLClient: (overrideBaseUrl?: string) => Promise<DeepLClient>;
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
  $ deepl glossary list
  $ deepl glossary show my-terms
  $ deepl glossary entries my-terms
`)
    .addCommand(
      new Command('create')
        .description('Create a glossary from TSV/CSV file')
        .argument('<name>', 'Glossary name')
        .argument('<source-lang>', 'Source language code')
        .argument('<target-lang>', 'Target language code')
        .argument('<file>', 'TSV/CSV file path')
        .action(async (name: string, sourceLang: string, targetLang: string, file: string) => {
          try {
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

            const targetLangs = [targetLang as Language];

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
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
        .option('--target <lang>', 'Target language (required for multilingual glossaries)')
        .action(async (nameOrId: string, options: { target?: string }) => {
          try {
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

            const targetLang = options.target as Language | undefined;
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
        .action(async (nameOrId: string) => {
          try {
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

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
        .action(async (nameOrId: string, targetLang: string) => {
          try {
            const client = await createDeepLClient();
            const { GlossaryService } = await import('../../services/glossary.js');
            const { GlossaryCommand } = await import('./glossary.js');
            const glossaryService = new GlossaryService(client);
            const glossaryCommand = new GlossaryCommand(glossaryService);

            await glossaryCommand.deleteDictionary(nameOrId, targetLang as Language);
            Logger.success(chalk.green(`\u2713 Dictionary deleted successfully (${targetLang})`));
          } catch (error) {
            handleError(error);

          }
        })
    );
}
