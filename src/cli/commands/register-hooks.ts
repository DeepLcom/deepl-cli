import { Command, Option } from 'commander';
import type { HookType } from '../../services/git-hooks.js';
import { Logger } from '../../utils/logger.js';

export function registerHooks(
  program: Command,
  deps: {
    handleError: (error: unknown) => never;
  }
): void {
  const { handleError } = deps;

  program
    .command('hooks')
    .description('Manage git hooks for translation workflow')
    .addHelpText(
      'after',
      `
Examples:
  $ deepl hooks install pre-commit
  $ deepl hooks install post-commit
  $ deepl hooks install pre-commit --yes
  $ deepl hooks uninstall pre-commit
  $ deepl hooks list
  $ deepl hooks path pre-commit
`
    )
    .addCommand(
      new Command('install')
        .description('Install a git hook')
        .argument(
          '<hook-type>',
          'Hook type: pre-commit, pre-push, commit-msg, or post-commit'
        )
        .option(
          '-y, --yes',
          'Skip the confirmation prompt when this repository sends hooks outside the working tree'
        )
        .action(async (hookType: string, options: { yes?: boolean }) => {
          try {
            const { HooksCommand } = await import('./hooks.js');
            const hooksCommand = new HooksCommand();

            // A repository-local core.hooksPath is chosen by the checkout, not
            // by the user running the command, so a target outside the working
            // tree is confirmed before an executable is written to it.
            let allowExternal = false;
            const external = hooksCommand.externalHooksPath();
            if (external !== null) {
              const { externalHooksPathMessage } =
                await import('../../services/git-hooks.js');
              const notice = externalHooksPathMessage(
                external,
                hooksCommand.hooksDirectory() ?? ''
              );
              if (options.yes === true) {
                // Announced rather than asked, so a scripted install still
                // records where the executable went.
                Logger.warn(notice);
                allowExternal = true;
              } else {
                const { confirm } = await import('../../utils/confirm.js');
                allowExternal = await confirm({
                  message: `${notice}\nInstall the hook there?`,
                });
              }
            }

            const result = hooksCommand.install(hookType as HookType, {
              allowExternal,
            });
            Logger.output(result);
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('uninstall')
        .description('Uninstall a git hook')
        .argument(
          '<hook-type>',
          'Hook type: pre-commit, pre-push, commit-msg, or post-commit'
        )
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
        .addOption(
          new Option('--format <format>', 'Output format')
            .choices(['text', 'json'])
            .default('text')
        )
        .action(async (options: { format?: string }) => {
          try {
            const { HooksCommand } = await import('./hooks.js');
            const hooksCommand = new HooksCommand();
            if (options.format === 'json') {
              const status = hooksCommand.listData();
              Logger.output(JSON.stringify(status, null, 2));
            } else {
              const result = hooksCommand.list();
              Logger.output(result);
            }
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('path')
        .description('Show path to a hook file')
        .argument(
          '<hook-type>',
          'Hook type: pre-commit, pre-push, commit-msg, or post-commit'
        )
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
