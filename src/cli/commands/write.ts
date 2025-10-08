/**
 * Write Command
 * Handles text improvement operations using DeepL Write API
 */

import { WriteService } from '../../services/write.js';
import { ConfigService } from '../../storage/config.js';
import { WriteLanguage, WritingStyle, WriteTone } from '../../types/index.js';
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import * as Diff from 'diff';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface WriteOptions {
  lang: WriteLanguage;
  style?: WritingStyle;
  tone?: WriteTone;
  showAlternatives?: boolean;
  outputFile?: string;
  inPlace?: boolean;
  createBackup?: boolean;
}

export class WriteCommand {
  private writeService: WriteService;

  constructor(writeService: WriteService, config: ConfigService) {
    if (!config) {
      throw new Error('Config service is required');
    }
    this.writeService = writeService;
  }

  /**
   * Improve text using DeepL Write API
   */
  async improve(text: string, options: WriteOptions): Promise<string> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    if (!options.lang) {
      throw new Error('Language is required');
    }

    if (options.style && options.tone) {
      throw new Error('Cannot specify both style and tone in a single request');
    }

    const writeOptions: {
      targetLang: WriteLanguage;
      writingStyle?: WritingStyle;
      tone?: WriteTone;
    } = {
      targetLang: options.lang,
    };

    if (options.style) {
      writeOptions.writingStyle = options.style;
    }

    if (options.tone) {
      writeOptions.tone = options.tone;
    }

    if (options.showAlternatives) {
      const improvements = await this.writeService.improve(text, writeOptions);
      return this.formatAlternatives(improvements.map(i => i.text));
    }

    const improvement = await this.writeService.getBestImprovement(text, writeOptions);
    return improvement.text;
  }

  /**
   * Improve text from a file
   */
  async improveFile(filePath: string, options: WriteOptions): Promise<string> {
    if (!filePath || filePath.trim() === '') {
      throw new Error('File path cannot be empty');
    }

    if (!options.lang) {
      throw new Error('Language is required');
    }

    // Read file content
    const absolutePath = resolve(filePath);
    let content: string;

    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }

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

    // Read file content
    const absolutePath = resolve(filePath);
    let content: string;

    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }

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

    // Read file content
    const absolutePath = resolve(filePath);
    let content: string;

    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }

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

    // Read file content
    const absolutePath = resolve(filePath);
    let content: string;

    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }

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
   */
  async improveInteractive(text: string, options: WriteOptions): Promise<string> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    if (!options.lang) {
      throw new Error('Language is required');
    }

    const writeOptions: {
      targetLang: WriteLanguage;
      writingStyle?: WritingStyle;
      tone?: WriteTone;
    } = {
      targetLang: options.lang,
    };

    if (options.style) {
      writeOptions.writingStyle = options.style;
    }

    if (options.tone) {
      writeOptions.tone = options.tone;
    }

    // Get all improvements
    const improvements = await this.writeService.improve(text, writeOptions);

    // Create choices with previews
    const choices = [
      {
        name: `${chalk.yellow('Keep original')} - "${this.truncate(text, 60)}"`,
        value: -1,
      },
      ...improvements.map((improvement, index) => ({
        name: `${chalk.bold(`Option ${index + 1}`)} - "${this.truncate(improvement.text, 60)}"`,
        value: index,
      })),
    ];

    // Prompt user to select
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: 'Choose an improvement:',
        choices,
      },
    ]);

    // Return selected text
    if (answer.selection === -1) {
      return text; // Keep original
    }

    return improvements[answer.selection]!.text;
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

    // Read file content
    const absolutePath = resolve(filePath);
    let content: string;

    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }

    // Get alternatives
    const writeOptions: {
      targetLang: WriteLanguage;
      writingStyle?: WritingStyle;
      tone?: WriteTone;
    } = {
      targetLang: options.lang,
    };

    if (options.style) {
      writeOptions.writingStyle = options.style;
    }

    if (options.tone) {
      writeOptions.tone = options.tone;
    }

    const improvements = await this.writeService.improve(content, writeOptions);
    const alternatives = improvements.map(i => i.text);

    // Interactive selection
    const selected = await this.improveInteractive(content, options);

    return {
      selected,
      alternatives,
      original: content,
    };
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
   * Format alternatives with numbering
   */
  private formatAlternatives(alternatives: string[]): string {
    return alternatives.map((alt, index) => `${index + 1}. ${alt}`).join('\n\n');
  }
}
