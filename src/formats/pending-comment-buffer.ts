/**
 * Buffer for the span-surgical parsers' comment/blank-line preamble with
 * "flush on emit, drop on delete, flush on reinsert" semantics: lines are
 * collected ahead of an entry, flushed into the output when the entry
 * survives, and dropped when the entry is deleted.
 */
export class PendingCommentBuffer {
  private buffer: string[] = [];

  collect(line: string): void {
    this.buffer.push(line);
  }

  flushToOutput(out: string[]): void {
    if (this.buffer.length > 0) {
      out.push(...this.buffer);
      this.buffer = [];
    }
  }

  drop(): void {
    this.buffer = [];
  }

  reset(): void {
    this.buffer = [];
  }
}
