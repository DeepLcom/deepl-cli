/**
 * Glossary Service
 * Manages DeepL glossaries
 */

import { DeepLClient } from '../api/deepl-client.js';
import { GlossaryInfo, GlossaryLanguagePair, Language } from '../types/index.js';
import { isMultilingual } from '../types/glossary.js';
import { Logger } from '../utils/logger.js';

export class GlossaryService {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  /**
   * Create a glossary from entries object (v3 API - supports multiple target languages)
   */
  async createGlossary(
    name: string,
    sourceLang: Language,
    targetLangs: Language[],
    entries: Record<string, string>
  ): Promise<GlossaryInfo> {
    // Validate inputs
    if (!name || name.trim() === '') {
      throw new Error('Glossary name is required');
    }

    if (targetLangs.length === 0) {
      throw new Error('At least one target language is required');
    }

    if (Object.keys(entries).length === 0) {
      throw new Error('Glossary entries cannot be empty');
    }

    // Convert entries to TSV format
    const tsv = this.entriesToTSV(entries);

    // Create glossary via API
    return this.client.createGlossary(name, sourceLang, targetLangs, tsv);
  }

  /**
   * Create a glossary from TSV/CSV string (v3 API - supports multiple target languages)
   */
  async createGlossaryFromTSV(
    name: string,
    sourceLang: Language,
    targetLangs: Language[],
    tsv: string
  ): Promise<GlossaryInfo> {
    if (!name || name.trim() === '') {
      throw new Error('Glossary name is required');
    }

    if (targetLangs.length === 0) {
      throw new Error('At least one target language is required');
    }

    if (!tsv || tsv.trim() === '') {
      throw new Error('Glossary entries cannot be empty');
    }

    return this.client.createGlossary(name, sourceLang, targetLangs, tsv);
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
   * Get glossary entries as object (v3 API - requires language pair)
   */
  async getGlossaryEntries(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<Record<string, string>> {
    const tsv = await this.client.getGlossaryEntries(glossaryId, sourceLang, targetLang);
    return this.tsvToEntries(tsv);
  }

  /**
   * Get supported glossary language pairs
   */
  async getGlossaryLanguages(): Promise<GlossaryLanguagePair[]> {
    return this.client.getGlossaryLanguages();
  }

  /**
   * Add a new entry to an existing glossary (v3 API - uses PATCH)
   */
  async addEntry(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    sourceText: string,
    targetText: string
  ): Promise<void> {
    // Validate inputs
    if (!sourceText || sourceText.trim() === '') {
      throw new Error('Source text cannot be empty');
    }
    if (!targetText || targetText.trim() === '') {
      throw new Error('Target text cannot be empty');
    }

    // Get existing entries
    const entries = await this.getGlossaryEntries(glossaryId, sourceLang, targetLang);

    // Check if entry already exists
    if (entries[sourceText] !== undefined) {
      throw new Error(`Entry "${sourceText}" already exists in glossary`);
    }

    // Add new entry
    entries[sourceText] = targetText;

    // Convert to TSV
    const tsv = this.entriesToTSV(entries);

    // Update glossary using v3 PATCH endpoint
    await this.client.updateGlossaryEntries(glossaryId, sourceLang, targetLang, tsv);
  }

  /**
   * Update an existing entry in a glossary (v3 API - uses PATCH)
   */
  async updateEntry(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    sourceText: string,
    newTargetText: string
  ): Promise<void> {
    // Validate inputs
    if (!sourceText || sourceText.trim() === '') {
      throw new Error('Source text cannot be empty');
    }
    if (!newTargetText || newTargetText.trim() === '') {
      throw new Error('Target text cannot be empty');
    }

    // Get existing entries
    const entries = await this.getGlossaryEntries(glossaryId, sourceLang, targetLang);

    // Check if entry exists
    if (entries[sourceText] === undefined) {
      throw new Error(`Entry "${sourceText}" not found in glossary`);
    }

    // Update entry
    entries[sourceText] = newTargetText;

    // Convert to TSV
    const tsv = this.entriesToTSV(entries);

    // Update glossary using v3 PATCH endpoint
    await this.client.updateGlossaryEntries(glossaryId, sourceLang, targetLang, tsv);
  }

  /**
   * Remove an entry from a glossary (v3 API - uses PATCH)
   */
  async removeEntry(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language,
    sourceText: string
  ): Promise<void> {
    // Validate input
    if (!sourceText || sourceText.trim() === '') {
      throw new Error('Source text cannot be empty');
    }

    // Get existing entries
    const entries = await this.getGlossaryEntries(glossaryId, sourceLang, targetLang);

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

    // Update glossary using v3 PATCH endpoint
    await this.client.updateGlossaryEntries(glossaryId, sourceLang, targetLang, tsv);
  }

  /**
   * Rename a glossary (v3 API - uses PATCH endpoint)
   */
  async renameGlossary(
    glossaryId: string,
    newName: string
  ): Promise<void> {
    // Validate input
    if (!newName || newName.trim() === '') {
      throw new Error('New glossary name cannot be empty');
    }

    // Get glossary info to check current name
    const glossary = await this.client.getGlossary(glossaryId);

    // Check if new name is different from current name
    if (glossary.name === newName) {
      throw new Error('New name must be different from current name');
    }

    // Rename using v3 PATCH endpoint
    await this.client.renameGlossary(glossaryId, newName);
  }

  /**
   * Delete a dictionary from a multilingual glossary (v3 API)
   * Removes a specific language pair from the glossary
   */
  async deleteGlossaryDictionary(
    glossaryId: string,
    sourceLang: Language,
    targetLang: Language
  ): Promise<void> {
    // Get glossary info to validate it's multilingual
    const glossary = await this.client.getGlossary(glossaryId);

    // Check if glossary has multiple dictionaries
    if (!isMultilingual(glossary)) {
      throw new Error('Cannot delete dictionary from single-language glossary. Delete the entire glossary instead.');
    }

    // Check if this would be the last dictionary
    if (glossary.dictionaries.length === 1) {
      throw new Error('Cannot delete last dictionary from glossary. Delete the entire glossary instead.');
    }

    // Validate the dictionary exists
    const dictionaryExists = glossary.dictionaries.some(
      dict => dict.source_lang.toUpperCase() === sourceLang.toUpperCase() &&
              dict.target_lang.toUpperCase() === targetLang.toUpperCase()
    );

    if (!dictionaryExists) {
      throw new Error(`Dictionary ${sourceLang}-${targetLang} not found in glossary`);
    }

    // Delete the dictionary using v3 DELETE endpoint
    await this.client.deleteGlossaryDictionary(glossaryId, sourceLang, targetLang);
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
   * Handles UTF-8 BOM, warns about extra columns, validates format
   */
  tsvToEntries(tsv: string): Record<string, string> {
    const entries: Record<string, string> = {};

    // Remove UTF-8 BOM if present (0xFEFF)
    let content = tsv;
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    const lines = content.split('\n');
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        continue;
      }

      // Try tab-separated first (TSV is preferred), then comma-separated (CSV)
      let parts: string[];

      if (trimmed.includes('\t')) {
        parts = trimmed.split('\t');
      } else if (trimmed.includes(',')) {
        // Use proper CSV parsing for comma-separated values (handles quoted fields)
        parts = this.parseCsvLine(trimmed);
      } else {
        // Line has no separator - skip it
        Logger.warn(`Line ${lineNumber}: No tab or comma separator found, skipping`);
        continue;
      }

      // Validate we have at least 2 columns
      if (parts.length < 2) {
        Logger.warn(`Line ${lineNumber}: Expected 2 columns, found ${parts.length}, skipping`);
        continue;
      }

      // Warn if more than 2 columns (extra data will be ignored)
      if (parts.length > 2) {
        Logger.warn(`Line ${lineNumber}: Found ${parts.length} columns, expected 2. Using first 2 columns.`);
      }

      const source = parts[0]?.trim();
      const target = parts[1]?.trim();

      // Validate both source and target are non-empty
      if (!source || !target) {
        Logger.warn(`Line ${lineNumber}: Empty source or target, skipping`);
        continue;
      }

      // Add to entries (duplicates will overwrite earlier entries)
      if (entries[source] !== undefined) {
        Logger.warn(`Line ${lineNumber}: Duplicate source "${source}", overwriting previous entry`);
      }

      entries[source] = target;
    }

    return entries;
  }

  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote (two consecutive quotes = one quote character)
          currentField += '"';
          i += 2;
        } else {
          // Toggle quote state (entering or leaving quoted field)
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator (only when not inside quotes)
        fields.push(currentField);
        currentField = '';
        i++;
      } else {
        // Regular character
        currentField += char;
        i++;
      }
    }

    // Add the last field
    fields.push(currentField);

    return fields;
  }
}
