/**
 * Tests for the classifier that decides whether a run aborts.
 *
 * It matches an API error string that carries no compatibility contract, and it
 * decides whether the remaining files in a batch are sent at all, so every
 * pattern is pinned rather than left as a guess.
 */

import { isUnrecoverableRequestError } from '../../src/utils/unrecoverable-request-error';
import {
  AuthError,
  NetworkError,
  QuotaError,
  RateLimitError,
  ValidationError,
} from '../../src/utils/errors';

describe('isUnrecoverableRequestError', () => {
  describe('rejections that apply to every item', () => {
    it.each([
      "API error: Value for 'target_lang' not supported.",
      "API error: Value for 'source_lang' not supported.",
      'API error: target_lang not supported',
      'API error: source_lang not supported',
    ])('should match %s', message => {
      expect(isUnrecoverableRequestError(new ValidationError(message))).toBe(true);
    });

    it('should match regardless of case', () => {
      expect(
        isUnrecoverableRequestError(new ValidationError("VALUE FOR 'TARGET_LANG' NOT SUPPORTED.")),
      ).toBe(true);
    });

    it('should treat a refused key and an exhausted quota as request-wide', () => {
      expect(isUnrecoverableRequestError(new AuthError('Authentication failed'))).toBe(true);
      expect(isUnrecoverableRequestError(new QuotaError('Quota exceeded'))).toBe(true);
    });
  });

  describe('failures specific to one attempt', () => {
    it('should not match a transient error quoting the same phrase', () => {
      // 5xx interpolates the upstream body, so the message alone cannot tell a
      // gateway hiccup from a rejected language.
      expect(
        isUnrecoverableRequestError(
          new NetworkError(
            "Server error (502): upstream unavailable, value for 'target_lang' not supported by shard",
          ),
        ),
      ).toBe(false);
    });

    it('should not match a rate limit', () => {
      expect(isUnrecoverableRequestError(new RateLimitError('Rate limit exceeded'))).toBe(false);
    });

    it('should not match an unrelated validation error', () => {
      expect(isUnrecoverableRequestError(new ValidationError('Text cannot be empty'))).toBe(false);
    });

    it('should not match a plain Error, whatever it says', () => {
      expect(
        isUnrecoverableRequestError(new Error("Value for 'target_lang' not supported.")),
      ).toBe(false);
    });

    it('should not match a non-error value', () => {
      for (const value of [undefined, null, 'target_lang not supported', 42]) {
        expect(isUnrecoverableRequestError(value)).toBe(false);
      }
    });
  });
});
