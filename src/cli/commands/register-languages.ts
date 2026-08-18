import { Option, type Command } from 'commander';
import chalk from 'chalk';
import type { ConfigService } from '../../storage/config.js';
import type { LanguageInfo } from '../../api/deepl-client.js';
import { Logger } from '../../utils/logger.js';
import {
  createLanguagesCommand,
  type CreateDeepLClient,
} from './service-factory.js';

/**
 * The features matrix rides along on every LanguageInfo, so it is stripped from
 * JSON unless asked for; existing consumers keep the shape they were written to.
 */
function forJson(
  languages: LanguageInfo[],
  includeFeatures: boolean
): unknown[] {
  if (includeFeatures) return languages;
  return languages.map((language) => {
    const copy = { ...language };
    delete copy.features;
    return copy;
  });
}

/**
 * The bundled snapshot in LanguageInfo shape, for output with no API key, so that
 * JSON lists the same languages the text and table formats read from it.
 */
function registryAsLanguageInfo(
  command: {
    getRegistryLanguages: (
      type: 'source' | 'target'
    ) => Array<{ code: string; name: string }>;
  },
  type: 'source' | 'target'
): LanguageInfo[] {
  return command.getRegistryLanguages(type).map((entry) => ({
    language: entry.code as LanguageInfo['language'],
    name: entry.name,
  }));
}

export function registerLanguages(
  program: Command,
  deps: {
    getConfigService: () => ConfigService;
    createDeepLClient: CreateDeepLClient;
    handleError: (error: unknown) => never;
  }
): void {
  const { getConfigService, createDeepLClient, handleError } = deps;

  program
    .command('languages')
    .description('List supported source and target languages')
    .option('-s, --source', 'Show only source languages')
    .option('--target', 'Show only target languages')
    .option(
      '--features',
      'Show per-language feature support (requires an API key)'
    )
    .addOption(
      new Option('--format <format>', 'Output format')
        .choices(['text', 'json', 'table'])
        .default('text')
    )
    .addHelpText(
      'after',
      `
Examples:
  $ deepl languages
  $ deepl languages --source
  $ deepl languages --target
  $ deepl languages --features
  $ deepl languages --target --features --format table
  $ deepl languages --format json
  $ deepl languages --format table
`
    )
    .action(
      async (options: {
        source?: boolean;
        target?: boolean;
        features?: boolean;
        format?: string;
      }) => {
        try {
          const apiKey = getConfigService().getValue<string>('auth.apiKey');
          const envKey = process.env['DEEPL_API_KEY'];
          const hasApiKey = !!(apiKey ?? envKey);
          const showFeatures = !!options.features;

          let client = null;
          if (hasApiKey) {
            client = await createDeepLClient();
          } else {
            Logger.warn(
              chalk.yellow(
                'Note: No API key configured. Showing local language registry only.'
              )
            );
            Logger.warn(
              chalk.yellow(
                'Run: deepl init, or deepl auth set-key --from-stdin < keyfile, for API-verified names.\n'
              )
            );
            if (showFeatures) {
              Logger.warn(
                chalk.yellow(
                  'Note: --features needs an API key; the local registry carries no feature data.\n'
                )
              );
            }
          }

          const languagesCommand = await createLanguagesCommand(client);

          if (options.format === 'json') {
            const listFor = async (
              type: 'source' | 'target'
            ): Promise<LanguageInfo[]> => {
              const fromApi =
                type === 'source'
                  ? await languagesCommand.getSourceLanguages()
                  : await languagesCommand.getTargetLanguages();
              return fromApi.length === 0 && !hasApiKey
                ? registryAsLanguageInfo(languagesCommand, type)
                : fromApi;
            };

            if (options.source && !options.target) {
              Logger.output(
                JSON.stringify(
                  forJson(await listFor('source'), showFeatures),
                  null,
                  2
                )
              );
            } else if (options.target && !options.source) {
              Logger.output(
                JSON.stringify(
                  forJson(await listFor('target'), showFeatures),
                  null,
                  2
                )
              );
            } else {
              const [sourceLanguages, targetLanguages] = await Promise.all([
                listFor('source'),
                listFor('target'),
              ]);
              Logger.output(
                JSON.stringify(
                  {
                    source: forJson(sourceLanguages, showFeatures),
                    target: forJson(targetLanguages, showFeatures),
                  },
                  null,
                  2
                )
              );
            }
            return;
          }

          const useTable = options.format === 'table';
          if (useTable && !process.stdout.isTTY) {
            Logger.warn(
              'WARN  --format table is not supported in non-TTY output; falling back to plain text'
            );
          }
          const wantTable = useTable && process.stdout.isTTY;

          let output: string;
          if (options.source && !options.target) {
            const sourceLanguages = await languagesCommand.getSourceLanguages();
            output = wantTable
              ? languagesCommand.formatLanguagesTable(
                  sourceLanguages,
                  'source',
                  showFeatures
                )
              : languagesCommand.formatLanguages(
                  sourceLanguages,
                  'source',
                  showFeatures
                );
          } else if (options.target && !options.source) {
            const targetLanguages = await languagesCommand.getTargetLanguages();
            output = wantTable
              ? languagesCommand.formatLanguagesTable(
                  targetLanguages,
                  'target',
                  showFeatures
                )
              : languagesCommand.formatLanguages(
                  targetLanguages,
                  'target',
                  showFeatures
                );
          } else {
            const [sourceLanguages, targetLanguages] = await Promise.all([
              languagesCommand.getSourceLanguages(),
              languagesCommand.getTargetLanguages(),
            ]);
            output = wantTable
              ? languagesCommand.formatAllLanguagesTable(
                  sourceLanguages,
                  targetLanguages,
                  showFeatures
                )
              : languagesCommand.formatAllLanguages(
                  sourceLanguages,
                  targetLanguages,
                  showFeatures
                );
          }

          Logger.output(output);
        } catch (error) {
          handleError(error);
        }
      }
    );
}
