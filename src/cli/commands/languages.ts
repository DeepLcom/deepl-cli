import chalk from 'chalk';
import Table from 'cli-table3';
import type { LanguagesService } from '../../services/languages.js';
import { LanguageInfo } from '../../api/deepl-client.js';
import {
  getSourceLanguages as getRegistrySourceLanguages,
  getTargetLanguages as getRegistryTargetLanguages,
} from '../../data/language-registry.js';
import { isColorEnabled } from '../../utils/formatters.js';

export interface LanguageDisplayEntry {
  code: string;
  name: string;
  category: 'core' | 'regional' | 'extended';
  supportsFormality?: boolean;
}

export class LanguagesCommand {
  private service: LanguagesService;

  constructor(service: LanguagesService) {
    this.service = service;
  }

  async getSourceLanguages(): Promise<LanguageInfo[]> {
    return this.service.getSupportedLanguages('source');
  }

  async getTargetLanguages(): Promise<LanguageInfo[]> {
    return this.service.getSupportedLanguages('target');
  }

  /**
   * Merge API languages with registry data. API names take precedence.
   */
  mergeWithRegistry(
    apiLanguages: LanguageInfo[],
    type: 'source' | 'target'
  ): LanguageDisplayEntry[] {
    const apiMap = new Map<string, LanguageInfo>();
    for (const lang of apiLanguages) {
      apiMap.set(lang.language.toLowerCase(), lang);
    }

    const registryEntries = type === 'source'
      ? getRegistrySourceLanguages()
      : getRegistryTargetLanguages();

    return registryEntries.map(entry => {
      const apiLang = apiMap.get(entry.code);
      return {
        code: entry.code,
        name: apiLang?.name ?? entry.name,
        category: entry.category,
        ...(apiLang?.supportsFormality !== undefined && { supportsFormality: apiLang.supportsFormality }),
      };
    });
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
    if (languages.length === 0 && !this.service.hasClient()) {
      const displayEntries = this.getRegistryLanguages(type);
      return this.formatDisplayEntries(displayEntries, type);
    }

    const displayEntries = this.mergeWithRegistry(languages, type);
    return this.formatDisplayEntries(displayEntries, type);
  }

  formatDisplayEntries(entries: LanguageDisplayEntry[], type: 'source' | 'target'): string {
    const lines: string[] = [];
    const header = type === 'source' ? 'Source Languages:' : 'Target Languages:';
    const showFormality = type === 'target' && entries.some(e => e.supportsFormality !== undefined);

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
      const formalityMarker = showFormality && entry.supportsFormality ? chalk.green(' [F]') : '';
      lines.push(`  ${chalk.cyan(code)} ${entry.name}${formalityMarker}`);
    });

    if (extended.length > 0) {
      lines.push('');
      lines.push(chalk.gray('  Extended Languages (quality_optimized only, no formality/glossary):'));
      extended.forEach(entry => {
        const code = entry.code.padEnd(maxCodeLength + 2);
        lines.push(`  ${chalk.gray(code)} ${chalk.gray(entry.name)}`);
      });
    }

    if (showFormality) {
      lines.push('');
      lines.push(chalk.gray('  [F] = supports formality parameter'));
    }

    return lines.join('\n');
  }

  formatAllLanguages(sourceLanguages: LanguageInfo[], targetLanguages: LanguageInfo[]): string {
    const sourcePart = this.formatLanguages(sourceLanguages, 'source');
    const targetPart = this.formatLanguages(targetLanguages, 'target');

    return `${sourcePart}\n\n${targetPart}`;
  }

  /** Format a single language list (source or target) as a cli-table3 table. */
  formatLanguagesTable(languages: LanguageInfo[], type: 'source' | 'target'): string {
    const entries = languages.length === 0 && !this.service.hasClient()
      ? this.getRegistryLanguages(type)
      : this.mergeWithRegistry(languages, type);

    const header = type === 'source' ? 'Source Languages' : 'Target Languages';
    if (entries.length === 0) {
      return `${header}: (no languages available)`;
    }

    const showFormality = type === 'target' && entries.some(e => e.supportsFormality !== undefined);
    const head = showFormality
      ? ['Code', 'Name', 'Category', 'Formality']
      : ['Code', 'Name', 'Category'];
    const colWidths = showFormality ? [10, 30, 12, 13] : [10, 36, 12];
    const colorDisabled = !isColorEnabled();

    const table = new Table({
      head,
      colWidths,
      wordWrap: true,
      ...(colorDisabled && { style: { head: [], border: [] } }),
    });

    for (const entry of entries) {
      const row: string[] = [entry.code, entry.name, entry.category];
      if (showFormality) {
        row.push(entry.supportsFormality ? 'yes' : '—');
      }
      table.push(row);
    }

    return `${header}:\n${table.toString()}`;
  }

  /** Format both source and target language tables joined by a blank line. */
  formatAllLanguagesTable(sourceLanguages: LanguageInfo[], targetLanguages: LanguageInfo[]): string {
    return `${this.formatLanguagesTable(sourceLanguages, 'source')}\n\n${this.formatLanguagesTable(targetLanguages, 'target')}`;
  }
}
