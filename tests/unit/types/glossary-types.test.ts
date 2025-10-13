/**
 * Tests for glossary type helpers
 */

import {
  GlossaryInfo,
  isMultilingual,
  getTotalEntryCount,
  getTargetLang,
} from '../../../src/types/glossary';

describe('Glossary Type Helpers', () => {
  describe('isMultilingual', () => {
    it('should return false for single-target glossary', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
        ],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(isMultilingual(glossary)).toBe(false);
    });

    it('should return true for multi-target glossary', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr', 'de'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'de',
            entry_count: 10,
          },
        ],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(isMultilingual(glossary)).toBe(true);
    });
  });

  describe('getTotalEntryCount', () => {
    it('should return entry count for single-target glossary', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 25,
          },
        ],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(getTotalEntryCount(glossary)).toBe(25);
    });

    it('should sum entry counts for multi-target glossary', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr', 'de'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 15,
          },
          {
            source_lang: 'en',
            target_lang: 'de',
            entry_count: 20,
          },
        ],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(getTotalEntryCount(glossary)).toBe(45);
    });

    it('should return 0 for glossary with no dictionaries', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: [],
        dictionaries: [],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(getTotalEntryCount(glossary)).toBe(0);
    });
  });

  describe('getTargetLang', () => {
    it('should return the only target for single-target glossary', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
        ],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(getTargetLang(glossary)).toBe('es');
    });

    it('should return specified target when valid', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr', 'de'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'de',
            entry_count: 10,
          },
        ],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(getTargetLang(glossary, 'fr')).toBe('fr');
    });

    it('should throw error when target not specified for multi-target glossary', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr', 'de'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'de',
            entry_count: 10,
          },
        ],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(() => getTargetLang(glossary)).toThrow(
        'This glossary contains multiple language pairs: es, fr, de'
      );
    });

    it('should throw error when specified target not in glossary', () => {
      const glossary: GlossaryInfo = {
        glossary_id: 'test-123',
        name: 'Test Glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 10,
          },
        ],
        creation_time: '2025-10-13T10:00:00Z',
      };

      expect(() => getTargetLang(glossary, 'de' as any)).toThrow(
        'Target language "de" not found in glossary'
      );
    });
  });
});
