/**
 * Tests for glossary wire-parameter selection (glossary_id vs glossary_ids)
 */

import {
  resolveGlossaryWireParams,
  encodeGlossaryIdsForMultipart,
  applyGlossarySourceLang,
  hasGlossarySelection,
  MAX_GLOSSARIES_PER_REQUEST,
} from '../../src/utils/glossary-params.js';
import { ValidationError } from '../../src/utils/errors.js';

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('resolveGlossaryWireParams', () => {
  it('should return undefined when no glossary is selected', () => {
    expect(resolveGlossaryWireParams({})).toBeUndefined();
  });

  it('should return undefined for an empty glossaryIds list', () => {
    expect(resolveGlossaryWireParams({ glossaryIds: [] })).toBeUndefined();
  });

  it('should send a lone glossaryId as glossary_id', () => {
    expect(resolveGlossaryWireParams({ glossaryId: A })).toEqual({ glossary_id: A });
  });

  it('should send a single-entry glossaryIds list as glossary_id', () => {
    expect(resolveGlossaryWireParams({ glossaryIds: [A] })).toEqual({ glossary_id: A });
  });

  it('should send two or more IDs as glossary_ids', () => {
    expect(resolveGlossaryWireParams({ glossaryIds: [A, B] })).toEqual({ glossary_ids: [A, B] });
  });

  it('should preserve the caller order, since the last glossary wins conflicts', () => {
    expect(resolveGlossaryWireParams({ glossaryIds: [C, A, B] })).toEqual({
      glossary_ids: [C, A, B],
    });
  });

  it('should accept exactly the maximum number of glossaries', () => {
    const ids = [A, B, C, A, B];
    expect(ids).toHaveLength(MAX_GLOSSARIES_PER_REQUEST);
    expect(resolveGlossaryWireParams({ glossaryIds: ids })).toEqual({ glossary_ids: ids });
  });

  it('should reject more than the maximum number of glossaries', () => {
    expect.assertions(3);
    const ids = [A, B, C, A, B, C];
    expect(() => resolveGlossaryWireParams({ glossaryIds: ids })).toThrow(ValidationError);
    try {
      resolveGlossaryWireParams({ glossaryIds: ids });
    } catch (error) {
      expect((error as ValidationError).message).toContain('maximum of 5 glossaries');
      expect((error as ValidationError).message).toContain('got 6');
    }
  });

  it('should reject glossaryId combined with glossaryIds, which the API refuses', () => {
    expect.assertions(2);
    expect(() => resolveGlossaryWireParams({ glossaryId: A, glossaryIds: [B] })).toThrow(
      ValidationError,
    );
    try {
      resolveGlossaryWireParams({ glossaryId: A, glossaryIds: [B] });
    } catch (error) {
      expect((error as ValidationError).message).toContain('Cannot combine');
    }
  });

  it('should ignore an empty glossaryIds list alongside glossaryId', () => {
    expect(resolveGlossaryWireParams({ glossaryId: A, glossaryIds: [] })).toEqual({
      glossary_id: A,
    });
  });
});

describe('encodeGlossaryIdsForMultipart', () => {
  it('should join IDs with commas and no whitespace', () => {
    expect(encodeGlossaryIdsForMultipart([A, B])).toBe(`${A},${B}`);
  });

  it('should preserve order', () => {
    expect(encodeGlossaryIdsForMultipart([B, A])).toBe(`${B},${A}`);
  });
});

describe('hasGlossarySelection', () => {
  it('should treat an empty array as selecting nothing, unlike bare truthiness', () => {
    expect(hasGlossarySelection({ glossary: [] })).toBe(false);
  });

  it('should recognize a string and a non-empty array', () => {
    expect(hasGlossarySelection({ glossary: 'terms' })).toBe(true);
    expect(hasGlossarySelection({ glossary: ['terms'] })).toBe(true);
  });
});

describe('applyGlossarySourceLang', () => {
  const example = 'Example: deepl translate --from en --to es --glossary g "Hello"';

  it('should leave an explicit --from alone', () => {
    const options = { glossary: ['terms'], from: 'de' };
    applyGlossarySourceLang(options, 'en', example);
    expect(options.from).toBe('de');
  });

  it('should fall back to the configured source language', () => {
    // The request carries source_lang either way, so rejecting on a missing
    // flag alone broke sessions that had been working from config.
    const options: { glossary: string[]; from?: string } = { glossary: ['terms'] };
    applyGlossarySourceLang(options, 'EN', example);
    expect(options.from).toBe('en');
  });

  it('should throw only when neither the flag nor the config supplies one', () => {
    expect(() => applyGlossarySourceLang({ glossary: ['terms'] }, undefined, example)).toThrow(
      ValidationError,
    );
    expect(() => applyGlossarySourceLang({ glossary: ['terms'] }, undefined, example)).toThrow(
      'Source language (--from) is required when using a glossary',
    );
  });

  it('should do nothing when no glossary is selected', () => {
    const options: { glossary?: string[]; from?: string } = { glossary: [] };
    expect(() => applyGlossarySourceLang(options, undefined, example)).not.toThrow();
    expect(options.from).toBeUndefined();
  });

  it('should accept a single-string glossary, as watch and sync spell it', () => {
    const options: { glossary: string; from?: string } = { glossary: 'terms' };
    applyGlossarySourceLang(options, 'en', example);
    expect(options.from).toBe('en');
  });
});
