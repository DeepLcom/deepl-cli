/**
 * Shared rule for control characters a locale file must not carry raw.
 *
 * Tab, LF and CR are excluded: every writer already escapes or legally emits
 * them, and they are the three C0 bytes XML 1.0 and gettext both accept. The
 * rest are never legitimate in a translation. Written raw they reach git, where
 * `git diff`, `cat`, `less` and a CI log viewer render an ESC sequence as a live
 * terminal command; TOML rejects its own output on the next read; and XML 1.0
 * cannot represent them at all, not even as a numeric character reference.
 *
 * Writers that have an escape for them use {@link escapeControlChars}; the two
 * XML formats, which do not, use {@link findForbiddenControlChar} to refuse the
 * value instead.
 */
export function isForbiddenControlChar(code: number): boolean {
  return code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
}

/** The first forbidden control character in `value`, or `undefined`. */
export function findForbiddenControlChar(value: string): string | undefined {
  for (const ch of value) {
    if (isForbiddenControlChar(ch.codePointAt(0)!)) return ch;
  }
  return undefined;
}

/**
 * Renders a control character as `U+001B`. A message must never quote the byte
 * itself: it prints as nothing, so the reader would be shown the string they
 * already believe they have.
 */
export function describeControlChar(char: string): string {
  return (
    'U+' + char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
  );
}

/**
 * Replace every forbidden control character with `render(code)`, the escape
 * syntax of the calling format. `alsoEscape` extends the set for a format whose
 * own spec forbids more than the shared rule does — TOML also rejects a raw
 * U+007F.
 */
export function escapeControlChars(
  value: string,
  render: (code: number) => string,
  alsoEscape?: (code: number) => boolean
): string {
  let result = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    result +=
      isForbiddenControlChar(code) || alsoEscape?.(code) ? render(code) : ch;
  }
  return result;
}
