/**
 * Tests for glossary wire-parameter selection (glossary_id vs glossary_ids)
 */

import {
  resolveGlossaryWireParams,
  encodeGlossaryIdsForMultipart,
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
