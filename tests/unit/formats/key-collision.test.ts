/**
 * Tests that a parser refuses a file whose strings cannot be given distinct
 * keys, instead of rewriting it.
 *
 * Four parsers encode hierarchy in-band: PO joins msgctxt and msgid with
 * U+0004, YAML joins path segments with U+0000, JSON / Laravel PHP / Android XML
 * join with '.'. A key component holding the separator therefore resolves to the
 * same key as an unrelated entry, and reconstruct writes one string's
 * translation into the other's slot — invisibly, for the two control bytes.
 */

import { PoFormatParser } from '../../../src/formats/po';
import { YamlFormatParser } from '../../../src/formats/yaml';
import { JsonFormatParser } from '../../../src/formats/json';
import { PhpArraysFormatParser } from '../../../src/formats/php-arrays';
import { AndroidXmlFormatParser } from '../../../src/formats/android-xml';
import { PropertiesFormatParser } from '../../../src/formats/properties';
import { XliffFormatParser } from '../../../src/formats/xliff';
import {
  FormatKeyCollisionError,
  type TranslatedEntry,
} from '../../../src/formats/format';

const EOT = '\u0004';
const NUL = '\u0000';

const PO_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
].join('\n');

describe('PO msgctxt separator smuggled into a msgid', () => {
  const parser = new PoFormatParser();

  it('should refuse a msgid holding the U+0004 context separator', () => {
    const po = [PO_HEADER, `msgid "menu${EOT}Save"`, 'msgstr ""', ''].join(
      '\n'
    );

    expect(() => parser.extract(po)).toThrow(FormatKeyCollisionError);
  });

  it('should refuse a msgctxt holding the U+0004 context separator', () => {
    const po = [
      PO_HEADER,
      `msgctxt "menu${EOT}extra"`,
      'msgid "Save"',
      'msgstr ""',
      '',
    ].join('\n');

    expect(() => parser.extract(po)).toThrow(FormatKeyCollisionError);
  });

  it('should name the offending codepoint so an invisible byte is actionable', () => {
    const po = [PO_HEADER, `msgid "menu${EOT}Save"`, 'msgstr ""', ''].join(
      '\n'
    );

    expect(() => parser.extract(po)).toThrow(/U\+0004/);
  });

  it('should refuse the same byte in an existing target catalog on reconstruct', () => {
    const target = [PO_HEADER, `msgid "menu${EOT}Save"`, 'msgstr "x"', ''].join(
      '\n'
    );
    const entries: TranslatedEntry[] = [
      { key: 'Save', value: 'Save', translation: 'Speichern' },
    ];

    expect(() => parser.reconstruct(target, entries)).toThrow(
      FormatKeyCollisionError
    );
  });

  it('should still accept a legitimate msgctxt/msgid pair', () => {
    const po = [
      PO_HEADER,
      'msgctxt "menu"',
      'msgid "Save"',
      'msgstr ""',
      '',
    ].join('\n');

    const entries = parser.extract(po);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe(`menu${EOT}Save`);
  });
});

describe('YAML path separator smuggled into a key', () => {
  const parser = new YamlFormatParser();

  it('should refuse a key holding the U+0000 path separator', () => {
    expect(() => parser.extract(`? "a\\0b"\n: Save\n`)).toThrow(
      FormatKeyCollisionError
    );
  });

  it('should name the offending codepoint', () => {
    expect(() => parser.extract(`? "a\\0b"\n: Save\n`)).toThrow(/U\+0000/);
  });

  it('should refuse the same byte in an existing target file on reconstruct', () => {
    const entries: TranslatedEntry[] = [
      { key: 'other', value: 'Other', translation: 'Andere' },
    ];

    expect(() =>
      parser.reconstruct(`? "a\\0b"\n: Save\nother: Other\n`, entries)
    ).toThrow(FormatKeyCollisionError);
  });

  it('should still accept a nested mapping', () => {
    const entries = parser.extract('a:\n  b: Save\n');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe(`a${NUL}b`);
  });
});

describe('dotted-path parsers refuse a key that collides with a nested path', () => {
  it('JSON should refuse a flat dotted key shadowing a nested path', () => {
    const json = JSON.stringify({ 'a.b': 'FLAT', a: { b: 'NESTED' } }, null, 2);

    expect(() => new JsonFormatParser().extract(json)).toThrow(
      FormatKeyCollisionError
    );
  });

  it('Laravel PHP should refuse a flat dotted key shadowing a nested path', () => {
    const php =
      "<?php\nreturn [\n  'a.b' => 'FLAT',\n  'a' => [\n    'b' => 'NESTED',\n  ],\n];\n";

    expect(() => new PhpArraysFormatParser().extract(php)).toThrow(
      FormatKeyCollisionError
    );
  });

  it('Android XML should refuse a string name colliding with a string-array index', () => {
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<resources>',
      '  <string name="items.0">FLAT</string>',
      '  <string-array name="items">',
      '    <item>NESTED</item>',
      '  </string-array>',
      '</resources>',
      '',
    ].join('\n');

    expect(() => new AndroidXmlFormatParser().extract(xml)).toThrow(
      FormatKeyCollisionError
    );
  });

  it('should report the colliding key so the user knows which to rename', () => {
    const json = JSON.stringify({ 'a.b': 'FLAT', a: { b: 'NESTED' } }, null, 2);

    expect(() => new JsonFormatParser().extract(json)).toThrow(/'a\.b'/);
  });

  it('JSON should still accept a flat dotted key with no nested counterpart', () => {
    const json = JSON.stringify({ 'a.b': 'FLAT', c: 'OTHER' }, null, 2);

    const entries = new JsonFormatParser().extract(json);
    expect(entries.map((e) => e.key)).toEqual(['a.b', 'c']);
  });

  it('Android XML should still accept string-array indices', () => {
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<resources>',
      '  <string-array name="items">',
      '    <item>one</item>',
      '    <item>two</item>',
      '  </string-array>',
      '</resources>',
      '',
    ].join('\n');

    const entries = new AndroidXmlFormatParser().extract(xml);
    expect(entries.map((e) => e.key)).toEqual(['items.0', 'items.1']);
  });
});

describe('formats that permit a literal repeated key are left alone', () => {
  it('.properties should keep extracting a legally repeated key', () => {
    const entries = new PropertiesFormatParser().extract('a=one\na=two\n');
    expect(entries.map((e) => e.key)).toEqual(['a', 'a']);
  });

  it('XLIFF should keep extracting a repeated trans-unit id', () => {
    const xliff = [
      '<?xml version="1.0"?>',
      '<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext" original="x">',
      '<body>',
      '<trans-unit id="a"><source>one</source></trans-unit>',
      '<trans-unit id="a"><source>two</source></trans-unit>',
      '</body></file></xliff>',
      '',
    ].join('\n');

    const entries = new XliffFormatParser().extract(xliff);
    expect(entries.map((e) => e.key)).toEqual(['a', 'a']);
  });
});
