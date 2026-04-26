import { PendingCommentBuffer } from '../../../src/formats/pending-comment-buffer';

describe('PendingCommentBuffer', () => {
  describe('collect() + flushToOutput()', () => {
    it('should emit buffered lines into the output array in order', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.collect('# comment one');
      buf.collect('# comment two');
      buf.flushToOutput(out);
      expect(out).toEqual(['# comment one', '# comment two']);
    });

    it('should clear the buffer after flushing', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.collect('# c1');
      buf.flushToOutput(out);
      buf.flushToOutput(out);
      expect(out).toEqual(['# c1']);
    });

    it('should be a no-op when nothing is buffered', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = ['existing'];
      buf.flushToOutput(out);
      expect(out).toEqual(['existing']);
    });

    it('should accept blank lines alongside comment lines', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.collect('# comment');
      buf.collect('');
      buf.collect('# another');
      buf.flushToOutput(out);
      expect(out).toEqual(['# comment', '', '# another']);
    });
  });

  describe('drop()', () => {
    it('should discard buffered lines without emitting them', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = ['prev'];
      buf.collect('# about to be orphaned');
      buf.drop();
      buf.flushToOutput(out);
      expect(out).toEqual(['prev']);
    });

    it('should be a no-op when the buffer is already empty', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.drop();
      buf.flushToOutput(out);
      expect(out).toEqual([]);
    });
  });

  describe('reset()', () => {
    it('should clear the buffer without emitting', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.collect('# dropped');
      buf.reset();
      buf.flushToOutput(out);
      expect(out).toEqual([]);
    });
  });

  describe('flush-on-emit, drop-on-delete, flush-on-reinsert semantics', () => {
    it('flushes when the next entry survives (emit)', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.collect('# keeps-its-comment');
      buf.flushToOutput(out);
      out.push('key = "value"');
      expect(out).toEqual(['# keeps-its-comment', 'key = "value"']);
    });

    it('drops when the next entry is deleted (preamble goes with it)', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.collect('# doomed-preamble');
      buf.drop();
      expect(out).toEqual([]);
    });

    it('flushes again after reinsertion-path entries survive', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.collect('# first-preamble');
      buf.flushToOutput(out);
      out.push('kept = "x"');
      buf.collect('# second-preamble');
      buf.flushToOutput(out);
      out.push('kept2 = "y"');
      expect(out).toEqual([
        '# first-preamble',
        'kept = "x"',
        '# second-preamble',
        'kept2 = "y"',
      ]);
    });
  });

  describe('round-trip preservation', () => {
    it('should preserve the full comment+blank+entry sequence exactly', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      const src = [
        '# header comment',
        '',
        '# another',
        'key = "value"',
        '',
        'other = "thing"',
      ];
      for (const line of src) {
        if (line.startsWith('#') || line === '') {
          buf.collect(line);
          continue;
        }
        buf.flushToOutput(out);
        out.push(line);
      }
      buf.flushToOutput(out);
      expect(out).toEqual(src);
    });

    it('supports mixed emit/drop/emit over the same buffer', () => {
      const buf = new PendingCommentBuffer();
      const out: string[] = [];
      buf.collect('# for-deleted');
      buf.drop();
      buf.collect('# for-kept');
      buf.flushToOutput(out);
      out.push('kept = "v"');
      expect(out).toEqual(['# for-kept', 'kept = "v"']);
    });
  });
});
