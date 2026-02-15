import { type Command, Option } from 'commander';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import chalk from 'chalk';
import type { WriteLanguage, WritingStyle, WriteTone } from '../../types/api.js';
import { Logger } from '../../utils/logger.js';
import { ExitCode } from '../../utils/exit-codes.js';
import { isNoInput } from '../../utils/confirm.js';
import { ValidationError } from '../../utils/errors.js';
import { createWriteCommand, type ServiceDeps } from './service-factory.js';

export function registerWrite(
  program: Command,
  deps: Pick<ServiceDeps, 'createDeepLClient' | 'getConfigService' | 'getCacheService' | 'handleError'>,
): void {
  const { handleError } = deps;

  program
    .command('write')
    .description('Improve text using DeepL Write API (grammar, style, tone)')
    .argument('<text>', 'Text to improve (or file path when used with file operations)')
    .optionsGroup('Core Options:')
    .option('-t, --to <language>', 'Target language: de, en, en-GB, en-US, es, fr, it, pt, pt-BR, pt-PT (auto-detect if omitted)')
    .addOption(new Option('-l, --lang <language>').hideHelp())
    .option('--style <style>', 'Writing style: default, simple, business, academic, casual, prefer_simple, prefer_business, prefer_academic, prefer_casual')
    .option('--tone <tone>', 'Tone: default, enthusiastic, friendly, confident, diplomatic, prefer_enthusiastic, prefer_friendly, prefer_confident, prefer_diplomatic')
    .optionsGroup('Output Modes:')
    .option('-a, --alternatives', 'Show all alternative improvements')
    .option('-o, --output <file>', 'Write improved text to file')
    .option('--in-place', 'Edit file in place (use with file input)')
    .option('-i, --interactive', 'Interactive mode - choose from multiple suggestions')
    .option('-d, --diff', 'Show diff between original and improved text')
    .optionsGroup('Fix Operations:')
    .option('--check', 'Check if text needs improvement (exit 0 if clean, exit 8 if changes needed)')
    .option('--fix', 'Automatically fix file in place')
    .option('-b, --backup', 'Create backup file before fixing (use with --fix)')
    .optionsGroup('Advanced:')
    .option('--no-cache', 'Bypass cache for this request')
    .optionsGroup('Output:')
    .addOption(new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text'))
    .addHelpText('after', `
Examples:
  $ deepl write "Their going to the store" --to en-US
  $ deepl write report.txt --check
  $ deepl write essay.md --fix --backup
  $ deepl write "Make this formal" --style business --to en
  $ deepl write "Great news!" --tone diplomatic --to en
  $ deepl write document.txt --diff
  $ deepl write article.md --interactive
  $ deepl write "Hello world" --alternatives
  $ deepl write report.txt --output improved.txt
  $ deepl write "Text here" --format json
`)
    .action(async (text: string, options: {
      to?: string;
      lang?: string;
      style?: string;
      tone?: string;
      alternatives?: boolean;
      output?: string;
      inPlace?: boolean;
      interactive?: boolean;
      diff?: boolean;
      check?: boolean;
      fix?: boolean;
      backup?: boolean;
      format?: string;
      cache?: boolean;
    }) => {
      try {
        if (!options.to && options.lang) options.to = options.lang;

        const validLanguages = ['de', 'en', 'en-GB', 'en-US', 'es', 'fr', 'it', 'pt', 'pt-BR', 'pt-PT'];
        if (options.to && !validLanguages.includes(options.to)) {
          throw new ValidationError(`Invalid language code: ${options.to}. Valid options: ${validLanguages.join(', ')}`);
        }

        const validStyles = ['default', 'simple', 'business', 'academic', 'casual', 'prefer_simple', 'prefer_business', 'prefer_academic', 'prefer_casual'];
        if (options.style && !validStyles.includes(options.style)) {
          throw new ValidationError(`Invalid writing style: ${options.style}. Valid options: ${validStyles.join(', ')}`);
        }

        const validTones = ['default', 'enthusiastic', 'friendly', 'confident', 'diplomatic', 'prefer_enthusiastic', 'prefer_friendly', 'prefer_confident', 'prefer_diplomatic'];
        if (options.tone && !validTones.includes(options.tone)) {
          throw new ValidationError(`Invalid tone: ${options.tone}. Valid options: ${validTones.join(', ')}`);
        }

        if (options.style && options.tone) {
          throw new ValidationError('Cannot specify both --style and --tone. Use one or the other.');
        }

        if (options.interactive && isNoInput()) {
          throw new ValidationError('--interactive is not supported in non-interactive mode. Remove --no-input or omit --interactive.');
        }

        const writeCommand = await createWriteCommand(deps);

        const writeOptions = {
          lang: options.to as WriteLanguage | undefined,
          style: options.style as WritingStyle | undefined,
          tone: options.tone as WriteTone | undefined,
          showAlternatives: options.alternatives,
          outputFile: options.output,
          inPlace: options.inPlace,
          createBackup: options.backup,
          format: options.format,
          noCache: options.cache === false,
        };

        if (options.check) {
          let needsImprovement: boolean;
          let changes = 0;

          if (existsSync(text)) {
            const result = await writeCommand.checkFile(text, writeOptions);
            needsImprovement = result.needsImprovement;
            changes = result.changes;
            Logger.info(chalk.gray(`File: ${text}`));
          } else {
            const result = await writeCommand.checkText(text, writeOptions);
            needsImprovement = result.needsImprovement;
            changes = result.changes;
          }

          if (needsImprovement) {
            Logger.warn(chalk.yellow(`\u26a0 Text needs improvement (${changes} potential changes)`));
            process.exitCode = ExitCode.CheckFailed;
          } else {
            Logger.success(chalk.green('\u2713 Text looks good'));
          }
          return;
        }

        if (options.fix) {
          if (!existsSync(text)) {
            throw new ValidationError('--fix requires a file path as input');
          }

          const result = await writeCommand.autoFixFile(text, writeOptions);

          if (result.fixed) {
            Logger.success(chalk.green('\u2713 File improved'));
            if (result.backupPath) {
              Logger.info(chalk.gray(`Backup: ${result.backupPath}`));
            }
            Logger.info(chalk.gray(`Changes: ${result.changes}`));
          } else {
            Logger.success(chalk.green('\u2713 No improvements needed'));
          }
          return;
        }

        if (options.diff) {
          let result: { original: string; improved: string; diff: string };

          if (existsSync(text)) {
            result = await writeCommand.improveFileWithDiff(text, writeOptions);
          } else {
            result = await writeCommand.improveWithDiff(text, writeOptions);
          }

          Logger.output(chalk.bold('Original:'));
          Logger.output(result.original);
          Logger.output();
          Logger.output(chalk.bold('Improved:'));
          Logger.output(result.improved);
          Logger.output();
          Logger.output(chalk.bold('Diff:'));
          Logger.output(result.diff);
          return;
        }

        if (options.interactive) {
          let result: string;

          if (existsSync(text)) {
            const interactiveResult = await writeCommand.improveFileInteractive(text, writeOptions);
            result = interactiveResult.selected;


            if (options.output || options.inPlace) {
              const outputPath = options.inPlace ? text : options.output!;
              await writeFile(outputPath, result, 'utf-8');
              Logger.success(chalk.green(`\u2713 Saved to ${outputPath}`));
            }
          } else {
            result = await writeCommand.improveInteractive(text, writeOptions);
          }

          Logger.output();
          Logger.output(chalk.bold('Selected improvement:'));
          Logger.output(result);
          return;
        }

        if (existsSync(text)) {
          const result = await writeCommand.improveFile(text, writeOptions);
          Logger.output(result);
          return;
        }

        const result = await writeCommand.improve(text, writeOptions);
        if (options.output) {
          await writeFile(options.output, result, 'utf-8');
          Logger.success(chalk.green(`\u2713 Saved to ${options.output}`));
        }
        Logger.output(result);
      } catch (error) {
        handleError(error);
      }
    });
}
