/**
 * Glossary Service
 * Manages DeepL glossaries
 */

import { DeepLClient, GlossaryInfo, GlossaryLanguagePair } from '../api/deepl-client.js';

export class GlossaryService {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  /**
   * Create a glossary from entries object
   */
  async createGlossary(
    name: string,
    sourceLang: string,
    targetLang: string,
    entries: Record<string, string>
  ): Promise<GlossaryInfo> {
    // Validate inputs
    if (!name || name.trim() === '') {
      throw new Error('Glossary name is required');
    }

    if (Object.keys(entries).length === 0) {
      throw new Error('Glossary entries cannot be empty');
    }

    // Convert entries to TSV format
    const tsv = this.entriesToTSV(entries);

    // Create glossary via API
    return this.client.createGlossary(name, sourceLang, targetLang, tsv);
  }

  /**
   * Create a glossary from TSV/CSV string
   */
  async createGlossaryFromTSV(
    name: string,
    sourceLang: string,
    targetLang: string,
    tsv: string
  ): Promise<GlossaryInfo> {
    if (!name || name.trim() === '') {
      throw new Error('Glossary name is required');
    }

    if (!tsv || tsv.trim() === '') {
      throw new Error('Glossary entries cannot be empty');
    }

    return this.client.createGlossary(name, sourceLang, targetLang, tsv);
  }

  /**
   * List all glossaries
   */
  async listGlossaries(): Promise<GlossaryInfo[]> {
    return this.client.listGlossaries();
  }

  /**
   * Get glossary by ID
   */
  async getGlossary(glossaryId: string): Promise<GlossaryInfo> {
    return this.client.getGlossary(glossaryId);
  }

  /**
   * Get glossary by name
   */
  async getGlossaryByName(name: string): Promise<GlossaryInfo | null> {
    const glossaries = await this.listGlossaries();
    return glossaries.find(g => g.name === name) ?? null;
  }

  /**
   * Delete a glossary
   */
  async deleteGlossary(glossaryId: string): Promise<void> {
    return this.client.deleteGlossary(glossaryId);
  }

  /**
   * Get glossary entries as object
   */
  async getGlossaryEntries(glossaryId: string): Promise<Record<string, string>> {
    const tsv = await this.client.getGlossaryEntries(glossaryId);
    return this.tsvToEntries(tsv);
  }

  /**
   * Get supported glossary language pairs
   */
  async getGlossaryLanguages(): Promise<GlossaryLanguagePair[]> {
    return this.client.getGlossaryLanguages();
  }

  /**
   * Add a new entry to an existing glossary
   */
  async addEntry(
    glossaryId: string,
    sourceText: string,
    targetText: string
  ): Promise<GlossaryInfo> {
    // Validate inputs
    if (!sourceText || sourceText.trim() === '') {
      throw new Error('Source text cannot be empty');
    }
    if (!targetText || targetText.trim() === '') {
      throw new Error('Target text cannot be empty');
    }

    // Get glossary info to preserve name and language pair
    const glossary = await this.client.getGlossary(glossaryId);

    // Get existing entries
    const entries = await this.getGlossaryEntries(glossaryId);

    // Check if entry already exists
    if (entries[sourceText] !== undefined) {
      throw new Error(`Entry "${sourceText}" already exists in glossary`);
    }

    // Add new entry
    entries[sourceText] = targetText;

    // Convert to TSV
    const tsv = this.entriesToTSV(entries);

    // Delete old glossary
    await this.client.deleteGlossary(glossaryId);

    // Create new glossary with updated entries
    return this.client.createGlossary(
      glossary.name,
      glossary.source_lang,
      glossary.target_lang,
      tsv
    );
  }

  /**
   * Update an existing entry in a glossary
   */
  async updateEntry(
    glossaryId: string,
    sourceText: string,
    newTargetText: string
  ): Promise<GlossaryInfo> {
    // Validate inputs
    if (!sourceText || sourceText.trim() === '') {
      throw new Error('Source text cannot be empty');
    }
    if (!newTargetText || newTargetText.trim() === '') {
      throw new Error('Target text cannot be empty');
    }

    // Get glossary info to preserve name and language pair
    const glossary = await this.client.getGlossary(glossaryId);

    // Get existing entries
    const entries = await this.getGlossaryEntries(glossaryId);

    // Check if entry exists
    if (entries[sourceText] === undefined) {
      throw new Error(`Entry "${sourceText}" not found in glossary`);
    }

    // Update entry
    entries[sourceText] = newTargetText;

    // Convert to TSV
    const tsv = this.entriesToTSV(entries);

    // Delete old glossary
    await this.client.deleteGlossary(glossaryId);

    // Create new glossary with updated entries
    return this.client.createGlossary(
      glossary.name,
      glossary.source_lang,
      glossary.target_lang,
      tsv
    );
  }

  /**
   * Remove an entry from a glossary
   */
  async removeEntry(
    glossaryId: string,
    sourceText: string
  ): Promise<GlossaryInfo> {
    // Validate input
    if (!sourceText || sourceText.trim() === '') {
      throw new Error('Source text cannot be empty');
    }

    // Get glossary info to preserve name and language pair
    const glossary = await this.client.getGlossary(glossaryId);

    // Get existing entries
    const entries = await this.getGlossaryEntries(glossaryId);

    // Check if entry exists
    if (entries[sourceText] === undefined) {
      throw new Error(`Entry "${sourceText}" not found in glossary`);
    }

    // Check if this is the last entry
    if (Object.keys(entries).length === 1) {
      throw new Error('Cannot remove last entry from glossary. Delete the glossary instead.');
    }

    // Remove entry
    delete entries[sourceText];

    // Convert to TSV
    const tsv = this.entriesToTSV(entries);

    // Delete old glossary
    await this.client.deleteGlossary(glossaryId);

    // Create new glossary with updated entries
    return this.client.createGlossary(
      glossary.name,
      glossary.source_lang,
      glossary.target_lang,
      tsv
    );
  }

  /**
   * Convert entries object to TSV format
   */
  entriesToTSV(entries: Record<string, string>): string {
    return Object.entries(entries)
      .map(([source, target]) => `${source}\t${target}`)
      .join('\n');
  }

  /**
   * Convert TSV/CSV to entries object
   */
  tsvToEntries(tsv: string): Record<string, string> {
    const entries: Record<string, string> = {};

    const lines = tsv.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue; // Skip empty lines
      }

      // Try tab-separated first, then comma-separated
      let parts: string[];
      if (trimmed.includes('\t')) {
        parts = trimmed.split('\t');
      } else if (trimmed.includes(',')) {
        parts = trimmed.split(',');
      } else {
        continue; // Skip invalid lines
      }

      if (parts.length >= 2) {
        const source = parts[0]?.trim();
        const target = parts[1]?.trim();
        if (source && target) {
          entries[source] = target;
        }
      }
    }

    return entries;
  }
}
