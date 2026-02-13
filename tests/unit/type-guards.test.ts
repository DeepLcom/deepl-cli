import { isTranslationResult } from '../../src/api/translation-client';
import { isWriteImprovementArray } from '../../src/types/api';

describe('isTranslationResult', () => {
  it('should return true for valid TranslationResult', () => {
    expect(isTranslationResult({ text: 'Hello' })).toBe(true);
  });

  it('should return true with optional fields', () => {
    expect(isTranslationResult({
      text: 'Hola',
      detectedSourceLang: 'EN',
      billedCharacters: 5,
      modelTypeUsed: 'quality_optimized',
    })).toBe(true);
  });

  it('should return false for missing text', () => {
    expect(isTranslationResult({ detectedSourceLang: 'EN' })).toBe(false);
  });

  it('should return false for non-string text', () => {
    expect(isTranslationResult({ text: 123 })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isTranslationResult(null)).toBe(false);
  });

  it('should return false for number', () => {
    expect(isTranslationResult(42)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isTranslationResult('hello')).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isTranslationResult(undefined)).toBe(false);
  });
});

describe('isWriteImprovementArray', () => {
  it('should return true for valid array', () => {
    expect(isWriteImprovementArray([
      { text: 'Improved text', targetLanguage: 'en' },
    ])).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isWriteImprovementArray([])).toBe(true);
  });

  it('should return true for multiple items', () => {
    expect(isWriteImprovementArray([
      { text: 'First', targetLanguage: 'en' },
      { text: 'Second', targetLanguage: 'de' },
    ])).toBe(true);
  });

  it('should return false for non-array', () => {
    expect(isWriteImprovementArray({ text: 'not an array' })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isWriteImprovementArray(null)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isWriteImprovementArray('hello')).toBe(false);
  });

  it('should return false for array with invalid item (missing text)', () => {
    expect(isWriteImprovementArray([
      { targetLanguage: 'en' },
    ])).toBe(false);
  });

  it('should return false for array with null item', () => {
    expect(isWriteImprovementArray([null])).toBe(false);
  });

  it('should return false for array with non-object item', () => {
    expect(isWriteImprovementArray(['hello'])).toBe(false);
  });
});
