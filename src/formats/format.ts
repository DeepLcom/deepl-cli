export interface ExtractedEntry {
  /** Dot-path key (e.g., "nav.home.title" for nested, "greeting" for flat) */
  key: string;
  /** The source string value */
  value: string;
  /** Optional context from surrounding code or format metadata */
  context?: string;
  /** Format-specific metadata (plural forms, description fields, etc.) */
  metadata?: Record<string, unknown>;
}

export interface TranslatedEntry extends ExtractedEntry {
  /** The translated string */
  translation: string;
}

export interface FormatParser {
  /** Human-readable format name (e.g., "JSON i18n", "YAML") */
  readonly name: string;
  /** Canonical config/CLI format key (e.g., "json", "android_xml", "ios_strings"). Single source of truth for --file-format choices and .deepl-sync.yaml bucket keys. */
  readonly configKey: string;
  /** File extensions this parser handles (e.g., [".json"], [".yaml", ".yml"]) */
  readonly extensions: string[];
  /** True if the format stores all locales in a single file (e.g., .xcstrings) */
  readonly multiLocale?: boolean;
  /** Extract translatable entries from file content. For multi-locale formats, locale scopes extraction. */
  extract(content: string, locale?: string): ExtractedEntry[];
  /** Reconstruct file content with translated entries applied. For multi-locale formats, locale scopes the update. */
  reconstruct(content: string, entries: TranslatedEntry[], locale?: string): string;
  /** Optional: extract context for a specific key from file content */
  extractContext?(content: string, key: string): string | undefined;
}
