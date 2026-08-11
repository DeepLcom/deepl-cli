/**
 * A string may contain more than one ICU block.
 *
 * Detection must find all of them rather than stopping at the first and
 * pushing the remaining suffix on as a single prose segment: that submits
 * every later block to the MT engine as translatable text — the exact exposure
 * the module exists to prevent. The engine translates the keyword and the
 * selectors:
 *
 *   in  You have {n, plural, one {# item} other {# items}} and
 *       {m, plural, one {# gift} other {# gifts}} waiting.
 *   out ... und {m, Plural, ein {# gift} andere {# gifts}} wartet.
 *
 * leaving a message with no valid format type and no `other` branch, which
 * throws at render time.
 */

import { parseIcu } from '../../src/utils/icu-preservation';

const TWO_BLOCKS =
  'You have {n, plural, one {# item} other {# items}} and ' +
  '{m, plural, one {# gift} other {# gifts}} waiting.';

describe('a string with several ICU blocks', () => {
  it('should send no ICU syntax to the engine', () => {
    const { segments } = parseIcu(TWO_BLOCKS);

    for (const segment of segments) {
      expect(segment.text).not.toMatch(/\bplural\b/);
      expect(segment.text).not.toMatch(/\bother\b/);
    }
  });

  it('should expose every branch and every prose run as its own segment', () => {
    const texts = parseIcu(TWO_BLOCKS).segments.map((s) => s.text);

    expect(texts).toEqual([
      'You have ',
      '# item',
      '# items',
      ' and ',
      '# gift',
      '# gifts',
      ' waiting.',
    ]);
  });

  it('should mark the branches of the second block as plural branches', () => {
    const { segments } = parseIcu(TWO_BLOCKS);

    expect(segments.filter((s) => s.isPluralBranch).map((s) => s.text)).toEqual(
      ['# item', '# items', '# gift', '# gifts']
    );
  });

  it('should reassemble both blocks with their structure intact', () => {
    const result = parseIcu(TWO_BLOCKS);
    const translated = result.segments.map((s) => `[de]${s.text}`);

    expect(result.reassemble(translated)).toBe(
      '[de]You have {n, plural, one {[de]# item} other {[de]# items}}' +
        '[de] and {m, plural, one {[de]# gift} other {[de]# gifts}}[de] waiting.'
    );
  });

  it('should handle adjacent blocks with no prose between them', () => {
    const source =
      '{n, plural, one {# item} other {# items}}' +
      '{m, plural, one {# gift} other {# gifts}}';
    const result = parseIcu(source);

    expect(result.segments.map((s) => s.text)).toEqual([
      '# item',
      '# items',
      '# gift',
      '# gifts',
    ]);
    expect(result.reassemble(result.segments.map((s) => s.text))).toBe(source);
  });

  it('should handle three blocks', () => {
    const source =
      'A {a, plural, one {# x} other {# xs}} B ' +
      '{b, select, male {he} other {they}} C ' +
      '{c, plural, one {# y} other {# ys}} D';
    const result = parseIcu(source);

    expect(result.segments.map((s) => s.text)).toEqual([
      'A ',
      '# x',
      '# xs',
      ' B ',
      'he',
      'they',
      ' C ',
      '# y',
      '# ys',
      ' D',
    ]);
    expect(result.reassemble(result.segments.map((s) => s.text))).toBe(source);
  });

  it('should still pass the whole string through when a block is malformed', () => {
    // An unterminated block is the documented safe fallback: the string is not
    // treated as ICU at all rather than partly protected.
    const source = 'Text {n, plural, one {# item} other {# items';
    const result = parseIcu(source);

    expect(result.isIcu).toBe(false);
    expect(result.segments).toEqual([]);
    expect(result.reassemble([])).toBe(source);
  });

  it('should pass the whole string through when a later block is malformed', () => {
    // The first block parses; protecting it and sending the malformed remainder
    // as prose would leave a half-protected message.
    const source =
      '{n, plural, one {# item} other {# items}} then {m, plural, one {# gift';
    const result = parseIcu(source);

    expect(result.isIcu).toBe(false);
    expect(result.reassemble([])).toBe(source);
  });
});
