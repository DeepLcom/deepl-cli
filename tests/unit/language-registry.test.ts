import {
  LANGUAGE_REGISTRY,
  isValidLanguage,
  isExtendedLanguage,
  getLanguageName,
  getSourceLanguages,
  getTargetLanguages,
  getAllLanguageCodes,
  getExtendedLanguageCodes,
} from '../../src/data/language-registry';

describe('Language Registry', () => {
  describe('LANGUAGE_REGISTRY', () => {
    it('should contain 121 language entries', () => {
      expect(LANGUAGE_REGISTRY.size).toBe(121);
    });

    it('should have unique language codes', () => {
      const codes = Array.from(LANGUAGE_REGISTRY.keys());
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it('should contain all 32 core languages', () => {
      const core = Array.from(LANGUAGE_REGISTRY.values()).filter(e => e.category === 'core');
      expect(core.length).toBe(32);
    });

    it('should contain all 7 regional variants', () => {
      const regional = Array.from(LANGUAGE_REGISTRY.values()).filter(e => e.category === 'regional');
      expect(regional.length).toBe(7);
    });

    it('should contain all 82 extended languages', () => {
      const extended = Array.from(LANGUAGE_REGISTRY.values()).filter(e => e.category === 'extended');
      expect(extended.length).toBe(82);
    });

    it('should mark regional variants as targetOnly', () => {
      const regional = Array.from(LANGUAGE_REGISTRY.values()).filter(e => e.category === 'regional');
      regional.forEach(entry => {
        expect(entry.targetOnly).toBe(true);
      });
    });

    it('should not mark core or extended languages as targetOnly', () => {
      const nonRegional = Array.from(LANGUAGE_REGISTRY.values()).filter(e => e.category !== 'regional');
      nonRegional.forEach(entry => {
        expect(entry.targetOnly).toBeUndefined();
      });
    });

    it('should have non-empty names for all entries', () => {
      LANGUAGE_REGISTRY.forEach(entry => {
        expect(entry.name.length).toBeGreaterThan(0);
      });
    });

    it('should have lowercase codes', () => {
      LANGUAGE_REGISTRY.forEach((_, code) => {
        expect(code).toBe(code.toLowerCase());
      });
    });
  });

  describe('specific language entries', () => {
    it('should include known core languages', () => {
      expect(LANGUAGE_REGISTRY.get('en')).toEqual({ code: 'en', name: 'English', category: 'core' });
      expect(LANGUAGE_REGISTRY.get('de')).toEqual({ code: 'de', name: 'German', category: 'core' });
      expect(LANGUAGE_REGISTRY.get('ja')).toEqual({ code: 'ja', name: 'Japanese', category: 'core' });
    });

    it('should include known regional variants', () => {
      expect(LANGUAGE_REGISTRY.get('en-gb')).toEqual({ code: 'en-gb', name: 'English (British)', category: 'regional', targetOnly: true });
      expect(LANGUAGE_REGISTRY.get('pt-br')).toEqual({ code: 'pt-br', name: 'Portuguese (Brazilian)', category: 'regional', targetOnly: true });
    });

    it('should include known extended languages', () => {
      expect(LANGUAGE_REGISTRY.get('hi')).toEqual({ code: 'hi', name: 'Hindi', category: 'extended' });
      expect(LANGUAGE_REGISTRY.get('sw')).toEqual({ code: 'sw', name: 'Swahili', category: 'extended' });
    });
  });

  describe('isValidLanguage()', () => {
    it('should return true for core languages', () => {
      expect(isValidLanguage('en')).toBe(true);
      expect(isValidLanguage('de')).toBe(true);
      expect(isValidLanguage('zh')).toBe(true);
    });

    it('should return true for regional variants', () => {
      expect(isValidLanguage('en-gb')).toBe(true);
      expect(isValidLanguage('pt-br')).toBe(true);
      expect(isValidLanguage('zh-hans')).toBe(true);
    });

    it('should return true for extended languages', () => {
      expect(isValidLanguage('hi')).toBe(true);
      expect(isValidLanguage('sw')).toBe(true);
      expect(isValidLanguage('yue')).toBe(true);
    });

    it('should return false for invalid codes', () => {
      expect(isValidLanguage('xx')).toBe(false);
      expect(isValidLanguage('invalid')).toBe(false);
      expect(isValidLanguage('')).toBe(false);
    });
  });

  describe('isExtendedLanguage()', () => {
    it('should return true for extended languages', () => {
      expect(isExtendedLanguage('hi')).toBe(true);
      expect(isExtendedLanguage('ace')).toBe(true);
      expect(isExtendedLanguage('zu')).toBe(true);
    });

    it('should return false for core languages', () => {
      expect(isExtendedLanguage('en')).toBe(false);
      expect(isExtendedLanguage('de')).toBe(false);
    });

    it('should return false for regional variants', () => {
      expect(isExtendedLanguage('en-gb')).toBe(false);
      expect(isExtendedLanguage('pt-br')).toBe(false);
    });

    it('should return false for invalid codes', () => {
      expect(isExtendedLanguage('xx')).toBe(false);
      expect(isExtendedLanguage('')).toBe(false);
    });
  });

  describe('getLanguageName()', () => {
    it('should return name for valid codes', () => {
      expect(getLanguageName('en')).toBe('English');
      expect(getLanguageName('de')).toBe('German');
      expect(getLanguageName('en-gb')).toBe('English (British)');
      expect(getLanguageName('hi')).toBe('Hindi');
    });

    it('should return undefined for invalid codes', () => {
      expect(getLanguageName('xx')).toBeUndefined();
      expect(getLanguageName('')).toBeUndefined();
    });
  });

  describe('getSourceLanguages()', () => {
    it('should exclude target-only languages', () => {
      const sources = getSourceLanguages();
      const codes = sources.map(e => e.code);
      expect(codes).not.toContain('en-gb');
      expect(codes).not.toContain('en-us');
      expect(codes).not.toContain('pt-br');
      expect(codes).not.toContain('zh-hans');
    });

    it('should include core and extended languages', () => {
      const sources = getSourceLanguages();
      const codes = sources.map(e => e.code);
      expect(codes).toContain('en');
      expect(codes).toContain('de');
      expect(codes).toContain('hi');
      expect(codes).toContain('sw');
    });

    it('should return 114 languages (121 - 7 regional)', () => {
      expect(getSourceLanguages().length).toBe(114);
    });
  });

  describe('getTargetLanguages()', () => {
    it('should include all languages', () => {
      expect(getTargetLanguages().length).toBe(121);
    });

    it('should include regional variants', () => {
      const targets = getTargetLanguages();
      const codes = targets.map(e => e.code);
      expect(codes).toContain('en-gb');
      expect(codes).toContain('en-us');
      expect(codes).toContain('pt-br');
    });
  });

  describe('getAllLanguageCodes()', () => {
    it('should return set of all 121 codes', () => {
      const codes = getAllLanguageCodes();
      expect(codes.size).toBe(121);
    });

    it('should support has() lookups', () => {
      const codes = getAllLanguageCodes();
      expect(codes.has('en')).toBe(true);
      expect(codes.has('en-gb')).toBe(true);
      expect(codes.has('hi')).toBe(true);
      expect(codes.has('xx')).toBe(false);
    });
  });

  describe('getExtendedLanguageCodes()', () => {
    it('should return set of 82 extended codes', () => {
      const codes = getExtendedLanguageCodes();
      expect(codes.size).toBe(82);
    });

    it('should only contain extended language codes', () => {
      const codes = getExtendedLanguageCodes();
      codes.forEach(code => {
        const entry = LANGUAGE_REGISTRY.get(code);
        expect(entry?.category).toBe('extended');
      });
    });

    it('should not contain core or regional codes', () => {
      const codes = getExtendedLanguageCodes();
      expect(codes.has('en')).toBe(false);
      expect(codes.has('en-gb')).toBe(false);
    });
  });
});
