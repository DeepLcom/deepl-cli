/**
 * Write Command
 * Handles text improvement operations using DeepL Write API
 */

import { WriteService } from '../../services/write.js';
import { WriteLanguage, WritingStyle, WriteTone } from '../../types/index.js';
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import * as Diff from 'diff';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { formatWriteJson } from '../../utils/formatters.js';
import { safeReadFile } from '../../utils/safe-read-file.js';
import { Logger } from '../../utils/logger.js';

interface WriteOptions {
  lang?: WriteLanguage;
  style?: WritingStyle;
  tone?: WriteTone;
  showAlternatives?: boolean;
  outputFile?: string;
  inPlace?: boolean;
  createBackup?: boolean;
  format?: string;
  noCache?: boolean;
}

export class WriteCommand {
  private writeService: WriteService;

  constructor(writeService: WriteService) {
    this.writeService = writeService;
  }

  /**
   * Improve text using DeepL Write API
   */
  async improve(text: string, options: WriteOptions): Promise<string> {
    const writeOptions: {
      targetLang?: WriteLanguage;
      writingStyle?: WritingStyle;
      tone?: WriteTone;
    } = {};

    if (options.lang) {
      writeOptions.targetLang = options.lang;
    }

    if (options.style) {
      writeOptions.writingStyle = options.style;
    }

    if (options.tone) {
      writeOptions.tone = options.tone;
    }

    const serviceOptions = { skipCache: options.noCache };

    if (options.showAlternatives) {
      const improvements = await this.writeService.improve(text, writeOptions, serviceOptions);
      return this.formatAlternatives(improvements.map(i => i.text));
    }

    const improvement = await this.writeService.getBestImprovement(text, writeOptions, serviceOptions);

    // Format output based on format option
    if (options.format === 'json') {
      return formatWriteJson(text, improvement.text, options.lang ?? 'auto-detected');
    }

    return improvement.text;
  }

  /**
   * Improve text from a file
   */
  async improveFile(filePath: string, options: WriteOptions): Promise<string> {
    if (!filePath || filePath.trim() === '') {
      throw new Error('File path cannot be empty');
    }

    const absolutePath = resolve(filePath);
    const content = await this.readFileContent(filePath);

    // Improve the content
    const improvedText = await this.improve(content, options);

    // Handle output
    if (options.outputFile) {
      const outputPath = resolve(options.outputFile);
      // Ensure output directory exists
      await fs.mkdir(dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, improvedText, 'utf-8');
    } else if (options.inPlace) {
      await fs.writeFile(absolutePath, improvedText, 'utf-8');
    }

    return improvedText;
  }

  /**
   * Generate a unified diff between original and improved text
   */
  generateDiff(original: string, improved: string): string {
    const patch = Diff.createPatch(
      'text',
      original,
      improved,
      'original',
      'improved'
    );

    // Color the diff output
    const lines = patch.split('\n');
    const coloredLines = lines.map((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return chalk.green(line);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        return chalk.red(line);
      } else if (line.startsWith('@@')) {
        return chalk.cyan(line);
      }
      return line;
    });

    return coloredLines.join('\n');
  }

  /**
   * Improve text and return with diff view
   */
  async improveWithDiff(
    text: string,
    options: WriteOptions
  ): Promise<{ original: string; improved: string; diff: string }> {
    const improvedText = await this.improve(text, options);
    const diff = this.generateDiff(text, improvedText);

    return {
      original: text,
      improved: improvedText,
      diff,
    };
  }

  /**
   * Improve file and return with diff view
   */
  async improveFileWithDiff(
    filePath: string,
    options: WriteOptions
  ): Promise<{ original: string; improved: string; diff: string }> {
    if (!filePath || filePath.trim() === '') {
      throw new Error('File path cannot be empty');
    }

    const content = await this.readFileContent(filePath);

    return this.improveWithDiff(content, options);
  }

  /**
   * Check if text needs improvement
   */
  async checkText(
    text: string,
    options: WriteOptions
  ): Promise<{
    needsImprovement: boolean;
    original: string;
    improved: string;
    changes: number;
  }> {
    const improvedText = await this.improve(text, options);

    // Count the number of changes using diff
    const patches = Diff.diffWords(text, improvedText);
    const changes = patches.filter(p => p.added || p.removed).length;

    return {
      needsImprovement: changes > 0,
      original: text,
      improved: improvedText,
      changes,
    };
  }

  /**
   * Check if file needs improvement
   */
  async checkFile(
    filePath: string,
    options: WriteOptions
  ): Promise<{
    needsImprovement: boolean;
    filePath: string;
    original: string;
    improved: string;
    changes: number;
  }> {
    if (!filePath || filePath.trim() === '') {
      throw new Error('File path cannot be empty');
    }

    const absolutePath = resolve(filePath);
    const content = await this.readFileContent(filePath);

    const checkResult = await this.checkText(content, options);

    return {
      ...checkResult,
      filePath: absolutePath,
    };
  }

  /**
   * Auto-fix file by applying improvements in-place
   */
  async autoFixFile(
    filePath: string,
    options: WriteOptions
  ): Promise<{
    fixed: boolean;
    filePath: string;
    changes: number;
    backupPath?: string;
  }> {
    if (!filePath || filePath.trim() === '') {
      throw new Error('File path cannot be empty');
    }

    const absolutePath = resolve(filePath);
    const content = await this.readFileContent(filePath);

    // Check if improvements are needed
    const checkResult = await this.checkText(content, options);

    if (!checkResult.needsImprovement) {
      return {
        fixed: false,
        filePath: absolutePath,
        changes: 0,
      };
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (options.createBackup) {
      backupPath = `${absolutePath}.bak`;
      await fs.writeFile(backupPath, content, 'utf-8');
    }

    // Write improved content
    await fs.writeFile(absolutePath, checkResult.improved, 'utf-8');

    return {
      fixed: true,
      filePath: absolutePath,
      changes: checkResult.changes,
      backupPath,
    };
  }

  /**
   * Improve text interactively - show alternatives and let user choose
   * Generates multiple alternatives by calling the API with different styles/tones
   */
  async improveInteractive(text: string, options: WriteOptions): Promise<string> {
    const serviceOptions = { skipCache: options.noCache };

    // If user specified a style or tone, only use that
    if (options.style || options.tone) {
      const writeOptions: {
        targetLang?: WriteLanguage;
        writingStyle?: WritingStyle;
        tone?: WriteTone;
      } = {};

      if (options.lang) {
        writeOptions.targetLang = options.lang;
      }

      if (options.style) {
        writeOptions.writingStyle = options.style;
      }

      if (options.tone) {
        writeOptions.tone = options.tone;
      }

      const improvements = await this.writeService.improve(text, writeOptions, serviceOptions);

      const maxLen = this.getPreviewWidth();
      const choices = [
        {
          name: `${chalk.yellow('Keep original')} - "${this.truncate(text, maxLen)}"`,
          value: -1,
          description: text,
        },
        {
          name: `${chalk.bold('Improved')} - "${this.truncate(improvements[0]!.text, maxLen)}"`,
          value: 0,
          description: improvements[0]!.text,
        },
      ];

      const selection = await select({
        message: 'Choose an improvement:',
        choices,
      });

      return selection === -1 ? text : improvements[0]!.text;
    }

    // Generate multiple alternatives by calling API with different styles
    const styles: WritingStyle[] = ['simple', 'business', 'academic', 'casual'];
    const allImprovements: Array<{ text: string; label: string }> = [];

    // Call API for each style
    for (const style of styles) {
      try {
        const improvements = await this.writeService.improve(text, {
          ...(options.lang ? { targetLang: options.lang } : {}),
          writingStyle: style,
        }, serviceOptions);

        if (improvements.length > 0 && improvements[0]) {
          allImprovements.push({
            text: improvements[0].text,
            label: this.capitalizeFirst(style),
          });
        }
      } catch (error) {
        Logger.verbose(`Write style ${style} failed:`, error instanceof Error ? error.message : String(error));
      }
    }

    if (allImprovements.length === 0) {
      throw new Error('No improvements could be generated');
    }

    // Remove duplicates (same text with different styles)
    const uniqueImprovements = allImprovements.filter(
      (improvement, index, self) =>
        index === self.findIndex(t => t.text === improvement.text)
    );

    // Create choices with style labels
    const maxLen = this.getPreviewWidth();
    const choices = [
      {
        name: `${chalk.yellow('Keep original')} - "${this.truncate(text, maxLen)}"`,
        value: -1,
        description: text,
      },
      ...uniqueImprovements.map((improvement, index) => ({
        name: `${chalk.bold(improvement.label)} - "${this.truncate(improvement.text, maxLen)}"`,
        value: index,
        description: improvement.text,
      })),
    ];

    // Prompt user to select
    const selection = await select({
      message: `Choose an improvement (${uniqueImprovements.length} alternatives):`,
      choices,
    });

    // Return selected text
    if (selection === -1) {
      return text; // Keep original
    }

    return uniqueImprovements[selection]!.text;
  }

  /**
   * Improve file interactively
   */
  async improveFileInteractive(
    filePath: string,
    options: WriteOptions
  ): Promise<{
    selected: string;
    alternatives: string[];
    original: string;
  }> {
    if (!filePath || filePath.trim() === '') {
      throw new Error('File path cannot be empty');
    }

    const content = await this.readFileContent(filePath);

    // Get alternatives
    const writeOptions: {
      targetLang?: WriteLanguage;
      writingStyle?: WritingStyle;
      tone?: WriteTone;
    } = {};

    if (options.lang) {
      writeOptions.targetLang = options.lang;
    }

    if (options.style) {
      writeOptions.writingStyle = options.style;
    }

    if (options.tone) {
      writeOptions.tone = options.tone;
    }

    const improvements = await this.writeService.improve(content, writeOptions, { skipCache: options.noCache });
    const alternatives = improvements.map(i => i.text);

    // Interactive selection
    const selected = await this.improveInteractive(content, options);

    return {
      selected,
      alternatives,
      original: content,
    };
  }

  private async readFileContent(filePath: string): Promise<string> {
    const absolutePath = resolve(filePath);

    try {
      return await safeReadFile(absolutePath, 'utf-8');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Symlinks are not supported')) {
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Calculate preview width based on terminal columns
   */
  private getPreviewWidth(): number {
    return Math.max(40, (process.stdout.columns || 80) - 25);
  }

  /**
   * Truncate text for preview
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Capitalize first letter of string
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Format alternatives with numbering
   */
  private formatAlternatives(alternatives: string[]): string {
    return alternatives.map((alt, index) => `${index + 1}. ${alt}`).join('\n\n');
  }
}
