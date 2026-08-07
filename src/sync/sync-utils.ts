import * as path from 'path';
import * as fs from 'fs';
import type {
  ExtractedEntry,
  FormatRegistry,
  FormatParser,
  TranslatedEntry,
} from '../formats/index.js';
import { ValidationError } from '../utils/errors.js';
import { sanitizeForTerminal } from '../utils/control-chars.js';
import { FORBIDDEN_TARGET_SEGMENTS } from './sync-config.js';

export function getParserForBucket(
  formatRegistry: FormatRegistry,
  formatKey: string
): FormatParser | undefined {
  return formatRegistry.getParserByFormatKey(formatKey);
}

export function mergePulledTranslations(
  sourceEntries: ExtractedEntry[],
  pulledKeys: Record<string, string>,
  existingTargetEntries: Map<string, string> = new Map()
): TranslatedEntry[] {
  return sourceEntries.map((entry) => ({
    key: entry.key,
    value: entry.value,
    context: entry.context,
    metadata: entry.metadata,
    translation:
      pulledKeys[entry.key] ??
      existingTargetEntries.get(entry.key) ??
      entry.value,
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
  if (
    !resolvedPath.startsWith(resolvedRoot + path.sep) &&
    resolvedPath !== resolvedRoot
  ) {
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
