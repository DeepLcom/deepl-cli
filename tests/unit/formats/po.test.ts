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
    const po = ['msgid "path\\\\nname"', 'msgstr ""'].join('\n');

    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.value).toBe('path\\nname');
    expect(entries[0]!.value).not.toContain('\n');
  });
});

describe('PoFormatParser extract (msgid with #)', () => {
  const parser = new PoFormatParser();

  it('should not confuse # in msgid with msgctxt separator', () => {
    const po = ['msgid "error#404"', 'msgstr "Not Found"'].join('\n');

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
    const template = ['msgid "greeting"', 'msgstr "Hallo"'].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      { key: 'new_key', value: 'New text', translation: 'Neuer Text' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('msgid "greeting"');
    expect(result).toContain('msgid "new_key"');
    expect(result).toContain('msgstr "Neuer Text"');
    const lines = result.split('\n');
    const newKeyIdx = lines.findIndex((l) => l.includes('"new_key"'));
    const greetingIdx = lines.findIndex((l) => l.includes('"greeting"'));
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

    expect(result).toContain(
      'msgstr "Content-Type: text/plain; charset=UTF-8\\n"'
    );
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
    const template = ['#, fuzzy', 'msgid "greeting"', 'msgstr ""'].join('\n');

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

  it('should keep the fuzzy flag on an entry whose msgstr this run does not change', () => {
    const template = ['#, fuzzy', 'msgid "greeting"', 'msgstr "Hallo"'].join(
      '\n'
    );

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('#, fuzzy');
    expect(result).toContain('msgstr "Hallo"');
  });

  it('should keep a multi-flag comment line verbatim when the msgstr is unchanged', () => {
    const template = [
      '#, fuzzy, python-format',
      'msgid "count: %d"',
      'msgstr "Anzahl: %d"',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'count: %d', value: 'count: %d', translation: 'Anzahl: %d' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('#, fuzzy, python-format');
  });

  it('should keep the fuzzy flag when the unchanged msgstr is wrapped across continuation lines', () => {
    const template = [
      '#, fuzzy',
      'msgid "greeting"',
      'msgstr ""',
      '"Hallo "',
      '"Welt"',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello world', translation: 'Hallo Welt' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('#, fuzzy');
    expect(result).toContain('msgstr "Hallo Welt"');
  });

  it('should keep the fuzzy flag on a plural entry whose forms are carried forward', () => {
    const template = [
      '#, fuzzy',
      'msgid "One file"',
      'msgid_plural "%d files"',
      'msgstr[0] "Un archivo"',
      'msgstr[1] "%d archivos"',
    ].join('\n');

    // A carried-forward entry travels without plural payloads, so the forms
    // in the file are kept and the flag with them.
    const entries: TranslatedEntry[] = [
      { key: 'One file', value: 'One file', translation: 'Un archivo' },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).toContain('#, fuzzy');
    expect(result).toContain('msgstr[0] "Un archivo"');
    expect(result).toContain('msgstr[1] "%d archivos"');
  });

  it('should strip the fuzzy flag from a plural entry rewritten with fresh forms', () => {
    const template = [
      '#, fuzzy',
      'msgid "One file"',
      'msgid_plural "%d files"',
      'msgstr[0] "Un archivo"',
      'msgstr[1] "%d archivos"',
    ].join('\n');

    const entries: TranslatedEntry[] = [
      {
        key: 'One file',
        value: 'One file',
        translation: 'Una ficha',
        metadata: {
          plural_forms: {
            'msgstr[0]': 'Una ficha',
            'msgstr[1]': '%d fichas',
          },
        },
      },
    ];

    const result = parser.reconstruct(template, entries);

    expect(result).not.toContain('fuzzy');
    expect(result).toContain('msgstr[0] "Una ficha"');
    expect(result).toContain('msgstr[1] "%d fichas"');
  });

  it('should write a catalog with no flags byte-identically when nothing changes', () => {
    const template =
      [
        'msgid "greeting"',
        'msgstr "Hallo"',
        '',
        'msgid "farewell"',
        'msgstr "Tschuess"',
      ].join('\n') + '\n';

    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      { key: 'farewell', value: 'Bye', translation: 'Tschuess' },
    ];

    expect(parser.reconstruct(template, entries)).toBe(template);
  });

  it('should use continuation line format for long msgstr with newlines', () => {
    const template = ['msgid "long_message"', 'msgstr ""'].join('\n');

    const longTranslation =
      'First line of the translated message\nSecond line of the translated message\nThird line';

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
    const template = ['msgid "greeting"', 'msgstr ""'].join('\n');

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
    const po =
      '#~ msgid "old"\n#~ msgstr "ancient"\nmsgid "key"\nmsgstr "value"\n';
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
    const po =
      [
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
    const po =
      ['msgid ""', '"Hello "', '"World"', 'msgstr "Hallo Welt"'].join('\n') +
      '\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.value).toBe('Hello World');
  });

  it('should handle continuation for msgctxt', () => {
    const po =
      ['msgctxt ""', '"menu"', 'msgid "file"', 'msgstr "Datei"'].join('\n') +
      '\n';
    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
  });

  it('should handle continuation for msgid_plural', () => {
    const po =
      [
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
    const po =
      ['msgid "greeting"', 'msgstr ""', '"Hallo "', '"Welt"'].join('\n') + '\n';
    const entries = parser.extract(po);
    expect(entries[0]!.value).toBe('greeting');
  });

  it('should handle continuation for msgstr[N]', () => {
    const po =
      [
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
    const po =
      [
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
    const po =
      ['msgctxt "menu"', 'msgid "file"', 'msgstr "File"'].join('\n') + '\n';
    const entries: TranslatedEntry[] = [
      { key: 'menu\x04file', value: 'file', translation: 'Datei' },
    ];
    const result = parser.reconstruct(po, entries);
    expect(result).toContain('Datei');
  });

  it('should reconstruct plural entries', () => {
    const po =
      [
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
    const po =
      ['#, fuzzy', 'msgid "greeting"', 'msgstr "old"'].join('\n') + '\n';
    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'greeting', translation: 'Hallo' },
    ];
    const result = parser.reconstruct(po, entries);
    expect(result).toContain('Hallo');
    expect(result).not.toContain('fuzzy');
  });

  it('should preserve non-fuzzy flags', () => {
    const po =
      ['#, python-format', 'msgid "count: %d"', 'msgstr "Anzahl: %d"'].join(
        '\n'
      ) + '\n';
    const entries: TranslatedEntry[] = [
      { key: 'count: %d', value: 'count: %d', translation: 'Anzahl: %d' },
    ];
    const result = parser.reconstruct(po, entries);
    expect(result).toContain('python-format');
  });
});

// gettext does not require a blank line between entries: msgfmt -c exits 0 on
// every fixture below. Both the reader and the writer treated a blank line as
// the only entry terminator, so a catalog without them collapsed into one
// entry — the key set lost every message but the last, and reconstruct wrote
// one translation into every msgstr it found, the header's included.
describe('PoFormatParser — entries with no blank line between them', () => {
  const parser = new PoFormatParser();

  const HEADER = [
    'msgid ""',
    'msgstr ""',
    '"Project-Id-Version: demo\\n"',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
  ].join('\n');

  function translateAll(content: string): string {
    const entries = parser.extract(content).map((e) => ({
      ...e,
      translation: `[T]${e.value}`,
    }));
    return parser.reconstruct(content, entries);
  }

  it('extracts every entry when nothing separates them', () => {
    const po = [
      HEADER,
      'msgid "Hello"',
      'msgstr "REVIEWED-1"',
      'msgid "Bye"',
      'msgstr "REVIEWED-2"',
      'msgid "Third"',
      'msgstr "REVIEWED-3"',
      '',
    ].join('\n');

    expect(parser.extract(po).map((e) => e.key)).toEqual([
      'Hello',
      'Bye',
      'Third',
    ]);
  });

  it('reads every existing translation out of an unseparated target', () => {
    const po = [
      HEADER,
      'msgid "Hello"',
      'msgstr "REVIEWED-1"',
      'msgid "Bye"',
      'msgstr "REVIEWED-2"',
      '',
    ].join('\n');

    expect([...parser.extractTranslations(po)]).toEqual([
      ['Hello', 'REVIEWED-1'],
      ['Bye', 'REVIEWED-2'],
    ]);
  });

  describe('extractNeedsReview', () => {
    it('names a key whose translation is flagged fuzzy', () => {
      const po = [
        HEADER,
        'msgid "Hello"',
        'msgstr "Hola"',
        '',
        '#, fuzzy',
        'msgid "Good morning"',
        'msgstr "Buenas"',
        '',
      ].join('\n');

      expect([...parser.extractNeedsReview(po)]).toEqual(['Good morning']);
    });

    it('still returns the flagged translation from extractTranslations', () => {
      // A run must carry a reviewer's draft forward, not overwrite it.
      const po = [
        HEADER,
        '#, fuzzy',
        'msgid "Good morning"',
        'msgstr "Buenas"',
        '',
      ].join('\n');

      expect(parser.extractTranslations(po).get('Good morning')).toBe('Buenas');
    });

    it('leaves a fuzzy entry with no translation out, since it is simply missing', () => {
      const po = [
        HEADER,
        '#, fuzzy',
        'msgid "Good morning"',
        'msgstr ""',
        '',
      ].join('\n');

      expect([...parser.extractNeedsReview(po)]).toEqual([]);
    });

    it('keeps a key whose other flags do not mean needs-review', () => {
      const po = [
        HEADER,
        '#, python-format',
        'msgid "Hi %s"',
        'msgstr "Hola %s"',
        '',
      ].join('\n');

      expect([...parser.extractNeedsReview(po)]).toEqual([]);
    });

    it('names a flagged key that carries other flags too', () => {
      const po = [
        HEADER,
        '#, fuzzy, python-format',
        'msgid "Hi %s"',
        'msgstr "Hola %s"',
        '',
      ].join('\n');

      expect([...parser.extractNeedsReview(po)]).toEqual(['Hi %s']);
    });

    it('says nothing about a catalog with no flags at all', () => {
      const po = [HEADER, 'msgid "Hello"', 'msgstr "Hola"', ''].join('\n');

      expect([...parser.extractNeedsReview(po)]).toEqual([]);
    });
  });

  it('keeps the header and its charset when the first message follows it directly', () => {
    const po = [HEADER, 'msgid "Hello"', 'msgstr "REVIEWED"', ''].join('\n');

    const out = translateAll(po);

    expect(out).toContain('"Content-Type: text/plain; charset=UTF-8\\n"');
    expect(out).toContain('"Plural-Forms: nplurals=2; plural=(n != 1);\\n"');
    expect(out).toContain('msgid ""\nmsgstr ""\n');
    expect(out).toContain('msgstr "[T]Hello"');
  });

  it('writes each translation into its own entry rather than the first msgstr it finds', () => {
    const po = [
      HEADER,
      'msgid "Hello"',
      'msgstr "REVIEWED-1"',
      'msgid "Bye"',
      'msgstr "REVIEWED-2"',
      '',
    ].join('\n');

    const out = translateAll(po);

    expect(out).toContain('msgid "Hello"\nmsgstr "[T]Hello"');
    expect(out).toContain('msgid "Bye"\nmsgstr "[T]Bye"');
  });

  it('keeps an unseparated entry that carries its own comments', () => {
    const po = [
      HEADER,
      '#: src/a.js:1',
      'msgid "Hello"',
      'msgstr "REVIEWED-1"',
      '#: src/b.js:2',
      'msgid "Bye"',
      'msgstr "REVIEWED-2"',
      '',
    ].join('\n');

    const out = translateAll(po);

    expect(out).toContain('msgid "Hello"');
    expect(out).toContain('#: src/a.js:1');
    expect(out).toContain('msgstr "[T]Hello"');
    expect(out).toContain('msgstr "[T]Bye"');
  });

  it('keeps the header when an obsolete entry sits between two unseparated messages', () => {
    const po = [
      HEADER,
      'msgid "Hello"',
      'msgstr "REVIEWED-1"',
      '#~ msgid "Gone"',
      '#~ msgstr "Verschwunden"',
      'msgid "Bye"',
      'msgstr "REVIEWED-2"',
      '',
    ].join('\n');

    const out = translateAll(po);

    expect(out).toContain('"Content-Type: text/plain; charset=UTF-8\\n"');
    expect(out).toContain('msgid "Hello"');
    expect(out).toContain('#~ msgid "Gone"');
    expect(out).toContain('msgstr "[T]Bye"');
  });

  it('keeps the header and the plural forms of an unseparated plural entry', () => {
    const po = [
      HEADER,
      'msgid "One item"',
      'msgid_plural "%d items"',
      'msgstr[0] "REVIEWED-S"',
      'msgstr[1] "REVIEWED-P"',
      'msgid "Bye"',
      'msgstr "REVIEWED-2"',
      '',
    ].join('\n');

    expect(parser.extract(po).map((e) => e.key)).toEqual(['One item', 'Bye']);

    const out = translateAll(po);

    expect(out).toContain('"Plural-Forms: nplurals=2; plural=(n != 1);\\n"');
    expect(out).toContain('msgid_plural "%d items"');
    expect(out).toContain('msgstr[0] "REVIEWED-S"');
  });

  // Over-rejection guards: the separated form is the common case and its
  // handling must not change, and a genuine continuation line must still be
  // folded into the field it continues.
  it('leaves a blank-line-separated catalog exactly as it was', () => {
    const po = [
      HEADER,
      '',
      'msgid "Hello"',
      'msgstr "REVIEWED-1"',
      '',
      'msgid "Bye"',
      'msgstr "REVIEWED-2"',
      '',
    ].join('\n');

    expect(parser.extract(po).map((e) => e.key)).toEqual(['Hello', 'Bye']);

    const out = translateAll(po);

    expect(out).toContain('"Content-Type: text/plain; charset=UTF-8\\n"');
    expect(out).toContain('msgid "Hello"\nmsgstr "[T]Hello"');
    expect(out).toContain('msgid "Bye"\nmsgstr "[T]Bye"');
  });

  it('still folds a multi-line msgid and msgstr into one entry', () => {
    const po = [
      'msgid ""',
      '"first "',
      '"second"',
      'msgstr ""',
      '"uno "',
      '"dos"',
      '',
    ].join('\n');

    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe('first second');
    expect([...parser.extractTranslations(po)]).toEqual([
      ['first second', 'uno dos'],
    ]);
  });
});

describe('PoFormatParser — carrying a wrapped plural form forward', () => {
  // gettext writes any msgstr[N] over 74 characters as `msgstr[N] ""` plus
  // continuation lines. A carried plural entry supplies no `plural_forms`
  // metadata, so reconstruct must keep the form the file already holds — but it
  // re-emitted only the FIRST line and swallowed the continuations, leaving
  // `msgstr[N] ""`. The reviewed translation was erased by a run whose only
  // reason to rewrite the entry was a sibling key.
  const LONG_ES =
    'Esta es una traduccion deliberadamente larga para que gettext la envuelva en varias lineas.';

  const CATALOG = [
    'msgid ""',
    'msgstr ""',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
    '',
    'msgid "One %d file"',
    'msgid_plural "%d files"',
    'msgstr[0] "Un archivo"',
    'msgstr[1] ""',
    `"${LONG_ES}"`,
    '',
    'msgid "Hello"',
    'msgstr "Hola"',
    '',
  ].join('\n');

  const parser = new PoFormatParser();

  it('reads the wrapped form as its full value', () => {
    const entries = parser.extract(CATALOG);
    const plural = entries.find((e) => e.key === 'One %d file');
    expect(
      (plural?.metadata?.['plural_forms'] as Record<string, string>)?.[
        'msgstr[1]'
      ]
    ).toBe(LONG_ES);
  });

  it('keeps every continuation line when the entry is carried, not retranslated', () => {
    // The carry shape: the plural entry arrives with its plural_forms stripped
    // (what `withoutPluralForms` produces), so the file's own forms must stand.
    const written = parser.reconstruct(CATALOG, [
      {
        key: 'One %d file',
        value: 'One %d file',
        translation: 'Un archivo',
        metadata: { msgid_plural: '%d files' },
      },
      { key: 'Hello', value: 'Hello', translation: 'Hola' },
    ]);

    expect(written).toContain(LONG_ES);
    const reread = parser.extract(written);
    const plural = reread.find((e) => e.key === 'One %d file');
    expect(
      (plural?.metadata?.['plural_forms'] as Record<string, string>)?.[
        'msgstr[1]'
      ]
    ).toBe(LONG_ES);
  });

  it('still replaces a wrapped form when this run has a new translation for it', () => {
    const fresh = 'Traduccion nueva y tambien bastante larga para envolverse.';
    const written = parser.reconstruct(CATALOG, [
      {
        key: 'One %d file',
        value: 'One %d file',
        translation: 'Un archivo',
        metadata: {
          msgid_plural: '%d files',
          plural_forms: { 'msgstr[0]': 'Un archivo', 'msgstr[1]': fresh },
        },
      },
      { key: 'Hello', value: 'Hello', translation: 'Hola' },
    ]);

    expect(written).toContain(fresh);
    expect(written).not.toContain(LONG_ES);
  });
});

describe('PoFormatParser — carriage returns round-trip', () => {
  // `quote` escapes CR to `\r`, but `unquote` had no `r` case, so reading the
  // file back produced a literal backslash + 'r'. The next run then escaped that
  // backslash, so a carried entry's CR became `\\r` and grew a backslash on
  // every subsequent run. msgfmt cannot flag it: both spellings are valid.
  const parser = new PoFormatParser();
  const HEADER = [
    'msgid ""',
    'msgstr ""',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '',
    '',
  ].join('\n');

  const WITH_CR = HEADER + ['msgid "Hi"', 'msgstr "a\\rb"', ''].join('\n');

  it('decodes an escaped CR back to a carriage return', () => {
    expect(parser.extractTranslations(WITH_CR).get('Hi')).toBe('a\rb');
  });

  it('is idempotent across runs rather than growing a backslash', () => {
    const first = parser.reconstruct(WITH_CR, [
      {
        key: 'Hi',
        value: 'Hi',
        translation: parser.extractTranslations(WITH_CR).get('Hi')!,
      },
    ]);
    expect(first).toContain('msgstr "a\\rb"');

    const second = parser.reconstruct(first, [
      {
        key: 'Hi',
        value: 'Hi',
        translation: parser.extractTranslations(first).get('Hi')!,
      },
    ]);
    expect(second).toBe(first);
    expect(parser.extractTranslations(second).get('Hi')).toBe('a\rb');
  });

  it('still decodes the escapes it already handled', () => {
    const mixed =
      HEADER + ['msgid "K"', 'msgstr "n\\nt\\tq\\"b\\\\end"', ''].join('\n');
    expect(parser.extractTranslations(mixed).get('K')).toBe('n\nt\tq"b\\end');
  });
});
