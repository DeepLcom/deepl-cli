/**
 * Tests for actionable error suggestions
 * Verifies that error classes include helpful fix suggestions
 * and that the HTTP client attaches them correctly.
 */

import nock from 'nock';
import {
  AuthError,
  RateLimitError,
  QuotaError,
  NetworkError,
  ValidationError,
  ConfigError,
} from '../../src/utils/errors';

describe('Error suggestions', () => {
  describe('DeepLCLIError base class', () => {
    it('should store suggestion when provided', () => {
      // ValidationError doesn't override the constructor, so it uses the base class directly
      const error = new ValidationError('bad input', 'Try this instead');
      expect(error.suggestion).toBe('Try this instead');
    });

    it('should have undefined suggestion when not provided', () => {
      const error = new ValidationError('bad input');
      expect(error.suggestion).toBeUndefined();
    });
  });

  describe('AuthError', () => {
    it('should have a default suggestion about setting the API key', () => {
      const error = new AuthError('Authentication failed');
      expect(error.suggestion).toBe('Run: deepl init (setup wizard) or deepl auth set-key <your-api-key>');
    });

    it('should allow overriding the default suggestion', () => {
      const error = new AuthError('Auth failed', 'Custom suggestion');
      expect(error.suggestion).toBe('Custom suggestion');
    });

    it('should have correct exit code', () => {
      const error = new AuthError('test');
      expect(error.exitCode).toBe(2);
    });

    it('should preserve the error message', () => {
      const error = new AuthError('Authentication failed: Invalid API key');
      expect(error.message).toBe('Authentication failed: Invalid API key');
    });
  });

  describe('RateLimitError', () => {
    it('should have a default suggestion about waiting and retrying', () => {
      const error = new RateLimitError('Rate limit exceeded');
      expect(error.suggestion).toContain('Wait a moment and retry');
      expect(error.suggestion).toContain('--concurrency');
    });

    it('should allow overriding the default suggestion', () => {
      const error = new RateLimitError('Rate limit', 'Custom');
      expect(error.suggestion).toBe('Custom');
    });

    it('should have correct exit code', () => {
      const error = new RateLimitError('test');
      expect(error.exitCode).toBe(3);
    });
  });

  describe('QuotaError', () => {
    it('should have a default suggestion about checking usage and upgrading', () => {
      const error = new QuotaError('Quota exceeded');
      expect(error.suggestion).toContain('deepl usage');
      expect(error.suggestion).toContain('upgrade');
    });

    it('should allow overriding the default suggestion', () => {
      const error = new QuotaError('Quota', 'Custom');
      expect(error.suggestion).toBe('Custom');
    });

    it('should have correct exit code', () => {
      const error = new QuotaError('test');
      expect(error.exitCode).toBe(4);
    });
  });

  describe('NetworkError', () => {
    it('should have a default suggestion about checking connection and proxy', () => {
      const error = new NetworkError('Connection refused');
      expect(error.suggestion).toContain('internet connection');
      expect(error.suggestion).toContain('proxy');
    });

    it('should allow overriding the default suggestion', () => {
      const error = new NetworkError('Network error', 'Custom');
      expect(error.suggestion).toBe('Custom');
    });

    it('should have correct exit code', () => {
      const error = new NetworkError('test');
      expect(error.exitCode).toBe(5);
    });
  });

  describe('ValidationError', () => {
    it('should support optional suggestion', () => {
      const error = new ValidationError('Invalid language', 'Run: deepl languages');
      expect(error.suggestion).toBe('Run: deepl languages');
    });

    it('should have undefined suggestion when none provided', () => {
      const error = new ValidationError('Invalid language');
      expect(error.suggestion).toBeUndefined();
    });

    it('should have correct exit code', () => {
      const error = new ValidationError('test');
      expect(error.exitCode).toBe(6);
    });
  });

  describe('ConfigError', () => {
    it('should support optional suggestion', () => {
      const error = new ConfigError('Config missing', 'Run: deepl config set ...');
      expect(error.suggestion).toBe('Run: deepl config set ...');
    });

    it('should have undefined suggestion when none provided', () => {
      const error = new ConfigError('Config missing');
      expect(error.suggestion).toBeUndefined();
    });

    it('should have correct exit code', () => {
      const error = new ConfigError('test');
      expect(error.exitCode).toBe(7);
    });
  });
});

describe('HttpClient.handleError suggestions', () => {
  const baseUrl = 'https://api-free.deepl.com';

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  async function createClientAndTranslate(statusCode: number, body: Record<string, unknown> = {}) {
    const { DeepLClient } = await import('../../src/api/deepl-client');
    const client = new DeepLClient('test-api-key', { maxRetries: 0 });

    nock(baseUrl)
      .post('/v2/translate')
      .reply(statusCode, body);

    return client.translate('Hello', { targetLang: 'es' });
  }

  it('should include suggestion for HTTP 403 (auth error)', async () => {
    await expect(createClientAndTranslate(403))
      .rejects
      .toMatchObject({
        message: expect.stringContaining('Authentication failed'),
        suggestion: expect.stringContaining('deepl auth set-key'),
      });
  });

  it('should include suggestion for HTTP 456 (quota exceeded)', async () => {
    await expect(createClientAndTranslate(456))
      .rejects
      .toMatchObject({
        message: expect.stringContaining('Quota exceeded'),
        suggestion: expect.stringContaining('deepl usage'),
      });
  });

  it('should include suggestion for HTTP 429 (rate limit)', async () => {
    await expect(createClientAndTranslate(429))
      .rejects
      .toMatchObject({
        message: expect.stringContaining('Rate limit exceeded'),
        suggestion: expect.stringContaining('Wait a moment'),
      });
  });

  it('should include suggestion for HTTP 503 (service unavailable)', async () => {
    await expect(createClientAndTranslate(503))
      .rejects
      .toMatchObject({
        message: expect.stringContaining('Service temporarily unavailable'),
        suggestion: expect.stringContaining('internet connection'),
      });
  });

  it('should wrap unrecognized 4xx errors with ValidationError', async () => {
    const { DeepLClient } = await import('../../src/api/deepl-client');
    const client = new DeepLClient('test-api-key', { maxRetries: 0 });

    nock(baseUrl)
      .post('/v2/translate')
      .reply(422, { message: 'Unprocessable Entity' });

    await expect(client.translate('Hello', { targetLang: 'es' }))
      .rejects
      .toBeInstanceOf(ValidationError);
  });

  it('should wrap network-level errors with NetworkError and suggestion', async () => {
    const { DeepLClient } = await import('../../src/api/deepl-client');
    const client = new DeepLClient('test-api-key', {
      maxRetries: 0,
      baseUrl: 'https://localhost:1',
    });

    nock('https://localhost:1')
      .post('/v2/translate')
      .replyWithError('connect ECONNREFUSED 127.0.0.1:1');

    await expect(client.translate('Hello', { targetLang: 'es' }))
      .rejects
      .toMatchObject({
        message: expect.stringContaining('ECONNREFUSED'),
        suggestion: expect.stringContaining('internet connection'),
      });
  });
});
