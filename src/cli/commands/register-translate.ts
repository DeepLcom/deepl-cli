import * as fs from 'fs';
import { Command, Option } from 'commander';
import chalk from 'chalk';
import { Logger } from '../../utils/logger.js';
import { createTranslateCommand, type ServiceDeps } from './service-factory.js';

export function registerTranslate(
  program: Command,
  deps: ServiceDeps,
): void {
  const { handleError } = deps;

  program
    .command('translate')
    .description('Translate text, files, or directories using DeepL API')
    .argument('[text]', 'Text, file path, or directory to translate (or read from stdin)')
    .option('-t, --to <language>', 'Target language(s), comma-separated for multiple (uses config default if omitted)')
    .option('-f, --from <language>', 'Source language (auto-detect if not specified)')
    .option('-o, --output <path>', 'Output file path or directory (required for file/directory translation)')
    .addOption(new Option('--formality <level>', 'Formality level').choices(['default', 'more', 'less', 'prefer_more', 'prefer_less']))
    .addOption(new Option('--output-format <format>', 'Convert document format during translation').choices(['pdf', 'docx', 'pptx', 'xlsx', 'html', 'htm', 'txt', 'srt', 'xlf', 'xliff']))
    .option('--preserve-code', 'Preserve code blocks and variables during translation')
    .option('--preserve-formatting', 'Preserve line breaks and whitespace formatting')
    .option('--context <text>', 'Additional context to improve translation quality')
    .addOption(new Option('--split-sentences <mode>', 'Sentence splitting (default: on)').choices(['on', 'off', 'nonewlines']))
    .addOption(new Option('--tag-handling <mode>', 'Tag handling for XML/HTML').choices(['xml', 'html']))
    .addOption(new Option('--model-type <type>', 'Model type').choices(['quality_optimized', 'prefer_quality_optimized', 'latency_optimized']))
    .option('--show-billed-characters', 'Request and display actual billed character count for cost transparency')
    .option('--enable-minification', 'Enable document minification (PPTX/DOCX only, reduces file size)')
    .option('--outline-detection <bool>', 'Control automatic XML structure detection (true/false, default: true, requires --tag-handling xml)')
    .option('--splitting-tags <tags>', 'Comma-separated XML tags that split sentences (requires --tag-handling xml)')
    .option('--non-splitting-tags <tags>', 'Comma-separated XML tags that should not be used to split sentences (requires --tag-handling xml)')
    .option('--ignore-tags <tags>', 'Comma-separated XML tags with content to ignore (requires --tag-handling xml)')
    .addOption(new Option('--tag-handling-version <version>', 'Tag handling version (v2 improves structure handling, requires --tag-handling)').choices(['v1', 'v2']))
    .option('--recursive', 'Process subdirectories recursively (default: true)', true)
    .option('--pattern <pattern>', 'Glob pattern for file filtering (e.g., "*.md")')
    .option('--concurrency <number>', 'Number of parallel translations (default: 5)', parseInt)
    .option('--glossary <name-or-id>', 'Use glossary by name or ID')
    .option('--custom-instruction <instruction>', 'Custom instruction for translation (repeatable, max 10, max 300 chars each)', (val: string, prev: string[]) => prev.concat([val]), [] as string[])
    .option('--style-id <uuid>', 'Style rule ID for translation (Pro API only, forces quality_optimized model)')
    .option('--enable-beta-languages', 'Include beta languages that are not yet stable (forward-compatibility)')
    .option('--no-cache', 'Bypass cache for this translation (useful for testing)')
    .option('--format <format>', 'Output format: json, table (default: plain text)')
    .option('--api-url <url>', 'Custom API endpoint (e.g., https://api-free.deepl.com/v2 or internal test URLs)')
    .option('--dry-run', 'Show what would be translated without performing the operation')
    .addHelpText('after', `
Examples:
  $ deepl translate "Hello world" --to es
  $ deepl translate README.md --to fr --output README.fr.md
  $ deepl translate ./docs --to de,es,fr --pattern "*.md"
  $ echo "Hello" | deepl translate --to ja
  $ deepl translate report.docx --to de --output-format pdf
  $ deepl translate "Hello" --to es --formality more --glossary my-glossary
  $ deepl translate page.html --to fr --tag-handling html
  $ deepl translate "Hello" --to es --custom-instruction "Use informal language"
  $ deepl translate ./docs --to es --dry-run
`)
    .action(async (text: string | undefined, options: {
      to?: string;
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
      enableBetaLanguages?: boolean;
      noCache?: boolean;
      format?: string;
      apiUrl?: string;
      dryRun?: boolean;
    }) => {
      try {
        if (!options.to) {
          const configService = deps.getConfigService();
          const targetLangs = configService.getValue<string[]>('defaults.targetLangs');
          if (targetLangs && targetLangs.length > 0) {
            options.to = targetLangs[0];
          } else {
            throw new Error(
              'Target language is required. Use --to <language> or set a default with: deepl config set defaults.targetLangs \'["es"]\'',
            );
          }
        }

        if (options.dryRun) {
          const targetLangs = options.to!.split(',').map(l => l.trim());
          const lines: string[] = [
            chalk.yellow('[dry-run] No translations will be performed.'),
          ];

          if (text) {
            const isDir = fs.existsSync(text) && fs.statSync(text).isDirectory();
            const isFile = !isDir && fs.existsSync(text) && fs.statSync(text).isFile();

            if (isDir) {
              lines.push(chalk.yellow(`[dry-run] Would translate directory: ${text}`));
              lines.push(chalk.yellow(`[dry-run] Output directory: ${options.output ?? '<required>'}`));
              if (options.pattern) {
                lines.push(chalk.yellow(`[dry-run] File pattern: ${options.pattern}`));
              }
              lines.push(chalk.yellow(`[dry-run] Recursive: ${options.recursive !== false}`));
            } else if (isFile) {
              lines.push(chalk.yellow(`[dry-run] Would translate file: ${text}`));
              lines.push(chalk.yellow(`[dry-run] Output: ${options.output ?? '<stdout>'}`));
            } else {
              lines.push(chalk.yellow(`[dry-run] Would translate text: "${text.length > 80 ? text.substring(0, 80) + '...' : text}"`));
            }
          } else {
            lines.push(chalk.yellow(`[dry-run] Would translate text from stdin`));
          }

          lines.push(chalk.yellow(`[dry-run] Target language(s): ${targetLangs.join(', ')}`));
          if (options.from) {
            lines.push(chalk.yellow(`[dry-run] Source language: ${options.from}`));
          }
          if (options.glossary) {
            lines.push(chalk.yellow(`[dry-run] Glossary: ${options.glossary}`));
          }
          if (options.formality) {
            lines.push(chalk.yellow(`[dry-run] Formality: ${options.formality}`));
          }

          Logger.output(lines.join('\n'));
          return;
        }

        const translateCommand = await createTranslateCommand(deps, options.apiUrl);

        let result: string;

        if (text) {
          result = await translateCommand.translate(text, options as { to: string } & typeof options);
        } else {
          result = await translateCommand.translateFromStdin(options as { to: string } & typeof options);
        }

        Logger.output(result);
      } catch (error) {
        handleError(error);
      }
    });
}
