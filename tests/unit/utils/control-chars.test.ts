import {
  neutralizeTerminalControls,
  sanitizeForTerminal,
} from '../../../src/utils/control-chars';

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

describe('neutralizeTerminalControls', () => {
  it('neutralizes an OSC title-set sequence so the terminal cannot act on it', () => {
    expect(neutralizeTerminalControls('\x1b]0;PWNED\x07done')).toBe(
      '?]0;PWNED?done'
    );
  });

  it('neutralizes an OSC 52 clipboard-write sequence', () => {
    expect(neutralizeTerminalControls('\x1b]52;c;cm0=\x07')).toBe(
      '?]52;c;cm0=?'
    );
  });

  it('neutralizes CSI erase and cursor-movement sequences', () => {
    expect(neutralizeTerminalControls('\x1b[2J\x1b[1;1H')).toBe('?[2J?[1;1H');
  });

  it('neutralizes a CSI 6n cursor-position query whose reply lands on the shell stdin', () => {
    expect(neutralizeTerminalControls('\x1b[6n')).toBe('?[6n');
  });

  it('preserves SGR colour sequences so chalk output survives', () => {
    expect(neutralizeTerminalControls('\x1b[31mred\x1b[0m')).toBe(
      '\x1b[31mred\x1b[0m'
    );
  });

  it('preserves truecolor SGR sequences in both semicolon and colon forms', () => {
    expect(neutralizeTerminalControls('\x1b[38;2;1;2;3mx\x1b[39m')).toBe(
      '\x1b[38;2;1;2;3mx\x1b[39m'
    );
    expect(neutralizeTerminalControls('\x1b[38:2::1:2:3mx')).toBe(
      '\x1b[38:2::1:2:3mx'
    );
  });

  it('preserves tabs, newlines and carriage returns so piped text keeps its structure', () => {
    expect(neutralizeTerminalControls('a\tb\nc\r\nd')).toBe('a\tb\nc\r\nd');
  });

  it('preserves zero-width joiners and bidi marks that are legitimate translation content', () => {
    // ZWNJ is orthographically required in Persian; LRM/RLM appear in DeepL's
    // bidi output; ZWJ builds emoji sequences.
    const persian = 'نمی\u200cخواهم';
    const bidi = '\u200fשלום\u200e';
    const emoji = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}';
    expect(neutralizeTerminalControls(persian)).toBe(persian);
    expect(neutralizeTerminalControls(bidi)).toBe(bidi);
    expect(neutralizeTerminalControls(emoji)).toBe(emoji);
  });

  it('replaces C0 controls other than tab, newline and carriage return', () => {
    expect(neutralizeTerminalControls('a\x00b\x07c\x08d\x0be\x1ff')).toBe(
      'a?b?c?d?e?f'
    );
  });

  it('replaces DEL', () => {
    expect(neutralizeTerminalControls('bad\x7fthing')).toBe('bad?thing');
  });

  it('replaces C1 controls, including the single-byte CSI introducer', () => {
    expect(neutralizeTerminalControls('a\u009b2Jb\u0090c\u009fd')).toBe(
      'a?2Jb?c?d'
    );
  });

  it('leaves plain text unchanged', () => {
    expect(neutralizeTerminalControls('Grüße — 你好 123')).toBe(
      'Grüße — 你好 123'
    );
  });

  it('handles empty string', () => {
    expect(neutralizeTerminalControls('')).toBe('');
  });
});
