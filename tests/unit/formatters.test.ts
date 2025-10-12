/**
 * Tests for output formatters
 */

import {
  formatTranslationJson,
  formatMultiTranslationJson,
  formatWriteJson,
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
