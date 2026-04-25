import * as path from 'path';
import * as fs from 'fs';
import type { ExtractedEntry, FormatRegistry, FormatParser, TranslatedEntry } from '../formats/index.js';
import { ValidationError } from '../utils/errors.js';
import { sanitizeForTerminal } from '../utils/control-chars.js';

export function getParserForBucket(
  formatRegistry: FormatRegistry,
  formatKey: string,
): FormatParser | undefined {
  return formatRegistry.getParserByFormatKey(formatKey);
}

export function mergePulledTranslations(
  sourceEntries: ExtractedEntry[],
  pulledKeys: Record<string, string>,
  existingTargetEntries: Map<string, string> = new Map(),
): TranslatedEntry[] {
  return sourceEntries.map((entry) => ({
    key: entry.key,
    value: entry.value,
    context: entry.context,
    metadata: entry.metadata,
    translation: pulledKeys[entry.key] ?? existingTargetEntries.get(entry.key) ?? entry.value,
  }));
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
  targetPathPattern?: string,
): string {
  if (targetPathPattern) {
    return targetPathPattern
      .replace(/\{locale\}/g, targetLocale)
      .replace(/\{basename\}/g, path.basename(sourcePath));
  }

  const escaped = sourceLocale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const result = sourcePath.replace(
    new RegExp(`(^|[/_.])${escaped}([/_.])`, 'g'),
    (_match: string, p1: string, p2: string) => p1 + targetLocale + p2,
  );

  if (result === sourcePath) {
    const result2 = sourcePath.replace(
      new RegExp(`${escaped}(\\.[^./]+)$`),
      (_match: string, p1: string) => targetLocale + p1,
    );
    if (result2 !== sourcePath) return result2;
  }

  if (result === sourcePath) {
    throw new ValidationError(
      `Cannot resolve target path: locale "${sanitizeForTerminal(sourceLocale)}" not found in path "${sanitizeForTerminal(sourcePath)}". ` +
      `Ensure the source file path contains the source locale code.`,
    );
  }

  return result;
}

/**
 * Resolve `absPath` to its symlink-followed real path.
 *
 * `path.resolve` performs lexical normalization only — it does not follow
 * symlinks — so two paths that point at the same inode via different
 * symlink chains (e.g. `/tmp` vs `/private/tmp` on macOS) compare as
 * different strings. `fs.realpathSync` follows symlinks, but only works
 * for paths that already exist on disk; output paths typically don't.
 *
 * This helper handles the output-path case by walking up to the closest
 * existing ancestor, realpath'ing that, and re-appending the unresolved
 * tail. If no ancestor exists (rare — implies a path on a missing volume)
 * it falls back to the lexically-resolved path.
 */
function realpathOrAncestor(absPath: string): string {
  let current = path.resolve(absPath);
  const tail: string[] = [];
  while (true) {
    try {
      const real = fs.realpathSync(current);
      return tail.length > 0 ? path.join(real, ...tail) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(absPath);
      }
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Verify that an absolute path stays within the project root.
 * Throws ValidationError if path escapes.
 *
 * Both sides are resolved through `realpathOrAncestor` so symlinks are
 * followed before the containment check. Without that, a project rooted
 * under a symlinked directory (the common macOS case where `/tmp` is a
 * symlink to `/private/tmp`) would reject paths the user typed in their
 * unresolved form. Symlink-based escapes (a symlink inside the project
 * pointing outside) are now also caught.
 */
export function assertPathWithinRoot(absPath: string, projectRoot: string): void {
  const resolvedRoot = realpathOrAncestor(projectRoot);
  const resolvedPath = realpathOrAncestor(absPath);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    throw new ValidationError(`Target path escapes project root: ${sanitizeForTerminal(absPath)}`);
  }
}
