/**
 * Append lines to a line-based `reconstruct` result.
 *
 * The result array comes from splitting on the line terminator, so a file that
 * ends with a newline leaves a final empty element. Pushing onto the end of that
 * would emit a blank line before the new content and leave the file without a
 * terminator, so the empty element is lifted over the appended lines.
 *
 * Shared by the .properties and iOS .strings parsers.
 */
export function appendEntryLines(
  result: string[],
  lines: readonly string[]
): void {
  if (lines.length === 0) return;
  const trailing =
    result.length > 0 && result[result.length - 1] === ''
      ? result.pop()
      : undefined;
  result.push(...lines);
  if (trailing !== undefined) result.push(trailing);
}
