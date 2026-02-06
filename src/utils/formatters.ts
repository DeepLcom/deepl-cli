/**
 * Output Formatters
 * Utilities for formatting command output (JSON, plain text, table, etc.)
 */

import Table from 'cli-table3';
import { TranslationResult } from '../api/deepl-client.js';
import { Language } from '../types/index.js';

export interface TranslateJsonOutput {
  text: string;
  targetLang: Language;
  detectedSourceLang?: Language;
  modelTypeUsed?: string;
  cached?: boolean;
}

export interface WriteJsonOutput {
  original: string;
  improved: string;
  changes: number;
  language: string;
}

export interface MultiTranslateJsonOutput {
  translations: Array<{
    targetLang: Language;
    text: string;
    detectedSourceLang?: Language;
    billedCharacters?: number;
    modelTypeUsed?: string;
  }>;
}

/**
 * Format translation result as JSON
 */
export function formatTranslationJson(
  result: TranslationResult,
  targetLang: Language,
  cached?: boolean
): string {
  const output: TranslateJsonOutput = {
    text: result.text,
    targetLang,
    detectedSourceLang: result.detectedSourceLang,
  };

  if (result.modelTypeUsed) {
    output.modelTypeUsed = result.modelTypeUsed;
  }

  if (cached !== undefined) {
    output.cached = cached;
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Format multiple translation results as JSON
 */
export function formatMultiTranslationJson(
  results: Array<{ targetLang: Language; text: string; detectedSourceLang?: Language; billedCharacters?: number; modelTypeUsed?: string }>
): string {
  const output: MultiTranslateJsonOutput = {
    translations: results.map(r => ({
      targetLang: r.targetLang,
      text: r.text,
      detectedSourceLang: r.detectedSourceLang,
      ...(r.billedCharacters !== undefined && { billedCharacters: r.billedCharacters }),
      ...(r.modelTypeUsed && { modelTypeUsed: r.modelTypeUsed }),
    })),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Format write/improve result as JSON
 */
export function formatWriteJson(
  original: string,
  improved: string,
  language: string
): string {
  const changes = original !== improved ? 1 : 0;

  const output: WriteJsonOutput = {
    original,
    improved,
    changes,
    language,
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Format multiple translation results as table
 */
export function formatMultiTranslationTable(
  results: Array<{
    targetLang: Language;
    text: string;
    detectedSourceLang?: Language;
    billedCharacters?: number;
  }>
): string {
  // Check if any result has billedCharacters - if so, show the Characters column
  const showCharacters = results.some(r => r.billedCharacters !== undefined);

  const table = new Table({
    head: showCharacters ? ['Language', 'Translation', 'Characters'] : ['Language', 'Translation'],
    colWidths: showCharacters ? [10, 60, 12] : [10, 70],
    wordWrap: true,
  });

  results.forEach((result) => {
    const row = [
      result.targetLang.toUpperCase(),
      result.text,
    ];

    if (showCharacters) {
      row.push(result.billedCharacters?.toLocaleString() ?? 'N/A');
    }

    table.push(row);
  });

  return table.toString();
}
