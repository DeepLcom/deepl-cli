/**
 * Usage Command
 * Displays API usage statistics
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import type { UsageService } from '../../services/usage.js';
import { UsageInfo } from '../../api/deepl-client.js';
import type { ProductUsage } from '../../api/translation-client.js';
import { isColorEnabled } from '../../utils/formatters.js';

const DURATION_BILLING_UNITS = new Set(['milliseconds', 'minutes']);

/** The API reports product types in camelCase; display uses the documented snake_case. */
function productDisplayName(productType: string): string {
  return productType.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function isDurationBilled(product: ProductUsage): boolean {
  return product.billingUnit !== undefined && DURATION_BILLING_UNITS.has(product.billingUnit);
}

/**
 * Duration-billed usage in milliseconds: the account-wide amount where the
 * response carries one, and the API-key-scoped amount.
 *
 * `accountUsed` stays undefined rather than falling back to the API-key figure:
 * live responses omit `unit_count` for these products, so a fallback would print
 * the key's own usage in the account column and the two would always be equal.
 *
 * A `milliseconds`-billed product reports its duration in the character-count
 * fields, which is why those are read at all -- but only there. Under `minutes`
 * billing they are character counts, and scaling one by 60,000 invents hours of
 * usage that never happened.
 */
function productDurationsMs(product: ProductUsage): {
  accountUsed: number | undefined;
  apiKeyUsed: number | undefined;
} {
  const perMinute = product.billingUnit === 'minutes';
  const scale = perMinute ? 60_000 : 1;
  const duration = (value: number | null | undefined): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value * scale : undefined;
  const accountFallback = perMinute ? undefined : duration(product.characterCount);
  const apiKeyFallback = perMinute ? undefined : duration(product.apiKeyCharacterCount);
  return {
    accountUsed:
      duration(product.unitCount) ?? duration(product.accountUnitCount) ?? accountFallback,
    apiKeyUsed: duration(product.apiKeyUnitCount) ?? apiKeyFallback,
  };
}

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

    // Tolerates a null the response may carry where the type says number: the
    // alternative is `deepl usage` throwing on a field it only displays.
    const formatNumber = (num: number | null | undefined): string => {
      return typeof num === 'number' && Number.isFinite(num) ? num.toLocaleString('en-US') : '—';
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

    if (usage.products && usage.products.length > 0) {
      lines.push('');
      lines.push(chalk.bold('Product Breakdown:'));
      for (const product of usage.products) {
        const name = productDisplayName(product.productType);
        if (isDurationBilled(product)) {
          const { accountUsed, apiKeyUsed } = productDurationsMs(product);
          const account = accountUsed === undefined ? undefined : this.formatMilliseconds(accountUsed);
          const apiKey = apiKeyUsed === undefined ? undefined : this.formatMilliseconds(apiKeyUsed);
          if (account !== undefined && apiKey !== undefined) {
            lines.push(`  ${name}: ${account} (API key: ${apiKey})`);
          } else if (apiKey !== undefined) {
            lines.push(`  ${name}: ${apiKey} (API key)`);
          } else {
            lines.push(`  ${name}: ${account ?? 'not reported'}`);
          }
        } else if (product.unitCount !== undefined) {
          const apiKeyPart = product.apiKeyUnitCount !== undefined
            ? ` (API key: ${formatNumber(product.apiKeyUnitCount)} units)`
            : ` (API key: ${formatNumber(product.apiKeyCharacterCount)} characters)`;
          lines.push(`  ${name}: ${formatNumber(product.unitCount)} units${apiKeyPart}`);
        } else {
          lines.push(`  ${name}: ${formatNumber(product.characterCount)} characters (API key: ${formatNumber(product.apiKeyCharacterCount)})`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatMilliseconds(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /** Format usage statistics as a cli-table3 table. */
  formatUsageTable(usage: UsageInfo): string {
    const formatNumber = (n: number): string => n.toLocaleString('en-US');
    const pct = (count: number, limit: number): string =>
      limit > 0 ? `${((count / limit) * 100).toFixed(1)}%` : '—';
    const fmtLimit = (limit: number | undefined): string =>
      limit === undefined || limit === 0 ? 'unlimited' : formatNumber(limit);
    const colorDisabled = !isColorEnabled();

    const table = new Table({
      head: ['Resource', 'Used', 'Limit', 'Usage'],
      colWidths: [22, 18, 18, 10],
      wordWrap: true,
      ...(colorDisabled && { style: { head: [], border: [] } }),
    });

    table.push([
      'Characters',
      formatNumber(usage.characterCount),
      fmtLimit(usage.characterLimit),
      pct(usage.characterCount, usage.characterLimit),
    ]);

    if (usage.accountUnitCount !== undefined) {
      table.push([
        'Account units',
        formatNumber(usage.accountUnitCount),
        fmtLimit(usage.accountUnitLimit),
        pct(usage.accountUnitCount, usage.accountUnitLimit ?? 0),
      ]);
    }

    if (usage.apiKeyUnitCount !== undefined) {
      table.push([
        'API key units',
        formatNumber(usage.apiKeyUnitCount),
        fmtLimit(usage.apiKeyUnitLimit),
        pct(usage.apiKeyUnitCount, usage.apiKeyUnitLimit ?? 0),
      ]);
    } else if (usage.apiKeyCharacterCount !== undefined) {
      table.push([
        'API key characters',
        formatNumber(usage.apiKeyCharacterCount),
        fmtLimit(usage.apiKeyCharacterLimit),
        pct(usage.apiKeyCharacterCount, usage.apiKeyCharacterLimit ?? 0),
      ]);
    }

    let output = table.toString();

    if (usage.products && usage.products.length > 0) {
      const productTable = new Table({
        head: ['Product', 'Used', 'API key'],
        colWidths: [28, 22, 22],
        wordWrap: true,
        ...(colorDisabled && { style: { head: [], border: [] } }),
      });
      for (const product of usage.products) {
        const name = productDisplayName(product.productType);
        if (isDurationBilled(product)) {
          const { accountUsed, apiKeyUsed } = productDurationsMs(product);
          productTable.push([
            name,
            accountUsed === undefined ? '—' : this.formatMilliseconds(accountUsed),
            apiKeyUsed === undefined ? '—' : this.formatMilliseconds(apiKeyUsed),
          ]);
        } else if (product.unitCount !== undefined) {
          const apiKeyVal = product.apiKeyUnitCount !== undefined
            ? `${formatNumber(product.apiKeyUnitCount)} units`
            : `${formatNumber(product.apiKeyCharacterCount)} chars`;
          productTable.push([
            name,
            `${formatNumber(product.unitCount)} units`,
            apiKeyVal,
          ]);
        } else {
          productTable.push([
            name,
            `${formatNumber(product.characterCount)} chars`,
            `${formatNumber(product.apiKeyCharacterCount)} chars`,
          ]);
        }
      }
      output = `${output}\n\nProduct Breakdown:\n${productTable.toString()}`;
    }

    return output;
  }
}
