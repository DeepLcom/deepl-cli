import { UUID_RE, validateUuid, validateTranslationMemoryId } from '../../src/utils/uuid';
import { ValidationError } from '../../src/utils/errors';

describe('UUID_RE', () => {
  it('matches canonical 8-4-4-4-12 lowercase', () => {
    expect(UUID_RE.test('11111111-2222-3333-4444-555555555555')).toBe(true);
  });

  it('matches canonical 8-4-4-4-12 uppercase (case-insensitive)', () => {
    expect(UUID_RE.test('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(true);
  });

  it('is anchored — rejects embedded UUID with leading text', () => {
    expect(UUID_RE.test('prefix-11111111-2222-3333-4444-555555555555')).toBe(false);
  });

  it('is anchored — rejects embedded UUID with trailing text', () => {
    expect(UUID_RE.test('11111111-2222-3333-4444-555555555555-suffix')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(UUID_RE.test('')).toBe(false);
  });

  it('rejects short form', () => {
    expect(UUID_RE.test('1111-2222-3333-4444')).toBe(false);
  });

  it('rejects non-hex chars in a segment', () => {
    expect(UUID_RE.test('zzzzzzzz-2222-3333-4444-555555555555')).toBe(false);
  });

  it('rejects a uuid with path-traversal chars', () => {
    expect(UUID_RE.test('../11111111-2222-3333-4444-555555555555')).toBe(false);
    expect(UUID_RE.test('11111111-2222-3333-4444-555555555555/../')).toBe(false);
  });
});

describe('validateUuid', () => {
  it('accepts a canonical UUID without throwing', () => {
    expect(() => validateUuid('11111111-2222-3333-4444-555555555555')).not.toThrow();
  });

  it('throws ValidationError on malformed input', () => {
    expect(() => validateUuid('not-a-uuid')).toThrow(ValidationError);
  });

  it('throws ValidationError on empty string', () => {
    expect(() => validateUuid('')).toThrow(ValidationError);
  });

  it('does NOT echo the raw input in the error message (attacker-controlled data)', () => {
    try {
      validateUuid('../../../etc/passwd');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).not.toContain('../');
      expect((err as Error).message).not.toContain('passwd');
    }
  });
});

describe('validateTranslationMemoryId', () => {
  it('accepts a canonical UUID without throwing', () => {
    expect(() => validateTranslationMemoryId('11111111-2222-3333-4444-555555555555')).not.toThrow();
  });

  it('throws ValidationError on non-UUID strings (loose glossary pattern rejected)', () => {
    expect(() => validateTranslationMemoryId('my-tm-name')).toThrow('Invalid translation memory ID format');
  });

  it('throws ValidationError on path-traversal input without echoing raw bytes', () => {
    try {
      validateTranslationMemoryId('../../../etc/passwd');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).not.toContain('..');
      expect((err as Error).message).not.toContain('passwd');
      expect((err as Error).message).toContain('translation memory');
    }
  });
});
