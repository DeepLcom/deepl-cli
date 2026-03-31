import nock from 'nock';
import { HttpClient, isFreeApiKey } from '../../src/api/http-client';
import { NetworkError } from '../../src/utils/errors';

class TestHttpClient extends HttpClient {
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.makeRequest<T>('GET', path, params);
  }

  callParseRetryAfter(value: string | undefined): number | undefined {
    return this.parseRetryAfter(value);
  }
}

describe('isFreeApiKey', () => {
  it('should return true for keys ending with :fx', () => {
    expect(isFreeApiKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx')).toBe(true);
  });

  it('should return true for short keys ending with :fx', () => {
    expect(isFreeApiKey('test-key:fx')).toBe(true);
  });

  it('should return false for pro keys without :fx suffix', () => {
    expect(isFreeApiKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });

  it('should return false for keys with :fx in the middle', () => {
    expect(isFreeApiKey('key:fx:extra')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isFreeApiKey('')).toBe(false);
  });
});

describe('HttpClient', () => {
  const apiKey = 'test-api-key';
  const baseUrl = 'https://api-free.deepl.com';
  let client: TestHttpClient;
  let sleepSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    client = new TestHttpClient(apiKey, { maxRetries: 3 });
    sleepSpy = jest.spyOn(client as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue();
    nock.cleanAll();
  });

  afterEach(() => {
    jest.useRealTimers();
    nock.cleanAll();
  });

  describe('Retry-After header parsing', () => {
    it('should parse numeric Retry-After value as seconds', () => {
      expect(client.callParseRetryAfter('5')).toBe(5000);
    });

    it('should parse Retry-After: 0 as immediate retry', () => {
      expect(client.callParseRetryAfter('0')).toBe(0);
    });

    it('should return undefined for missing Retry-After', () => {
      expect(client.callParseRetryAfter(undefined)).toBeUndefined();
    });

    it('should cap Retry-After exceeding 60 seconds', () => {
      expect(client.callParseRetryAfter('120')).toBe(60000);
    });

    it('should return undefined for invalid Retry-After value', () => {
      expect(client.callParseRetryAfter('not-a-number-or-date')).toBeUndefined();
    });

    it('should parse HTTP date format Retry-After', () => {
      const futureDate = new Date(Date.now() + 10000);
      const result = client.callParseRetryAfter(futureDate.toUTCString());
      expect(result).toBeDefined();
      expect(result!).toBeGreaterThan(0);
      expect(result!).toBeLessThanOrEqual(11000);
    });

    it('should treat past HTTP date as 0 delay', () => {
      const pastDate = new Date(Date.now() - 5000);
      expect(client.callParseRetryAfter(pastDate.toUTCString())).toBe(0);
    });

    it('should cap HTTP date Retry-After exceeding 60 seconds', () => {
      const farFuture = new Date(Date.now() + 120000);
      expect(client.callParseRetryAfter(farFuture.toUTCString())).toBe(60000);
    });

    it('should handle negative numeric Retry-After as 0', () => {
      expect(client.callParseRetryAfter('-5')).toBe(0);
    });
  });

  describe('429 retry behavior', () => {
    it('should retry on 429 with Retry-After: 5 and wait 5 seconds', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' }, { 'Retry-After': '5' });
      nock(baseUrl)
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      const result = await client.get<{ result: string }>('/v2/test');

      expect(result).toEqual({ result: 'ok' });
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenCalledWith(5000);
    });

    it('should retry immediately on 429 with Retry-After: 0', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' }, { 'Retry-After': '0' });
      nock(baseUrl)
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      const result = await client.get<{ result: string }>('/v2/test');

      expect(result).toEqual({ result: 'ok' });
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenCalledWith(0);
    });

    it('should use exponential backoff on 429 without Retry-After', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' });
      nock(baseUrl)
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      const result = await client.get<{ result: string }>('/v2/test');

      expect(result).toEqual({ result: 'ok' });
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenCalledWith(1000);
    });

    it('should cap Retry-After at 60 seconds', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' }, { 'Retry-After': '300' });
      nock(baseUrl)
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      const result = await client.get<{ result: string }>('/v2/test');

      expect(result).toEqual({ result: 'ok' });
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenCalledWith(60000);
    });

    it('should fall back to exponential backoff on invalid Retry-After', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' }, { 'Retry-After': 'garbage' });
      nock(baseUrl)
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      const result = await client.get<{ result: string }>('/v2/test');

      expect(result).toEqual({ result: 'ok' });
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenCalledWith(1000);
    });

    it('should handle Retry-After as HTTP date format', async () => {
      const futureDate = new Date(Date.now() + 10000);
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' }, { 'Retry-After': futureDate.toUTCString() });
      nock(baseUrl)
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      const result = await client.get<{ result: string }>('/v2/test');

      expect(result).toEqual({ result: 'ok' });
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      const delay = sleepSpy.mock.calls[0][0] as number;
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(11000);
    });

    it('should use exponential backoff across multiple 429 retries without Retry-After', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' });
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' });
      nock(baseUrl)
        .get('/v2/test')
        .reply(429, { message: 'Too many requests' });
      nock(baseUrl)
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      const result = await client.get<{ result: string }>('/v2/test');

      expect(result).toEqual({ result: 'ok' });
      expect(sleepSpy).toHaveBeenCalledTimes(3);
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);
      expect(sleepSpy).toHaveBeenNthCalledWith(3, 4000);
    });

    it('should throw RateLimitError after exhausting all retries on 429', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .times(4)
        .reply(429, { message: 'Too many requests' });

      await expect(client.get('/v2/test')).rejects.toThrow();
      expect(sleepSpy).toHaveBeenCalledTimes(3);
    });

    it('should still throw immediately on other 4xx errors', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .reply(403, { message: 'Forbidden' });

      await expect(client.get('/v2/test')).rejects.toThrow('Authentication failed');
      expect(sleepSpy).not.toHaveBeenCalled();
    });
  });

  describe('retry error wrapping (W6)', () => {
    it('should throw NetworkError after retry exhaustion on 500', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .times(4)
        .reply(500, { message: 'Internal Server Error' });

      await expect(client.get('/v2/test')).rejects.toThrow(NetworkError);
      expect(sleepSpy).toHaveBeenCalledTimes(3);
    });

    it('should wrap retry-exhausted errors through handleError', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .times(4)
        .reply(500, { message: 'Internal Server Error' });

      await expect(client.get('/v2/test')).rejects.toThrow(/Server error \(500\)/);
    });
  });

  describe('5xx error mapping (W7)', () => {
    it('should map 500 to NetworkError with status in message', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .times(4)
        .reply(500, { message: 'Internal Server Error' });

      try {
        await client.get('/v2/test');
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as Error).message).toContain('500');
      }
    });

    it('should map 502 to NetworkError with status in message', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .times(4)
        .reply(502, { message: 'Bad Gateway' });

      try {
        await client.get('/v2/test');
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as Error).message).toContain('502');
      }
    });

    it('should still map 503 to the specific service unavailable message', async () => {
      nock(baseUrl)
        .get('/v2/test')
        .times(4)
        .reply(503, { message: 'Service Unavailable' });

      try {
        await client.get('/v2/test');
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as Error).message).toContain('Service temporarily unavailable');
      }
    });
  });

  describe('API URL auto-detection from key suffix', () => {
    it('should use free API URL for keys ending with :fx', async () => {
      const freeClient = new TestHttpClient('test-key:fx');
      const scope = nock('https://api-free.deepl.com')
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      await freeClient.get('/v2/test');
      expect(scope.isDone()).toBe(true);
    });

    it('should use pro API URL for keys without :fx suffix', async () => {
      const proClient = new TestHttpClient('test-pro-key');
      const scope = nock('https://api.deepl.com')
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      await proClient.get('/v2/test');
      expect(scope.isDone()).toBe(true);
    });

    it('should allow explicit baseUrl to override auto-detection', async () => {
      const customUrl = 'https://custom.example.com';
      const customClient = new TestHttpClient('test-key:fx', { baseUrl: customUrl });
      const scope = nock(customUrl)
        .get('/v2/test')
        .reply(200, { result: 'ok' });

      await customClient.get('/v2/test');
      expect(scope.isDone()).toBe(true);
    });
  });
});
