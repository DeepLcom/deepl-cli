import { ConfigError } from './errors.js';
import { sanitizeForTerminal } from './control-chars.js';

/**
 * fast-glob expands brace groups through `braces`, which bounds only its INPUT
 * length (10000 characters) and places no bound on the expansion it produces —
 * unlike `brace-expansion`, whose similar name hides a very different set of
 * caps. The expansion is the product of every group's alternatives, so 20
 * `{a,b}` groups fit in 107 characters and allocate ~600MB, and 22 groups end
 * the process with a V8 out-of-memory abort. An abort is not a catchable
 * exception, so patterns must be bounded before they reach fast-glob at all.
 *
 * The cap sits at or below the `braces` range limit (1000) so that a range
 * wider than the limit is rejected here rather than surfacing as a raw
 * RangeError from inside the glob walk.
 */
export const MAX_GLOB_EXPANSION = 1000;

/**
 * Length ceiling applied before `braces` sees the pattern, keeping its own
 * 10000-character SyntaxError unreachable.
 */
export const MAX_GLOB_PATTERN_LENGTH = 4096;

const PATTERN_IN_MESSAGE_MAX = 80;

interface Frame {
  /** Product of the expansion counts concatenated in the current alternative. */
  current: number;
  /** Summed expansion counts of the alternatives already closed by a comma. */
  completed: number;
  /** Index just past the `{` that opened this frame. */
  bodyStart: number;
  hasComma: boolean;
}

/**
 * Cardinality of a `braces` range body (`1..9`, `1..9..2`, `a..e`), or null if
 * the body is not a range.
 */
function rangeCardinality(body: string): number | null {
  const parts = body.split('..');
  if (parts.length < 2 || parts.length > 3) return null;

  const [from, to, rawStep] = parts;
  let step = 1;
  if (rawStep !== undefined) {
    if (!/^-?\d+$/.test(rawStep)) return null;
    step = Math.abs(Number(rawStep)) || 1;
  }

  if (/^-?\d+$/.test(from!) && /^-?\d+$/.test(to!)) {
    return Math.floor(Math.abs(Number(to) - Number(from)) / step) + 1;
  }
  if (/^[a-zA-Z]$/.test(from!) && /^[a-zA-Z]$/.test(to!)) {
    const span = Math.abs(to!.charCodeAt(0) - from!.charCodeAt(0));
    return Math.floor(span / step) + 1;
  }
  return null;
}

function closeFrame(frame: Frame, pattern: string, end: number): number {
  if (frame.hasComma) {
    return frame.completed + frame.current;
  }
  // A comma-less group is literal in `braces` (`{en}` stays `{en}`) unless it
  // is a range, but it may still contain a group that does expand.
  const body = pattern.slice(frame.bodyStart, end);
  return (rangeCardinality(body) ?? 1) * frame.current;
}

/**
 * Conservative upper bound on the number of paths a glob pattern's brace
 * groups expand to. Saturates at `MAX_GLOB_EXPANSION + 1` rather than
 * computing the full product, and over-approximates unbalanced groups so an
 * unclosed `{` cannot be used to smuggle a bomb past the bound.
 *
 * Iterative by design: a recursive walk would itself stack-overflow on a
 * deeply nested pattern.
 */
export function countGlobExpansion(pattern: string): number {
  const saturated = MAX_GLOB_EXPANSION + 1;
  const root: Frame = {
    current: 1,
    completed: 0,
    bodyStart: 0,
    hasComma: false,
  };
  const stack: Frame[] = [root];

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];

    if (ch === '\\') {
      i += 1;
      continue;
    }

    if (ch === '{') {
      stack.push({
        current: 1,
        completed: 0,
        bodyStart: i + 1,
        hasComma: false,
      });
      continue;
    }

    if (stack.length === 1) continue;

    const top = stack[stack.length - 1]!;

    if (ch === ',') {
      top.completed += top.current;
      top.current = 1;
      top.hasComma = true;
      if (top.completed > MAX_GLOB_EXPANSION) return saturated;
      continue;
    }

    if (ch === '}') {
      stack.pop();
      const parent = stack[stack.length - 1]!;
      parent.current *= closeFrame(top, pattern, i);
      if (parent.current > MAX_GLOB_EXPANSION) return saturated;
    }
  }

  // Unbalanced `{` groups are literal to `braces`, but folding them in as if
  // closed keeps the bound an over-approximation.
  while (stack.length > 1) {
    const frame = stack.pop()!;
    const parent = stack[stack.length - 1]!;
    parent.current *= closeFrame(frame, pattern, pattern.length);
    if (parent.current > MAX_GLOB_EXPANSION) return saturated;
  }

  return root.current;
}

/**
 * The first `*(…)` / `+(…)` extglob group whose body holds an unbounded
 * wildcard, or undefined.
 *
 * Those two operators are repetitions, so a `*` or `+` inside one gives picomatch
 * a nested quantifier and exponential backtracking. Measured against a
 * 40-character directory name, the six-character pattern `+(a*)b` takes about 50
 * SECONDS — and the expansion bound above never sees it, because a pattern can
 * carry no brace at all. `@(…)`, `?(…)` and `!(…)` are not repetitions and stayed
 * flat under the same measurement, so they are left alone.
 *
 * Both the pattern and the directory names it is matched against come from the
 * checkout, so this is reachable from a merge request rather than only from a
 * hand-edited config.
 */
function findNestedQuantifierExtglob(pattern: string): string | undefined {
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] === '\\') {
      i += 1;
      continue;
    }
    const op = pattern[i];
    if ((op !== '*' && op !== '+') || pattern[i + 1] !== '(') continue;

    let depth = 1;
    let body = '';
    let j = i + 2;
    for (; j < pattern.length; j += 1) {
      const ch = pattern[j]!;
      if (ch === '\\') {
        body += ch + (pattern[j + 1] ?? '');
        j += 1;
        continue;
      }
      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
      body += ch;
    }
    if (/[*+]/.test(body)) {
      return pattern.slice(i, Math.min(j + 1, pattern.length));
    }
  }
  return undefined;
}

/**
 * Reject a glob pattern whose brace expansion, raw length or extglob nesting
 * could wedge the process inside fast-glob. `field` names the config path for
 * the error.
 */
export function assertBoundedGlobExpansion(
  pattern: string,
  field: string
): void {
  const nested = findNestedQuantifierExtglob(pattern);
  if (nested !== undefined) {
    throw new ConfigError(
      `${field} entry contains the extglob group "${sanitizeForTerminal(nested)}", whose repetition wraps an unbounded wildcard. ` +
        `That compiles to a regular expression with nested quantifiers, which can take minutes on a single directory name.`,
      `Remove the "*" or "+" from inside the group in ${field} — "@(...)" matches one alternative without the repetition.`
    );
  }

  if (pattern.length > MAX_GLOB_PATTERN_LENGTH) {
    throw new ConfigError(
      `${field} entry is ${pattern.length} characters long, exceeding the ${MAX_GLOB_PATTERN_LENGTH}-character limit for a glob pattern`,
      `Shorten the pattern in ${field}, or split it across several entries.`
    );
  }

  if (countGlobExpansion(pattern) > MAX_GLOB_EXPANSION) {
    const shown =
      pattern.length > PATTERN_IN_MESSAGE_MAX
        ? `${pattern.slice(0, PATTERN_IN_MESSAGE_MAX)}…`
        : pattern;
    throw new ConfigError(
      `${field} entry "${sanitizeForTerminal(shown)}" expands to more than ${MAX_GLOB_EXPANSION} paths through its brace groups`,
      `Reduce the number of {...} alternatives in ${field}, or list the paths as separate entries.`
    );
  }
}
