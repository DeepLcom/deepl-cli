import { sanitizeForTerminal } from '../../../src/utils/control-chars';

describe('sanitizeForTerminal', () => {
  it('replaces NUL bytes with ?', () => {
    expect(sanitizeForTerminal('abc\x00def')).toBe('abc?def');
  });

  it('replaces escape and other C0 controls with ?', () => {
    expect(sanitizeForTerminal('\x1b[31mred\x1b[0m')).toBe('?[31mred?[0m');
  });

  it('replaces DEL (0x7f) with ?', () => {
    expect(sanitizeForTerminal('bad\x7fthing')).toBe('bad?thing');
  });

  it('replaces zero-width space and bidi markers with ?', () => {
    expect(sanitizeForTerminal('a\u200bb\u200ec\u200fd')).toBe('a?b?c?d');
  });

  it('replaces line/paragraph separators and bidi overrides with ?', () => {
    expect(sanitizeForTerminal('a\u2028b\u2029c\u202ed')).toBe('a?b?c?d');
  });

  it('replaces tabs, newlines, and carriage returns with ?', () => {
    expect(sanitizeForTerminal('a\tb\nc\rd')).toBe('a?b?c?d');
  });

  it('leaves plain ASCII unchanged', () => {
    expect(sanitizeForTerminal('hello world 123')).toBe('hello world 123');
  });

  it('leaves printable non-ASCII unchanged', () => {
    expect(sanitizeForTerminal('Grüße — 你好')).toBe('Grüße — 你好');
  });

  it('handles empty string', () => {
    expect(sanitizeForTerminal('')).toBe('');
  });

  it('replaces multiple control chars in a single call', () => {
    expect(sanitizeForTerminal('\x00\x01\x02\x7f')).toBe('????');
  });
});
