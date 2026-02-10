/**
 * Tests for Output Helper
 */

import { formatJson, formatOutput } from '../../src/utils/output-helper';

describe('output-helper', () => {
  describe('formatJson()', () => {
    it('should serialize an object as pretty-printed JSON', () => {
      const data = { key: 'value', count: 42 };
      const result = formatJson(data);
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('should serialize an array as pretty-printed JSON', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const result = formatJson(data);
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('should produce valid parseable JSON', () => {
      const data = { nested: { a: [1, 2, 3] }, flag: true };
      const result = formatJson(data);
      expect(JSON.parse(result)).toEqual(data);
    });

    it('should handle null', () => {
      expect(formatJson(null)).toBe('null');
    });

    it('should handle primitive values', () => {
      expect(formatJson(42)).toBe('42');
      expect(formatJson('hello')).toBe('"hello"');
      expect(formatJson(true)).toBe('true');
    });

    it('should handle empty object', () => {
      expect(formatJson({})).toBe('{}');
    });

    it('should handle empty array', () => {
      expect(formatJson([])).toBe('[]');
    });
  });

  describe('formatOutput()', () => {
    const data = { name: 'test', items: [1, 2, 3] };
    const text = 'Name: test\nItems: 1, 2, 3';

    it('should return JSON when format is "json"', () => {
      const result = formatOutput(data, text, 'json');
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('should return text when format is "text"', () => {
      const result = formatOutput(data, text, 'text');
      expect(result).toBe(text);
    });

    it('should default to text when format is undefined', () => {
      const result = formatOutput(data, text);
      expect(result).toBe(text);
    });

    it('should default to text for unrecognised format values', () => {
      const result = formatOutput(data, text, 'csv');
      expect(result).toBe(text);
    });

    it('should produce valid JSON that round-trips correctly', () => {
      const result = formatOutput(data, text, 'json');
      expect(JSON.parse(result)).toEqual(data);
    });
  });
});
