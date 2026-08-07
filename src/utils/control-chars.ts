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

/**
 * Replace only the characters a terminal interprets as the start of a control
 * sequence, leaving every other codepoint — including tab, newline, carriage
 * return and zero-width/bidi marks — byte-for-byte intact. Used as a whole-
 * stream filter in the logger, where `sanitizeForTerminal` cannot be applied:
 * it would turn newlines into `?` and mangle ZWNJ/ZWJ/LRM/RLM that are
 * legitimate content in Persian, Arabic, Devanagari and emoji sequences.
 *
 * The regex covers:
 *   - `\x1b` not followed by an SGR `CSI…m` body — ESC is what makes OSC, DCS
 *     and non-SGR CSI sequences actionable; replacing it leaves the remainder
 *     as inert printable text
 *   - `\x00-\x08`, `\x0b`, `\x0c`, `\x0e-\x1a`, `\x1c-\x1f`, `\x7f` — C0
 *     controls and DEL, minus tab/LF/CR which carry document structure
 *   - `\u0080-\u009f` — C1 controls, including U+009B, the single-byte CSI
 *
 * SGR sequences are allowed through because chalk-formatted strings are passed
 * to the logger already rendered, so stripping them would drop all colour.
 * They can only change text attributes; the primitives that let injected text
 * take over a session — OSC title/clipboard writes, CSI erase and cursor
 * moves, and the status queries whose reply is typed back on stdin — all
 * require a non-SGR sequence and are neutralized.
 */
const TERMINAL_CONTROL_SEQUENCES =
  // eslint-disable-next-line no-control-regex -- intentional: matching terminal control introducers in untrusted input before rendering
  /\x1b(?!\[[\d;:]*m)|[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f\u0080-\u009f]/g;

export function neutralizeTerminalControls(input: string): string {
  return input.replace(TERMINAL_CONTROL_SEQUENCES, '?');
}
