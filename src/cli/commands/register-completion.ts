import type { Command } from 'commander';
import { Logger } from '../../utils/logger.js';
import type { ShellType } from './completion.js';

const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'] as const;

export function registerCompletion(
  program: Command,
  _deps: {
    handleError: (error: unknown) => never;
  },
): void {
  const { handleError } = _deps;

  program
    .command('completion')
    .description('Generate shell completion scripts')
    .argument('<shell>', `Shell type (${SUPPORTED_SHELLS.join(', ')})`)
    .addHelpText('after', `
Examples:
  $ deepl completion bash > /etc/bash_completion.d/deepl
  $ deepl completion zsh > "\${fpath[1]}/_deepl"
  $ deepl completion fish > ~/.config/fish/completions/deepl.fish

  # Or source directly:
  $ source <(deepl completion bash)
  $ eval "$(deepl completion zsh)"
  $ deepl completion fish | source
`)
    .action(async (shell: string) => {
      try {
        const normalized = shell.toLowerCase().trim();

        if (!SUPPORTED_SHELLS.includes(normalized as ShellType)) {
          throw new Error(
            `Unsupported shell: "${shell}". Supported shells: ${SUPPORTED_SHELLS.join(', ')}`,
          );
        }

        const { CompletionCommand } = await import('./completion.js');
        const completionCommand = new CompletionCommand(program.parent ?? program);
        const script = completionCommand.generate(normalized as ShellType);
        Logger.output(script);
      } catch (error) {
        handleError(error);
      }
    });
}
