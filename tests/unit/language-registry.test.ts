import {
  LANGUAGE_REGISTRY,
  isValidLanguage,
  isExtendedLanguage,
  getLanguageName,
  getSourceLanguages,
  getTargetLanguages,
  getAllLanguageCodes,
  getExtendedLanguageCodes,
  deriveLanguageEntry,
  looksLikeLanguageTag,
} from '../../src/data/language-registry';
import { ENTRIES, WRITE_TARGET_LANGUAGES } from '../../src/data/language-entries';
import type { Language } from '../../src/types/common';

/**
 * Counts are compared against the snapshot rather than written out, so
 * regenerating it -- the documented release step -- does not turn this suite red
 * for a change it is supposed to accept. Drift from the API is checked by
 * "npm run check:languages", which is where that belongs.
 *
 * Comparing the registry against the array it is built from proves the plumbing
 * but not the data, so the floors below stand in for the literal counts: they
 * hold across any plausible upstream change and still fail on a snapshot that
 * lost most of its languages.
 */
const TIERS = ['core', 'regional', 'extended'] as const;
const entriesIn = (category: string) => ENTRIES.filter(e => e.category === category);

/** Floors chosen well under today's 125/32/11/82 and well over an empty file. */
const MIN_TOTAL = 100;
const MIN_PER_TIER: Record<(typeof TIERS)[number], number> = {
  core: 20,
  regional: 5,
  extended: 50,
};

describe('Language Registry', () => {
  describe('LANGUAGE_REGISTRY', () => {
    it('should contain one entry per snapshot language', () => {
      expect(LANGUAGE_REGISTRY.size).toBe(ENTRIES.length);
    });

    it('should hold a plausible number of languages', () => {
      // Independent of ENTRIES.length, which the assertion above compares against
      // itself: a snapshot regenerated from a broken response fails here.
      expect(LANGUAGE_REGISTRY.size).toBeGreaterThanOrEqual(MIN_TOTAL);
    });

    it.each(TIERS)('should hold a plausible number of %s languages', category => {
      expect(entriesIn(category).length).toBeGreaterThanOrEqual(MIN_PER_TIER[category]);
    });

    it('should still contain a representative language from every tier', () => {
      // Named codes, so losing a whole tier or a common language is caught even
      // if the totals stay plausible.
      for (const code of ['en', 'de', 'ja', 'zh', 'en-gb', 'pt-br', 'zh-hans', 'hi', 'sw', 'th']) {
        expect(LANGUAGE_REGISTRY.has(code)).toBe(true);
      }
    });

    it('should have unique language codes', () => {
      const codes = Array.from(LANGUAGE_REGISTRY.keys());
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it.each(TIERS)('should contain every %s language from the snapshot', category => {
      const inRegistry = Array.from(LANGUAGE_REGISTRY.values()).filter(
        e => e.category === category,
      );
      expect(inRegistry.length).toBe(entriesIn(category).length);
      expect(inRegistry.length).toBeGreaterThan(0);
    });

    it('should place every entry in exactly one known tier', () => {
      expect(TIERS.map(entriesIn).reduce((sum, group) => sum + group.length, 0)).toBe(
        ENTRIES.length,
      );
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

    it('should include the regional variants of German and French', () => {
      expect(LANGUAGE_REGISTRY.get('de-ch')).toEqual({ code: 'de-ch', name: 'German (Swiss)', category: 'regional', targetOnly: true });
      expect(LANGUAGE_REGISTRY.get('fr-ca')).toEqual({ code: 'fr-ca', name: 'French (Canadian)', category: 'regional', targetOnly: true });
    });

    it('should carry the API name even where it duplicates a bare code', () => {
      // The API calls both `de` and `de-DE` "German"; the snapshot mirrors it
      // rather than inventing a disambiguated name.
      expect(getLanguageName('de-de')).toBe('German');
      expect(getLanguageName('fr-fr')).toBe('French');
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

    it('should return every language that is not target-only', () => {
      const targetOnly = ENTRIES.filter(e => 'targetOnly' in e && e.targetOnly).length;
      expect(getSourceLanguages().length).toBe(ENTRIES.length - targetOnly);
      expect(targetOnly).toBeGreaterThan(0);
    });
  });

  describe('getTargetLanguages()', () => {
    it('should include all languages', () => {
      expect(getTargetLanguages().length).toBe(ENTRIES.length);
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
    it('should return a set of every snapshot code', () => {
      const codes = getAllLanguageCodes();
      expect(codes.size).toBe(ENTRIES.length);
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
    it('should return a set of every extended code', () => {
      const codes = getExtendedLanguageCodes();
      expect(codes.size).toBe(entriesIn('extended').length);
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

  describe('WRITE_TARGET_LANGUAGES', () => {
    it('should be non-empty', () => {
      expect(WRITE_TARGET_LANGUAGES.length).toBeGreaterThan(0);
    });

    it('should be lowercase and sorted, matching how the generator emits it', () => {
      const codes = [...WRITE_TARGET_LANGUAGES];
      expect(codes).toEqual(codes.map(c => c.toLowerCase()));
      expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b, 'en')));
    });

    it('should have no duplicates', () => {
      expect(new Set(WRITE_TARGET_LANGUAGES).size).toBe(WRITE_TARGET_LANGUAGES.length);
    });

    it('should only contain languages the translate snapshot also knows', () => {
      // Both lists come from the same GET /v3/languages, so a write target the
      // main snapshot has never heard of means one of them was generated stale.
      for (const code of WRITE_TARGET_LANGUAGES) {
        expect(isValidLanguage(code)).toBe(true);
      }
    });

    it('should be a subset of the target languages', () => {
      const targets = new Set(getTargetLanguages().map(e => e.code));
      for (const code of WRITE_TARGET_LANGUAGES) {
        expect(targets.has(code)).toBe(true);
      }
    });
  });

  describe('deriveLanguageEntry()', () => {
    const stable = { status: 'stable' };

    it('should classify a source-usable language with glossary support as core', () => {
      expect(
        deriveLanguageEntry({
          lang: 'de',
          name: 'German',
          usable_as_source: true,
          features: { glossary: stable, formality: stable },
        }),
      ).toEqual({ code: 'de', name: 'German', category: 'core' });
    });

    it('should classify a target-only language with glossary support as regional', () => {
      expect(
        deriveLanguageEntry({
          lang: 'de-CH',
          name: 'German (Swiss)',
          usable_as_source: false,
          features: { glossary: stable, formality: stable },
        }),
      ).toEqual({ code: 'de-ch', name: 'German (Swiss)', category: 'regional', targetOnly: true });
    });

    it('should classify a language without glossary support as extended', () => {
      expect(
        deriveLanguageEntry({
          lang: 'hi',
          name: 'Hindi',
          usable_as_source: true,
          features: { tag_handling: stable },
        }),
      ).toEqual({ code: 'hi', name: 'Hindi', category: 'extended' });
    });

    it('should classify an empty features matrix as extended, which is evidence', () => {
      // An empty matrix says the language supports none of them, glossary
      // included. A missing one says nothing -- see below.
      expect(
        deriveLanguageEntry({
          lang: 'hi',
          name: 'Hindi',
          usable_as_source: true,
          features: {},
        }).category,
      ).toBe('extended');
    });

    it('should not file a language with no features matrix as extended', () => {
      // Silence about a language is not evidence that it lacks glossary support,
      // and the extended tier is what suppresses formality and glossary locally.
      // Tiering it by source usability instead leaves the judgement to the API,
      // which is the same choice the --features table makes.
      expect(
        deriveLanguageEntry({ lang: 'xx', name: 'Test', usable_as_source: true }).category,
      ).toBe('core');
      expect(
        deriveLanguageEntry({ lang: 'xx', name: 'Test', usable_as_source: false }).category,
      ).toBe('regional');
    });

    it('should lowercase the code', () => {
      expect(deriveLanguageEntry({ lang: 'ZH-Hans', name: 'Chinese' }).code).toBe('zh-hans');
    });

    it('should mark targetOnly whenever the language is not source-usable', () => {
      expect(
        deriveLanguageEntry({ lang: 'th', name: 'Thai', usable_as_source: false }).targetOnly,
      ).toBe(true);
      expect(
        deriveLanguageEntry({ lang: 'th', name: 'Thai', usable_as_source: true }).targetOnly,
      ).toBeUndefined();
    });

    it('should reproduce every entry currently in the snapshot', () => {
      // The snapshot is generated by this derivation, so re-deriving an entry
      // from the shape it came from must be a fixed point.
      const de = LANGUAGE_REGISTRY.get('de')!;
      expect(
        deriveLanguageEntry({
          lang: 'de',
          name: de.name,
          usable_as_source: true,
          features: { glossary: { status: 'stable' } },
        }),
      ).toEqual(de);
    });
  });

  describe('Language union', () => {
    /**
     * Compile-time, not runtime: these assignments fail to build if the union
     * stops deriving from the snapshot and falls behind it.
     */
    it('should cover the regional variants a hand-written union had missed', () => {
      const codes: Language[] = ['de-ch', 'de-de', 'fr-ca', 'fr-fr'];
      codes.forEach(code => expect(isValidLanguage(code)).toBe(true));
    });

    it('should still exclude a code the snapshot does not list', () => {
      // @ts-expect-error 'zz' is not a snapshot language; widening Language to
      // string would make this directive unused and fail the build.
      const unknown: Language = 'zz';
      expect(isValidLanguage(unknown)).toBe(false);
    });
  });

  describe('looksLikeLanguageTag()', () => {
    it.each(['de', 'ace', 'de-ch', 'en-gb', 'es-419', 'zh-hans', 'bho'])(
      'should accept the well-formed tag %s',
      code => {
        expect(looksLikeLanguageTag(code)).toBe(true);
      },
    );

    it.each(['grman', 'g', '', 'de_CH', 'de-', '-de', 'de-ch-extra', 'DE'])(
      'should reject the malformed tag %s',
      code => {
        expect(looksLikeLanguageTag(code)).toBe(false);
      },
    );
  });

  describe('formality support', () => {
    it('should not carry formality data; GET /v3/languages reports it as features.formality', () => {
      LANGUAGE_REGISTRY.forEach(entry => {
        expect(entry).not.toHaveProperty('supportsFormality');
      });
    });
  });
});
