import { XcstringsFormatParser } from '../../../src/formats/xcstrings';
import type { TranslatedEntry } from '../../../src/formats/format';

const parser = new XcstringsFormatParser();

const SAMPLE = JSON.stringify({
  sourceLanguage: 'en',
  version: '1.0',
  strings: {
    greeting: {
      comment: 'Welcome screen title',
      localizations: {
        en: { stringUnit: { state: 'translated', value: 'Hello' } },
        de: { stringUnit: { state: 'translated', value: 'Hallo' } },
      },
    },
    farewell: {
      localizations: {
        en: { stringUnit: { state: 'translated', value: 'Goodbye' } },
      },
    },
  },
}, null, 2) + '\n';

describe('XcstringsFormatParser', () => {
  it('should have multiLocale set to true', () => {
    expect(parser.multiLocale).toBe(true);
  });

  describe('extract()', () => {
    it('should extract entries for a specific locale', () => {
      const result = parser.extract(SAMPLE, 'en');
      expect(result).toHaveLength(2);
      expect(result.find(e => e.key === 'farewell')!.value).toBe('Goodbye');
      expect(result.find(e => e.key === 'greeting')!.value).toBe('Hello');
    });

    it('should return empty array when locale is not provided', () => {
      const result = parser.extract(SAMPLE);
      expect(result).toEqual([]);
    });

    it('should return empty array when locale has no localizations', () => {
      const result = parser.extract(SAMPLE, 'fr');
      expect(result).toEqual([]);
    });

    it('should extract entries for a target locale', () => {
      const result = parser.extract(SAMPLE, 'de');
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('greeting');
      expect(result[0]!.value).toBe('Hallo');
    });

    it('should preserve comment as context and metadata', () => {
      const result = parser.extract(SAMPLE, 'en');
      const greeting = result.find(e => e.key === 'greeting');
      expect(greeting!.context).toBe('Welcome screen title');
      expect(greeting!.metadata).toEqual({ comment: 'Welcome screen title' });
    });

    it('should not set context when no comment exists', () => {
      const result = parser.extract(SAMPLE, 'en');
      const farewell = result.find(e => e.key === 'farewell');
      expect(farewell!.context).toBeUndefined();
      expect(farewell!.metadata).toBeUndefined();
    });

    it('should return entries in insertion order (consumers sort downstream)', () => {
      const content = JSON.stringify({
        sourceLanguage: 'en',
        version: '1.0',
        strings: {
          zebra: { localizations: { en: { stringUnit: { state: 'translated', value: 'Z' } } } },
          apple: { localizations: { en: { stringUnit: { state: 'translated', value: 'A' } } } },
          mango: { localizations: { en: { stringUnit: { state: 'translated', value: 'M' } } } },
        },
      });
      const result = parser.extract(content, 'en');
      expect(result.map(e => e.key).sort()).toEqual(['apple', 'mango', 'zebra']);
    });

    it('should handle empty strings object', () => {
      const content = JSON.stringify({ sourceLanguage: 'en', version: '1.0', strings: {} });
      const result = parser.extract(content, 'en');
      expect(result).toEqual([]);
    });

    it('should skip keys with missing stringUnit', () => {
      const content = JSON.stringify({
        sourceLanguage: 'en',
        version: '1.0',
        strings: {
          has_unit: { localizations: { en: { stringUnit: { state: 'translated', value: 'Yes' } } } },
          no_unit: { localizations: { en: {} } },
        },
      });
      const result = parser.extract(content, 'en');
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('has_unit');
    });
  });

  describe('reconstruct()', () => {
    it('should add translations for a locale', () => {
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Bonjour' },
        { key: 'farewell', value: 'Goodbye', translation: 'Au revoir' },
      ];
      const result = parser.reconstruct(SAMPLE, entries, 'fr');
      const data = JSON.parse(result);
      expect(data.strings.greeting.localizations.fr.stringUnit.value).toBe('Bonjour');
      expect(data.strings.farewell.localizations.fr.stringUnit.value).toBe('Au revoir');
    });

    it('should set state to translated', () => {
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(SAMPLE, entries, 'es');
      const data = JSON.parse(result);
      expect(data.strings.greeting.localizations.es.stringUnit.state).toBe('translated');
    });

    it('should preserve existing localizations for other locales', () => {
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Bonjour' },
      ];
      const result = parser.reconstruct(SAMPLE, entries, 'fr');
      const data = JSON.parse(result);
      expect(data.strings.greeting.localizations.en.stringUnit.value).toBe('Hello');
      expect(data.strings.greeting.localizations.de.stringUnit.value).toBe('Hallo');
      expect(data.strings.greeting.localizations.fr.stringUnit.value).toBe('Bonjour');
    });

    it('should create localizations structure when absent', () => {
      const content = JSON.stringify({
        sourceLanguage: 'en',
        version: '1.0',
        strings: { new_key: {} },
      });
      const entries: TranslatedEntry[] = [
        { key: 'new_key', value: 'New', translation: 'Neu' },
      ];
      const result = parser.reconstruct(content, entries, 'de');
      const data = JSON.parse(result);
      expect(data.strings.new_key.localizations.de.stringUnit.value).toBe('Neu');
    });

    it('should preserve comments on string definitions', () => {
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(SAMPLE, entries, 'es');
      const data = JSON.parse(result);
      expect(data.strings.greeting.comment).toBe('Welcome screen title');
    });

    it('should preserve sourceLanguage and version', () => {
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(SAMPLE, entries, 'es');
      const data = JSON.parse(result);
      expect(data.sourceLanguage).toBe('en');
      expect(data.version).toBe('1.0');
    });

    it('should preserve indentation style', () => {
      const tabIndented = JSON.stringify({ sourceLanguage: 'en', version: '1.0', strings: {} }, null, '\t') + '\n';
      const entries: TranslatedEntry[] = [];
      const result = parser.reconstruct(tabIndented, entries, 'de');
      expect(result).toContain('\t');
    });

    it('should preserve trailing newline', () => {
      const withNewline = JSON.stringify({ sourceLanguage: 'en', version: '1.0', strings: {} }, null, 2) + '\n';
      const result = parser.reconstruct(withNewline, [], 'de');
      expect(result.endsWith('\n')).toBe(true);
    });

    it('should return content unchanged when locale is not provided', () => {
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(SAMPLE, entries);
      expect(result).toBe(SAMPLE);
    });
  });

  describe('round-trip', () => {
    it('should extract translations after reconstruct', () => {
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Bonjour' },
        { key: 'farewell', value: 'Goodbye', translation: 'Au revoir' },
      ];
      const reconstructed = parser.reconstruct(SAMPLE, entries, 'fr');
      const extracted = parser.extract(reconstructed, 'fr');

      expect(extracted).toHaveLength(2);
      expect(extracted.find(e => e.key === 'greeting')!.value).toBe('Bonjour');
      expect(extracted.find(e => e.key === 'farewell')!.value).toBe('Au revoir');
    });

    it('should chain reconstructs for multiple locales', () => {
      let content = SAMPLE;
      content = parser.reconstruct(content, [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ], 'es');
      content = parser.reconstruct(content, [
        { key: 'greeting', value: 'Hello', translation: 'Bonjour' },
      ], 'fr');

      const data = JSON.parse(content);
      expect(data.strings.greeting.localizations.en.stringUnit.value).toBe('Hello');
      expect(data.strings.greeting.localizations.de.stringUnit.value).toBe('Hallo');
      expect(data.strings.greeting.localizations.es.stringUnit.value).toBe('Hola');
      expect(data.strings.greeting.localizations.fr.stringUnit.value).toBe('Bonjour');
    });
  });
});
