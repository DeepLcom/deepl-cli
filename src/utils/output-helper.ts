/**
 * Output Helper
 * Generic format-aware output for CLI commands.
 * Centralises the JSON-vs-text branching used across all commands.
 */

import type { OutputFormat } from '../types/index.js';

/**
 * Serialize data as pretty-printed JSON.
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Return either JSON or the pre-formatted text representation of `data`.
 *
 * @param data  - The structured object to serialise when format is 'json'.
 * @param text  - The human-readable string to return when format is 'text' (default).
 * @param format - 'json' | 'text' (defaults to 'text').
 */
export function formatOutput(data: unknown, text: string, format?: OutputFormat): string {
  if (format === 'json') {
    return formatJson(data);
  }
  return text;
}
