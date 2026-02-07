import { Command, Option } from 'commander';
import { Logger } from '../../utils/logger.js';
import { createVoiceCommand, type ServiceDeps } from './service-factory.js';

export function registerVoice(
  program: Command,
  deps: ServiceDeps,
): void {
  const { handleError } = deps;

  program
    .command('voice')
    .description('Translate audio using DeepL Voice API (real-time speech translation)')
    .argument('<file>', 'Audio file to translate (use "-" for stdin)')
    .requiredOption('-t, --to <languages>', 'Target language(s), comma-separated, max 5')
    .option('-f, --from <language>', 'Source language (auto-detect if not specified)')
    .addOption(new Option('--formality <level>', 'Formality level').choices(['default', 'more', 'less', 'prefer_more', 'prefer_less']))
    .option('--glossary <id>', 'Glossary ID to use for translation')
    .option('--content-type <type>', 'Audio content type (auto-detected from extension: ogg, opus, webm, mka, flac, mp3, pcm)')
    .option('--chunk-size <bytes>', 'Audio chunk size in bytes (default: 6400)', parseInt)
    .option('--chunk-interval <ms>', 'Interval between chunks in ms (default: 200)', parseInt)
    .option('--no-stream', 'Disable live streaming output (collect and print at end)')
    .option('--no-reconnect', 'Disable automatic reconnection on WebSocket drop')
    .option('--max-reconnect-attempts <n>', 'Maximum reconnect attempts (default: 3)', parseInt)
    .addOption(new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text'))
    .addHelpText('after', `
Examples:
  $ deepl voice recording.ogg --to de
  $ deepl voice meeting.mp3 --to es,fr,de
  $ deepl voice audio.flac --to ja --from en
  $ cat audio.pcm | deepl voice - --to es --content-type 'audio/pcm;encoding=s16le;rate=16000'
  $ deepl voice speech.ogg --to de --no-stream
  $ deepl voice speech.ogg --to de --format json
`)
    .action(async (file: string, options: {
      to: string;
      from?: string;
      formality?: string;
      glossary?: string;
      contentType?: string;
      chunkSize?: number;
      chunkInterval?: number;
      stream?: boolean;
      reconnect?: boolean;
      maxReconnectAttempts?: number;
      format?: string;
    }) => {
      try {
        const voiceCommand = await createVoiceCommand(deps.getApiKeyAndOptions);

        let result: string;

        if (file === '-') {
          result = await voiceCommand.translateFromStdin(options);
        } else {
          result = await voiceCommand.translate(file, options);
        }

        Logger.output(result);
      } catch (error) {
        handleError(error);
      }
    });
}
