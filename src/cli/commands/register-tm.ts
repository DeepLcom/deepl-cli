import { Command, Option } from 'commander';
import { Logger } from '../../utils/logger.js';
import { createTmCommand, type ServiceDeps } from './service-factory.js';

export function registerTm(
  program: Command,
  deps: Pick<ServiceDeps, 'createDeepLClient' | 'handleError'>,
): void {
  const { createDeepLClient, handleError } = deps;

  program
    .command('tm')
    .description('Manage translation memories')
    .addHelpText('after', `
Examples:
  $ deepl tm list
  $ deepl tm list --format json

Pass a listed UUID or name to 'deepl translate --translation-memory' and
'deepl sync' (via .deepl-sync.yaml translation.translation_memory).
`)
    .addCommand(
      new Command('list')
        .description('List all translation memories on the account')
        .addOption(new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text'))
        .action(async (options: { format?: string }) => {
          try {
            const tmCommand = await createTmCommand(createDeepLClient);
            const tms = await tmCommand.list();
            if (options.format === 'json') {
              Logger.output(JSON.stringify(tms, null, 2));
            } else {
              Logger.output(tmCommand.formatList(tms));
            }
          } catch (error) {
            handleError(error);
          }
        }),
    );
}
