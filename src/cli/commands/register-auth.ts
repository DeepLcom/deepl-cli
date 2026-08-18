import { Command } from 'commander';
import chalk from 'chalk';
import type { ConfigService } from '../../storage/config.js';
import type { DeepLClientOptions } from '../../api/http-client.js';
import { Logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';

export function registerAuth(
  program: Command,
  deps: {
    getConfigService: () => ConfigService;
    getHttpOptions?: () => DeepLClientOptions;
    handleError: (error: unknown) => never;
  }
): void {
  const { getConfigService, getHttpOptions, handleError } = deps;

  program
    .command('auth')
    .description('Manage DeepL API authentication')
    .addHelpText(
      'after',
      `
Examples:
  $ echo "YOUR_API_KEY" | deepl auth set-key --from-stdin
  $ deepl auth set-key --from-stdin < ~/.deepl-api-key
  $ deepl auth show
  $ deepl auth clear

Note: The key is read from stdin only. A command-line argument would be visible
to other users via process listings and recorded in shell history. Run deepl init
to be prompted for it instead.
`
    )
    .addCommand(
      new Command('set-key')
        .description('Set your DeepL API key (read from stdin)')
        // Excess arguments are accepted by the parser so that a key passed as
        // one can be refused by name here. Commander's own excess-argument
        // error quotes the offending value, which would print the key.
        .allowExcessArguments(true)
        .option('--from-stdin', 'Read API key from stdin (the only source)')
        .option(
          '--no-verify',
          'Store the key without validating it against the API (for offline or proxied networks)'
        )
        .action(
          async (
            opts: { fromStdin?: boolean; verify?: boolean },
            command: Command
          ) => {
            try {
              if (command.args.length > 0) {
                handleError(
                  new ValidationError(
                    'The API key can no longer be passed as an argument.',
                    'Pipe it in instead: deepl auth set-key --from-stdin < keyfile, or run deepl init to be prompted for it.'
                  )
                );
                return;
              }
              if (process.stdin.isTTY) {
                handleError(
                  new ValidationError(
                    'API key required on stdin.',
                    'Pipe it in: echo "YOUR_API_KEY" | deepl auth set-key --from-stdin, or run deepl init to be prompted for it.'
                  )
                );
                return;
              }
              const MAX_STDIN_BYTES = 131072; // 128KB
              const chunks: Buffer[] = [];
              let totalBytes = 0;
              for await (const chunk of process.stdin) {
                const buf = chunk as Buffer;
                totalBytes += buf.length;
                if (totalBytes > MAX_STDIN_BYTES) {
                  throw new ValidationError(
                    'Input exceeds maximum size of 128KB'
                  );
                }
                chunks.push(buf);
              }
              const key = Buffer.concat(chunks).toString('utf-8').trim();
              const { AuthCommand } = await import('./auth.js');
              const authCommand = new AuthCommand(
                getConfigService(),
                getHttpOptions?.()
              );
              await authCommand.setKey(key, { verify: opts.verify });
              Logger.success(
                chalk.green(
                  opts.verify === false
                    ? '\u2713 API key saved without validation'
                    : '\u2713 API key saved and validated successfully'
                )
              );
            } catch (error) {
              handleError(error);
            }
          }
        )
    )
    .addCommand(
      new Command('show')
        .description('Show current API key (masked)')
        .action(async () => {
          try {
            const { AuthCommand } = await import('./auth.js');
            const authCommand = new AuthCommand(getConfigService());
            const key = await authCommand.getKey();
            if (key) {
              const masked =
                key.substring(0, 4) + '...' + key.substring(key.length - 4);
              Logger.output(chalk.blue('API Key:'), masked);
            } else {
              Logger.output(chalk.yellow('No API key set'));
            }
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('clear')
        .description('Remove stored API key')
        .action(async () => {
          try {
            const { AuthCommand } = await import('./auth.js');
            const authCommand = new AuthCommand(getConfigService());
            await authCommand.clearKey();
            Logger.success(chalk.green('\u2713 API key removed'));
          } catch (error) {
            handleError(error);
          }
        })
    );
}
