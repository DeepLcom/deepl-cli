import * as path from 'path';
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
 * Verify that an absolute path stays within the project root.
 * Throws ValidationError if path escapes.
 */
export function assertPathWithinRoot(absPath: string, projectRoot: string): void {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(absPath);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    throw new ValidationError(`Target path escapes project root: ${sanitizeForTerminal(absPath)}`);
  }
}
