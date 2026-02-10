/**
 * Output Formatters
 * Utilities for formatting command output (JSON, plain text, table, etc.)
 */

import Table from 'cli-table3';
import { TranslationResult } from '../api/deepl-client.js';
import { Language } from '../types/index.js';
import type { VoiceSessionResult } from '../types/voice.js';

/**
 * Determine whether color output should be enabled.
 * Priority order: NO_COLOR > FORCE_COLOR > TERM=dumb > auto-detect (default on)
 */
export function isColorEnabled(): boolean {
  if ('NO_COLOR' in process.env) {
    return false;
  }

  const forceColor = process.env['FORCE_COLOR'];
  if (forceColor !== undefined && forceColor !== '') {
    const lower = forceColor.toLowerCase();
    if (lower === '0' || lower === 'false') {
      return false;
    }
    return true;
  }

  if (process.env['TERM'] === 'dumb') {
    return false;
  }

  return true;
}

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
  const colorDisabled = !isColorEnabled();

  const table = new Table({
    head: showCharacters ? ['Language', 'Translation', 'Characters'] : ['Language', 'Translation'],
    colWidths: showCharacters ? [10, 60, 12] : [10, 70],
    wordWrap: true,
    ...(colorDisabled && { style: { head: [], border: [] } }),
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

export interface VoiceJsonOutput {
  sessionId: string;
  source: {
    lang: string;
    text: string;
    segments: Array<{ text: string; startTime: number; endTime: number }>;
  };
  targets: Array<{
    lang: string;
    text: string;
    segments: Array<{ text: string; startTime: number; endTime: number }>;
  }>;
}

/**
 * Format voice translation result as JSON
 */
export function formatVoiceJson(result: VoiceSessionResult): string {
  const output: VoiceJsonOutput = {
    sessionId: result.sessionId,
    source: {
      lang: result.source.lang,
      text: result.source.text,
      segments: result.source.segments.map((s) => ({
        text: s.text,
        startTime: s.start_time,
        endTime: s.end_time,
      })),
    },
    targets: result.targets.map((t) => ({
      lang: t.lang,
      text: t.text,
      segments: t.segments.map((s) => ({
        text: s.text,
        startTime: s.start_time,
        endTime: s.end_time,
      })),
    })),
  };

  return JSON.stringify(output, null, 2);
}
