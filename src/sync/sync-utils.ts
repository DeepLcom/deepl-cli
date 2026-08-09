import * as path from 'path';
import type {
  ExtractedEntry,
  FormatRegistry,
  FormatParser,
  TranslatedEntry,
} from '../formats/index.js';
import { ValidationError } from '../utils/errors.js';
import { sanitizeForTerminal } from '../utils/control-chars.js';
import { isWithinDirectory, realpathOrAncestor } from '../utils/paths.js';
import { FORBIDDEN_TARGET_SEGMENTS } from './sync-config.js';

export function getParserForBucket(
  formatRegistry: FormatRegistry,
  formatKey: string
): FormatParser | undefined {
  return formatRegistry.getParserByFormatKey(formatKey);
}

/**
 * The metadata payloads a parser rebuilds an entry's plural content from:
 * gettext's `plural_forms` (`msgstr[N]`) and Android XML's `plurals` items.
 */
const PLURAL_FORM_METADATA_KEYS = ['plural_forms', 'plurals'] as const;

/**
 * The metadata that makes an entry a plural entry at all, whether or not it
 * currently carries the forms.
 *
 * A gettext entry declares `msgid_plural` even when it has no `msgstr[N]` lines
 * yet — a freshly extracted catalog is exactly that shape, since `plural_forms`
 * only appears once forms exist. Judging plurality from the payload alone let
 * `deepl sync pull` treat such an entry as ordinary: one exported string cannot
 * fill a plural entry's forms, so the pull recorded a translation it had not
 * applied.
 *
 * Kept separate from `PLURAL_FORM_METADATA_KEYS`, which lists the payloads to
 * STRIP. Stripping `msgid_plural` would tell `reconstruct` the entry is not
 * plural at all, and that is how both the carry-forward and the new-entry append
 * know to emit `msgid_plural` and one `msgstr[N]` per form.
 */
const PLURAL_ENTRY_METADATA_KEYS = [
  ...PLURAL_FORM_METADATA_KEYS,
  'msgid_plural',
] as const;

/** True when the entry is a plural entry in its format's terms. */
export function isPluralEntry(
  metadata: Record<string, unknown> | undefined
): boolean {
  return (
    metadata !== undefined &&
    PLURAL_ENTRY_METADATA_KEYS.some((key) => key in metadata)
  );
}

/**
 * True when `reconstruct` would rebuild this entry's plural forms from its
 * metadata rather than keep the ones the target file holds.
 */
export function hasPluralForms(
  metadata: Record<string, unknown> | undefined
): boolean {
  return (
    metadata !== undefined &&
    PLURAL_FORM_METADATA_KEYS.some((key) => key in metadata)
  );
}

/**
 * An entry's metadata with the plural-form payloads left out.
 *
 * In a source entry's metadata those payloads hold the source file's own
 * forms — empty `msgstr[N]` for gettext, source-language items for Android —
 * so handing them to `reconstruct` for an entry whose plural forms this run
 * did not translate replaces the target's translated forms with them. Without
 * the payloads the parsers keep the target file's own plural lines.
 */
export function withoutPluralForms(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!hasPluralForms(metadata)) return metadata;
  const rest = { ...metadata };
  for (const key of PLURAL_FORM_METADATA_KEYS) {
    delete rest[key];
  }
  return rest;
}

/**
 * Merge a TMS pull response over whatever the target file already holds: the
 * pulled value wins, an existing target value is kept when the response omits
 * the key, and a key neither side has is omitted from the result.
 *
 * Omitting matters because `reconstruct` writes exactly the entries it is
 * handed. Handing it `entry.value` for a key with no translation anywhere
 * would put source-language text in the target file and let the lockfile call
 * it translated, which no later run revisits — the same reason the locale
 * translator pushes nothing for a key it could not translate. An empty string
 * is a translation and is preserved.
 */
export function mergePulledTranslations(
  sourceEntries: ExtractedEntry[],
  pulledKeys: Record<string, string>,
  existingTargetEntries: Map<string, string> = new Map()
): TranslatedEntry[] {
  const merged: TranslatedEntry[] = [];
  for (const entry of sourceEntries) {
    // Own-key only: a source key named after a prototype member (`toString`,
    // `constructor`) must not resolve to an inherited function when the pull
    // response is a plain object that does not own it. `Object.hasOwn` is safe
    // on a null-prototype response too.
    const translation = Object.hasOwn(pulledKeys, entry.key)
      ? pulledKeys[entry.key]
      : existingTargetEntries.get(entry.key);
    if (translation === undefined) continue;
    merged.push({
      key: entry.key,
      value: entry.value,
      context: entry.context,
      // A pull never carries per-form plural translations — the export is one
      // string per key — so the target file's own forms must survive the write.
      metadata: withoutPluralForms(entry.metadata),
      translation,
    });
  }
  return merged;
}

/**
 * Replace the source locale segment in a file path with the target locale.
 *
 * When targetPathPattern is provided (e.g. for Android XML or XLIFF where the
 * source locale is absent from the source path), the pattern is used as a
 * template: {locale} → targetLocale, {basename} → basename of sourcePath.
 *
 * Otherwise falls back to word-boundary-aware regex substitution.
 */
export function resolveTargetPath(
  sourcePath: string,
  sourceLocale: string,
  targetLocale: string,
  targetPathPattern?: string
): string {
  if (targetPathPattern) {
    return assertNotDashLeading(
      targetPathPattern
        .replace(/\{locale\}/g, targetLocale)
        .replace(/\{basename\}/g, path.basename(sourcePath))
    );
  }

  const escaped = sourceLocale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const result = sourcePath.replace(
    new RegExp(`(^|[/_.])${escaped}([/_.])`, 'g'),
    (_match: string, p1: string, p2: string) => p1 + targetLocale + p2
  );

  if (result === sourcePath) {
    const result2 = sourcePath.replace(
      new RegExp(`${escaped}(\\.[^./]+)$`),
      (_match: string, p1: string) => targetLocale + p1
    );
    if (result2 !== sourcePath) return assertNotDashLeading(result2);
  }

  if (result === sourcePath) {
    throw new ValidationError(
      `Cannot resolve target path: locale "${sanitizeForTerminal(sourceLocale)}" not found in path "${sanitizeForTerminal(sourcePath)}". ` +
        `Ensure the source file path contains the source locale code.`
    );
  }

  return assertNotDashLeading(result);
}

/**
 * Reject a repo-relative target path whose first segment begins with `-`.
 *
 * Such a path is a single argv entry by the time it reaches `git add` or
 * `git commit`, where a leading dash is parsed as an option rather than a
 * pathspec. Only the first segment matters: a dash further along the path is
 * never option-like, and `res/values-de/strings.xml` is the canonical Android
 * target. The three sources of a dash-leading first segment are a literal
 * `target_path_pattern` (also rejected at config load), a `{basename}` taken
 * from a dash-leading source filename, and the default locale-substitution
 * branch running over a dash-leading source directory.
 */
function assertNotDashLeading(targetPath: string): string {
  if (targetPath.startsWith('-')) {
    throw new ValidationError(
      `Refusing to use target path "${sanitizeForTerminal(targetPath)}": its first path segment begins with "-", which command-line tools parse as an option.`,
      'Rename the source file or adjust target_path_pattern so the target path does not begin with "-".'
    );
  }
  return targetPath;
}

/**
 * Verify that an absolute path is one the sync pipeline may read or write:
 * inside the project root, and outside the repository's own control
 * directories (`FORBIDDEN_TARGET_SEGMENTS`). Throws ValidationError otherwise.
 *
 * Both sides are resolved through `realpathOrAncestor` so symlinks are
 * followed before the containment check. Without that, a project rooted
 * under a symlinked directory (the common macOS case where `/tmp` is a
 * symlink to `/private/tmp`) would reject paths the user typed in their
 * unresolved form. Symlink-based escapes (a symlink inside the project
 * pointing outside) are now also caught.
 *
 * The forbidden-segment check belongs on the resolved path rather than on
 * `target_path_pattern` alone: the default locale-substitution branch of
 * `resolveTargetPath` has no pattern to inspect, and the multi-locale branch
 * writes back to the source path without calling it at all. Every read and
 * write in the pipeline passes through here, so this is the one place that
 * cannot be bypassed by a caller that forgets. Segments are compared relative
 * to the root, so a checkout that happens to live under a `.github`
 * directory is unaffected.
 */
export function assertPathWithinRoot(
  absPath: string,
  projectRoot: string
): void {
  const resolvedRoot = realpathOrAncestor(projectRoot);
  const resolvedPath = realpathOrAncestor(absPath);
  if (!isWithinDirectory(resolvedRoot, resolvedPath)) {
    throw new ValidationError(
      `Target path escapes project root: ${sanitizeForTerminal(absPath)}`
    );
  }

  const forbidden = path
    .relative(resolvedRoot, resolvedPath)
    .split(/[/\\]/)
    .find((segment) => FORBIDDEN_TARGET_SEGMENTS.has(segment.toLowerCase()));
  if (forbidden) {
    throw new ValidationError(
      `Sync path resolves into "${forbidden}/", which sync must never read or write: ${sanitizeForTerminal(absPath)}`,
      `Point buckets at a locale directory outside ${forbidden}/ in .deepl-sync.yaml.`
    );
  }
}
