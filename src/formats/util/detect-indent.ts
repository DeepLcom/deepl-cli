/**
 * Detect the indentation of a JSON-family document by inspecting the first
 * indented line. Returns a value suitable for the JSON.stringify spacing
 * parameter: `'\t'` for tab indentation, the space count for space
 * indentation, or `2` as the default.
 *
 * Shared by the JSON, ARB, and xcstrings parsers.
 */
export function detectIndent(content: string): string | number {
  const match = /\n([ \t]+)/.exec(content);
  if (!match?.[1]) {
    return 2;
  }
  const whitespace = match[1];
  if (whitespace.startsWith('\t')) {
    return '\t';
  }
  return whitespace.length;
}
