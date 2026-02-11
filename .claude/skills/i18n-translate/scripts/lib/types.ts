export type KeyPath = (string | number)[];

export type LocaleFormat = 'json' | 'yaml' | 'arb';

export interface StringEntry {
  path: KeyPath;
  dotPath: string;
  value: string;
}

export interface ParsedLocaleFile {
  data: Record<string, unknown>;
  format: LocaleFormat;
  indent: number;
  trailingNewline: boolean;
  filePath: string;
}

export interface DiffResult {
  missing: KeyPath[];
  extra: KeyPath[];
  empty: KeyPath[];
}

export interface ValidationIssue {
  check: string;
  severity: 'error' | 'warning';
  message: string;
  path?: KeyPath;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface DetectedFramework {
  name: string;
  interpolation: string[];
  configFile?: string;
  localeDir?: string;
  source: 'config' | 'detection';
}

export interface MergeResult {
  merged: Record<string, unknown>;
  added: KeyPath[];
  updated: KeyPath[];
  unchanged: KeyPath[];
}

export interface PlaceholderMap {
  placeholder: string;
  original: string;
}

export interface I18nProjectConfig {
  sourceLocale: string;
  targetLocales: string[];
  framework?: string;
  formality?: string;
  glossary?: string;
  localePaths?: string[];
  excludePaths?: string[];
  monorepo?: { packages: string[] };
}
