/**
 * Usage Command
 * Displays API usage statistics
 */

import chalk from 'chalk';
import type { UsageService } from '../../services/usage.js';
import { UsageInfo } from '../../api/deepl-client.js';

export class UsageCommand {
  private service: UsageService;

  constructor(service: UsageService) {
    this.service = service;
  }

  /**
   * Get usage statistics from DeepL API
   */
  async getUsage(): Promise<UsageInfo> {
    return await this.service.getUsage();
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

    if (usage.accountUnitCount !== undefined) {
      lines.push('');
      lines.push(chalk.bold('Account Unit Usage:'));
      const unitLimit = usage.accountUnitLimit ?? 0;
      const unitLimitStr = unitLimit === 0 ? 'unlimited' : formatNumber(unitLimit);
      lines.push(`  Used: ${formatNumber(usage.accountUnitCount)} / ${unitLimitStr} units`);
    }

    if (usage.apiKeyUnitCount !== undefined) {
      lines.push('');
      lines.push(chalk.bold('API Key Unit Usage:'));
      const unitLimit = usage.apiKeyUnitLimit ?? 0;
      const unitLimitStr = unitLimit === 0 ? 'unlimited' : formatNumber(unitLimit);
      lines.push(`  Used: ${formatNumber(usage.apiKeyUnitCount)} / ${unitLimitStr} units`);
    } else if (usage.apiKeyCharacterCount !== undefined) {
      lines.push('');
      lines.push(chalk.bold('API Key Usage:'));
      const limitStr = usage.apiKeyCharacterLimit === 0
        ? 'unlimited'
        : formatNumber(usage.apiKeyCharacterLimit ?? 0);
      lines.push(`  Used: ${formatNumber(usage.apiKeyCharacterCount)} / ${limitStr}`);
    }

    if (usage.speechToTextMillisecondsCount !== undefined) {
      const sttCount = usage.speechToTextMillisecondsCount;
      const sttLimit = usage.speechToTextMillisecondsLimit ?? 0;
      const sttPercentage = sttLimit > 0
        ? ((sttCount / sttLimit) * 100).toFixed(1)
        : '0.0';
      const sttRemaining = sttLimit - sttCount;
      const isHighStt = sttLimit > 0 && (sttCount / sttLimit) > 0.8;

      lines.push('');
      lines.push(chalk.bold('Speech-to-Text Usage:'));
      const sttColor = isHighStt ? chalk.yellow : chalk.green;
      lines.push(`  Used: ${sttColor(this.formatMilliseconds(sttCount))} / ${this.formatMilliseconds(sttLimit)} (${sttColor(sttPercentage + '%')})`);
      lines.push(`  Remaining: ${this.formatMilliseconds(sttRemaining)}`);

      if (isHighStt) {
        lines.push('');
        lines.push(chalk.yellow('Warning: You are approaching your speech-to-text limit'));
      }
    }

    if (usage.products && usage.products.length > 0) {
      lines.push('');
      lines.push(chalk.bold('Product Breakdown:'));
      for (const product of usage.products) {
        if (product.billingUnit === 'milliseconds') {
          lines.push(`  ${product.productType}: ${this.formatMilliseconds(product.characterCount)} (API key: ${this.formatMilliseconds(product.apiKeyCharacterCount)})`);
        } else if (product.unitCount !== undefined) {
          const apiKeyPart = product.apiKeyUnitCount !== undefined
            ? ` (API key: ${formatNumber(product.apiKeyUnitCount)} units)`
            : ` (API key: ${formatNumber(product.apiKeyCharacterCount)} characters)`;
          lines.push(`  ${product.productType}: ${formatNumber(product.unitCount)} units${apiKeyPart}`);
        } else {
          lines.push(`  ${product.productType}: ${formatNumber(product.characterCount)} characters (API key: ${formatNumber(product.apiKeyCharacterCount)})`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatMilliseconds(ms: number): string {
    if (ms === 0) {
      return '0ms';
    }
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s ${ms % 1000}ms`;
  }
}
