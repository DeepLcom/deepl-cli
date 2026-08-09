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
  reconstruct(
    content: string,
    entries: TranslatedEntry[],
    locale?: string
  ): string;
  /** Optional: extract context for a specific key from file content */
  extractContext?(content: string, key: string): string | undefined;
  /**
   * Optional: the translations a *target* file already holds, keyed the way
   * `extract` keys them. Bilingual formats — one file carrying both sides, as
   * PO does with `msgid`/`msgstr` and XLIFF with `<source>`/`<target>` — must
   * implement it, because their `extract().value` is the SOURCE text even when
   * reading a target file. A key the file has no translation for yet is left
   * out of the map rather than mapped to the empty string, which is how a caller
   * separates an untranslated key from a deliberately empty translation. An
   * implementation must also leave out any key it tags `metadata.skipped`, since
   * the map bypasses the walker's skip partition.
   *
   * Monolingual formats leave it undefined: for them `extract().value` on a
   * target read already is the translation.
   */
  extractTranslations?(content: string, locale?: string): Map<string, string>;
  /**
   * Optional: keys whose translation is present but marked as needing review, so
   * the format's own toolchain will not ship it.
   *
   * Gettext is the case this exists for: `msgfmt` leaves a `#, fuzzy` entry out
   * of the compiled catalog, so a translation this CLI counted as done is one the
   * application does not display. The value is still a translation and is
   * deliberately still returned by `extractTranslations` — a run must carry it
   * forward rather than overwrite a reviewer's draft — so the two answers travel
   * separately.
   *
   * A format with no such concept leaves it undefined.
   */
  extractNeedsReview?(content: string, locale?: string): Set<string>;
  /**
   * Optional: a copy of this parser bounded to `maxDepth` levels of nesting.
   * Parsers that walk their tree recursively implement it so `sync` can apply
   * `sync.limits.max_depth`; the walker skips the field for parsers without it.
   */
  withMaxDepth?(maxDepth: number): FormatParser;
}

/**
 * Thrown when a parser refuses a file for exceeding its nesting cap. Walkers
 * catch this to skip the one file with a warning, rather than propagating a
 * ValidationError (a hard reject) or letting a recursive walk exhaust the stack
 * and take the whole run down with a bare RangeError.
 */
export class FormatDepthExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatDepthExceededError';
  }
}

/**
 * Thrown when a parser cannot give a file's strings distinct keys: a key
 * component contains the byte the format uses to encode hierarchy, so two
 * unrelated strings resolve to one key and reconstruct writes one translation
 * into the other's slot. Walkers treat it like a depth rejection and skip the
 * one file, since rewriting it is what does the damage.
 */
export class FormatKeyCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatKeyCollisionError';
  }
}

/**
 * Refuse extract output in which two entries share a key. Only for formats
 * whose container already guarantees distinct sibling keys, where a repeat
 * therefore proves a separator collision rather than a duplicate the format
 * permits — `.properties` and XLIFF allow literal repeats and must not use it.
 */
export function assertDistinctKeys(
  entries: readonly ExtractedEntry[],
  format: string,
  separator: string
): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      throw new FormatKeyCollisionError(
        `${format}: '${describeKeyPath(entry.key)}' is the key of two different strings. ` +
          `A literal '${separator}' inside a key is indistinguishable from the separator ` +
          `between levels, so one translation would be written over the other. ` +
          `Rename one of them.`
      );
    }
    seen.add(entry.key);
  }
}

/**
 * Renders a key path for a depth-limit message. At the depth these fire, the
 * full path is dozens of segments of no diagnostic value beyond the first few,
 * so it is clipped rather than printed in full.
 */
export function describeKeyPath(keyPath: string): string {
  if (!keyPath) return '<root>';
  return keyPath.length > 60 ? `${keyPath.slice(0, 60)}…` : keyPath;
}
