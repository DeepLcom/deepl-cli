import chalk from 'chalk';
import { DeepLClient, LanguageInfo } from '../../api/deepl-client.js';

export class LanguagesCommand {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  async getSourceLanguages(): Promise<LanguageInfo[]> {
    return await this.client.getSupportedLanguages('source');
  }

  async getTargetLanguages(): Promise<LanguageInfo[]> {
    return await this.client.getSupportedLanguages('target');
  }

  formatLanguages(languages: LanguageInfo[], type: 'source' | 'target'): string {
    const lines: string[] = [];
    const header = type === 'source' ? 'Source Languages:' : 'Target Languages:';

    lines.push(chalk.bold(header));

    if (languages.length === 0) {
      lines.push(chalk.gray('  No languages available'));
      return lines.join('\n');
    }

    // Find the longest language code for alignment
    const maxCodeLength = Math.max(...languages.map(lang => lang.language.length));

    languages.forEach(lang => {
      const code = lang.language.padEnd(maxCodeLength + 2);
      lines.push(`  ${chalk.cyan(code)} ${lang.name}`);
    });

    return lines.join('\n');
  }

  formatAllLanguages(sourceLanguages: LanguageInfo[], targetLanguages: LanguageInfo[]): string {
    const sourcePart = this.formatLanguages(sourceLanguages, 'source');
    const targetPart = this.formatLanguages(targetLanguages, 'target');

    return `${sourcePart}\n\n${targetPart}`;
  }
}
