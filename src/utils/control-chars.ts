/**
 * Replace ASCII control characters and zero-width / bidi codepoints in a
 * string with `?` so untrusted user input (YAML keys, translation text,
 * TMS-returned values) cannot corrupt the terminal when echoed inside a
 * rendered error message. Non-string input is returned unchanged.
 *
 * The regex covers:
 *   - `\x00-\x1f`  — C0 controls (includes NUL, escape, CR, LF, tab)
 *   - `\x7f`       — DEL
 *   - `\u200b-\u200f` — zero-width space + bidi markers
 *   - `\u2028-\u202f` — line/paragraph separators + bidi overrides
 *
 * Chosen over stripping because retaining length in error messages helps
 * the user spot where the offending character sat in their input.
 */
// eslint-disable-next-line no-control-regex -- intentional: matching control chars in untrusted input before rendering
const TERMINAL_UNSAFE_CHARS = /[\x00-\x1f\x7f\u200b-\u200f\u2028-\u202f]/g;

export function sanitizeForTerminal(input: string): string {
  return input.replace(TERMINAL_UNSAFE_CHARS, '?');
}
