import { PropertiesFormatParser } from '../../../src/formats/properties';
import { createDefaultRegistry } from '../../../src/formats/index';
import type { TranslatedEntry } from '../../../src/formats/format';

const parser = new PropertiesFormatParser();

describe('PropertiesFormatParser', () => {
  it('should be registered in the default registry', async () => {
    const registry = await createDefaultRegistry();
    expect(registry.getSupportedExtensions()).toContain('.properties');
  });

  describe('extract()', () => {
    it('should extract key=value pairs', () => {
      const content = 'greeting=Hello\nfarewell=Goodbye\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.key === 'farewell')!.value).toBe('Goodbye');
      expect(entries.find(e => e.key === 'greeting')!.value).toBe('Hello');
    });

    it('should handle key: value separator', () => {
      const content = 'greeting: Hello\nfarewell: Goodbye\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.key === 'farewell')!.value).toBe('Goodbye');
    });

    it('should handle spaces around separator', () => {
      const content = 'greeting = Hello World\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('Hello World');
    });

    it('should skip comment lines', () => {
      const content = '# This is a comment\ngreeting=Hello\n! Another comment\nfarewell=Goodbye\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
    });

    it('should attach preceding comment as metadata', () => {
      const content = '# Welcome message\ngreeting=Hello\n';
      const entries = parser.extract(content);
      expect(entries[0]!.metadata).toEqual({ comment: 'Welcome message' });
    });

    it('should handle Unicode escapes', () => {
      const content = 'greeting=Hallo \\u0057elt\n';
      const entries = parser.extract(content);
      expect(entries[0]!.value).toBe('Hallo Welt');
    });

    it('should handle escaped special characters', () => {
      const content = 'path=C\\:\\\\Users\\\\test\n';
      const entries = parser.extract(content);
      expect(entries[0]!.value).toBe('C:\\Users\\test');
    });

    it('should handle line continuations', () => {
      const content = 'greeting=Hello \\\n    World\n';
      const entries = parser.extract(content);
      expect(entries[0]!.value).toBe('Hello World');
    });

    it('should return empty array for empty content', () => {
      expect(parser.extract('')).toEqual([]);
    });

    it('should skip blank lines', () => {
      const content = 'greeting=Hello\n\n\nfarewell=Goodbye\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
    });
  });

  describe('reconstruct()', () => {
    it('should replace values with translations', () => {
      const content = 'greeting=Hello\nfarewell=Goodbye\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
        { key: 'farewell', value: 'Goodbye', translation: 'Tsch\\u00fcss' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('greeting=Hallo');
    });

    it('should remove deleted keys', () => {
      const content = 'greeting=Hello\nfarewell=Goodbye\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Hallo');
      expect(result).not.toContain('farewell');
    });

    it('should preserve comments for kept keys', () => {
      const content = '# Welcome\ngreeting=Hello\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('# Welcome');
      expect(result).toContain('Hallo');
    });

    it('should escape non-ASCII characters in output', () => {
      const content = 'greeting=Hello\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Héllo' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\u00e9');
    });

    it('should preserve original separator style', () => {
      const content = 'greeting = Hello\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('greeting = Hallo');
    });

    it('should collapse line continuations in original to single line', () => {
      const content = 'greeting=Hello \\\n    World\nfarewell=Bye\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello World', translation: 'Hallo Welt' },
        { key: 'farewell', value: 'Bye', translation: 'Bye' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('greeting=Hallo Welt');
      const lines = result.split('\n');
      const greetingLine = lines.find(l => l.startsWith('greeting='));
      expect(greetingLine).toBe('greeting=Hallo Welt');
    });

    it('should preserve colon separator in output', () => {
      const content = 'greeting: Hello\nfarewell: Goodbye\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
        { key: 'farewell', value: 'Goodbye', translation: 'Auf Wiedersehen' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('greeting: Hallo');
      expect(result).toContain('farewell: Auf Wiedersehen');
    });

    it('should handle empty value in reconstruct', () => {
      const content = 'greeting=Hello\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: '' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('greeting=');
      expect(result.trim()).toBe('greeting=');
    });

    it('should preserve pending blank lines between kept entries', () => {
      const content = 'greeting=Hello\n\nfarewell=Goodbye\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
        { key: 'farewell', value: 'Goodbye', translation: 'Adios' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('Hola');
      expect(result).toContain('Adios');
      expect(result).toContain('\n\n');
    });

    it('should remove comments for deleted keys and keep non-entry lines', () => {
      const content = [
        '# comment for deleted',
        'deleted=Gone',
        'some-random-line-that-does-not-match',
        'keep=Hello',
      ].join('\n');
      const entries: TranslatedEntry[] = [
        { key: 'keep', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).not.toContain('deleted');
      expect(result).toContain('some-random-line-that-does-not-match');
      expect(result).toContain('Hola');
    });

    it('should flush trailing pending comments at end of file', () => {
      const content = 'greeting=Hello\n# trailing comment\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('# trailing comment');
    });

    it('should handle line continuations in reconstruct', () => {
      const content = 'long=This is \\\n    a continued \\\n    line\n';
      const entries: TranslatedEntry[] = [
        { key: 'long', value: 'This is a continued line', translation: 'Translated' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('long=Translated');
    });
  });

  describe('extract() escape edge cases', () => {
    it('should unescape backslash-equals in value', () => {
      const content = 'key=1\\=2\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('1=2');
    });

    it('should unescape backslash-colon in value', () => {
      const content = 'key=value\\:with\\:colons\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('value:with:colons');
    });

    it('should unescape backslash-space in value', () => {
      const content = 'key=hello\\ world\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('hello world');
    });

    it('should handle \\r escape in value', () => {
      const content = 'key=line\\rreturn\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('line\rreturn');
    });

    it('should handle \\n escape in value', () => {
      const content = 'key=line\\nnewline\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('line\nnewline');
    });

    it('should handle \\t escape in value', () => {
      const content = 'key=tab\\there\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('tab\there');
    });

    it('should handle invalid Unicode escape (non-hex after \\u)', () => {
      const content = 'key=hello\\uzzzz\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('hellouzzzz');
    });

    it('should handle \\u with fewer than 4 hex chars at end of string', () => {
      const content = 'key=end\\u00\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('endu00');
    });

    it('should pass through unknown escape character', () => {
      const content = 'key=hello\\xworld\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('helloxworld');
    });

    it('should unescape backslash-backslash', () => {
      const content = 'key=path\\\\to\\\\file\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe('path\\to\\file');
    });

    it('should clear pendingComment after blank line', () => {
      const content = '# orphan comment\n\ngreeting=Hello\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toBeUndefined();
    });

    it('should attach comment with ! prefix as metadata', () => {
      const content = '! Important note\ngreeting=Hello\n';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toEqual({ comment: 'Important note' });
    });
  });

  describe('escapeValue()', () => {
    it('should escape \\r in output', () => {
      const content = 'key=Hello\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'line\rreturn' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\r');
    });

    it('should escape \\t in output', () => {
      const content = 'key=Hello\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'tab\there' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\t');
    });

    it('should escape \\n in output', () => {
      const content = 'key=Hello\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'line\nnewline' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\\n');
    });

    it('should escape backslashes in output', () => {
      const content = 'key=Hello\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'Hello', translation: 'back\\slash' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('back\\\\slash');
    });
  });
});
