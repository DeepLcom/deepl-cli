import { Command } from 'commander';
import type { HookType } from '../../services/git-hooks.js';
import { Logger } from '../../utils/logger.js';

export function registerHooks(
  program: Command,
  deps: {
    handleError: (error: unknown) => never;
  },
): void {
  const { handleError } = deps;

  program
    .command('hooks')
    .description('Manage git hooks for translation workflow')
    .addHelpText('after', `
Examples:
  $ deepl hooks install pre-commit
  $ deepl hooks install post-commit
  $ deepl hooks uninstall pre-commit
  $ deepl hooks list
  $ deepl hooks path pre-commit
`)
    .addCommand(
      new Command('install')
        .description('Install a git hook')
        .argument('<hook-type>', 'Hook type: pre-commit, pre-push, commit-msg, or post-commit')
        .action(async (hookType: string) => {
          try {
            const { HooksCommand } = await import('./hooks.js');
            const hooksCommand = new HooksCommand();
            const result = hooksCommand.install(hookType as HookType);
            Logger.output(result);
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('uninstall')
        .description('Uninstall a git hook')
        .argument('<hook-type>', 'Hook type: pre-commit, pre-push, commit-msg, or post-commit')
        .action(async (hookType: string) => {
          try {
            const { HooksCommand } = await import('./hooks.js');
            const hooksCommand = new HooksCommand();
            const result = hooksCommand.uninstall(hookType as HookType);
            Logger.output(result);
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('list')
        .description('List all hooks and their status')
        .action(async () => {
          try {
            const { HooksCommand } = await import('./hooks.js');
            const hooksCommand = new HooksCommand();
            const result = hooksCommand.list();
            Logger.output(result);
          } catch (error) {
            handleError(error);

          }
        })
    )
    .addCommand(
      new Command('path')
        .description('Show path to a hook file')
        .argument('<hook-type>', 'Hook type: pre-commit, pre-push, commit-msg, or post-commit')
        .action(async (hookType: string) => {
          try {
            const { HooksCommand } = await import('./hooks.js');
            const hooksCommand = new HooksCommand();
            const result = hooksCommand.showPath(hookType as HookType);
            Logger.output(result);
          } catch (error) {
            handleError(error);

          }
        })
    );
}
