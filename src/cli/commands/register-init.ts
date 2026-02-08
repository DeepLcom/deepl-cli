import { Command } from 'commander';
import type { ConfigService } from '../../storage/config.js';

export function registerInit(
  program: Command,
  deps: {
    getConfigService: () => ConfigService;
    handleError: (error: unknown) => never;
  },
): void {
  const { getConfigService, handleError } = deps;

  program
    .command('init')
    .description('Interactive setup wizard for first-time configuration')
    .addHelpText('after', `
Examples:
  $ deepl init
`)
    .action(async () => {
      try {
        const { InitCommand } = await import('./init.js');
        const initCommand = new InitCommand(getConfigService());
        await initCommand.run();
      } catch (error) {
        if (error instanceof Error && error.message.includes('Authentication failed')) {
          handleError(new Error('Invalid API key: Authentication failed with DeepL API'));
        }
        handleError(error);
      }
    });
}
