/**
 * Tests for output formatters
 */

import {
  formatTranslationJson,
  formatMultiTranslationJson,
  formatMultiTranslationTable,
  formatWriteJson,
  isColorEnabled,
} from '../../src/utils/formatters';
import { TranslationResult } from '../../src/api/deepl-client';
import { Language } from '../../src/types';

describe('formatters', () => {
  describe('formatTranslationJson()', () => {
    it('should format single translation as JSON', () => {
      const result: TranslationResult = {
        text: 'Hola',
        detectedSourceLang: 'en' as Language,
      };

      const output = formatTranslationJson(result, 'es' as Language);
      const parsed = JSON.parse(output);

      expect(parsed.text).toBe('Hola');
      expect(parsed.targetLang).toBe('es');
      expect(parsed.detectedSourceLang).toBe('en');
    });

    it('should include cached flag when provided', () => {
      const result: TranslationResult = {
        text: 'Hola',
      };

      const output = formatTranslationJson(result, 'es' as Language, true);
      const parsed = JSON.parse(output);

      expect(parsed.cached).toBe(true);
    });

    it('should not include cached flag when not provided', () => {
      const result: TranslationResult = {
        text: 'Hola',
      };

      const output = formatTranslationJson(result, 'es' as Language);
      const parsed = JSON.parse(output);

      expect(parsed.cached).toBeUndefined();
    });

    it('should handle missing detectedSourceLang', () => {
      const result: TranslationResult = {
        text: 'Hola',
      };

      const output = formatTranslationJson(result, 'es' as Language);
      const parsed = JSON.parse(output);

      expect(parsed.text).toBe('Hola');
      expect(parsed.targetLang).toBe('es');
      expect(parsed.detectedSourceLang).toBeUndefined();
    });

    it('should format JSON with 2-space indentation', () => {
      const result: TranslationResult = {
        text: 'Hola',
      };

      const output = formatTranslationJson(result, 'es' as Language);

      expect(output).toContain('  "text": "Hola"');
      expect(output).toContain('  "targetLang": "es"');
    });
  });

  describe('formatMultiTranslationJson()', () => {
    it('should format multiple translations as JSON', () => {
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
          detectedSourceLang: 'en' as Language,
        },
        {
          targetLang: 'fr' as Language,
          text: 'Bonjour',
          detectedSourceLang: 'en' as Language,
        },
      ];

      const output = formatMultiTranslationJson(results);
      const parsed = JSON.parse(output);

      expect(parsed.translations).toHaveLength(2);
      expect(parsed.translations[0].targetLang).toBe('es');
      expect(parsed.translations[0].text).toBe('Hola');
      expect(parsed.translations[1].targetLang).toBe('fr');
      expect(parsed.translations[1].text).toBe('Bonjour');
    });

    it('should handle translations without detectedSourceLang', () => {
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
        },
      ];

      const output = formatMultiTranslationJson(results);
      const parsed = JSON.parse(output);

      expect(parsed.translations[0].detectedSourceLang).toBeUndefined();
    });

    it('should format JSON with 2-space indentation', () => {
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
        },
      ];

      const output = formatMultiTranslationJson(results);

      expect(output).toContain('  "translations": [');
    });
  });

  describe('formatMultiTranslationTable()', () => {
    it('should format multiple translations as table', () => {
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
          billedCharacters: 5,
        },
        {
          targetLang: 'fr' as Language,
          text: 'Bonjour',
          billedCharacters: 7,
        },
      ];

      const output = formatMultiTranslationTable(results);

      // Verify table headers
      expect(output).toContain('Language');
      expect(output).toContain('Translation');
      expect(output).toContain('Characters');

      // Verify data rows
      expect(output).toContain('ES');
      expect(output).toContain('Hola');
      expect(output).toContain('5');

      expect(output).toContain('FR');
      expect(output).toContain('Bonjour');
      expect(output).toContain('7');
    });

    it('should handle missing optional fields', () => {
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
        },
      ];

      const output = formatMultiTranslationTable(results);

      expect(output).toContain('ES');
      expect(output).toContain('Hola');
      // Should NOT contain Characters column when billedCharacters is missing
      expect(output).not.toContain('Characters');
    });

    it('should handle long translations with word wrap', () => {
      const results = [
        {
          targetLang: 'de' as Language,
          text: 'Dies ist ein sehr langer Text, der über mehrere Zeilen umgebrochen werden sollte, um die Lesbarkeit zu verbessern.',
          billedCharacters: 100,
        },
      ];

      const output = formatMultiTranslationTable(results);

      expect(output).toContain('DE');
      expect(output).toContain('Dies ist ein sehr langer');
      expect(output).toContain('100');
    });

    it('should format billed characters with thousands separator', () => {
      const results = [
        {
          targetLang: 'ja' as Language,
          text: 'こんにちは',
          billedCharacters: 1234567,
        },
      ];

      const output = formatMultiTranslationTable(results);

      expect(output).toContain('1,234,567');
    });

    it('should handle empty results array', () => {
      const results: Array<{
        targetLang: Language;
        text: string;
        billedCharacters?: number;
      }> = [];

      const output = formatMultiTranslationTable(results);

      // Should still have table headers (without Characters column since no data has billedCharacters)
      expect(output).toContain('Language');
      expect(output).toContain('Translation');
      expect(output).not.toContain('Characters');
    });

    it('should handle multiple languages consistently', () => {
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
          billedCharacters: 5,
        },
        {
          targetLang: 'fr' as Language,
          text: 'Bonjour',
          billedCharacters: 7,
        },
        {
          targetLang: 'de' as Language,
          text: 'Hallo',
          billedCharacters: 5,
        },
        {
          targetLang: 'ja' as Language,
          text: 'こんにちは',
          billedCharacters: 15,
        },
      ];

      const output = formatMultiTranslationTable(results);

      // All languages present
      expect(output).toContain('ES');
      expect(output).toContain('FR');
      expect(output).toContain('DE');
      expect(output).toContain('JA');

      // All translations present
      expect(output).toContain('Hola');
      expect(output).toContain('Bonjour');
      expect(output).toContain('Hallo');
      expect(output).toContain('こんにちは');

      // Character counts present
      expect(output).toContain('5');
      expect(output).toContain('7');
      expect(output).toContain('15');
    });
  });

  describe('formatMultiTranslationTable() color environment handling', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should not contain ANSI escape codes when NO_COLOR is set', () => {
      process.env = { ...originalEnv, NO_COLOR: '1' };
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
          billedCharacters: 5,
        },
      ];

      const output = formatMultiTranslationTable(results);

      // eslint-disable-next-line no-control-regex
      const ansiRegex = /\x1b\[[0-9;]*m/;
      expect(ansiRegex.test(output)).toBe(false);
    });

    it('should still contain table structure when NO_COLOR is set', () => {
      process.env = { ...originalEnv, NO_COLOR: '' };
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
          billedCharacters: 5,
        },
      ];

      const output = formatMultiTranslationTable(results);

      expect(output).toContain('Language');
      expect(output).toContain('Translation');
      expect(output).toContain('ES');
      expect(output).toContain('Hola');
      // eslint-disable-next-line no-control-regex
      const ansiRegex = /\x1b\[[0-9;]*m/;
      expect(ansiRegex.test(output)).toBe(false);
    });

    it('should not contain ANSI escape codes when TERM=dumb', () => {
      process.env = { ...originalEnv, TERM: 'dumb' };
      delete process.env['NO_COLOR'];
      delete process.env['FORCE_COLOR'];
      const results = [
        {
          targetLang: 'es' as Language,
          text: 'Hola',
          billedCharacters: 5,
        },
      ];

      const output = formatMultiTranslationTable(results);

      // eslint-disable-next-line no-control-regex
      const ansiRegex = /\x1b\[[0-9;]*m/;
      expect(ansiRegex.test(output)).toBe(false);
    });
  });

  describe('isColorEnabled()', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true by default when no color env vars are set', () => {
      process.env = { ...originalEnv };
      delete process.env['NO_COLOR'];
      delete process.env['FORCE_COLOR'];
      delete process.env['TERM'];

      expect(isColorEnabled()).toBe(true);
    });

    it('should return false when NO_COLOR is set', () => {
      process.env = { ...originalEnv, NO_COLOR: '1' };
      delete process.env['FORCE_COLOR'];

      expect(isColorEnabled()).toBe(false);
    });

    it('should return false when NO_COLOR is empty string (presence check)', () => {
      process.env = { ...originalEnv, NO_COLOR: '' };
      delete process.env['FORCE_COLOR'];

      expect(isColorEnabled()).toBe(false);
    });

    it('should return true when FORCE_COLOR=1', () => {
      process.env = { ...originalEnv, FORCE_COLOR: '1' };
      delete process.env['NO_COLOR'];

      expect(isColorEnabled()).toBe(true);
    });

    it('should return true when FORCE_COLOR=true', () => {
      process.env = { ...originalEnv, FORCE_COLOR: 'true' };
      delete process.env['NO_COLOR'];

      expect(isColorEnabled()).toBe(true);
    });

    it('should return false when FORCE_COLOR=0', () => {
      process.env = { ...originalEnv, FORCE_COLOR: '0' };
      delete process.env['NO_COLOR'];

      expect(isColorEnabled()).toBe(false);
    });

    it('should return false when FORCE_COLOR=false', () => {
      process.env = { ...originalEnv, FORCE_COLOR: 'false' };
      delete process.env['NO_COLOR'];

      expect(isColorEnabled()).toBe(false);
    });

    it('should return false when TERM=dumb', () => {
      process.env = { ...originalEnv, TERM: 'dumb' };
      delete process.env['NO_COLOR'];
      delete process.env['FORCE_COLOR'];

      expect(isColorEnabled()).toBe(false);
    });

    it('should return true when TERM is not dumb', () => {
      process.env = { ...originalEnv, TERM: 'xterm-256color' };
      delete process.env['NO_COLOR'];
      delete process.env['FORCE_COLOR'];

      expect(isColorEnabled()).toBe(true);
    });

    it('should prioritize NO_COLOR over FORCE_COLOR', () => {
      process.env = { ...originalEnv, NO_COLOR: '1', FORCE_COLOR: '1' };

      expect(isColorEnabled()).toBe(false);
    });

    it('should prioritize FORCE_COLOR over TERM=dumb', () => {
      process.env = { ...originalEnv, FORCE_COLOR: '1', TERM: 'dumb' };
      delete process.env['NO_COLOR'];

      expect(isColorEnabled()).toBe(true);
    });

    it('should prioritize NO_COLOR over TERM=dumb', () => {
      process.env = { ...originalEnv, NO_COLOR: '', TERM: 'dumb' };
      delete process.env['FORCE_COLOR'];

      expect(isColorEnabled()).toBe(false);
    });
  });

  describe('formatWriteJson()', () => {
    it('should format write result as JSON', () => {
      const output = formatWriteJson(
        'This are good.',
        'This is good.',
        'en-US'
      );
      const parsed = JSON.parse(output);

      expect(parsed.original).toBe('This are good.');
      expect(parsed.improved).toBe('This is good.');
      expect(parsed.changes).toBe(1);
      expect(parsed.language).toBe('en-US');
    });

    it('should set changes to 0 when text is unchanged', () => {
      const output = formatWriteJson(
        'This is good.',
        'This is good.',
        'en-US'
      );
      const parsed = JSON.parse(output);

      expect(parsed.changes).toBe(0);
    });

    it('should set changes to 1 when text is changed', () => {
      const output = formatWriteJson(
        'Original',
        'Improved',
        'en-US'
      );
      const parsed = JSON.parse(output);

      expect(parsed.changes).toBe(1);
    });

    it('should format JSON with 2-space indentation', () => {
      const output = formatWriteJson('Original', 'Improved', 'en-US');

      expect(output).toContain('  "original": "Original"');
      expect(output).toContain('  "improved": "Improved"');
    });
  });
});
