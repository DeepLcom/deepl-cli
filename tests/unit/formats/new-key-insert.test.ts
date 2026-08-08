/**
 * Tests that `reconstruct` writes an entry the template has no slot for.
 *
 * On the first sync there is no target file, so the SOURCE is the template and
 * every key already has a slot. From the second run onwards the target file is
 * the template — which is how the existing translations survive — and a key
 * added to the source since has no slot in it. A parser that only rewrites the
 * slots it finds drops that entry, and `sync` has no way to tell: it records the
 * key as translated, so `status` reports the locale complete, `--frozen` passes,
 * and no later run revisits the string.
 *
 * The contract is therefore the same for all eleven formats regardless of how
 * each one writes: every entry handed to `reconstruct` is readable back out.
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
import type {
  FormatParser,
  TranslatedEntry,
} from '../../../src/formats/format';

const PO_TARGET = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
  'msgid "Hello"',
  'msgstr "Hola"',
  '',
].join('\n');

const XLIFF_12_TARGET = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
  '  <file source-language="en" target-language="es" datatype="plaintext" original="app">',
  '    <body>',
  '      <trans-unit id="greeting">',
  '        <source>Hello</source>',
  '        <target>Hola</target>',
  '      </trans-unit>',
  '    </body>',
  '  </file>',
  '</xliff>',
  '',
].join('\n');

const XLIFF_20_TARGET = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<xliff version="2.0" srcLang="en" trgLang="es" xmlns="urn:oasis:names:tc:xliff:document:2.0">',
  '  <file id="f1">',
  '    <unit id="greeting">',
  '      <segment>',
  '        <source>Hello</source>',
  '        <target>Hola</target>',
  '      </segment>',
  '    </unit>',
  '  </file>',
  '</xliff>',
  '',
].join('\n');

const ANDROID_TARGET = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources>',
  '    <string name="greeting">Hola</string>',
  '</resources>',
  '',
].join('\n');

const xcstringsTarget = (): string =>
  JSON.stringify(
    {
      sourceLanguage: 'en',
      version: '1.0',
      strings: {
        greeting: {
          localizations: {
            es: { stringUnit: { state: 'translated', value: 'Hola' } },
          },
        },
      },
    },
    null,
    2
  ) + '\n';

/** The translations a file holds, read the way `sync` reads a target file. */
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

function extractKeys(
  parser: FormatParser,
  content: string,
  locale?: string
): string[] {
  const entries = parser.multiLocale
    ? parser.extract(content, locale)
    : parser.extract(content);
  return entries.map((e) => e.key);
}

function write(
  parser: FormatParser,
  content: string,
  entries: TranslatedEntry[],
  locale?: string
): string {
  return parser.multiLocale
    ? parser.reconstruct(content, entries, locale)
    : parser.reconstruct(content, entries);
}

interface InsertCase {
  label: string;
  parser: () => FormatParser;
  /** A target-locale file holding `existingKey` already translated. */
  target: string;
  existingKey: string;
  existingTranslation: string;
  /** A key added to the source file after the target was written. */
  newKey: string;
  newSource: string;
  newTranslation: string;
  locale?: string;
}

const CASES: InsertCase[] = [
  {
    label: 'JSON',
    parser: () => new JsonFormatParser(),
    target: '{\n  "greeting": "Hola"\n}\n',
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'YAML',
    parser: () => new YamlFormatParser(),
    target: 'greeting: Hola\n',
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'TOML',
    parser: () => new TomlFormatParser(),
    target: 'greeting = "Hola"\n',
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'ARB',
    parser: () => new ArbFormatParser(),
    target: '{\n  "greeting": "Hola"\n}\n',
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'xcstrings',
    parser: () => new XcstringsFormatParser(),
    target: xcstringsTarget(),
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
    locale: 'es',
  },
  {
    label: 'PO',
    parser: () => new PoFormatParser(),
    target: PO_TARGET,
    existingKey: 'Hello',
    existingTranslation: 'Hola',
    newKey: 'Translate me',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'Java Properties',
    parser: () => new PropertiesFormatParser(),
    target: 'greeting=Hola\n',
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'iOS .strings',
    parser: () => new IosStringsFormatParser(),
    target: '"greeting" = "Hola";\n',
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'Laravel PHP',
    parser: () => new PhpArraysFormatParser(),
    target: "<?php\n\nreturn [\n    'greeting' => 'Hola',\n];\n",
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'Android XML',
    parser: () => new AndroidXmlFormatParser(),
    target: ANDROID_TARGET,
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'XLIFF 1.2',
    parser: () => new XliffFormatParser(),
    target: XLIFF_12_TARGET,
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
  {
    label: 'XLIFF 2.0',
    parser: () => new XliffFormatParser(),
    target: XLIFF_20_TARGET,
    existingKey: 'greeting',
    existingTranslation: 'Hola',
    newKey: 'added',
    newSource: 'Translate me',
    newTranslation: 'Traduceme',
  },
];

describe('reconstruct with an entry the template has no slot for', () => {
  describe.each(CASES)(
    '$label',
    ({
      parser: makeParser,
      target,
      existingKey,
      existingTranslation,
      newKey,
      newSource,
      newTranslation,
      locale,
    }) => {
      const allEntries = (): TranslatedEntry[] => [
        {
          key: existingKey,
          value: 'Hello',
          translation: existingTranslation,
        },
        { key: newKey, value: newSource, translation: newTranslation },
      ];

      it('should write the new key into the target file', () => {
        const parser = makeParser();
        const out = write(parser, target, allEntries(), locale);

        expect(extractKeys(parser, out, locale)).toContain(newKey);
        expect(readTranslations(parser, out, locale).get(newKey)).toBe(
          newTranslation
        );
      });

      it('should keep the translation the target file already held', () => {
        const parser = makeParser();
        const out = write(parser, target, allEntries(), locale);

        expect(readTranslations(parser, out, locale).get(existingKey)).toBe(
          existingTranslation
        );
      });

      it('should not duplicate the new key on a second write', () => {
        const parser = makeParser();
        const once = write(parser, target, allEntries(), locale);
        const twice = write(parser, once, allEntries(), locale);

        const keys = extractKeys(parser, twice, locale);
        expect(keys.filter((k) => k === newKey)).toHaveLength(1);
        expect(keys.filter((k) => k === existingKey)).toHaveLength(1);
        expect(
          readTranslations(parser, twice, locale).get(newTranslation)
        ).toBe(undefined);
      });

      it('should not invent a key no entry asked for', () => {
        const parser = makeParser();
        const out = write(
          parser,
          target,
          [{ key: existingKey, value: 'Hello', translation: 'Cambiado' }],
          locale
        );

        expect(extractKeys(parser, out, locale)).not.toContain(newKey);
      });
    }
  );
});
