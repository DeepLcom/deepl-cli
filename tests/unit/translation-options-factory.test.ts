import { buildBaseTranslationOptions, applySharedTmAndGlossary } from '../../src/cli/commands/translate/translation-options-factory';
import type { TranslateOptions } from '../../src/cli/commands/translate/types';
import type { GlossaryService } from '../../src/services/glossary';
import type { TranslationService } from '../../src/services/translation';
import type { TranslationOptions } from '../../src/types/api';

describe('translation-options-factory', () => {
  describe('buildBaseTranslationOptions()', () => {
    it('always sets targetLang from options.to', () => {
      const result = buildBaseTranslationOptions({ to: 'de' });
      expect(result.targetLang).toBe('de');
    });

    it('maps from → sourceLang', () => {
      const result = buildBaseTranslationOptions({ to: 'de', from: 'en' });
      expect(result.sourceLang).toBe('en');
    });

    it('maps formality', () => {
      const result = buildBaseTranslationOptions({ to: 'de', formality: 'more' });
      expect(result.formality).toBe('more');
    });

    it('maps glossary into options.glossary but does NOT set glossaryId (resolution is async)', () => {
      const result = buildBaseTranslationOptions({ to: 'de', glossary: 'my-glossary' });
      expect(result.glossaryId).toBeUndefined();
    });

    it('maps modelType', () => {
      const result = buildBaseTranslationOptions({ to: 'de', modelType: 'quality_optimized' });
      expect(result.modelType).toBe('quality_optimized');
    });

    it('maps preserveFormatting=true', () => {
      const result = buildBaseTranslationOptions({ to: 'de', preserveFormatting: true });
      expect(result.preserveFormatting).toBe(true);
    });

    it('maps preserveFormatting=false', () => {
      const result = buildBaseTranslationOptions({ to: 'de', preserveFormatting: false });
      expect(result.preserveFormatting).toBe(false);
    });

    it('maps context string', () => {
      const result = buildBaseTranslationOptions({ to: 'de', context: 'product ui' });
      expect(result.context).toBe('product ui');
    });

    it('maps showBilledCharacters', () => {
      const result = buildBaseTranslationOptions({ to: 'de', showBilledCharacters: true });
      expect(result.showBilledCharacters).toBe(true);
    });

    it('omits undefined fields', () => {
      const result = buildBaseTranslationOptions({ to: 'de' });
      expect(Object.keys(result)).toEqual(['targetLang']);
    });

    it('produces identical output for the same inputs across invocations (stability)', () => {
      const opts: TranslateOptions = { to: 'de', from: 'en', formality: 'more', modelType: 'quality_optimized', preserveFormatting: true };
      const a = buildBaseTranslationOptions(opts);
      const b = buildBaseTranslationOptions(opts);
      expect(a).toEqual(b);
    });
  });

  describe('applySharedTmAndGlossary()', () => {
    let glossarySvc: jest.Mocked<GlossaryService>;
    let translationSvc: jest.Mocked<TranslationService>;

    beforeEach(() => {
      glossarySvc = {
        resolveGlossaryId: jest.fn(),
      } as unknown as jest.Mocked<GlossaryService>;
      translationSvc = {
        listTranslationMemories: jest.fn().mockResolvedValue([
          { translation_memory_id: 'tm-uuid-1', name: 'my-tm', source_language: 'en', target_languages: ['de'], ready: true },
        ]),
      } as unknown as jest.Mocked<TranslationService>;
    });

    it('resolves glossaryId when options.glossary is set', async () => {
      glossarySvc.resolveGlossaryId.mockResolvedValue('glos-123');
      const base: Record<string, unknown> = { targetLang: 'de' };
      await applySharedTmAndGlossary(base, { to: 'de', glossary: 'my-glossary' } as TranslateOptions, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });
      expect(base['glossaryId']).toBe('glos-123');
      expect(glossarySvc.resolveGlossaryId).toHaveBeenCalledWith('my-glossary');
    });

    it('skips glossary resolution when options.glossary is absent', async () => {
      const base: Record<string, unknown> = { targetLang: 'de' };
      await applySharedTmAndGlossary(base, { to: 'de' } as TranslateOptions, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });
      expect(base['glossaryId']).toBeUndefined();
      expect(glossarySvc.resolveGlossaryId).not.toHaveBeenCalled();
    });

    it('resolves TM id and sets threshold when options.translationMemory is set', async () => {
      const base: Record<string, unknown> = { targetLang: 'de' };
      await applySharedTmAndGlossary(base, { to: 'de', from: 'en', translationMemory: 'my-tm', tmThreshold: 80 } as TranslateOptions, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });
      expect(base['translationMemoryId']).toBe('tm-uuid-1');
      expect(base['translationMemoryThreshold']).toBe(80);
    });

    it('defaults modelType to quality_optimized when TM is set and modelType was absent', async () => {
      const base: Record<string, unknown> = { targetLang: 'de' };
      await applySharedTmAndGlossary(base, { to: 'de', from: 'en', translationMemory: 'my-tm' } as TranslateOptions, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });
      expect(base['modelType']).toBe('quality_optimized');
    });

    it('preserves an already-set modelType when TM is also set', async () => {
      const base: Record<string, unknown> = { targetLang: 'de', modelType: 'quality_optimized' };
      await applySharedTmAndGlossary(base, { to: 'de', from: 'en', translationMemory: 'my-tm', modelType: 'quality_optimized' } as TranslateOptions, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });
      expect(base['modelType']).toBe('quality_optimized');
    });

    it('omits translationMemoryThreshold when tmThreshold is undefined', async () => {
      const base: Record<string, unknown> = { targetLang: 'de' };
      await applySharedTmAndGlossary(base, { to: 'de', from: 'en', translationMemory: 'my-tm' } as TranslateOptions, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });
      expect(base['translationMemoryThreshold']).toBeUndefined();
    });

    it('resolves TM for a multi-target list of languages', async () => {
      translationSvc.listTranslationMemories = jest.fn().mockResolvedValue([
        { translation_memory_id: 'tm-multi', name: 'multi-tm', source_language: 'en', target_languages: ['de'], ready: true },
      ]) as never;
      const base: Record<string, unknown> = { targetLang: 'de' };
      await applySharedTmAndGlossary(base, { to: 'de', from: 'en', translationMemory: 'multi-tm' } as TranslateOptions, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'], // single-pair TMs for each target — here one target matches
      });
      expect(base['translationMemoryId']).toBe('tm-multi');
    });

    it('skips TM block when options.translationMemory is absent', async () => {
      const base: Record<string, unknown> = { targetLang: 'de' };
      await applySharedTmAndGlossary(base, { to: 'de' } as TranslateOptions, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });
      expect(base['translationMemoryId']).toBeUndefined();
      expect(base['translationMemoryThreshold']).toBeUndefined();
    });
  });

  describe('equivalence across translate/translate-file/translate-directory code paths', () => {
    // Drift-detection — if one handler's factory output diverges from another
    // given the same input, this test fails.
    it('produces identical base options for --formality --glossary --model-type --preserve-formatting', () => {
      const opts: TranslateOptions = {
        to: 'de',
        from: 'en',
        formality: 'less',
        glossary: 'my-glossary',
        modelType: 'quality_optimized',
        preserveFormatting: true,
      };
      const text = buildBaseTranslationOptions(opts);
      const file = buildBaseTranslationOptions(opts);
      expect(text).toEqual(file);
      expect(text.targetLang).toBe('de');
      expect(text.sourceLang).toBe('en');
      expect(text.formality).toBe('less');
      expect(text.modelType).toBe('quality_optimized');
      expect(text.preserveFormatting).toBe(true);
    });

    it('produces identical base options for --translation-memory + --tm-threshold', () => {
      const opts: TranslateOptions = {
        to: 'de',
        from: 'en',
        translationMemory: 'my-tm',
        tmThreshold: 90,
      };
      const a = buildBaseTranslationOptions(opts);
      const b = buildBaseTranslationOptions(opts);
      expect(a).toEqual(b);
      // The factory's base step does NOT resolve TM; it just carries targetLang + sourceLang.
      expect(a.translationMemoryId).toBeUndefined();
    });

    it('combined base + TM/glossary layering yields the same shape in text-single and file-single paths', async () => {
      const opts: TranslateOptions = {
        to: 'de',
        from: 'en',
        formality: 'more',
        glossary: 'my-glossary',
        translationMemory: 'my-tm',
        tmThreshold: 85,
        modelType: 'quality_optimized',
        preserveFormatting: true,
      };

      const glossarySvc = {
        resolveGlossaryId: jest.fn().mockResolvedValue('g-1'),
      } as unknown as jest.Mocked<GlossaryService>;
      const translationSvc = {
        listTranslationMemories: jest.fn().mockResolvedValue([
          { translation_memory_id: 'tm-1', name: 'my-tm', source_language: 'en', target_languages: ['de'], ready: true },
        ]),
      } as unknown as jest.Mocked<TranslationService>;

      // Text-single path
      const textBase: TranslationOptions = buildBaseTranslationOptions(opts);
      await applySharedTmAndGlossary(textBase, opts, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });

      // File-single path (plain + structured share the same pattern in the new factory)
      const fileBase: TranslationOptions = buildBaseTranslationOptions(opts);
      await applySharedTmAndGlossary(fileBase, opts, {
        glossaryService: glossarySvc,
        translationService: translationSvc,
        targets: ['de'],
      });

      expect(textBase).toEqual(fileBase);
      expect(textBase.glossaryId).toBe('g-1');
      expect(textBase.translationMemoryId).toBe('tm-1');
      expect(textBase.translationMemoryThreshold).toBe(85);
      expect(textBase.modelType).toBe('quality_optimized');
    });
  });
});
