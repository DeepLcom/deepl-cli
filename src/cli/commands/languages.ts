import chalk from 'chalk';
import { DeepLClient, LanguageInfo } from '../../api/deepl-client.js';
import {
  getSourceLanguages as getRegistrySourceLanguages,
  getTargetLanguages as getRegistryTargetLanguages,
} from '../../data/language-registry.js';

export interface LanguageDisplayEntry {
  code: string;
  name: string;
  category: 'core' | 'regional' | 'extended';
}

export class LanguagesCommand {
  private client: DeepLClient | null;

  constructor(client: DeepLClient | null) {
    this.client = client;
  }

  async getSourceLanguages(): Promise<LanguageInfo[]> {
    if (!this.client) return [];
    return await this.client.getSupportedLanguages('source');
  }

  async getTargetLanguages(): Promise<LanguageInfo[]> {
    if (!this.client) return [];
    return await this.client.getSupportedLanguages('target');
  }

  /**
   * Merge API languages with registry data. API names take precedence.
   */
  mergeWithRegistry(
    apiLanguages: LanguageInfo[],
    type: 'source' | 'target'
  ): LanguageDisplayEntry[] {
    const apiMap = new Map<string, string>();
    for (const lang of apiLanguages) {
      apiMap.set(lang.language.toLowerCase(), lang.name);
    }

    const registryEntries = type === 'source'
      ? getRegistrySourceLanguages()
      : getRegistryTargetLanguages();

    return registryEntries.map(entry => ({
      code: entry.code,
      name: apiMap.get(entry.code) ?? entry.name,
      category: entry.category,
    }));
  }

  /**
   * Get display entries from registry only (no API call).
   */
  getRegistryLanguages(type: 'source' | 'target'): LanguageDisplayEntry[] {
    const entries = type === 'source'
      ? getRegistrySourceLanguages()
      : getRegistryTargetLanguages();

    return entries.map(entry => ({
      code: entry.code,
      name: entry.name,
      category: entry.category,
    }));
  }

  formatLanguages(languages: LanguageInfo[], type: 'source' | 'target'): string {
    if (languages.length === 0 && !this.client) {
      const displayEntries = this.getRegistryLanguages(type);
      return this.formatDisplayEntries(displayEntries, type);
    }

    const displayEntries = this.mergeWithRegistry(languages, type);
    return this.formatDisplayEntries(displayEntries, type);
  }

  formatDisplayEntries(entries: LanguageDisplayEntry[], type: 'source' | 'target'): string {
    const lines: string[] = [];
    const header = type === 'source' ? 'Source Languages:' : 'Target Languages:';

    lines.push(chalk.bold(header));

    if (entries.length === 0) {
      lines.push(chalk.gray('  No languages available'));
      return lines.join('\n');
    }

    const coreAndRegional = entries.filter(e => e.category === 'core' || e.category === 'regional');
    const extended = entries.filter(e => e.category === 'extended');

    const allEntries = [...coreAndRegional, ...extended];
    const maxCodeLength = Math.max(...allEntries.map(e => e.code.length));

    coreAndRegional.forEach(entry => {
      const code = entry.code.padEnd(maxCodeLength + 2);
      lines.push(`  ${chalk.cyan(code)} ${entry.name}`);
    });

    if (extended.length > 0) {
      lines.push('');
      lines.push(chalk.gray('  Extended Languages (quality_optimized only, no formality/glossary):'));
      extended.forEach(entry => {
        const code = entry.code.padEnd(maxCodeLength + 2);
        lines.push(`  ${chalk.gray(code)} ${chalk.gray(entry.name)}`);
      });
    }

    return lines.join('\n');
  }

  formatAllLanguages(sourceLanguages: LanguageInfo[], targetLanguages: LanguageInfo[]): string {
    const sourcePart = this.formatLanguages(sourceLanguages, 'source');
    const targetPart = this.formatLanguages(targetLanguages, 'target');

    return `${sourcePart}\n\n${targetPart}`;
  }
}
