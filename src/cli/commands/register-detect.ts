import type { Command } from 'commander';
import { Logger } from '../../utils/logger.js';
import type { CreateDeepLClient } from './service-factory.js';

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
    .option('--format <format>', 'Output format: text, json (default: text)')
    .addHelpText('after', `
Examples:
  $ deepl detect "Bonjour le monde"
  $ deepl detect "Hallo Welt" --format json
  $ echo "Ciao mondo" | deepl detect
`)
    .action(async (text: string | undefined, options: { format?: string }) => {
      try {
        const client = await createDeepLClient();
        const { DetectCommand } = await import('./detect.js');
        const detectCommand = new DetectCommand(client);

        let inputText: string;

        if (text !== undefined) {
          inputText = text;
        } else {
          inputText = await readStdin();
          if (!inputText || inputText.trim() === '') {
            throw new Error('No input provided. Provide text as an argument or pipe via stdin.');
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

async function readStdin(): Promise<string> {
  const MAX_STDIN_BYTES = 131072; // 128KB

  return new Promise((resolve, reject) => {
    let data = '';
    let byteLength = 0;

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      byteLength += Buffer.byteLength(String(chunk), 'utf8');
      if (byteLength > MAX_STDIN_BYTES) {
        reject(new Error('Input exceeds maximum size of 128KB'));
        return;
      }
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', (error) => {
      reject(error);
    });
  });
}
