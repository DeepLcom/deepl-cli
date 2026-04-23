import { TomlFormatParser } from '../../../src/formats/toml';
import { createDefaultRegistry } from '../../../src/formats/index';
import type { TranslatedEntry } from '../../../src/formats/format';

const parser = new TomlFormatParser();

describe('TomlFormatParser', () => {
  it('should be registered in the default registry', async () => {
    const registry = await createDefaultRegistry();
    expect(registry.getSupportedExtensions()).toContain('.toml');
  });

  describe('extract()', () => {
    it('should extract flat key-value pairs', () => {
      const content = 'greeting = "Hello"\nfarewell = "Goodbye"\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.key === 'greeting')!.value).toBe('Hello');
      expect(entries.find(e => e.key === 'farewell')!.value).toBe('Goodbye');
    });

    it('should extract nested table keys with dot paths', () => {
      const content = '[nav]\nhome = "Home"\nabout = "About"\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
      expect(entries.map(e => e.key).sort()).toEqual(['nav.about', 'nav.home']);
    });

    it('should skip non-string values', () => {
      const content = 'name = "Test"\ncount = 5\nflag = true\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.key).toBe('name');
    });

    it('should return empty array for empty content', () => {
      expect(parser.extract('')).toEqual([]);
      expect(parser.extract('  \n  ')).toEqual([]);
    });

    it('should handle go-i18n style deeply nested tables', () => {
      const content = [
        '[messages]',
        '[messages.greeting]',
        'other = "Hello, {{.Name}}!"',
        '[messages.farewell]',
        'other = "Goodbye"',
      ].join('\n') + '\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.key === 'messages.greeting.other')!.value).toBe('Hello, {{.Name}}!');
      expect(entries.find(e => e.key === 'messages.farewell.other')!.value).toBe('Goodbye');
    });
  });

  describe('reconstruct()', () => {
    it('should replace values with translations', () => {
      const content = 'greeting = "Hello"\nfarewell = "Goodbye"\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
        { key: 'farewell', value: 'Goodbye', translation: 'Tschüss' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Hallo');
      expect(result).toContain('Tschüss');
    });

    it('should remove deleted keys', () => {
      const content = 'greeting = "Hello"\nfarewell = "Goodbye"\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Hallo');
      expect(result).not.toContain('farewell');
    });

    it('should preserve trailing newline', () => {
      const content = 'greeting = "Hello"\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result.endsWith('\n')).toBe(true);
    });

    it('should handle nested tables', () => {
      const content = '[nav]\nhome = "Home"\n';
      const entries: TranslatedEntry[] = [
        { key: 'nav.home', value: 'Home', translation: 'Startseite' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Startseite');
    });

    it('should return empty string for empty content', () => {
      expect(parser.reconstruct('', [])).toBe('');
    });
  });

  describe('span-surgical reconstruct', () => {
    it('preserves # comments when translating values', () => {
      const content = [
        '# translator: keep this short',
        'greeting = "Hello"',
        '',
        '# another note',
        'farewell = "Goodbye"',
        '',
      ].join('\n');
      const result = parser.reconstruct(content, [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
        { key: 'farewell', value: 'Goodbye', translation: 'Tschüss' },
      ]);
      expect(result).toContain('# translator: keep this short');
      expect(result).toContain('# another note');
      expect(result).toContain('greeting = "Hallo"');
      expect(result).toContain('farewell = "Tschüss"');
    });

    it('preserves blank lines between sections', () => {
      const content = [
        '[home]',
        'title = "Home"',
        '',
        '',
        '[about]',
        'title = "About"',
        '',
      ].join('\n');
      const result = parser.reconstruct(content, [
        { key: 'home.title', value: 'Home', translation: 'Startseite' },
        { key: 'about.title', value: 'About', translation: 'Über uns' },
      ]);
      expect(result).toBe([
        '[home]',
        'title = "Startseite"',
        '',
        '',
        '[about]',
        'title = "Über uns"',
        '',
      ].join('\n'));
    });

    it('preserves double-quoted vs literal (single-quoted) values per-entry', () => {
      const content = [
        'dq = "double"',
        "lit = 'literal'",
        '',
      ].join('\n');
      const result = parser.reconstruct(content, [
        { key: 'dq', value: 'double', translation: 'doppel' },
        { key: 'lit', value: 'literal', translation: 'wörtlich' },
      ]);
      expect(result).toContain('dq = "doppel"');
      expect(result).toContain("lit = 'wörtlich'");
    });

    it('preserves key order within a section', () => {
      const content = [
        '[nav]',
        'zebra = "Z"',
        'alpha = "A"',
        'mid = "M"',
        '',
      ].join('\n');
      const result = parser.reconstruct(content, [
        { key: 'nav.zebra', value: 'Z', translation: 'Zebra' },
        { key: 'nav.alpha', value: 'A', translation: 'Alpha' },
        { key: 'nav.mid', value: 'M', translation: 'Mitte' },
      ]);
      const zIdx = result.indexOf('Zebra');
      const aIdx = result.indexOf('Alpha');
      const mIdx = result.indexOf('Mitte');
      expect(zIdx).toBeGreaterThanOrEqual(0);
      expect(zIdx).toBeLessThan(aIdx);
      expect(aIdx).toBeLessThan(mIdx);
    });

    it('preserves irregular whitespace around `=` and trailing comments', () => {
      const content = 'key    =     "value"    # trailing comment\n';
      const result = parser.reconstruct(content, [
        { key: 'key', value: 'value', translation: 'wert' },
      ]);
      expect(result).toBe('key    =     "wert"    # trailing comment\n');
    });

    it('escapes double-quote translations correctly', () => {
      const content = 'msg = "hi"\n';
      const result = parser.reconstruct(content, [
        { key: 'msg', value: 'hi', translation: 'She said "hello"' },
      ]);
      expect(result).toBe('msg = "She said \\"hello\\""\n');
    });

    it('falls back from literal to double-quoted when translation contains `\\\'`', () => {
      const content = "msg = 'hi'\n";
      const result = parser.reconstruct(content, [
        { key: 'msg', value: 'hi', translation: "It's fine" },
      ]);
      // Literal strings cannot contain apostrophes; falls back to double-quoted.
      expect(result).toBe('msg = "It\'s fine"\n');
    });

    it('passes non-string values through unchanged (numbers, bools, dates)', () => {
      const content = [
        'name = "Test"',
        'count = 5',
        'enabled = true',
        'shipped = 2024-01-15',
        '',
      ].join('\n');
      const result = parser.reconstruct(content, [
        { key: 'name', value: 'Test', translation: 'Testen' },
      ]);
      expect(result).toContain('name = "Testen"');
      expect(result).toContain('count = 5');
      expect(result).toContain('enabled = true');
      expect(result).toContain('shipped = 2024-01-15');
    });

    it('deletes entries whose keys are missing from the translation map (with preceding comments)', () => {
      const content = [
        'keep = "X"',
        '# comment for remove',
        'remove = "Y"',
        'also_keep = "Z"',
        '',
      ].join('\n');
      const result = parser.reconstruct(content, [
        { key: 'keep', value: 'X', translation: 'x' },
        { key: 'also_keep', value: 'Z', translation: 'z' },
      ]);
      expect(result).not.toContain('remove');
      expect(result).not.toContain('# comment for remove');
      expect(result).toContain('keep = "x"');
      expect(result).toContain('also_keep = "z"');
    });

    it('appends new keys at end when translations contain keys not in source', () => {
      const content = 'existing = "A"\n';
      const result = parser.reconstruct(content, [
        { key: 'existing', value: 'A', translation: 'a' },
        { key: 'brand_new', value: 'new', translation: 'neu' },
      ]);
      expect(result).toContain('existing = "a"');
      expect(result).toContain('brand_new = "neu"');
      // New key appears AFTER the existing entry, not before.
      expect(result.indexOf('existing')).toBeLessThan(result.indexOf('brand_new'));
    });

    it('is byte-equal when reconstruct keeps values identical to extract', () => {
      const content = [
        '# Root comment',
        'greeting = "Hello"',
        '',
        '[nav]',
        '# Inside-section comment',
        'home   =   "Home"   # trailing',
        'back = "Back"',
        '',
        '[messages.greeting]',
        'other = "Welcome, {{.Name}}!"',
        '',
      ].join('\n');
      const extracted = parser.extract(content);
      const identity = extracted.map((e) => ({ ...e, translation: e.value }));
      expect(parser.reconstruct(content, identity)).toBe(content);
    });

    it('preserves surrounding bytes verbatim when only one value is translated (span-surgical)', () => {
      const content = [
        '# keep-me',
        'one = "1"',
        '',
        '# also-keep',
        'two = "2"',
        '',
      ].join('\n');
      const result = parser.reconstruct(content, [
        { key: 'one', value: '1', translation: 'uno' },
        { key: 'two', value: '2', translation: '2' }, // unchanged
      ]);
      // Byte-delta equals the one replacement's length change: '"1"' → '"uno"' is +2 chars.
      expect(result.length).toBe(content.length + ('uno'.length - '1'.length));
      expect(result).toContain('# keep-me');
      expect(result).toContain('# also-keep');
      expect(result).toContain('one = "uno"');
      expect(result).toContain('two = "2"');
    });

    it('passes through multi-line triple-quoted strings without attempting translation', () => {
      const content = [
        'one = "first"',
        'multi = """',
        'line 1',
        'line 2',
        '"""',
        'two = "last"',
        '',
      ].join('\n');
      const result = parser.reconstruct(content, [
        { key: 'one', value: 'first', translation: 'erste' },
        { key: 'two', value: 'last', translation: 'letzte' },
      ]);
      expect(result).toContain('one = "erste"');
      expect(result).toContain('two = "letzte"');
      // Multi-line block preserved verbatim.
      expect(result).toContain('multi = """');
      expect(result).toContain('line 1');
      expect(result).toContain('line 2');
    });
  });
});
