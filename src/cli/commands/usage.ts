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

    // Calculate percentage
    const percentage = characterLimit > 0
      ? ((characterCount / characterLimit) * 100).toFixed(1)
      : '0.0';

    // Calculate remaining
    const remaining = characterLimit - characterCount;

    // Determine if usage is high (>80%)
    const isHighUsage = characterLimit > 0 && (characterCount / characterLimit) > 0.8;

    // Format numbers with commas
    const formatNumber = (num: number): string => {
      return num.toLocaleString('en-US');
    };

    // Build output
    const lines: string[] = [];
    lines.push(chalk.bold('Character Usage:'));

    // Usage line with color coding
    const usageColor = isHighUsage ? chalk.yellow : chalk.green;
    lines.push(`  Used: ${usageColor(formatNumber(characterCount))} / ${formatNumber(characterLimit)} (${usageColor(percentage + '%')})`);

    // Remaining line
    lines.push(`  Remaining: ${formatNumber(remaining)}`);

    // Warning for high usage
    if (isHighUsage) {
      lines.push('');
      lines.push(chalk.yellow('⚠ Warning: You are approaching your character limit'));
    }

    return lines.join('\n');
  }
}
