import { Command, Option } from 'commander';
import type { ConfigService } from '../../storage/config.js';
import type { CacheService } from '../../storage/cache.js';
import type { DeepLClient } from '../../api/deepl-client.js';
import { Logger } from '../../utils/logger.js';

export function registerTranslate(
  program: Command,
  deps: {
    getConfigService: () => ConfigService;
    getCacheService: () => Promise<CacheService>;
    createDeepLClient: (overrideBaseUrl?: string) => Promise<DeepLClient>;
    handleError: (error: unknown) => never;
  },
): void {
  const { getConfigService, getCacheService, createDeepLClient, handleError } = deps;

  program
    .command('translate')
    .description('Translate text, files, or directories using DeepL API')
    .argument('[text]', 'Text, file path, or directory to translate (or read from stdin)')
    .requiredOption('-t, --to <language>', 'Target language(s), comma-separated for multiple')
    .option('-f, --from <language>', 'Source language (auto-detect if not specified)')
    .option('-o, --output <path>', 'Output file path or directory (required for file/directory translation)')
    .addOption(new Option('--formality <level>', 'Formality level').choices(['default', 'more', 'less', 'prefer_more', 'prefer_less']))
    .option('--output-format <format>', 'Convert document format during translation (e.g., pdf, docx, pptx, xlsx, html)')
    .option('--preserve-code', 'Preserve code blocks and variables during translation')
    .option('--preserve-formatting', 'Preserve line breaks and whitespace formatting')
    .option('--context <text>', 'Additional context to improve translation quality')
    .addOption(new Option('--split-sentences <mode>', 'Sentence splitting (default: on)').choices(['on', 'off', 'nonewlines']))
    .addOption(new Option('--tag-handling <mode>', 'Tag handling for XML/HTML').choices(['xml', 'html']))
    .addOption(new Option('--model-type <type>', 'Model type').choices(['quality_optimized', 'prefer_quality_optimized', 'latency_optimized']))
    .option('--show-billed-characters', 'Request and display actual billed character count for cost transparency')
    .option('--enable-minification', 'Enable document minification for PPTX/DOCX files (reduces file size)')
    .option('--outline-detection <bool>', 'Control automatic XML structure detection (true/false, default: true, requires --tag-handling xml)')
    .option('--splitting-tags <tags>', 'Comma-separated XML tags that split sentences (requires --tag-handling xml)')
    .option('--non-splitting-tags <tags>', 'Comma-separated XML tags for non-translatable text (requires --tag-handling xml)')
    .option('--ignore-tags <tags>', 'Comma-separated XML tags with content to ignore (requires --tag-handling xml)')
    .option('--tag-handling-version <version>', 'Tag handling version: v1, v2 (v2 improves structure handling, requires --tag-handling)')
    .option('--recursive', 'Process subdirectories recursively (default: true)', true)
    .option('--pattern <pattern>', 'Glob pattern for file filtering (e.g., "*.md")')
    .option('--concurrency <number>', 'Number of parallel translations (default: 5)', parseInt)
    .option('--glossary <name-or-id>', 'Use glossary by name or ID')
    .option('--custom-instruction <instruction>', 'Custom instruction for translation (repeatable, max 10, max 300 chars each)', (val: string, prev: string[]) => prev.concat([val]), [] as string[])
    .option('--style-id <uuid>', 'Style rule ID for translation (Pro API only, forces quality_optimized model)')
    .option('--no-cache', 'Bypass cache for this translation (useful for testing)')
    .option('--format <format>', 'Output format: json, table (default: plain text)')
    .option('--api-url <url>', 'Custom API endpoint (e.g., https://api-free.deepl.com/v2 or internal test URLs)')
    .addHelpText('after', `
Examples:
  $ deepl translate "Hello world" --to es
  $ deepl translate README.md --to fr --output README.fr.md
  $ deepl translate ./docs --to de,es,fr --pattern "*.md"
  $ echo "Hello" | deepl translate --to ja
`)
    .action(async (text: string | undefined, options: {
      to: string;
      from?: string;
      output?: string;
      formality?: string;
      outputFormat?: string;
      preserveCode?: boolean;
      preserveFormatting?: boolean;
      context?: string;
      splitSentences?: string;
      tagHandling?: string;
      modelType?: string;
      showBilledCharacters?: boolean;
      enableMinification?: boolean;
      outlineDetection?: string;
      splittingTags?: string;
      nonSplittingTags?: string;
      ignoreTags?: string;
      tagHandlingVersion?: string;
      recursive?: boolean;
      pattern?: string;
      concurrency?: number;
      glossary?: string;
      customInstruction?: string[];
      styleId?: string;
      noCache?: boolean;
      format?: string;
      apiUrl?: string;
    }) => {
      try {
        const client = await createDeepLClient(options.apiUrl);
        const { TranslationService } = await import('../../services/translation.js');
        const { DocumentTranslationService } = await import('../../services/document-translation.js');
        const { GlossaryService } = await import('../../services/glossary.js');
        const { TranslateCommand } = await import('./translate.js');
        const configService = getConfigService();
        const translationService = new TranslationService(client, configService, await getCacheService());
        const documentTranslationService = new DocumentTranslationService(client);
        const glossaryService = new GlossaryService(client);
        const translateCommand = new TranslateCommand(translationService, documentTranslationService, glossaryService, configService);

        let result: string;

        if (text) {
          result = await translateCommand.translate(text, options);
        } else {
          result = await translateCommand.translateFromStdin(options);
        }

        Logger.output(result);
      } catch (error) {
        handleError(error);
      }
    });
}
