import { createDefaultRegistry } from '../../../src/formats/index';
import { PoFormatParser } from '../../../src/formats/po';
import type { TranslatedEntry } from '../../../src/formats/format';

describe('po parser', () => {
  it('should be registered in the default registry', async () => {
    const registry = await createDefaultRegistry();
    const extensions = registry.getSupportedExtensions();
    expect(extensions.length).toBeGreaterThan(0);
  });
});

describe('PoFormatParser extract (unquote)', () => {
  const parser = new PoFormatParser();

  it('should decode literal backslash-n (\\\\n in PO) as backslash + n, not newline', () => {
    const po = [
      'msgid "path\\\\nname"',
      'msgstr ""',
    ].join('\n');

    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.value).toBe('path\\nname');
    expect(entries[0]!.value).not.toContain('\n');
  });
});

describe('PoFormatParser extract (msgid with #)', () => {
  const parser = new PoFormatParser();

  it('should not confuse # in msgid with msgctxt separator', () => {
    const po = [
      'msgid "error#404"',
      'msgstr "Not Found"',
    ].join('\n');

    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe('error#404');
    expect(entries[0]!.value).toBe('error#404');

    const result = parser.reconstruct(po, [
      { key: 'error#404', value: 'error#404', translation: 'Nicht gefunden' },
    ]);

    expect(result).toContain('msgid "error#404"');
    expect(result).toContain('msgstr "Nicht gefunden"');
    expect(result).not.toContain('msgctxt');
  });
});

describe('PoFormatParser reconstruct', () => {
  const parser = new PoFormatParser();

  it('should replace msgstr with entry.translation, not source text', () => {
    const template = [
      'msgid "greeting"',
      'msgstr "Old Translation"',
      '',
      'msgid "farewell"',
      'msgstr "Old Farewell"',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      { key: 'farewell', value: 'Goodbye', translation: 'Auf Wiedersehen' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgstr "Hallo"');
    expect(result).toContain('msgstr "Auf Wiedersehen"');
    expect(result).not.toContain('msgstr "Old Translation"');
    expect(result).not.toContain('msgstr "Old Farewell"');
    expect(result).not.toContain('msgstr "Hello"');
    expect(result).not.toContain('msgstr "Goodbye"');
  });

  it('should append new entries not present in template', () => {
    const template = [
      'msgid "greeting"',
      'msgstr "Hallo"',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      { key: 'new_key', value: 'New text', translation: 'Neuer Text' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgid "greeting"');
    expect(result).toContain('msgid "new_key"');
    expect(result).toContain('msgstr "Neuer Text"');
    const lines = result.split('\n');
    const newKeyIdx = lines.findIndex(l => l.includes('"new_key"'));
    const greetingIdx = lines.findIndex(l => l.includes('"greeting"'));
    expect(newKeyIdx).toBeGreaterThan(greetingIdx);
  });

  it('should remove entries from template that are not in entries (deleted keys)', () => {
    const template = [
      'msgid "greeting"',
      'msgstr "Hallo"',
      '',
      'msgid "deleted_key"',
      'msgstr "Geloescht"',
      '',
      'msgid "farewell"',
      'msgstr "Auf Wiedersehen"',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      { key: 'farewell', value: 'Goodbye', translation: 'Auf Wiedersehen' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgid "greeting"');
    expect(result).toContain('msgid "farewell"');
    expect(result).not.toContain('deleted_key');
    expect(result).not.toContain('Geloescht');
  });

  it('should preserve header entries regardless of entries list', () => {
    const template = [
      'msgid ""',
      'msgstr "Content-Type: text/plain; charset=UTF-8\\n"',
      '',
      'msgid "greeting"',
      'msgstr "Hallo"',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Updated Hallo' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgstr "Content-Type: text/plain; charset=UTF-8\\n"');
    expect(result).toContain('msgstr "Updated Hallo"');
  });

  it('should preserve multi-line header with empty msgstr and continuation lines', () => {
    const template = [
      'msgid ""',
      'msgstr ""',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
      '',
      'msgid "greeting"',
      'msgstr "Hallo"',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Bonjour' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgstr ""');
    expect(result).toContain('"Content-Type: text/plain; charset=UTF-8\\n"');
    expect(result).toContain('"Plural-Forms: nplurals=2; plural=(n != 1);\\n"');
    expect(result).toContain('msgstr "Bonjour"');
  });

  it('should remove fuzzy flag when providing a fresh translation', () => {
    const template = [
      '#, fuzzy',
      'msgid "greeting"',
      'msgstr ""',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgstr "Hallo"');
    expect(result).not.toContain('fuzzy');
  });

  it('should keep other flags when removing fuzzy from multi-flag line', () => {
    const template = [
      '#, fuzzy, python-format',
      'msgid "greeting"',
      'msgstr ""',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('#, python-format');
    expect(result).not.toContain('fuzzy');
    expect(result).toContain('msgstr "Hallo"');
  });

  it('should use continuation line format for long msgstr with newlines', () => {
    const template = [
      'msgid "long_message"',
      'msgstr ""',
    ].join('\n');

    const longTranslation = 'First line of the translated message\nSecond line of the translated message\nThird line';

    const entries: TranslatedEntry[] = [
      { key: 'long_message', value: 'source', translation: longTranslation },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgstr ""');
    expect(result).toContain('"First line of the translated message\\n"');
    expect(result).toContain('"Second line of the translated message\\n"');
    expect(result).toContain('"Third line"');
    expect(result).not.toMatch(/^msgstr "First/m);
  });

  it('should use single-line format for short msgstr without newlines', () => {
    const template = [
      'msgid "greeting"',
      'msgstr ""',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgstr "Hallo"');
    expect(result).not.toContain('msgstr ""');
  });
});

describe('PoFormatParser — parsing coverage', () => {
  const parser = new PoFormatParser();

  it('should parse entries separated by blank lines', () => {
    const po = [
      'msgid "hello"',
      'msgstr "Hello"',
      '',
      'msgid "bye"',
      'msgstr "Bye"',
    ].join('\n');
    const entries = parser.extract(po);
    expect(entries).toHaveLength(2);
  });

  it('should parse developer comments (#.)', () => {
    const po = '#. Developer note\nmsgid "key"\nmsgstr "value"\n';
    const entries = parser.extract(po);
    expect(entries[0]!.context).toContain('Developer note');
  });

  it('should parse reference comments (#:)', () => {
    const po = '#: src/app.ts:42\nmsgid "key"\nmsgstr "value"\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
  });

  it('should parse flag comments (#,)', () => {
    const po = '#, fuzzy, python-format\nmsgid "key"\nmsgstr "value"\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
  });

  it('should parse translator comments (#)', () => {
    const po = '# Translator note\nmsgid "key"\nmsgstr "value"\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
  });

  it('should skip obsolete entries (#~)', () => {
    const po = '#~ msgid "old"\n#~ msgstr "ancient"\nmsgid "key"\nmsgstr "value"\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe('key');
  });

  it('should parse msgctxt', () => {
    const po = 'msgctxt "menu"\nmsgid "file"\nmsgstr "File"\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toContain('file');
  });

  it('should parse msgid_plural and msgstr[N]', () => {
    const po = [
      'msgid "item"',
      'msgid_plural "items"',
      'msgstr[0] "Artikel"',
      'msgstr[1] "Artikel"',
    ].join('\n') + '\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.metadata).toBeDefined();
    expect(entries[0]!.metadata!['msgid_plural']).toBe('items');
  });

  it('should handle multi-line continuation strings', () => {
    const po = [
      'msgid ""',
      '"Hello "',
      '"World"',
      'msgstr "Hallo Welt"',
    ].join('\n') + '\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.value).toBe('Hello World');
  });

  it('should handle continuation for msgctxt', () => {
    const po = [
      'msgctxt ""',
      '"menu"',
      'msgid "file"',
      'msgstr "Datei"',
    ].join('\n') + '\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
  });

  it('should handle continuation for msgid_plural', () => {
    const po = [
      'msgid "item"',
      'msgid_plural ""',
      '"items"',
      'msgstr[0] "Artikel"',
      'msgstr[1] "Artikel"',
    ].join('\n') + '\n';
    const entries = parser.extract(po);
    expect(entries[0]!.metadata!['msgid_plural']).toBe('items');
  });

  it('should handle continuation for msgstr', () => {
    const po = [
      'msgid "greeting"',
      'msgstr ""',
      '"Hallo "',
      '"Welt"',
    ].join('\n') + '\n';
    const entries = parser.extract(po);
    expect(entries[0]!.value).toBe('greeting');
  });

  it('should handle continuation for msgstr[N]', () => {
    const po = [
      'msgid "item"',
      'msgid_plural "items"',
      'msgstr[0] ""',
      '"Artikel"',
      'msgstr[1] ""',
      '"Artikel"',
    ].join('\n') + '\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
  });
});

describe('PoFormatParser — reconstruct coverage', () => {
  const parser = new PoFormatParser();

  it('should remove deleted entries from output', () => {
    const po = [
      'msgid "keep"',
      'msgstr "Keep"',
      '',
      'msgid "delete"',
      'msgstr "Delete"',
    ].join('\n') + '\n';
    const entries: TranslatedEntry[] = [
      { key: 'keep', value: 'keep', translation: 'Behalten' },
    ];
    const result = parser.reconstruct(po, entries);
    expect(result).toContain('Behalten');
    expect(result).not.toContain('delete');
  });

  it('should reconstruct entries with msgctxt', () => {
    const po = [
      'msgctxt "menu"',
      'msgid "file"',
      'msgstr "File"',
    ].join('\n') + '\n';
    const entries: TranslatedEntry[] = [
      { key: 'menu\x04file', value: 'file', translation: 'Datei' },
    ];
    const result = parser.reconstruct(po, entries);
    expect(result).toContain('Datei');
  });

  it('should reconstruct plural entries', () => {
    const po = [
      'msgid "item"',
      'msgid_plural "items"',
      'msgstr[0] "item"',
      'msgstr[1] "items"',
    ].join('\n') + '\n';
    const entries: TranslatedEntry[] = [
      {
        key: 'item',
        value: 'item',
        translation: 'Artikel',
        metadata: {
          msgid_plural: 'items',
          plural_forms: { 'msgstr[0]': 'Artikel', 'msgstr[1]': 'Artikel' },
        },
      },
    ];
    const result = parser.reconstruct(po, entries);
    expect(result).toContain('msgstr[0] "Artikel"');
    expect(result).toContain('msgstr[1] "Artikel"');
  });

  it('should remove fuzzy flag when translation is provided', () => {
    const po = [
      '#, fuzzy',
      'msgid "greeting"',
      'msgstr "old"',
    ].join('\n') + '\n';
    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'greeting', translation: 'Hallo' },
    ];
    const result = parser.reconstruct(po, entries);
    expect(result).toContain('Hallo');
    expect(result).not.toContain('fuzzy');
  });

  it('should preserve non-fuzzy flags', () => {
    const po = [
      '#, python-format',
      'msgid "count: %d"',
      'msgstr "Anzahl: %d"',
    ].join('\n') + '\n';
    const entries: TranslatedEntry[] = [
      { key: 'count: %d', value: 'count: %d', translation: 'Anzahl: %d' },
    ];
    const result = parser.reconstruct(po, entries);
    expect(result).toContain('python-format');
  });
});
