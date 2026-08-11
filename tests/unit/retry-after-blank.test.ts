/**
 * Tests Retry-After parsing.
 *
 * A blank header must read as absent, not as a delay. `Number('')` is 0, which
 * satisfies a bare finite check, and because 0 is a real number the
 * `retryAfterDelay ?? computeBackoffWithJitter` fallback would not engage —
 * every 429 retry would then fire back-to-back against an endpoint already
 * rate-limiting the client. A literal `0` is still honoured, so absent and zero
 * have to stay distinguishable.
 */

import { HttpClient } from '../../src/api/http-client';

/** Exposes the protected parser without going through a real request. */
class ProbeClient extends HttpClient {
  public parse(headerValue: string | undefined): number | undefined {
    return this.parseRetryAfter(headerValue);
  }
}

describe('parseRetryAfter', () => {
  let client: ProbeClient;

  beforeEach(() => {
    client = new ProbeClient('test-key:fx');
  });

  it.each([
    ['empty string', ''],
    ['single space', ' '],
    ['whitespace only', '   \t '],
  ])(
    'should treat a %s header as absent so jitter backoff applies',
    (_label, headerValue) => {
      expect(client.parse(headerValue)).toBeUndefined();
    }
  );

  it('should treat a missing header as absent', () => {
    expect(client.parse(undefined)).toBeUndefined();
  });

  it('should still honour a literal zero', () => {
    // An explicit "Retry-After: 0" is a real instruction, unlike a blank value.
    expect(client.parse('0')).toBe(0);
  });

  it('should parse delta-seconds', () => {
    expect(client.parse('5')).toBe(5000);
  });

  it('should clamp an excessive delay', () => {
    expect(client.parse('99999')).toBe(60_000);
  });

  it('should ignore a non-numeric, non-date value', () => {
    expect(client.parse('soon')).toBeUndefined();
  });
});
