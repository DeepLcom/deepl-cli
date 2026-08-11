import {
  FormatDepthExceededError,
  assertDistinctKeys,
  type ExtractedEntry,
  type FormatParser,
  type TranslatedEntry,
} from './format.js';
import { ValidationError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';
import { requireModule } from './php-parser-bridge.js';

export const SKIP_REASON_PIPE_PLURALIZATION = 'pipe_pluralization';

export const DEFAULT_PHP_MAX_DEPTH = 32;

export interface PhpArraysParserOptions {
  /**
   * Maximum associative-array nesting depth accepted during extract.
   * Protects against stack-overflow on adversarial inputs. Default 32
   * (matches DEFAULT_SYNC_LIMITS.max_depth); may be overridden by
   * {@link ResolvedSyncConfig.sync.limits.max_depth} up to the
   * HARD_MAX_SYNC_LIMITS.max_depth ceiling.
   */
  maxDepth?: number;
}

/**
 * Thrown when a parser cap from sync.limits is exceeded. Walkers catch
 * this specifically to convert into a file-skip + warn (vs. propagating
 * an allowlist ValidationError, which is a hard reject).
 */
export class PhpArraysCapExceededError extends FormatDepthExceededError {
  constructor(message: string) {
    super(message);
    this.name = 'PhpArraysCapExceededError';
  }
}

// Laravel's "complex" pluralization syntax uses `|` followed by either a
// single-count marker `{N}` or a range marker `[N,M]` / `[N,*]`. Plain
// pipe-delimited forms (`'apples|apple'`) are intentionally NOT matched: a
// literal pipe in a translation is ambiguous with simple pluralization, and a
// strict opt-in pattern avoids false positives on regular prose values.
const PIPE_PLURALIZATION_REGEX = /\|\s*(\{\d+\}|\[\d+,(\d+|\*)\])/;

interface PhpNode {
  readonly kind: string;
}

interface PhpLoc {
  readonly start: { readonly offset: number };
  readonly end: { readonly offset: number };
}

interface PhpString extends PhpNode {
  readonly kind: 'string';
  readonly value: string;
  readonly isDoubleQuote: boolean;
  readonly loc?: PhpLoc;
}

interface PhpArray extends PhpNode {
  readonly kind: 'array';
  readonly items: readonly PhpEntry[];
  readonly loc?: PhpLoc;
}

interface PhpEntry extends PhpNode {
  readonly kind: 'entry';
  readonly key: PhpNode | null;
  readonly value: PhpNode;
  readonly loc?: PhpLoc;
}

interface PhpReturn extends PhpNode {
  readonly kind: 'return';
  readonly expr: PhpNode | null;
}

interface PhpProgram extends PhpNode {
  readonly kind: 'program';
  readonly children: readonly PhpNode[];
}

interface PhpEngine {
  parseCode(source: string, filename?: string): PhpProgram;
}

interface PhpEngineCtor {
  new (options: unknown): PhpEngine;
}

let engineSingleton: PhpEngine | null = null;

function getEngine(): PhpEngine {
  if (engineSingleton) return engineSingleton;
  const mod = requireModule('php-parser') as {
    Engine?: PhpEngineCtor;
    default?: { Engine: PhpEngineCtor };
  };
  const Engine = mod.Engine ?? mod.default?.Engine;
  if (!Engine) {
    throw new Error("php-parser: 'Engine' export not found");
  }
  engineSingleton = new Engine({
    parser: { extractDoc: false, suppressErrors: false, version: '8.2' },
    ast: { withPositions: true },
  });
  return engineSingleton;
}

const ALLOWLIST_HINT =
  'Allowed: top-level `return [...]` with string keys mapping to string literals, nested arrays, or numeric/boolean/null scalars. ' +
  'Reject: double-quoted interpolation (e.g., "Hello $name"), heredoc/nowdoc, string concatenation.';

export class PhpArraysFormatParser implements FormatParser {
  readonly name = 'Laravel PHP arrays';
  readonly configKey = 'laravel_php';
  readonly extensions = ['.php'];

  private readonly maxDepth: number;

  constructor(options: PhpArraysParserOptions = {}) {
    this.maxDepth = options.maxDepth ?? DEFAULT_PHP_MAX_DEPTH;
  }

  withMaxDepth(maxDepth: number): PhpArraysFormatParser {
    return new PhpArraysFormatParser({ maxDepth });
  }

  extract(content: string, _locale?: string): ExtractedEntry[] {
    const clean = content.replace(/^\uFEFF/, '');
    if (!clean.trim()) return [];

    const ast = getEngine().parseCode(clean);
    const returnNode = (ast.children ?? []).find(
      (c): c is PhpReturn => c.kind === 'return'
    );
    if (!returnNode?.expr) return [];

    if (returnNode.expr.kind !== 'array') {
      throw new ValidationError(
        `Laravel PHP file must return an array literal (got '${returnNode.expr.kind}').`,
        ALLOWLIST_HINT
      );
    }

    const entries: ExtractedEntry[] = [];
    walkArray(returnNode.expr as PhpArray, '', entries, 1, this.maxDepth);
    assertDistinctKeys(entries, 'Laravel PHP', '.');
    return entries;
  }

  reconstruct(
    content: string,
    entries: TranslatedEntry[],
    _locale?: string
  ): string {
    if (entries.length === 0) return content;

    const hadBom = content.startsWith('\uFEFF');
    const body = hadBom ? content.slice(1) : content;

    const ast = getEngine().parseCode(body);
    const returnNode = (ast.children ?? []).find(
      (c): c is PhpReturn => c.kind === 'return'
    );
    if (returnNode?.expr?.kind !== 'array') {
      throw new ValidationError(
        'Cannot reconstruct: file must return an array literal.',
        ALLOWLIST_HINT
      );
    }

    const locMap = new Map<string, StringLoc>();
    collectStringLocs(returnNode.expr as PhpArray, '', locMap);

    const replacements: Replacement[] = [];
    for (const entry of entries) {
      const loc = locMap.get(entry.key);
      if (!loc) continue;
      replacements.push({
        start: loc.start,
        end: loc.end,
        literal: encodePhpString(entry.translation, loc.isDoubleQuote),
      });
    }
    replacements.push(
      ...planInsertions(
        body,
        returnNode.expr as PhpArray,
        entries.filter((entry) => !locMap.has(entry.key))
      )
    );
    replacements.sort((a, b) => b.start - a.start);

    let result = body;
    for (const r of replacements) {
      result = result.slice(0, r.start) + r.literal + result.slice(r.end);
    }
    return hadBom ? `\uFEFF${result}` : result;
  }
}

interface StringLoc {
  readonly start: number;
  readonly end: number;
  readonly isDoubleQuote: boolean;
}

/** A span of `body` to overwrite; an insertion has `start === end`. */
interface Replacement {
  start: number;
  end: number;
  literal: string;
}

const PHP_INDENT_STEP = '    ';

/** The run of spaces and tabs starting the line `offset` falls on. */
function lineIndentAt(body: string, offset: number): string {
  const lineStart = body.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(body.slice(lineStart, offset))![0];
}

function collectArrays(
  arr: PhpArray,
  prefix: string,
  out: Map<string, PhpArray>
): void {
  out.set(prefix, arr);
  for (const item of arr.items) {
    if (item.kind !== 'entry' || item.key?.kind !== 'string') continue;
    const keyStr = (item.key as PhpString).value;
    const dotPath = prefix ? `${prefix}.${keyStr}` : keyStr;
    if (item.value.kind === 'array') {
      collectArrays(item.value as PhpArray, dotPath, out);
    }
  }
}

/** Where a new element goes in `arr`, and the style to write it in. */
interface ArraySlot {
  /** Offset to splice at. */
  at: number;
  /** Text opening each new element, carrying the array's own line layout. */
  lead: string;
  /** Text preceding the first new element, separating it from the last one. */
  prefix: string;
  /** Text following the last new element. */
  suffix: string;
  keyIsDoubleQuote: boolean;
  valueIsDoubleQuote: boolean;
}

function arraySlot(body: string, arr: PhpArray): ArraySlot | undefined {
  if (!arr.loc) return undefined;
  const closeAt = arr.loc.end.offset - 1;
  // An array written on one line stays on one line; one already spanning lines
  // gets a line per element, indented like the element it follows.
  const multiline = body
    .slice(arr.loc.start.offset, arr.loc.end.offset)
    .includes('\n');
  const lastItem = arr.items[arr.items.length - 1];

  if (!lastItem?.loc) {
    // An empty array has no element to sit beside, so the new ones become its
    // body, written just inside the opening bracket — `[` for the short form,
    // `(` for `array(...)`. Writing before the closing bracket instead would
    // leave the newline already separating the two, and emit a blank line.
    const open = /[[(]/.exec(body.slice(arr.loc.start.offset, closeAt + 1));
    if (!open) return undefined;
    return {
      at: arr.loc.start.offset + open.index + 1,
      lead: multiline
        ? `\n${lineIndentAt(body, arr.loc.start.offset)}${PHP_INDENT_STEP}`
        : '',
      prefix: '',
      suffix: '',
      keyIsDoubleQuote: false,
      valueIsDoubleQuote: false,
    };
  }

  // A trailing comma after the last element is optional in PHP. Where one is
  // there the new elements follow it and keep it; where it is not, adding one
  // to the previous last element is unavoidable but adding another to the new
  // one would change a style the file chose.
  const tail = body.slice(lastItem.loc.end.offset, closeAt);
  const commaAt = tail.indexOf(',');
  const terminated = commaAt !== -1 && tail.slice(0, commaAt).trim() === '';
  const lastValue = lastItem.value;
  return {
    at: terminated
      ? lastItem.loc.end.offset + commaAt + 1
      : lastItem.loc.end.offset,
    lead: multiline
      ? `\n${lineIndentAt(body, lastItem.loc.start.offset)}`
      : ' ',
    prefix: terminated ? '' : ',',
    suffix: terminated ? ',' : '',
    keyIsDoubleQuote:
      lastItem.key?.kind === 'string' &&
      (lastItem.key as PhpString).isDoubleQuote,
    valueIsDoubleQuote:
      lastValue.kind === 'string' && (lastValue as PhpString).isDoubleQuote,
  };
}

/**
 * Plan an element for every entry the file has no string literal for. Such an
 * entry is a key added to the source file after this target was written: the
 * target is the reconstruct template, so a span-surgical rewrite has nothing to
 * overwrite, and dropping the entry loses the string with nothing to
 * distinguish it from a key never asked for.
 *
 * A key whose parent array is itself absent is left out: creating the
 * intervening arrays would guess at a structure the source file already
 * defines.
 */
function planInsertions(
  body: string,
  root: PhpArray,
  missing: readonly TranslatedEntry[]
): Replacement[] {
  if (missing.length === 0) return [];

  const arrays = new Map<string, PhpArray>();
  collectArrays(root, '', arrays);

  const byParent = new Map<string, TranslatedEntry[]>();
  for (const entry of missing) {
    const lastDot = entry.key.lastIndexOf('.');
    const parent = lastDot === -1 ? '' : entry.key.slice(0, lastDot);
    if (!arrays.has(parent)) continue;
    const group = byParent.get(parent);
    if (group) group.push(entry);
    else byParent.set(parent, [entry]);
  }

  const insertions: Replacement[] = [];
  for (const [parent, group] of byParent) {
    const slot = arraySlot(body, arrays.get(parent)!);
    if (!slot) continue;
    const elements = group.map((entry) => {
      const leaf = parent ? entry.key.slice(parent.length + 1) : entry.key;
      return (
        slot.lead +
        `${encodePhpString(leaf, slot.keyIsDoubleQuote)} => ` +
        `${encodePhpString(entry.translation, slot.valueIsDoubleQuote)}`
      );
    });
    insertions.push({
      start: slot.at,
      end: slot.at,
      literal: slot.prefix + elements.join(',') + slot.suffix,
    });
  }
  return insertions;
}

function collectStringLocs(
  arr: PhpArray,
  prefix: string,
  out: Map<string, StringLoc>
): void {
  for (const item of arr.items) {
    if (item.kind !== 'entry' || item.key?.kind !== 'string') continue;
    const keyStr = (item.key as PhpString).value;
    const dotPath = prefix ? `${prefix}.${keyStr}` : keyStr;

    const val = item.value;
    if (val.kind === 'string') {
      const s = val as PhpString;
      if (s.loc) {
        out.set(dotPath, {
          start: s.loc.start.offset,
          end: s.loc.end.offset,
          isDoubleQuote: s.isDoubleQuote,
        });
      }
    } else if (val.kind === 'array') {
      collectStringLocs(val as PhpArray, dotPath, out);
    }
  }
}

function encodePhpString(value: string, useDoubleQuote: boolean): string {
  if (useDoubleQuote) {
    // Order matters: escape backslashes first so subsequent `\n` etc. don't
    // collide with the backslashes they introduce. `$` is escaped to prevent
    // accidental interpolation on re-parse (e.g., a translation containing
    // "$100" would otherwise read as a variable reference). Literal control
    // characters (LF/CR/TAB) are re-encoded to their escape forms so
    // single-line double-quoted sources round-trip byte-equal.
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  }
  // Single-quoted PHP: only `\` and `'` are special; LF/CR/TAB are literal
  // bytes (the string may legitimately span multiple source lines).
  const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function walkArray(
  arr: PhpArray,
  prefix: string,
  out: ExtractedEntry[],
  depth: number,
  maxDepth: number
): void {
  if (depth > maxDepth) {
    throw new PhpArraysCapExceededError(
      `Laravel PHP: max nesting depth ${maxDepth} exceeded at '${prefix || '<root>'}'.`
    );
  }
  for (const item of arr.items) {
    if (item.kind !== 'entry') {
      throw new ValidationError(
        `Unsupported array item kind '${item.kind}' at '${prefix || '<root>'}'.`,
        ALLOWLIST_HINT
      );
    }
    if (item.key?.kind !== 'string') {
      throw new ValidationError(
        `Unsupported array key kind '${item.key?.kind ?? 'none'}' at '${prefix || '<root>'}' (string keys required).`,
        ALLOWLIST_HINT
      );
    }
    const keyStr = (item.key as PhpString).value;
    const dotPath = prefix ? `${prefix}.${keyStr}` : keyStr;

    const val = item.value;
    switch (val.kind) {
      case 'string': {
        const stringValue = (val as PhpString).value;
        const entry: ExtractedEntry = { key: dotPath, value: stringValue };
        if (PIPE_PLURALIZATION_REGEX.test(stringValue)) {
          entry.metadata = {
            skipped: { reason: SKIP_REASON_PIPE_PLURALIZATION },
          };
          Logger.warn(
            `Laravel PHP: skipping pipe-pluralization value at '${dotPath}' — preserved verbatim, not sent for translation.`
          );
        }
        out.push(entry);
        break;
      }
      case 'array':
        walkArray(val as PhpArray, dotPath, out, depth + 1, maxDepth);
        break;
      case 'number':
      case 'boolean':
      case 'nullkeyword':
        break;
      default:
        throw new ValidationError(
          `Unsupported value kind '${val.kind}' at key '${dotPath}'.`,
          ALLOWLIST_HINT
        );
    }
  }
}
