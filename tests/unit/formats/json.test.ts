import { JsonFormatParser } from '../../../src/formats/json';
import type { TranslatedEntry } from '../../../src/formats/format';

const parser = new JsonFormatParser();

describe('JsonFormatParser', () => {
  describe('extract()', () => {
    it('should extract flat key-value pairs', () => {
      const result = parser.extract('{"greeting":"Hello","farewell":"Goodbye"}');
      expect(result).toHaveLength(2);
      expect(result.find(e => e.key === 'farewell')!.value).toBe('Goodbye');
      expect(result.find(e => e.key === 'greeting')!.value).toBe('Hello');
    });

    it('should extract nested objects with dot-path keys', () => {
      const result = parser.extract('{"nav":{"home":"Home","about":"About"}}');
      expect(result).toHaveLength(2);
      expect(result.map(e => e.key).sort()).toEqual(['nav.about', 'nav.home']);
    });

    it('should skip non-string values', () => {
      const result = parser.extract('{"name":"Test","count":5,"flag":true}');
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('name');
    });
  });

  describe('reconstruct()', () => {
    it('should replace values with translations', () => {
      const original = '{\n  "greeting": "Hello"\n}\n';
      const entries: TranslatedEntry[] = [{ key: 'greeting', value: 'Hello', translation: 'Hallo' }];
      const result = parser.reconstruct(original, entries);
      expect(JSON.parse(result)).toEqual({ greeting: 'Hallo' });
    });

    it('should preserve indentation', () => {
      const original = '{\n  "key": "value"\n}\n';
      const entries: TranslatedEntry[] = [{ key: 'key', value: 'value', translation: 'valor' }];
      const result = parser.reconstruct(original, entries);
      expect(result).toBe('{\n  "key": "valor"\n}\n');
    });

    it('should INSERT new keys not in the template', () => {
      const original = '{\n  "existing": "Hello"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'existing', value: 'Hello', translation: 'Hallo' },
        { key: 'new_key', value: 'New', translation: 'Neu' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result) as Record<string, string>;
      expect(parsed['existing']).toBe('Hallo');
      expect(parsed['new_key']).toBe('Neu');
    });

    it('should INSERT nested new keys', () => {
      const original = '{\n  "nav": {\n    "home": "Home"\n  }\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'nav.home', value: 'Home', translation: 'Startseite' },
        { key: 'nav.about', value: 'About', translation: 'Uber uns' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect((parsed['nav'] as Record<string, string>)['about']).toBe('Uber uns');
    });

    it('should REMOVE deleted keys not in entries', () => {
      const original = '{\n  "keep": "Hello",\n  "delete_me": "Goodbye"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'keep', value: 'Hello', translation: 'Hallo' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result) as Record<string, string>;
      expect(parsed['keep']).toBe('Hallo');
      expect(parsed['delete_me']).toBeUndefined();
    });
  });

  describe('extract() arrays and edge cases', () => {
    it('should extract array values with string items', () => {
      const json = '{"items":["apple","banana","cherry"]}';
      const result = parser.extract(json);
      expect(result).toHaveLength(3);
      expect(result[0]!.key).toBe('items.0');
      expect(result[0]!.value).toBe('apple');
      expect(result[1]!.key).toBe('items.1');
      expect(result[1]!.value).toBe('banana');
      expect(result[2]!.key).toBe('items.2');
      expect(result[2]!.value).toBe('cherry');
    });

    it('should skip null values', () => {
      const json = '{"name":"Test","empty":null}';
      const result = parser.extract(json);
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('name');
    });

    it('should skip numeric and boolean values', () => {
      const json = '{"label":"OK","count":42,"flag":true,"nothing":null}';
      const result = parser.extract(json);
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('label');
    });
  });

  describe('reconstruct() nested key insertion and deletion', () => {
    it('should insert a nested key that creates intermediate objects', () => {
      const original = '{\n  "existing": "Hello"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'existing', value: 'Hello', translation: 'Hallo' },
        { key: 'nav.menu.item', value: 'Item', translation: 'Artikel' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.existing).toBe('Hallo');
      expect(parsed.nav.menu.item).toBe('Artikel');
    });

    it('should remove nested keys and clean up empty parent objects', () => {
      const original = JSON.stringify({
        nav: {
          home: 'Home',
          about: 'About',
        },
        footer: {
          copyright: 'Copyright',
        },
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'nav.home', value: 'Home', translation: 'Startseite' },
        { key: 'nav.about', value: 'About', translation: 'Info' },
      ];

      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.nav.home).toBe('Startseite');
      expect(parsed.nav.about).toBe('Info');
      expect(parsed).not.toHaveProperty('footer');
    });

    it('should remove only the deleted key and keep siblings', () => {
      const original = JSON.stringify({
        nav: {
          home: 'Home',
          about: 'About',
          contact: 'Contact',
        },
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'nav.home', value: 'Home', translation: 'Inicio' },
        { key: 'nav.about', value: 'About', translation: 'Acerca' },
      ];

      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.nav.home).toBe('Inicio');
      expect(parsed.nav.about).toBe('Acerca');
      expect(parsed.nav).not.toHaveProperty('contact');
    });
  });

  describe('metadata', () => {
    it('should have correct name and extensions', () => {
      expect(parser.name).toBe('JSON i18n');
      expect(parser.extensions).toEqual(['.json']);
    });
  });

  describe('round-trip', () => {
    it('should preserve content with identity translations', () => {
      const original = '{\n  "a": "Hello",\n  "b": "World"\n}\n';
      const entries = parser.extract(original);
      const translated: TranslatedEntry[] = entries.map(e => ({ ...e, translation: e.value }));
      const result = parser.reconstruct(original, translated);
      expect(result).toBe(original);
    });
  });

  describe('BOM handling', () => {
    it('should extract correctly from JSON with UTF-8 BOM prefix', () => {
      const bom = '\uFEFF{"key":"value"}';
      const entries = parser.extract(bom);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.key).toBe('key');
      expect(entries[0]!.value).toBe('value');
    });

    it('should reconstruct correctly from JSON with UTF-8 BOM prefix', () => {
      const bom = '\uFEFF{\n  "key": "value"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'value', translation: 'Wert' },
      ];
      const result = parser.reconstruct(bom, entries);
      expect(JSON.parse(result)).toEqual({ key: 'Wert' });
    });
  });

  describe('duplicate key detection', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('should warn on duplicate top-level keys', () => {
      const json = '{"greeting":"Hello","farewell":"Goodbye","greeting":"Hi"}';
      const result = parser.extract(json);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('duplicate keys: greeting'),
      );
      expect(result).toHaveLength(2);
      expect(result.find(e => e.key === 'greeting')!.value).toBe('Hi');
    });

    it('should warn on duplicate keys in nested objects', () => {
      const json = '{"nav":{"home":"Home","about":"About","home":"Casa"}}';
      parser.extract(json);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('duplicate keys: home'),
      );
    });

    it('should not warn when keys appear at different nesting levels', () => {
      const json = '{"name":"Top","child":{"name":"Nested"}}';
      parser.extract(json);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not warn when there are no duplicate keys', () => {
      const json = '{"greeting":"Hello","farewell":"Goodbye"}';
      parser.extract(json);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not warn for empty or minimal JSON', () => {
      parser.extract('{}');
      parser.extract('{"single":"value"}');

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should handle escaped quotes in keys', () => {
      const json = '{"say\\"hi":"Hello","other":"World","say\\"hi":"Again"}';
      parser.extract(json);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('duplicate keys'),
      );
    });

    it('should handle string value (not key) followed by non-colon', () => {
      const json = '{"arr":["hello","world"]}';
      parser.extract(json);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should handle unterminated string in findDuplicateJsonKeys', () => {
      const json = '{"key": "unterminated';
      expect(() => parser.extract(json)).toThrow();
    });

    it('should not crash on key-colon outside braces in findDuplicateJsonKeys', () => {
      const json = '{"valid": "json"}';
      parser.extract(json);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('extract() edge cases', () => {
    it('should return empty array for empty content', () => {
      expect(parser.extract('')).toEqual([]);
    });

    it('should return empty array for whitespace-only content', () => {
      expect(parser.extract('   \n  ')).toEqual([]);
    });

    it('should extract array items with nested objects', () => {
      const json = '{"list":[{"name":"Alice"},{"name":"Bob"}]}';
      const result = parser.extract(json);
      expect(result).toHaveLength(2);
      expect(result[0]!.key).toBe('list.0.name');
      expect(result[1]!.key).toBe('list.1.name');
    });

    it('should skip non-string non-object array items', () => {
      const json = '{"items":["hello",42,true,null]}';
      const result = parser.extract(json);
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('items.0');
    });

    it('should handle top-level array', () => {
      const json = '["hello","world"]';
      const result = parser.extract(json);
      expect(result).toHaveLength(2);
      expect(result[0]!.key).toBe('0');
      expect(result[1]!.key).toBe('1');
    });
  });

  describe('reconstruct() tab indentation', () => {
    it('should detect and preserve tab indentation', () => {
      const original = '{\n\t"key": "value"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'value', translation: 'valor' },
      ];
      const result = parser.reconstruct(original, entries);
      expect(result).toContain('\t"key"');
      expect(result).toBe('{\n\t"key": "valor"\n}\n');
    });

    it('should default to 2-space indent when content is not indented', () => {
      const original = '{"key":"value"}\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'value', translation: 'valor' },
      ];
      const result = parser.reconstruct(original, entries);
      expect(result).toContain('  "key"');
    });
  });

  describe('reconstruct() with arrays', () => {
    it('should apply translations to array items', () => {
      const original = '{\n  "items": [\n    "hello",\n    "world"\n  ]\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'items.0', value: 'hello', translation: 'hola' },
        { key: 'items.1', value: 'world', translation: 'mundo' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.items).toEqual(['hola', 'mundo']);
    });

    it('should apply translations to nested objects inside arrays', () => {
      const original = JSON.stringify({ list: [{ name: 'Alice' }, { name: 'Bob' }] }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'list.0.name', value: 'Alice', translation: 'Alicia' },
        { key: 'list.1.name', value: 'Bob', translation: 'Roberto' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.list[0].name).toBe('Alicia');
      expect(parsed.list[1].name).toBe('Roberto');
    });

    it('should not apply translation to array string item when not in translations', () => {
      const original = JSON.stringify({ items: ['keep', 'also_keep'] }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'items.0', value: 'keep', translation: 'kept' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.items[0]).toBe('kept');
      expect(parsed.items[1]).toBe('also_keep');
    });
  });

  describe('reconstruct() removeDeletedKeys nested cleanup', () => {
    it('should remove deeply nested empty parent objects after key removal', () => {
      const original = JSON.stringify({
        a: {
          b: {
            c: 'deep value',
          },
        },
        keep: 'yes',
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'keep', value: 'yes', translation: 'ja' },
      ];

      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed).not.toHaveProperty('a');
      expect(parsed.keep).toBe('ja');
    });

    it('should not remove array values via removeDeletedKeys', () => {
      const original = JSON.stringify({
        items: ['one', 'two'],
        label: 'test',
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'items.0', value: 'one', translation: 'uno' },
        { key: 'items.1', value: 'two', translation: 'dos' },
        { key: 'label', value: 'test', translation: 'prueba' },
      ];

      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.items).toEqual(['uno', 'dos']);
      expect(parsed.label).toBe('prueba');
    });
  });

  describe('reconstruct() insertNewKeys edge cases', () => {
    it('should not insert when obj is not an object', () => {
      const original = '{"key": "value"}\n';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'value', translation: 'valor' },
      ];
      const result = parser.reconstruct(original, entries);
      expect(JSON.parse(result)).toEqual({ key: 'valor' });
    });

    it('should handle setKey where intermediate path already exists as object', () => {
      const original = JSON.stringify({
        nav: { home: 'Home' },
      }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'nav.home', value: 'Home', translation: 'Inicio' },
        { key: 'nav.about', value: 'About', translation: 'Acerca' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.nav.home).toBe('Inicio');
      expect(parsed.nav.about).toBe('Acerca');
    });
  });

  describe('hasKey and setKey edge cases', () => {
    it('should insert new key through non-existent intermediate path', () => {
      const original = JSON.stringify({ existing: 'Hello' }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'existing', value: 'Hello', translation: 'Hola' },
        { key: 'deep.path.key', value: 'x', translation: 'y' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.existing).toBe('Hola');
      expect(parsed.deep.path.key).toBe('y');
    });

    it('should handle setKey when intermediate path is null', () => {
      const original = JSON.stringify({ parent: null, other: 'val' }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'other', value: 'val', translation: 'valor' },
        { key: 'parent.child', value: 'x', translation: 'y' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.parent.child).toBe('y');
    });

    it('should handle single-segment dotPath in setKey', () => {
      const original = JSON.stringify({ existing: 'Hello' }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'existing', value: 'Hello', translation: 'Hola' },
        { key: 'newkey', value: 'x', translation: 'y' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed.newkey).toBe('y');
    });
  });

  describe('reconstruct() with non-object root', () => {
    it('should handle JSON with a bare string value gracefully', () => {
      const original = '"hello"\n';
      const entries: TranslatedEntry[] = [];
      const result = parser.reconstruct(original, entries);
      expect(JSON.parse(result)).toBe('hello');
    });
  });

  describe('reconstruct() top-level array', () => {
    it('should apply translations to a top-level string array', () => {
      const original = '[\n  "hello",\n  "world"\n]\n';
      const entries: TranslatedEntry[] = [
        { key: '0', value: 'hello', translation: 'hola' },
        { key: '1', value: 'world', translation: 'mundo' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(['hola', 'mundo']);
    });

    it('should apply translations to top-level array with nested objects', () => {
      const original = JSON.stringify([{ name: 'Alice' }, { name: 'Bob' }], null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: '0.name', value: 'Alice', translation: 'Alicia' },
        { key: '1.name', value: 'Bob', translation: 'Roberto' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed[0].name).toBe('Alicia');
      expect(parsed[1].name).toBe('Roberto');
    });
  });

  describe('reconstruct() BOM handling', () => {
    it('should handle BOM in reconstruct and produce valid JSON', () => {
      const original = '\uFEFF{\n  "key": "value"\n}';
      const entries: TranslatedEntry[] = [
        { key: 'key', value: 'value', translation: 'Wert' },
      ];
      const result = parser.reconstruct(original, entries);
      expect(JSON.parse(result)).toEqual({ key: 'Wert' });
      expect(result).not.toMatch(/^\uFEFF/);
    });
  });

  describe('flat dotted keys', () => {
    it('should extract flat dotted keys as-is', () => {
      const json = '{"section.key": "Value", "section.other": "Other"}';
      const result = parser.extract(json);
      expect(result).toHaveLength(2);
      expect(result[0]!.key).toBe('section.key');
      expect(result[0]!.value).toBe('Value');
      expect(result[1]!.key).toBe('section.other');
      expect(result[1]!.value).toBe('Other');
    });

    it('should reconstruct flat dotted keys without nesting', () => {
      const original = '{\n  "section.key": "Value",\n  "section.other": "Other"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'section.key', value: 'Value', translation: 'Wert' },
        { key: 'section.other', value: 'Other', translation: 'Andere' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ 'section.key': 'Wert', 'section.other': 'Andere' });
      expect(parsed).not.toHaveProperty('section');
    });

    it('should preserve nested keys as nested', () => {
      const original = JSON.stringify({ section: { key: 'Value' } }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'section.key', value: 'Value', translation: 'Wert' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ section: { key: 'Wert' } });
      expect(Object.keys(parsed)).toEqual(['section']);
    });

    it('should handle mixed flat and nested keys', () => {
      const original = JSON.stringify({
        'flat.key': 'Flat Value',
        nested: { key: 'Nested Value' },
      }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'flat.key', value: 'Flat Value', translation: 'Flacher Wert' },
        { key: 'nested.key', value: 'Nested Value', translation: 'Verschachtelter Wert' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed['flat.key']).toBe('Flacher Wert');
      expect(parsed['nested']['key']).toBe('Verschachtelter Wert');
      expect(Object.keys(parsed)).toEqual(['flat.key', 'nested']);
    });

    it('should round-trip flat dotted keys with identity translations', () => {
      const original = '{\n  "app.title": "My App",\n  "app.version": "1.0"\n}\n';
      const entries = parser.extract(original);
      const translated: TranslatedEntry[] = entries.map(e => ({ ...e, translation: e.value }));
      const result = parser.reconstruct(original, translated);
      expect(result).toBe(original);
    });

    it('should insert new flat dotted keys when source has flat style', () => {
      const original = '{\n  "section.existing": "Hello"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'section.existing', value: 'Hello', translation: 'Hallo' },
        { key: 'section.new', value: 'New', translation: 'Neu' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed['section.existing']).toBe('Hallo');
      expect(parsed['section.new']).toBe('Neu');
      expect(parsed).not.toHaveProperty('section');
    });

    it('should remove deleted flat dotted keys', () => {
      const original = '{\n  "section.keep": "Keep",\n  "section.remove": "Remove"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'section.keep', value: 'Keep', translation: 'Behalten' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed['section.keep']).toBe('Behalten');
      expect(parsed).not.toHaveProperty('section.remove');
    });

    it('should handle flat dotted keys inside nested objects', () => {
      const original = JSON.stringify({
        outer: { 'inner.key': 'Value' },
      }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'outer.inner.key', value: 'Value', translation: 'Wert' },
      ];
      const result = parser.reconstruct(original, entries);
      const parsed = JSON.parse(result);
      expect(parsed['outer']['inner.key']).toBe('Wert');
      expect(parsed['outer']).not.toHaveProperty('inner');
    });
  });
});
