import { createDefaultRegistry } from '../../../src/formats/index';
import { IosStringsFormatParser } from '../../../src/formats/ios-strings';
import type { TranslatedEntry } from '../../../src/formats/format';

const parser = new IosStringsFormatParser();

describe('ios-strings parser', () => {
  it('should be registered in the default registry', async () => {
    const registry = await createDefaultRegistry();
    const extensions = registry.getSupportedExtensions();
    expect(extensions.length).toBeGreaterThan(0);
  });

  describe('reconstruct removes deleted keys', () => {
    it('should not include keys absent from translation entries', () => {
      const content = [
        '/* Greeting */',
        '"greeting" = "Hello";',
        '',
        '/* Farewell */',
        '"farewell" = "Goodbye";',
        '',
        '/* Deleted */',
        '"deleted_key" = "Remove me";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
        { key: 'farewell', value: 'Goodbye', translation: 'Adiós' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('greeting');
      expect(result).toContain('farewell');
      expect(result).not.toContain('deleted_key');
      expect(result).not.toContain('Remove me');
      expect(result).not.toContain('Deleted');
    });

    it('should preserve non-entry, non-comment lines', () => {
      const content = [
        '"greeting" = "Hello";',
        '"deleted" = "Gone";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Hola');
      expect(result).not.toContain('deleted');
      expect(result).not.toContain('Gone');
    });
  });

  describe('reconstruct removes multi-line block comments for deleted keys', () => {
    it('should remove entire multi-line block comment when key is deleted', () => {
      const content = [
        '/* This is a',
        '   multi-line comment',
        '   for the deleted key */',
        '"deleted_key" = "Remove me";',
        '',
        '/* Keep this */',
        '"kept_key" = "Keep me";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'kept_key', value: 'Keep me', translation: 'Behalte mich' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('kept_key');
      expect(result).toContain('Behalte mich');
      expect(result).not.toContain('deleted_key');
      expect(result).not.toContain('Remove me');
      expect(result).not.toContain('multi-line comment');
      expect(result).not.toContain('for the deleted key');
    });

    it('should keep multi-line block comments for retained keys', () => {
      const content = [
        '/* This is a',
        '   multi-line comment */',
        '"greeting" = "Hello";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('multi-line comment');
      expect(result).toContain('Hola');
    });
  });

  describe('extract()', () => {
    it('should extract basic key-value pairs', () => {
      const content = '"greeting" = "Hello";\n"farewell" = "Goodbye";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.key === 'greeting')!.value).toBe('Hello');
      expect(entries.find(e => e.key === 'farewell')!.value).toBe('Goodbye');
    });

    it('should attach block comments as metadata', () => {
      const content = '/* Welcome message */\n"greeting" = "Hello";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toEqual({ comment: 'Welcome message' });
    });

    it('should attach line comments as metadata', () => {
      const content = '// Welcome message\n"greeting" = "Hello";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toEqual({ comment: 'Welcome message' });
    });

    it('should handle multi-line block comments', () => {
      const content = [
        '/* This is a',
        '   multi-line comment */',
        '"greeting" = "Hello";',
      ].join('\n');
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toEqual({ comment: 'This is a\n   multi-line comment' });
    });

    it('should handle block comment spanning three or more lines', () => {
      const content = [
        '/* Line one',
        '   Line two',
        '   Line three */',
        '"greeting" = "Hello";',
      ].join('\n');
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toEqual({
        comment: 'Line one\n   Line two\n   Line three',
      });
    });

    it('should handle escaped double quotes', () => {
      const content = '"key" = "He said \\"hello\\"";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('He said "hello"');
    });

    it('should handle escaped backslash-n and tab', () => {
      const content = '"key" = "line1\\nline2\\ttab";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('line1\nline2\ttab');
    });

    it('should handle Unicode escapes like \\U0041', () => {
      const content = '"key" = "\\U0041\\U0042";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('AB');
    });

    it('should return empty array for empty file', () => {
      expect(parser.extract('')).toEqual([]);
    });

    it('should return empty array for whitespace-only file', () => {
      expect(parser.extract('   \n\n  ')).toEqual([]);
    });

    it('should carry comment across blank lines to next entry', () => {
      const content = '/* orphan comment */\n\n"greeting" = "Hello";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toEqual({ comment: 'orphan comment' });
    });

    it('should extract entries in source-file order (consumers sort downstream)', () => {
      const content = '"zebra" = "Z";\n"alpha" = "A";\n"middle" = "M";\n';
      const entries = parser.extract(content);
      expect(entries.map(e => e.key)).toEqual(['zebra', 'alpha', 'middle']);
    });
  });

  describe('reconstruct() comments preservation', () => {
    it('should remove comments for deleted keys', () => {
      const content = [
        '/* Keep comment */',
        '"kept" = "Keep";',
        '',
        '// Delete comment',
        '"deleted" = "Gone";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'kept', value: 'Keep', translation: 'Behalten' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Keep comment');
      expect(result).toContain('Behalten');
      expect(result).not.toContain('Delete comment');
      expect(result).not.toContain('deleted');
    });

    it('should preserve line comments for kept keys', () => {
      const content = [
        '// A line comment',
        '"greeting" = "Hello";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('// A line comment');
      expect(result).toContain('Hola');
    });
  });

  describe('reconstruct with $-patterns in translations', () => {
    it('should preserve literal dollar signs like Pay $5.99', () => {
      const content = '"price_label" = "Price";';
      const entries: TranslatedEntry[] = [
        { key: 'price_label', value: 'Price', translation: 'Pay $5.99' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toBe('"price_label" = "Pay $5.99";');
    });

    it('should preserve $1 and $& in translation values', () => {
      const content = '"msg" = "Hello";';
      const entries: TranslatedEntry[] = [
        { key: 'msg', value: 'Hello', translation: 'Cost $1 and $& more' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toBe('"msg" = "Cost $1 and $& more";');
    });
  });

  describe('unescape edge cases', () => {
    it('should unescape \\r to carriage return', () => {
      const content = '"key" = "line\\rreturn";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('line\rreturn');
    });

    it('should unescape \\0 to null character', () => {
      const content = '"key" = "null\\0char";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('null\0char');
    });

    it('should unescape \\t to tab', () => {
      const content = '"key" = "tab\\there";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('tab\there');
    });

    it('should unescape \\\\ to single backslash', () => {
      const content = '"key" = "back\\\\slash";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('back\\slash');
    });

    it('should handle invalid Unicode escape (non-hex after \\u)', () => {
      const content = '"key" = "hello\\uzzzz";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('hellouzzzz');
    });

    it('should handle invalid Unicode escape (non-hex after \\U)', () => {
      const content = '"key" = "hello\\Uzzzz";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('helloUzzzz');
    });

    it('should handle \\u with fewer than 4 hex chars at end of string', () => {
      const content = '"key" = "end\\u00";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('endu00');
    });

    it('should pass through unknown escape character', () => {
      const content = '"key" = "hello\\xworld";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('helloxworld');
    });

    it('should handle lowercase \\u with valid hex', () => {
      const content = '"key" = "\\u0041\\u0042";\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('AB');
    });
  });

  describe('escape edge cases', () => {
    it('should escape \\r in output', () => {
      const content = '"key" = "Hello";\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'line\rreturn' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\r');
    });

    it('should escape \\0 in output', () => {
      const content = '"key" = "Hello";\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'null\0char' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\0');
    });

    it('should escape \\t in output', () => {
      const content = '"key" = "Hello";\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'tab\there' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\t');
    });

    it('should escape \\n in output', () => {
      const content = '"key" = "Hello";\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'line\nnewline' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\n');
    });

    it('should escape double quotes in output', () => {
      const content = '"key" = "Hello";\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'say "hi"' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\"hi\\"');
    });

    it('should escape backslashes in output', () => {
      const content = '"key" = "Hello";\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'back\\slash' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('back\\\\slash');
    });
  });

  describe('reconstruct with block comments spanning multiple lines', () => {
    it('should handle inBlockComment state during reconstruct', () => {
      const content = [
        '/* Start of',
        '   a block comment',
        '   that spans lines */',
        '"greeting" = "Hello";',
        '',
        '"farewell" = "Goodbye";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
        { key: 'farewell', value: 'Goodbye', translation: 'Adios' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Start of');
      expect(result).toContain('a block comment');
      expect(result).toContain('that spans lines');
      expect(result).toContain('Hola');
      expect(result).toContain('Adios');
    });

    it('should drop multi-line block comment when following key is deleted', () => {
      const content = [
        '/* Multi-line',
        '   comment for deleted */',
        '"deleted" = "Gone";',
        '"kept" = "Here";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'kept', value: 'Here', translation: 'Aqui' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).not.toContain('Multi-line');
      expect(result).not.toContain('deleted');
      expect(result).toContain('Aqui');
    });
  });

  describe('reconstruct with non-entry non-comment lines', () => {
    it('should preserve non-matching lines in reconstruct', () => {
      const content = [
        '"greeting" = "Hello";',
        'SOME_RANDOM_DIRECTIVE',
        '"farewell" = "Goodbye";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
        { key: 'farewell', value: 'Goodbye', translation: 'Adios' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('SOME_RANDOM_DIRECTIVE');
      expect(result).toContain('Hola');
      expect(result).toContain('Adios');
    });
  });

  describe('extract edge cases', () => {
    it('should reset pendingComment on non-matching line', () => {
      const content = [
        '/* orphan comment */',
        'NOT_A_VALID_ENTRY',
        '"greeting" = "Hello";',
      ].join('\n');
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toBeUndefined();
    });

    it('should handle single-line block comment in reconstruct non-entry path', () => {
      const content = [
        '/* standalone comment */',
        '"greeting" = "Hello";',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('standalone comment');
      expect(result).toContain('Hola');
    });
  });

  describe('reconstruct flush trailing pending comments', () => {
    it('should flush trailing comments at end of file', () => {
      const content = [
        '"greeting" = "Hello";',
        '// trailing comment',
      ].join('\n');

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];

      const result = parser.reconstruct(content, entries);
      expect(result).toContain('// trailing comment');
    });

    it('should flush trailing empty lines at end of file', () => {
      const content = '"greeting" = "Hello";\n\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Hola');
    });
  });
});
