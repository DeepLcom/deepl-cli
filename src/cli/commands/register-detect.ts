import { Option, type Command } from 'commander';
import { Logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { readStdin } from '../../utils/read-stdin.js';
import { createDetectCommand, type CreateDeepLClient } from './service-factory.js';

export function registerDetect(
  program: Command,
  deps: {
    createDeepLClient: CreateDeepLClient;
    handleError: (error: unknown) => never;
  },
): void {
  const { createDeepLClient, handleError } = deps;

  program
    .command('detect')
    .description('Detect the language of text using DeepL API')
    .argument('[text]', 'Text to detect language of (or read from stdin)')
    .addOption(new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text'))
    .addHelpText('after', `
Examples:
  $ deepl detect "Bonjour le monde"
  $ deepl detect "Hallo Welt" --format json
  $ echo "Ciao mondo" | deepl detect
`)
    .action(async (text: string | undefined, options: { format?: string }) => {
      try {
        const detectCommand = await createDetectCommand(createDeepLClient);

        let inputText: string;

        if (text !== undefined) {
          inputText = text;
        } else {
          inputText = await readStdin();
          if (!inputText || inputText.trim() === '') {
            throw new ValidationError('No input provided. Provide text as an argument or pipe via stdin.');
          }
        }

        const result = await detectCommand.detect(inputText);

        if (options.format === 'json') {
          Logger.output(detectCommand.formatJson(result));
        } else {
          Logger.output(detectCommand.formatPlain(result));
        }
      } catch (error) {
        handleError(error);
      }
    });
}
