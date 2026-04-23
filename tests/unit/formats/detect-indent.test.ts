import { detectIndent } from '../../../src/formats/util/detect-indent';
import { JsonFormatParser } from '../../../src/formats/json';
import { ArbFormatParser } from '../../../src/formats/arb';
import { XcstringsFormatParser } from '../../../src/formats/xcstrings';
import { YamlFormatParser } from '../../../src/formats/yaml';
import type { TranslatedEntry } from '../../../src/formats/format';

describe('detectIndent()', () => {
  it('returns 2 as the default when the document has no indentation', () => {
    expect(detectIndent('{"flat":"value"}')).toBe(2);
    expect(detectIndent('')).toBe(2);
  });

  it('returns the space count for space-indented content', () => {
    expect(detectIndent('{\n  "a": 1\n}')).toBe(2);
    expect(detectIndent('{\n    "a": 1\n}')).toBe(4);
  });

  it('returns "\\t" for tab-indented content', () => {
    expect(detectIndent('{\n\t"a": 1\n}')).toBe('\t');
  });
});

describe('detectIndent shared usage', () => {
  it('preserves indentation round-trip in the JSON parser', () => {
    const parser = new JsonFormatParser();
    const original = '{\n    "greeting": "Hello"\n}\n';
    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
    ];
    expect(parser.reconstruct(original, entries)).toBe('{\n    "greeting": "Hallo"\n}\n');
  });

  it('preserves indentation round-trip in the ARB parser', () => {
    const parser = new ArbFormatParser();
    const original = '{\n\t"greeting": "Hello"\n}\n';
    const entries: TranslatedEntry[] = [
      { key: 'greeting', value: 'Hello', translation: 'Hallo' },
    ];
    expect(parser.reconstruct(original, entries)).toBe('{\n\t"greeting": "Hallo"\n}\n');
  });

  it('preserves indentation round-trip in the xcstrings parser', () => {
    const parser = new XcstringsFormatParser();
    const original = JSON.stringify(
      {
        sourceLanguage: 'en',
        version: '1.0',
        strings: {
          hi: { localizations: { en: { stringUnit: { state: 'translated', value: 'Hi' } } } },
        },
      },
      null,
      4,
    );
    const entries: TranslatedEntry[] = [
      { key: 'hi', value: 'Hi', translation: 'Hallo' },
    ];
    const result = parser.reconstruct(original, entries, 'de');
    expect(result).toContain('\n    "sourceLanguage"');
  });

  it('extract → reconstruct stays round-trip for a non-JSON format (YAML)', () => {
    const parser = new YamlFormatParser();
    const original = 'greeting: Hello\nfarewell: Goodbye\n';
    const entries = parser.extract(original);
    const translated: TranslatedEntry[] = entries.map(e => ({ ...e, translation: e.value }));
    const result = parser.reconstruct(original, translated);
    expect(parser.extract(result)).toHaveLength(entries.length);
  });
});
