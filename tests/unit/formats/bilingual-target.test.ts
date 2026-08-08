/**
 * Tests that reading a target file's translations never yields the source text.
 *
 * Most formats are monolingual: a target file holds only the translation, so
 * `extract(...).value` on a target read IS the translation. PO and XLIFF are
 * bilingual — one file carries both sides — and report the SOURCE as `value`
 * even when the file is a target. Callers that need the translation therefore
 * have to go through `extractTranslations`, and every format has to agree on
 * what "the translation this file holds" means: the value a reviewer would see,
 * with an untranslated key absent from the map rather than mapped to the source
 * or to the empty string.
 */

import { AndroidXmlFormatParser } from '../../../src/formats/android-xml';
import { ArbFormatParser } from '../../../src/formats/arb';
import { IosStringsFormatParser } from '../../../src/formats/ios-strings';
import { JsonFormatParser } from '../../../src/formats/json';
import { PhpArraysFormatParser } from '../../../src/formats/php-arrays';
import { PoFormatParser } from '../../../src/formats/po';
import { PropertiesFormatParser } from '../../../src/formats/properties';
import { TomlFormatParser } from '../../../src/formats/toml';
import { XcstringsFormatParser } from '../../../src/formats/xcstrings';
import { XliffFormatParser } from '../../../src/formats/xliff';
import { YamlFormatParser } from '../../../src/formats/yaml';
import type { FormatParser } from '../../../src/formats/format';

const PO_SOURCE = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
  'msgid "Hello"',
  'msgstr ""',
  '',
].join('\n');

const XLIFF_12_SOURCE = [
  '<?xml version="1.0"?>',
  '<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext" original="x">',
  '<body>',
  '<trans-unit id="greeting"><source>Hello</source></trans-unit>',
  '</body></file></xliff>',
  '',
].join('\n');

const XLIFF_20_SOURCE = [
  '<?xml version="1.0"?>',
  '<xliff version="2.0" srcLang="en" trgLang="de"><file id="f1">',
  '<unit id="greeting"><segment><source>Hello</source></segment></unit>',
  '</file></xliff>',
  '',
].join('\n');

const XCSTRINGS_SOURCE =
  JSON.stringify(
    {
      sourceLanguage: 'en',
      version: '1.0',
      strings: {
        greeting: {
          localizations: {
            en: { stringUnit: { state: 'translated', value: 'Hello' } },
          },
        },
      },
    },
    null,
    2
  ) + '\n';

/**
 * The contract every caller relies on, spelled out with the parser surface
 * alone: a parser that overrides the read owns it, and the rest report `value`.
 */
function readTranslations(
  parser: FormatParser,
  content: string,
  locale?: string
): Map<string, string> {
  if (parser.extractTranslations) {
    return parser.extractTranslations(
      content,
      parser.multiLocale ? locale : undefined
    );
  }
  const entries = parser.multiLocale
    ? parser.extract(content, locale)
    : parser.extract(content);
  return new Map(entries.map((e) => [e.key, e.value]));
}

describe('reading the translations a target file holds', () => {
  const CASES: Array<{
    label: string;
    parser: () => FormatParser;
    /** A source-locale file holding one key whose source text is "Hello". */
    source: string;
    key: string;
    locale?: string;
  }> = [
    {
      label: 'JSON',
      parser: () => new JsonFormatParser(),
      source: '{\n  "greeting": "Hello"\n}\n',
      key: 'greeting',
    },
    {
      label: 'YAML',
      parser: () => new YamlFormatParser(),
      source: 'greeting: Hello\n',
      key: 'greeting',
    },
    {
      label: 'Java Properties',
      parser: () => new PropertiesFormatParser(),
      source: 'greeting=Hello\n',
      key: 'greeting',
    },
    {
      label: 'TOML',
      parser: () => new TomlFormatParser(),
      source: 'greeting = "Hello"\n',
      key: 'greeting',
    },
    {
      label: 'iOS Strings',
      parser: () => new IosStringsFormatParser(),
      source: '"greeting" = "Hello";\n',
      key: 'greeting',
    },
    {
      label: 'Android XML',
      parser: () => new AndroidXmlFormatParser(),
      source: [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<resources>',
        '  <string name="greeting">Hello</string>',
        '</resources>',
        '',
      ].join('\n'),
      key: 'greeting',
    },
    {
      label: 'Laravel PHP',
      parser: () => new PhpArraysFormatParser(),
      source: "<?php\nreturn [\n    'greeting' => 'Hello',\n];\n",
      key: 'greeting',
    },
    {
      label: 'ARB',
      parser: () => new ArbFormatParser(),
      source: '{\n  "greeting": "Hello"\n}\n',
      key: 'greeting',
    },
    {
      label: 'PO',
      parser: () => new PoFormatParser(),
      source: PO_SOURCE,
      key: 'Hello',
    },
    {
      label: 'XLIFF 1.2',
      parser: () => new XliffFormatParser(),
      source: XLIFF_12_SOURCE,
      key: 'greeting',
    },
    {
      label: 'XLIFF 2.0',
      parser: () => new XliffFormatParser(),
      source: XLIFF_20_SOURCE,
      key: 'greeting',
    },
    {
      label: 'xcstrings',
      parser: () => new XcstringsFormatParser(),
      source: XCSTRINGS_SOURCE,
      key: 'greeting',
      locale: 'de',
    },
  ];

  describe.each(CASES)('$label', ({ parser, source, key, locale }) => {
    /** The target file a first sync produces from `source`. */
    function writeTarget(p: FormatParser, translation: string): string {
      const entries = p.multiLocale
        ? p.extract(source, 'en')
        : p.extract(source);
      return p.reconstruct(
        source,
        entries.map((e) => ({ ...e, translation })),
        locale
      );
    }

    it('should report the translation the file holds, not the source text', () => {
      const p = parser();
      const target = writeTarget(p, 'Hallo');

      expect(readTranslations(p, target, locale).get(key)).toBe('Hallo');
    });

    it('should report a hand-edited translation verbatim', () => {
      const p = parser();
      const target = writeTarget(p, 'REVIEWED');

      expect(readTranslations(p, target, locale).get(key)).toBe('REVIEWED');
    });
  });
});

describe('PoFormatParser.extractTranslations', () => {
  const parser = new PoFormatParser();

  it('should return the msgstr, never the msgid', () => {
    const target = [
      PO_SOURCE.trimEnd(),
      '',
      'msgid "Goodbye"',
      'msgstr "Adios"',
      '',
    ].join('\n');

    const map = parser.extractTranslations(target);

    expect(map.get('Goodbye')).toBe('Adios');
    expect([...map.values()]).not.toContain('Goodbye');
  });

  it('should omit a key whose msgstr is empty rather than report the msgid', () => {
    const map = parser.extractTranslations(PO_SOURCE);

    expect(map.has('Hello')).toBe(false);
  });

  it('should key a msgctxt entry the way extract keys it', () => {
    const target = [
      'msgctxt "menu"',
      'msgid "Save"',
      'msgstr "Guardar"',
      '',
    ].join('\n');

    const extractedKey = parser.extract(target)[0]!.key;

    expect(parser.extractTranslations(target).get(extractedKey)).toBe(
      'Guardar'
    );
  });

  it('should skip the header entry', () => {
    const map = parser.extractTranslations(PO_SOURCE);

    expect(map.has('')).toBe(false);
  });

  it('should report a plural entry as translated so it is not re-translated', () => {
    const target = [
      'msgid "One file"',
      'msgid_plural "%d files"',
      'msgstr[0] "Un archivo"',
      'msgstr[1] "%d archivos"',
      '',
    ].join('\n');

    const map = parser.extractTranslations(target);

    expect(map.get('One file')).toBe('Un archivo');
  });

  it('should omit a plural entry whose forms are all empty', () => {
    const target = [
      'msgid "One file"',
      'msgid_plural "%d files"',
      'msgstr[0] ""',
      'msgstr[1] ""',
      '',
    ].join('\n');

    expect(parser.extractTranslations(target).has('One file')).toBe(false);
  });

  it('should return an empty map for empty content', () => {
    expect(parser.extractTranslations('').size).toBe(0);
  });
});

describe('XliffFormatParser.extractTranslations', () => {
  const parser = new XliffFormatParser();

  it('should return the target element, never the source element (1.2)', () => {
    const target = XLIFF_12_SOURCE.replace(
      '<source>Hello</source>',
      '<source>Hello</source><target>Hola</target>'
    );

    const map = parser.extractTranslations(target);

    expect(map.get('greeting')).toBe('Hola');
    expect([...map.values()]).not.toContain('Hello');
  });

  it('should return the target element from inside a segment (2.0)', () => {
    const target = XLIFF_20_SOURCE.replace(
      '<source>Hello</source>',
      '<source>Hello</source><target>Hola</target>'
    );

    expect(parser.extractTranslations(target).get('greeting')).toBe('Hola');
  });

  it('should omit a unit with no target element', () => {
    expect(parser.extractTranslations(XLIFF_12_SOURCE).has('greeting')).toBe(
      false
    );
    expect(parser.extractTranslations(XLIFF_20_SOURCE).has('greeting')).toBe(
      false
    );
  });

  it('should omit a unit whose target element is empty', () => {
    const target = XLIFF_12_SOURCE.replace(
      '<source>Hello</source>',
      '<source>Hello</source><target></target>'
    );

    expect(parser.extractTranslations(target).has('greeting')).toBe(false);
  });

  it('should preserve a target that carries a state attribute', () => {
    const target = XLIFF_12_SOURCE.replace(
      '<source>Hello</source>',
      '<source>Hello</source><target state="translated">Hola</target>'
    );

    expect(parser.extractTranslations(target).get('greeting')).toBe('Hola');
  });

  it('should decode entities in the target text', () => {
    const target = XLIFF_12_SOURCE.replace(
      '<source>Hello</source>',
      '<source>Hello</source><target>Tom &amp; Jerry</target>'
    );

    expect(parser.extractTranslations(target).get('greeting')).toBe(
      'Tom & Jerry'
    );
  });
});

describe('monolingual parsers leave the read alone', () => {
  const MONOLINGUAL: Array<[string, FormatParser]> = [
    ['JSON', new JsonFormatParser()],
    ['YAML', new YamlFormatParser()],
    ['Java Properties', new PropertiesFormatParser()],
    ['TOML', new TomlFormatParser()],
    ['iOS Strings', new IosStringsFormatParser()],
    ['Android XML', new AndroidXmlFormatParser()],
    ['Laravel PHP', new PhpArraysFormatParser()],
    ['ARB', new ArbFormatParser()],
    ['xcstrings', new XcstringsFormatParser()],
  ];

  it.each(MONOLINGUAL)(
    '%s should not override extractTranslations',
    (_label, parser) => {
      expect(parser.extractTranslations).toBeUndefined();
    }
  );
});
