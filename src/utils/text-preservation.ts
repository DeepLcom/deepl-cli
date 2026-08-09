/**
 * Text preservation utilities
 * Preserves code blocks and variables during translation by replacing them with placeholders
 */

import { NetworkError } from './errors.js';

export function preserveCodeBlocks(
  text: string,
  preservationMap: Map<string, string>
): string {
  let processed = text;
  let counter = 0;

  // Preserve multi-line code blocks (```)
  processed = processed.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_${counter++}__`;
    preservationMap.set(placeholder, match);
    return placeholder;
  });

  // Preserve inline code blocks (`)
  processed = processed.replace(/`[^`]+`/g, (match) => {
    const placeholder = `__CODE_${counter++}__`;
    preservationMap.set(placeholder, match);
    return placeholder;
  });

  return processed;
}

export function preserveVariables(
  text: string,
  preservationMap: Map<string, string>
): string {
  let processed = text;
  let counter = 0;

  // Preserve various variable formats (order matters - longest match first)
  const patterns = [
    /\$\{[\p{L}\p{N}_]+\}/gu, // ${name}, ${имя}
    /\{\{[\p{L}\p{N}_]+\}\}/gu, // {{name}}, {{имя}} — must precede {name}
    /\{[\p{L}\p{N}_]+\}/gu, // {name}, {名前}, {0}
    /%\d+\$[sdfu@]/g, // %1$s, %2$d
    /%[sdfu@]/g, // %s, %d, %f, %u, %@
  ];

  for (const pattern of patterns) {
    processed = processed.replace(pattern, (match) => {
      const placeholder = `__VAR_${counter++}__`;
      preservationMap.set(placeholder, match);
      return placeholder;
    });
  }

  return processed;
}

/**
 * The originals whose placeholder tokens are absent from `text`, in the order
 * they were preserved.
 *
 * `restorePlaceholders` cannot report this itself: it replaces what it finds and
 * has no way to say what it did not. An engine that re-cases or re-spaces a
 * token it does not recognise (`__VAR_0__` → `__ Var_0 __`) leaves the CLI's own
 * scaffolding in the output, so an empty result is the post-condition every
 * caller without a validator needs to check.
 */
export function unresolvedPlaceholders(
  text: string,
  preservationMap: Map<string, string>
): string[] {
  // The preservation passes run in sequence over already-substituted text, so
  // a span preserved later can hold an earlier pass's token (a fence token
  // inside an inline code span, a code token inside a brace-shaped variable).
  // Such an earlier token is legitimately absent from the engine's output: it
  // survives inside the stored value of the later token. Scanning in reverse
  // insertion order lets each token count the values already found intact.
  const missing: string[] = [];
  const survivingValues: string[] = [];
  const entries = [...preservationMap.entries()].reverse();
  for (const [placeholder, original] of entries) {
    if (
      text.includes(placeholder) ||
      survivingValues.some((value) => value.includes(placeholder))
    ) {
      survivingValues.push(original);
    } else {
      missing.push(original);
    }
  }
  return missing.reverse();
}

/**
 * Names what was lost, for a caller that reports rather than throws.
 */
export function unresolvedPlaceholderMessage(unresolved: string[]): string {
  const one = unresolved.length === 1;
  return (
    `The translation lost ${one ? 'the placeholder' : 'the placeholders'} ${unresolved.join(', ')}. ` +
    `The endpoint returned the ${one ? 'token' : 'tokens'} the CLI substituted for ` +
    `${one ? 'it' : 'them'} in an altered form, so the text would carry the CLI's ` +
    'internal placeholders instead. Nothing was written.'
  );
}

const UNRESOLVED_PLACEHOLDER_SUGGESTION =
  'Retry; if it repeats, check which endpoint this run used (--api-url, or ' +
  'api.baseUrl in your config) — it is rewriting the placeholder tokens rather ' +
  'than returning them unchanged.';

/**
 * Throws when the engine's output no longer carries every token that was
 * substituted into the request. Callers with their own validator — sync, which
 * withholds the key and offers `validation.check_placeholders: false` as an
 * escape hatch — do not use this.
 */
export function assertPlaceholdersSurvived(
  text: string,
  preservationMap: Map<string, string>
): void {
  const unresolved = unresolvedPlaceholders(text, preservationMap);
  if (unresolved.length > 0) {
    throw new NetworkError(
      unresolvedPlaceholderMessage(unresolved),
      UNRESOLVED_PLACEHOLDER_SUGGESTION
    );
  }
}

export function restorePlaceholders(
  text: string,
  preservationMap: Map<string, string>
): string {
  let restored = text;
  // Reverse insertion order: a span preserved later can hold an earlier
  // token, so the later token must be expanded first for the earlier one to
  // be visible at all. A stored value can only contain tokens preserved
  // before it — the value was captured from text as it stood then — so one
  // pass in this order expands every level of nesting.
  const entries = [...preservationMap.entries()].reverse();
  for (const [placeholder, original] of entries) {
    // Single pass per placeholder: `original` may itself contain the
    // placeholder token (a locale value shaped like `{__VAR_0__}`), so any
    // loop that re-scans the output would never terminate.
    // The function form of the replacement keeps `$&`/`$1` in `original`
    // literal instead of being read as substitution patterns.
    restored = restored.replaceAll(placeholder, () => original);
  }
  return restored;
}
