import { randomBytes } from 'crypto';
import type { PlaceholderMap } from './types.js';

type FrameworkName = 'i18next' | 'angular' | 'rails' | 'vue-i18n' | 'react-intl' | 'next-intl' | 'flutter' | 'generic';

function generatePlaceholder(): string {
  return `__INTL_${randomBytes(4).toString('hex')}__`;
}

const FRAMEWORK_PATTERNS: Record<FrameworkName, RegExp[]> = {
  'i18next': [
    /\$t\([^)]+\)/g,
    /\{\{[a-zA-Z0-9_]+\}\}/g,
  ],
  'angular': [
    /\{\$[A-Z_]+\}/g,
    /\{\{[a-zA-Z0-9_]+\}\}/g,
  ],
  'rails': [
    /%<[a-zA-Z0-9_]+>[a-z]/g,
    /%\{[a-zA-Z0-9_]+\}/g,
  ],
  'vue-i18n': [
    /\{[a-zA-Z0-9_]+\s*\|\s*[a-zA-Z0-9_]+\}/g,
    /@:[a-zA-Z0-9_.]+/g,
  ],
  'react-intl': [
    /\{[a-zA-Z0-9_]+,\s*(?:plural|select|selectordinal),\s*[^}]*(?:\{[^}]*\}[^}]*)*\}/g,
  ],
  'next-intl': [
    /\{[a-zA-Z0-9_]+,\s*(?:plural|select|selectordinal),\s*[^}]*(?:\{[^}]*\}[^}]*)*\}/g,
  ],
  'flutter': [
    /\{[a-zA-Z0-9_]+,\s*(?:plural|select|selectordinal),\s*[^}]*(?:\{[^}]*\}[^}]*)*\}/g,
  ],
  'generic': [],
};

export function getFrameworkPatterns(framework: FrameworkName): RegExp[] {
  return FRAMEWORK_PATTERNS[framework] ?? [];
}

export function preprocessString(text: string, framework: FrameworkName): { processed: string; map: PlaceholderMap[] } {
  const patterns = getFrameworkPatterns(framework);
  const map: PlaceholderMap[] = [];
  let processed = text;

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    processed = processed.replace(regex, (match) => {
      const placeholder = generatePlaceholder();
      map.push({ placeholder, original: match });
      return placeholder;
    });
  }

  return { processed, map };
}

export function restoreString(text: string, map: PlaceholderMap[]): string {
  let restored = text;
  for (const { placeholder, original } of map) {
    restored = restored.replace(placeholder, original);
  }
  return restored;
}

export function validateRestoration(original: string, restored: string, framework: FrameworkName): string[] {
  const patterns = getFrameworkPatterns(framework);
  const issues: string[] = [];

  const extractVars = (str: string): string[] => {
    const vars: string[] = [];
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(str)) !== null) {
        vars.push(match[0]);
      }
    }
    return vars.sort();
  };

  const originalVars = extractVars(original);
  const restoredVars = extractVars(restored);

  const originalSet = new Set(originalVars);
  const restoredSet = new Set(restoredVars);

  for (const v of originalSet) {
    if (!restoredSet.has(v)) {
      issues.push(`Missing variable: ${v}`);
    }
  }

  for (const v of restoredSet) {
    if (!originalSet.has(v)) {
      issues.push(`Extra variable: ${v}`);
    }
  }

  return issues;
}
