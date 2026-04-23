import { ConfigError } from './errors.js';
import { sanitizeForTerminal } from './control-chars.js';

const META_CHARS = new Set(['*', '?', '[', ']', '{', '}', '(', ')', '!', '+', '@']);

interface SegmentScan {
  isDynamic: boolean;
  containsTraversal: boolean;
}

function scanSegment(segment: string): SegmentScan {
  let isDynamic = false;
  let depth = 0;
  let altStart = -1;
  let containsTraversal = false;

  const alternatives: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i]!;

    if (ch === '\\' && i + 1 < segment.length) {
      i += 1;
      continue;
    }

    if (ch === ',' && depth > 0) {
      if (altStart !== -1) {
        alternatives.push({ start: altStart, end: i });
      }
      altStart = i + 1;
      continue;
    }

    if (ch === '|' && depth > 0) {
      if (altStart !== -1) {
        alternatives.push({ start: altStart, end: i });
      }
      altStart = i + 1;
      continue;
    }

    if (!META_CHARS.has(ch)) continue;

    isDynamic = true;

    if (ch === '{') {
      depth += 1;
      altStart = i + 1;
      continue;
    }

    if (ch === '}') {
      if (altStart !== -1 && depth > 0) {
        alternatives.push({ start: altStart, end: i });
      }
      depth = Math.max(0, depth - 1);
      altStart = -1;
      continue;
    }

    if (ch === '(' && i > 0) {
      const prev = segment[i - 1];
      if (prev === '@' || prev === '+' || prev === '?' || prev === '*' || prev === '!') {
        depth += 1;
        altStart = i + 1;
        continue;
      }
    }

    if (ch === ')') {
      if (altStart !== -1 && depth > 0) {
        alternatives.push({ start: altStart, end: i });
      }
      depth = Math.max(0, depth - 1);
      altStart = -1;
      continue;
    }
  }

  for (const { start, end } of alternatives) {
    const alt = segment.slice(start, end);
    if (alt === '..') {
      containsTraversal = true;
      break;
    }
  }

  return { isDynamic, containsTraversal };
}

function isDotDotSegment(segment: string): boolean {
  return segment === '..';
}

/**
 * Extract the literal path prefix of a glob pattern — everything before the
 * first segment that contains an unescaped glob metacharacter — while also
 * rejecting any pattern that contains a parent-directory (`..`) token.
 *
 * Traversal tokens are detected in:
 *   - Plain path segments (e.g., `../foo`, `src/..`)
 *   - Brace alternatives (e.g., `{..,src}/**`)
 *   - Extglob alternatives (e.g., `@(..|foo)/**`, `+(..)/**`)
 *
 * Returns the literal prefix suitable for a subsequent
 * `assertPathWithinRoot(join(root, prefix), root)` check. Throws
 * `ConfigError` with the offending pattern for any traversal attempt.
 */
export function extractGlobLiteralPrefix(pattern: string): string {
  if (pattern.length === 0) return '';

  const segments = pattern.split('/');
  const literalParts: string[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;

    if (isDotDotSegment(segment)) {
      throw new ConfigError(
        `scan_paths pattern contains parent-directory traversal: "${sanitizeForTerminal(pattern)}"`,
        'Remove ".." segments from scan_paths in .deepl-sync.yaml; scan paths must stay within the project root.',
      );
    }

    const scan = scanSegment(segment);

    if (scan.containsTraversal) {
      throw new ConfigError(
        `scan_paths pattern contains parent-directory traversal in brace/extglob: "${sanitizeForTerminal(pattern)}"`,
        'Remove ".." alternatives from brace or extglob groups in scan_paths; scan paths must stay within the project root.',
      );
    }

    if (scan.isDynamic) {
      break;
    }

    literalParts.push(segment);
  }

  return literalParts.join('/');
}
