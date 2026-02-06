/**
 * Usage Command
 * Displays API usage statistics
 */

import chalk from 'chalk';
import { DeepLClient, UsageInfo } from '../../api/deepl-client.js';

export class UsageCommand {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  /**
   * Get usage statistics from DeepL API
   */
  async getUsage(): Promise<UsageInfo> {
    return await this.client.getUsage();
  }

  /**
   * Format usage statistics for display
   */
  formatUsage(usage: UsageInfo): string {
    const { characterCount, characterLimit } = usage;

    const percentage = characterLimit > 0
      ? ((characterCount / characterLimit) * 100).toFixed(1)
      : '0.0';

    const remaining = characterLimit - characterCount;
    const isHighUsage = characterLimit > 0 && (characterCount / characterLimit) > 0.8;

    const formatNumber = (num: number): string => {
      return num.toLocaleString('en-US');
    };

    const lines: string[] = [];
    lines.push(chalk.bold('Character Usage:'));

    const usageColor = isHighUsage ? chalk.yellow : chalk.green;
    lines.push(`  Used: ${usageColor(formatNumber(characterCount))} / ${formatNumber(characterLimit)} (${usageColor(percentage + '%')})`);
    lines.push(`  Remaining: ${formatNumber(remaining)}`);

    if (isHighUsage) {
      lines.push('');
      lines.push(chalk.yellow('⚠ Warning: You are approaching your character limit'));
    }

    if (usage.startTime || usage.endTime) {
      lines.push('');
      lines.push(chalk.bold('Billing Period:'));
      const start = usage.startTime ? usage.startTime.split('T')[0] : 'N/A';
      const end = usage.endTime ? usage.endTime.split('T')[0] : 'N/A';
      lines.push(`  ${start} to ${end}`);
    }

    if (usage.apiKeyCharacterCount !== undefined) {
      lines.push('');
      lines.push(chalk.bold('API Key Usage:'));
      const limitStr = usage.apiKeyCharacterLimit === 0
        ? 'unlimited'
        : formatNumber(usage.apiKeyCharacterLimit ?? 0);
      lines.push(`  Used: ${formatNumber(usage.apiKeyCharacterCount)} / ${limitStr}`);
    }

    if (usage.products && usage.products.length > 0) {
      lines.push('');
      lines.push(chalk.bold('Product Breakdown:'));
      for (const product of usage.products) {
        lines.push(`  ${product.productType}: ${formatNumber(product.characterCount)} characters (API key: ${formatNumber(product.apiKeyCharacterCount)})`);
      }
    }

    return lines.join('\n');
  }
}
