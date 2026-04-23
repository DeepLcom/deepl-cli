import { createDefaultRegistry } from '../../../src/formats/index';
import { ArbFormatParser } from '../../../src/formats/arb';
import type { TranslatedEntry } from '../../../src/formats/format';

const parser = new ArbFormatParser();

describe('arb parser', () => {
  it('should be registered in the default registry', async () => {
    const registry = await createDefaultRegistry();
    const extensions = registry.getSupportedExtensions();
    expect(extensions.length).toBeGreaterThan(0);
  });

  describe('reconstruct removes deleted keys', () => {
    it('should remove keys and their @metadata when absent from entries', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 'A greeting' },
        farewell: 'Goodbye',
        '@farewell': { description: 'A farewell' },
        deleted_key: 'Remove me',
        '@deleted_key': { description: 'Should be removed' },
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
        { key: 'farewell', value: 'Goodbye', translation: 'Adiós' },
      ];

      const result = parser.reconstruct(content, entries);
      const parsed = JSON.parse(result);
      expect(parsed.greeting).toBe('Hola');
      expect(parsed.farewell).toBe('Adiós');
      expect(parsed).not.toHaveProperty('deleted_key');
      expect(parsed).not.toHaveProperty('@deleted_key');
    });
  });

  describe('reconstruct inserts new keys', () => {
    it('should add keys not present in the template', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
        { key: 'new_key', value: 'New', translation: 'Nuevo' },
      ];

      const result = parser.reconstruct(content, entries);
      const parsed = JSON.parse(result);
      expect(parsed.greeting).toBe('Hola');
      expect(parsed.new_key).toBe('Nuevo');
    });
  });

  describe('reconstruct() applies translations to existing keys', () => {
    it('should update values for all existing keys', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 'A greeting' },
        farewell: 'Goodbye',
        '@farewell': { description: 'A farewell' },
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Bonjour' },
        { key: 'farewell', value: 'Goodbye', translation: 'Au revoir' },
      ];

      const result = parser.reconstruct(content, entries);
      const parsed = JSON.parse(result);
      expect(parsed.greeting).toBe('Bonjour');
      expect(parsed.farewell).toBe('Au revoir');
    });
  });

  describe('reconstruct() preserves @metadata entries', () => {
    it('should keep @metadata for keys that are present in entries', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 'A greeting', type: 'text' },
        farewell: 'Goodbye',
        '@farewell': { description: 'A farewell' },
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
        { key: 'farewell', value: 'Goodbye', translation: 'Adiós' },
      ];

      const result = parser.reconstruct(content, entries);
      const parsed = JSON.parse(result);
      expect(parsed['@greeting']).toEqual({ description: 'A greeting', type: 'text' });
      expect(parsed['@farewell']).toEqual({ description: 'A farewell' });
    });

    it('should remove @metadata for deleted keys but keep @metadata for retained keys', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 'A greeting' },
        deleted: 'Remove',
        '@deleted': { description: 'Will be removed' },
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];

      const result = parser.reconstruct(content, entries);
      const parsed = JSON.parse(result);
      expect(parsed.greeting).toBe('Hola');
      expect(parsed['@greeting']).toEqual({ description: 'A greeting' });
      expect(parsed).not.toHaveProperty('deleted');
      expect(parsed).not.toHaveProperty('@deleted');
    });
  });

  describe('reconstruct() preserves @@locale and top-level @ keys', () => {
    it('should preserve @@locale when present', () => {
      const content = JSON.stringify({
        '@@locale': 'en',
        greeting: 'Hello',
        '@greeting': { description: 'A greeting' },
      }, null, 2) + '\n';

      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];

      const result = parser.reconstruct(content, entries);
      const parsed = JSON.parse(result);
      expect(parsed['@@locale']).toBe('en');
      expect(parsed.greeting).toBe('Hola');
    });
  });

  describe('extract() with @-prefixed keys', () => {
    it('should skip @@locale entry during extraction', () => {
      const content = JSON.stringify({
        '@@locale': 'en',
        greeting: 'Hello',
      }, null, 2);
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.key).toBe('greeting');
    });

    it('should skip @metadata keys during extraction', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 'A greeting' },
      }, null, 2);
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.key).toBe('greeting');
    });

    it('should skip non-string values during extraction', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        count: 42,
        flag: true,
        nested: { inner: 'val' },
      }, null, 2);
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.key).toBe('greeting');
    });

    it('should attach @key metadata and description as context', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 'Used on the home page', type: 'text' },
      }, null, 2);
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.context).toBe('Used on the home page');
      expect(entries[0]!.metadata).toEqual({ description: 'Used on the home page', type: 'text' });
    });

    it('should set metadata without context when @key has no description field', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { type: 'text', placeholders: {} },
      }, null, 2);
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.context).toBeUndefined();
      expect(entries[0]!.metadata).toEqual({ type: 'text', placeholders: {} });
    });

    it('should handle entry with no @metadata at all', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        farewell: 'Goodbye',
      }, null, 2);
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
      expect(entries[0]!.metadata).toBeUndefined();
      expect(entries[0]!.context).toBeUndefined();
    });

    it('should skip @metadata that is not an object (string value)', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': 'not an object',
      }, null, 2);
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toBeUndefined();
    });

    it('should skip @metadata that is null', () => {
      const content = '{"greeting":"Hello","@greeting":null}';
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toBeUndefined();
    });
  });

  describe('extractContext()', () => {
    it('should return description from @key metadata', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 'A welcome message' },
      }, null, 2);
      const result = parser.extractContext(content, 'greeting');
      expect(result).toBe('A welcome message');
    });

    it('should return undefined when @key has no description', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { type: 'text' },
      }, null, 2);
      const result = parser.extractContext(content, 'greeting');
      expect(result).toBeUndefined();
    });

    it('should return undefined when @key does not exist', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
      }, null, 2);
      const result = parser.extractContext(content, 'greeting');
      expect(result).toBeUndefined();
    });

    it('should return undefined when @key is null', () => {
      const content = '{"greeting":"Hello","@greeting":null}';
      const result = parser.extractContext(content, 'greeting');
      expect(result).toBeUndefined();
    });

    it('should return undefined when @key is a string not an object', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': 'just a string',
      }, null, 2);
      const result = parser.extractContext(content, 'greeting');
      expect(result).toBeUndefined();
    });

    it('should return undefined when description is not a string', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 42 },
      }, null, 2);
      const result = parser.extractContext(content, 'greeting');
      expect(result).toBeUndefined();
    });
  });

  describe('reconstruct() edge cases', () => {
    it('should not add trailing newline when original lacks one', () => {
      const content = JSON.stringify({ greeting: 'Hello' }, null, 2);
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).not.toMatch(/\n$/);
      expect(JSON.parse(result).greeting).toBe('Hola');
    });

    it('should detect tab indentation', () => {
      const content = '{\n\t"greeting": "Hello"\n}\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('\t"greeting"');
    });

    it('should default to 2-space indent when no indentation detected', () => {
      const content = '{"greeting":"Hello"}\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(content, entries);
      expect(result).toContain('  "greeting"');
    });

    it('should handle reconstruct with key absent from original (no translation match)', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        farewell: 'Goodbye',
      }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(content, entries);
      const parsed = JSON.parse(result);
      expect(parsed.greeting).toBe('Hola');
      expect(parsed).not.toHaveProperty('farewell');
    });

    it('should handle reconstruct where deleted key has no @metadata', () => {
      const content = JSON.stringify({
        greeting: 'Hello',
        '@greeting': { description: 'A greeting' },
        orphan: 'No meta',
      }, null, 2) + '\n';
      const entries: TranslatedEntry[] = [
        { key: 'greeting', value: 'Hello', translation: 'Hola' },
      ];
      const result = parser.reconstruct(content, entries);
      const parsed = JSON.parse(result);
      expect(parsed).not.toHaveProperty('orphan');
      expect(parsed.greeting).toBe('Hola');
    });
  });
});
