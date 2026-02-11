import * as fs from 'fs/promises';
import * as path from 'path';
import YAML from 'yaml';
import type { LocaleFormat, ParsedLocaleFile } from './types.js';

export function detectFormat(filePath: string): LocaleFormat {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.yaml':
    case '.yml':
      return 'yaml';
    case '.arb':
      return 'arb';
    case '.json':
    default:
      return 'json';
  }
}

function detectIndent(raw: string): number {
  const lines = raw.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\s+)\S/);
    if (match?.[1]) {
      return match[1].length;
    }
  }
  return 2;
}

function hasTrailingNewline(raw: string): boolean {
  return raw.endsWith('\n');
}

export async function parseLocaleFile(filePath: string): Promise<ParsedLocaleFile> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const format = detectFormat(filePath);
  const indent = detectIndent(raw);
  const trailingNewline = hasTrailingNewline(raw);

  let data: Record<string, unknown>;

  switch (format) {
    case 'yaml': {
      const parsed = YAML.parse(raw);
      if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Invalid YAML locale file: ${filePath} — expected object at root`);
      }
      data = parsed as Record<string, unknown>;
      break;
    }
    case 'arb':
    case 'json': {
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Invalid ${format.toUpperCase()} locale file: ${filePath} — expected object at root`);
      }
      data = parsed as Record<string, unknown>;
      break;
    }
  }

  return { data, format, indent, trailingNewline, filePath };
}

export function serializeLocaleFile(parsed: ParsedLocaleFile): string {
  let output: string;

  switch (parsed.format) {
    case 'yaml': {
      output = YAML.stringify(parsed.data, { indent: parsed.indent });
      break;
    }
    case 'arb':
    case 'json': {
      output = JSON.stringify(parsed.data, null, parsed.indent);
      break;
    }
  }

  if (parsed.trailingNewline && !output.endsWith('\n')) {
    output += '\n';
  } else if (!parsed.trailingNewline && output.endsWith('\n')) {
    output = output.slice(0, -1);
  }

  return output;
}
