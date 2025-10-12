/**
 * Glossary Command
 * Manages DeepL glossaries
 */

import * as fs from 'fs';
import { GlossaryService } from '../../services/glossary.js';
import { GlossaryInfo, GlossaryLanguagePair } from '../../api/deepl-client.js';

export class GlossaryCommand {
  private glossaryService: GlossaryService;

  constructor(glossaryService: GlossaryService) {
    this.glossaryService = glossaryService;
  }

  /**
   * Create glossary from TSV/CSV file
   */
  async create(
    name: string,
    sourceLang: string,
    targetLang: string,
    filePath: string
  ): Promise<GlossaryInfo> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return this.glossaryService.createGlossaryFromTSV(
      name,
      sourceLang,
      targetLang,
      content
    );
  }

  /**
   * List all glossaries
   */
  async list(): Promise<GlossaryInfo[]> {
    return this.glossaryService.listGlossaries();
  }

  /**
   * Show glossary details
   */
  async show(nameOrId: string): Promise<GlossaryInfo> {
    // Try to get by ID first
    try {
      return await this.glossaryService.getGlossary(nameOrId);
    } catch {
      // If failed, try by name
      const glossary = await this.glossaryService.getGlossaryByName(nameOrId);
      if (!glossary) {
        throw new Error(`Glossary not found: ${nameOrId}`);
      }
      return glossary;
    }
  }

  /**
   * Delete glossary
   */
  async delete(nameOrId: string): Promise<void> {
    // Try to get glossary first to find ID
    const glossary = await this.show(nameOrId);
    await this.glossaryService.deleteGlossary(glossary.glossary_id);
  }

  /**
   * Get glossary entries
   */
  async entries(nameOrId: string): Promise<Record<string, string>> {
    const glossary = await this.show(nameOrId);
    return this.glossaryService.getGlossaryEntries(glossary.glossary_id);
  }

  /**
   * List supported glossary language pairs
   */
  async listLanguages(): Promise<GlossaryLanguagePair[]> {
    return this.glossaryService.getGlossaryLanguages();
  }

  /**
   * Add a new entry to an existing glossary
   */
  async addEntry(
    nameOrId: string,
    sourceText: string,
    targetText: string
  ): Promise<GlossaryInfo> {
    const glossary = await this.show(nameOrId);
    return this.glossaryService.addEntry(glossary.glossary_id, sourceText, targetText);
  }

  /**
   * Update an existing entry in a glossary
   */
  async updateEntry(
    nameOrId: string,
    sourceText: string,
    newTargetText: string
  ): Promise<GlossaryInfo> {
    const glossary = await this.show(nameOrId);
    return this.glossaryService.updateEntry(glossary.glossary_id, sourceText, newTargetText);
  }

  /**
   * Remove an entry from a glossary
   */
  async removeEntry(
    nameOrId: string,
    sourceText: string
  ): Promise<GlossaryInfo> {
    const glossary = await this.show(nameOrId);
    return this.glossaryService.removeEntry(glossary.glossary_id, sourceText);
  }

  /**
   * Format glossary info for display
   */
  formatGlossaryInfo(glossary: GlossaryInfo): string {
    const status = glossary.ready ? 'Ready' : 'Not ready';
    return [
      `Name: ${glossary.name}`,
      `ID: ${glossary.glossary_id}`,
      `Status: ${status}`,
      `Language pair: ${glossary.source_lang} → ${glossary.target_lang}`,
      `Entries: ${glossary.entry_count}`,
      `Created: ${new Date(glossary.creation_time).toLocaleString()}`,
    ].join('\n');
  }

  /**
   * Format glossary list for display
   */
  formatGlossaryList(glossaries: GlossaryInfo[]): string {
    if (glossaries.length === 0) {
      return 'No glossaries found';
    }

    const lines = glossaries.map(g => {
      const status = g.ready ? '✓' : '○';
      return `${status} ${g.name} (${g.source_lang}→${g.target_lang}) - ${g.entry_count} entries`;
    });

    return lines.join('\n');
  }

  /**
   * Format glossary entries for display
   */
  formatEntries(entries: Record<string, string>): string {
    if (Object.keys(entries).length === 0) {
      return 'No entries found';
    }

    const lines = Object.entries(entries).map(
      ([source, target]) => `${source} → ${target}`
    );

    return lines.join('\n');
  }

  /**
   * Format glossary language pairs for display
   */
  formatLanguagePairs(pairs: GlossaryLanguagePair[]): string {
    if (pairs.length === 0) {
      return 'No language pairs available';
    }

    const lines = pairs.map(
      (pair) => `${pair.sourceLang} → ${pair.targetLang}`
    );

    return lines.join('\n');
  }
}
