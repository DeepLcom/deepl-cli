/**
 * Tests that no writer emits a raw C0 control byte into a repo file.
 *
 * A hostile contributor can commit a *valid* locale file carrying an escaped
 * ESC sequence — TOML basic strings and Java `.properties` both decode `\uXXXX`
 * to a raw byte. The key is then `current`, so it is never translated and never
 * screened: the locale translator re-emits the existing target value verbatim
 * and the writer puts the byte back out raw. TOML then refuses its own output,
 * and quietly: `sync` swallows the parse failure as "no existing translations"
 * and `sync status` reports the file 100% complete. Android XML and XLIFF output
 * stops being well-formed XML, which `aapt2` and CAT tools reject. In every case
 * a live terminal-control sequence lands in source control, where `git diff`,
 * `cat`, `less` and CI log viewers render it.
 */

import { TomlFormatParser } from '../../../src/formats/toml';
import { PropertiesFormatParser } from '../../../src/formats/properties';
import { IosStringsFormatParser } from '../../../src/formats/ios-strings';
import { PoFormatParser } from '../../../src/formats/po';
import { AndroidXmlFormatParser } from '../../../src/formats/android-xml';
import { XliffFormatParser } from '../../../src/formats/xliff';
import type { FormatParser } from '../../../src/formats/format';
import { ValidationError } from '../../../src/utils/errors';

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const NUL = String.fromCharCode(0x00);
const DEL = String.fromCharCode(0x7f);
const CR = String.fromCharCode(0x0d);

/** ESC [ 2 J clears the screen when a terminal renders the file. */
const HOSTILE = `Hallo${ESC}[2J${BEL}${NUL}Welt`;

function rawControlBytes(s: string): string[] {
  return [
    ...new Set(
      [...s]
        .filter((c) => {
          const code = c.codePointAt(0)!;
          return code < 0x20 && c !== '\n' && c !== '\t';
        })
        .map((c) => 'U+' + c.codePointAt(0)!.toString(16).padStart(4, '0'))
    ),
  ];
}

const PO_SOURCE = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
  'msgid "Hello"',
  'msgstr ""',
  '',
].join('\n');

const ANDROID_SOURCE = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources>',
  '  <string name="greeting">Hello</string>',
  '</resources>',
  '',
].join('\n');

const XLIFF_SOURCE = [
  '<?xml version="1.0"?>',
  '<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext" original="x">',
  '<body>',
  '<trans-unit id="greeting"><source>Hello</source></trans-unit>',
  '</body></file></xliff>',
  '',
].join('\n');

function writeTranslation(
  parser: FormatParser,
  source: string,
  translation: string
): string {
  const entries = parser.extract(source);
  return parser.reconstruct(
    source,
    entries.map((e) => ({ ...e, translation }))
  );
}

describe('writers that can escape a control character do so', () => {
  const CASES: Array<{
    label: string;
    parser: () => FormatParser;
    source: string;
    /** How the format spells an escaped ESC in its own syntax. */
    expectedEscape: string;
  }> = [
    {
      label: 'TOML',
      parser: () => new TomlFormatParser(),
      source: 'greeting = "Hello"\n',
      expectedEscape: '\\u001b',
    },
    {
      label: 'Java Properties',
      parser: () => new PropertiesFormatParser(),
      source: 'greeting=Hello\n',
      expectedEscape: '\\u001b',
    },
    {
      label: 'iOS Strings',
      parser: () => new IosStringsFormatParser(),
      source: '"greeting" = "Hello";\n',
      expectedEscape: '\\U001b',
    },
  ];

  describe.each(CASES)('$label', ({ parser, source, expectedEscape }) => {
    it('should write no raw control byte', () => {
      const out = writeTranslation(parser(), source, HOSTILE);

      expect(rawControlBytes(out)).toEqual([]);
      expect(out).toContain(expectedEscape);
    });

    it('should read the escaped value back unchanged', () => {
      const p = parser();
      const out = writeTranslation(p, source, HOSTILE);

      expect(p.extract(out)[0]!.value).toBe(HOSTILE);
    });

    it('should leave an ordinary translation alone', () => {
      const out = writeTranslation(parser(), source, 'Hallo Welt');

      expect(out).toContain('Hallo Welt');
    });
  });

  it('TOML should also escape U+007F, which its own parser rejects raw', () => {
    const parser = new TomlFormatParser();
    const out = writeTranslation(parser, 'greeting = "Hello"\n', `a${DEL}b`);

    expect(out).not.toContain(DEL);
    expect(out).toContain('\\u007f');
    expect(parser.extract(out)[0]!.value).toBe(`a${DEL}b`);
  });

  it('TOML should not emit a literal string it cannot escape into', () => {
    const parser = new TomlFormatParser();
    const out = writeTranslation(parser, "greeting = 'Hello'\n", HOSTILE);

    expect(rawControlBytes(out)).toEqual([]);
    expect(parser.extract(out)[0]!.value).toBe(HOSTILE);
  });

  it('PO should escape a carriage return rather than write it raw', () => {
    const parser = new PoFormatParser();
    const out = writeTranslation(parser, PO_SOURCE, `Hallo${CR}Welt`);

    expect(out).toContain('\\r');
    expect(rawControlBytes(out)).toEqual([]);
  });
});

describe('writers that cannot escape a control character refuse the value', () => {
  const CASES: Array<{
    label: string;
    parser: () => FormatParser;
    source: string;
  }> = [
    { label: 'PO', parser: () => new PoFormatParser(), source: PO_SOURCE },
    {
      label: 'Android XML',
      parser: () => new AndroidXmlFormatParser(),
      source: ANDROID_SOURCE,
    },
    {
      label: 'XLIFF',
      parser: () => new XliffFormatParser(),
      source: XLIFF_SOURCE,
    },
  ];

  describe.each(CASES)('$label', ({ parser, source }) => {
    it('should throw ValidationError rather than write the byte', () => {
      expect(() => writeTranslation(parser(), source, HOSTILE)).toThrow(
        ValidationError
      );
    });

    it('should name the codepoint, which prints as nothing', () => {
      expect(() => writeTranslation(parser(), source, HOSTILE)).toThrow(
        /U\+001B/
      );
    });

    it('should name the key so the offending string can be found', () => {
      expect(() => writeTranslation(parser(), source, HOSTILE)).toThrow(
        /greeting|Hello/
      );
    });

    it('should leave an ordinary translation alone', () => {
      const out = writeTranslation(parser(), source, 'Hallo Welt');

      expect(out).toContain('Hallo Welt');
      expect(rawControlBytes(out)).toEqual([]);
    });
  });

  it('Android XML should refuse the byte inside a CDATA value too', () => {
    const source = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<resources>',
      '  <string name="greeting"><![CDATA[Hello]]></string>',
      '</resources>',
      '',
    ].join('\n');

    expect(() =>
      writeTranslation(new AndroidXmlFormatParser(), source, HOSTILE)
    ).toThrow(ValidationError);
  });
});
