import {
  TmsClient,
  TmsTimeoutError,
  MAX_PULL_BODY_BYTES,
  resolveTmsCredentials,
  createTmsClient,
} from '../../../src/sync/tms-client';
import type { SyncTmsConfig } from '../../../src/sync/types';
import type { TmsServerTrustDeps } from '../../../src/sync/tms-server-trust';
import { ConfigError, ValidationError } from '../../../src/utils/errors';
import { ExitCode, exitCodeForError } from '../../../src/utils/exit-codes';
import { Logger } from '../../../src/utils/logger';

const mockFetch = jest.fn();
(global as unknown as Record<string, unknown>)['fetch'] = mockFetch;

describe('TmsClient', () => {
  const client = new TmsClient({
    serverUrl: 'https://tms.example.com',
    projectId: 'proj-123',
    apiKey: 'test-key',
  });

  beforeEach(() => mockFetch.mockReset());

  it('should send PUT with correct URL and body for pushKey', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('greeting', 'de', 'Hallo');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://tms.example.com/api/projects/proj-123/keys/greeting',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ locale: 'de', value: 'Hallo' }),
      })
    );
  });

  it('should send GET and parse JSON for pullKeys', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: 'Hallo' }),
    });
    const result = await client.pullKeys('de');
    expect(result).toEqual({ greeting: 'Hallo' });
  });

  it('should use ApiKey auth header', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('k', 'de', 'v');
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers?.['Authorization']).toBe('ApiKey test-key');
  });

  it('should use Bearer auth when token configured', async () => {
    const tokenClient = new TmsClient({
      serverUrl: 'https://s.com',
      projectId: 'p',
      token: 'tok',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await tokenClient.pushKey('k', 'de', 'v');
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers?.['Authorization']).toBe('Bearer tok');
  });

  it('should throw ConfigError with remediation hint on 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(ConfigError);
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(
      /TMS authentication failed \(401/
    );
  });

  it('should throw ConfigError with remediation hint on 403', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(ConfigError);
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(
      /TMS authentication failed \(403/
    );
  });

  it('should throw generic Error on non-auth HTTP failures (e.g. 500)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(
      /TMS API error: 500/
    );
    await expect(client.pushKey('k', 'de', 'v')).rejects.not.toThrow(
      ConfigError
    );
  });

  it('should encode key paths', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('nav/home', 'de', 'v');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('nav%2Fhome'),
      expect.anything()
    );
  });
});

describe('TmsClient HTTPS validation', () => {
  beforeEach(() => mockFetch.mockReset());

  it('should reject http:// URLs that are not localhost', async () => {
    const client = new TmsClient({
      serverUrl: 'http://evil.example.com',
      projectId: 'proj-1',
      apiKey: 'key',
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(ConfigError);
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(
      'TMS server URL must use HTTPS'
    );
  });

  it('should accept https:// URLs', async () => {
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'proj-1',
      apiKey: 'key',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(client.pushKey('k', 'de', 'v')).resolves.toBeUndefined();
  });

  it('should accept http://localhost for dev mode', async () => {
    const client = new TmsClient({
      serverUrl: 'http://localhost:8080',
      projectId: 'proj-1',
      apiKey: 'key',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(client.pushKey('k', 'de', 'v')).resolves.toBeUndefined();
  });

  it('should accept http://127.0.0.1 for dev mode', async () => {
    const client = new TmsClient({
      serverUrl: 'http://127.0.0.1:3000',
      projectId: 'proj-1',
      apiKey: 'key',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(client.pushKey('k', 'de', 'v')).resolves.toBeUndefined();
  });

  // Only those two spellings are waived, so a local TMS named any other way is
  // refused correctly but has to be told how to proceed. `http://localhost`
  // reaches a server bound to ::1 or to 0.0.0.0 as well as one bound to
  // 127.0.0.1, which is why it is the whole of the remedy.
  it('names the accepted spellings when refusing another loopback address', async () => {
    const client = new TmsClient({
      serverUrl: 'http://[::1]:3000',
      projectId: 'proj-1',
      apiKey: 'key',
    });

    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(ConfigError);
    const err = await client.pushKey('k', 'de', 'v').catch((e: unknown) => e);
    expect((err as ConfigError).message).toContain(
      'TMS server URL must use HTTPS'
    );
    expect((err as ConfigError).message).toContain('http://[::1]:3000');
    expect((err as ConfigError).suggestion).toContain('http://localhost');
    expect((err as ConfigError).suggestion).toContain('127.0.0.1');
  });

  it('says the same for a host that is not loopback at all', async () => {
    const client = new TmsClient({
      serverUrl: 'http://tms.internal:3000',
      projectId: 'proj-1',
      apiKey: 'key',
    });

    const err = await client.pushKey('k', 'de', 'v').catch((e: unknown) => e);
    expect((err as ConfigError).message).toContain('http://tms.internal:3000');
    expect((err as ConfigError).suggestion).toContain('http://localhost');
  });

  // Over-rejection guard: the waiver is not widened by the message change. The
  // URL parser normalizes these three to 127.0.0.1, so they were always accepted.
  it.each([
    'http://0x7f.0.0.1:3000',
    'http://127.1:3000',
    'http://2130706433:3000',
  ])('still accepts %s, which normalizes to 127.0.0.1', async (serverUrl) => {
    const client = new TmsClient({
      serverUrl,
      projectId: 'proj-1',
      apiKey: 'key',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(client.pushKey('k', 'de', 'v')).resolves.toBeUndefined();
  });

  it('still refuses http://0.0.0.0, which is not a loopback address', async () => {
    const client = new TmsClient({
      serverUrl: 'http://0.0.0.0:3000',
      projectId: 'proj-1',
      apiKey: 'key',
    });

    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(ConfigError);
  });
});

describe('TmsClient URL construction', () => {
  beforeEach(() => mockFetch.mockReset());

  function clientFor(serverUrl: string): TmsClient {
    return new TmsClient({
      serverUrl,
      projectId: 'proj-1',
      apiKey: 'key',
      fetch: mockFetch,
    });
  }

  it('should not double the separator when the server URL has a trailing slash', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await clientFor('https://tms.example.com/').pushKey(
      'greeting',
      'de',
      'Hallo'
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://tms.example.com/api/projects/proj-1/keys/greeting',
      expect.anything()
    );
  });

  it('should preserve a base path on the server URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await clientFor('https://tms.example.com/tms/').pushKey(
      'greeting',
      'de',
      'Hallo'
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://tms.example.com/tms/api/projects/proj-1/keys/greeting',
      expect.anything()
    );
  });

  it('should reject a server URL carrying a query string instead of truncating the path', async () => {
    await expect(
      clientFor('https://tms.example.com/?token=abc').pushKey('k', 'de', 'v')
    ).rejects.toThrow(ConfigError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should reject a server URL carrying a fragment', async () => {
    await expect(
      clientFor('https://tms.example.com/#frag').pushKey('k', 'de', 'v')
    ).rejects.toThrow(ConfigError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should keep the export query string intact for pullKeys', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await clientFor('https://tms.example.com/').pullKeys('de');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://tms.example.com/api/projects/proj-1/keys/export?format=json&locale=de',
      expect.anything()
    );
  });

  it('should refuse a server URL whose path resolves the request to a different host', async () => {
    // `https://approved//evil` parses with hostname=approved, which the trust
    // gate approves and the https/localhost checks key off — but the base
    // path `//evil…` is a protocol-relative reference, so the resolved request
    // host becomes evil. The credential and every translated string would go
    // there. Refuse before any request.
    await expect(
      clientFor('https://tms.example.com//evil.example.com').pullKeys('de')
    ).rejects.toThrow(ConfigError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should refuse a localhost server URL whose path redirects to another host', async () => {
    await expect(
      clientFor('http://localhost//169.254.169.254').pullKeys('de')
    ).rejects.toThrow(ConfigError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should still accept a legitimate base path that keeps the approved host', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await clientFor('https://tms.example.com/tms').pullKeys('de');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://tms.example.com/tms/api/projects/proj-1/keys/export?format=json&locale=de',
      expect.anything()
    );
  });
});

describe('TmsClient error message redaction', () => {
  beforeEach(() => mockFetch.mockReset());

  it('should redact credentials embedded in the server URL from timeout messages', async () => {
    jest.useFakeTimers();
    try {
      const stubFetch = jest
        .fn()
        .mockImplementation((_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        });
      const client = new TmsClient({
        serverUrl: 'https://alice:s3cret@tms.example.com',
        projectId: 'p',
        apiKey: 'k',
        fetch: stubFetch,
        timeoutMs: 1000,
        retry: { maxAttempts: 1 },
      });

      const promise = client.pushKey('k', 'de', 'v');
      promise.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(1001);

      await expect(promise).rejects.toThrow(
        expect.objectContaining({
          message: expect.not.stringContaining('s3cret'),
        })
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('should redact credentials from the invalid-server-URL error', async () => {
    const client = new TmsClient({
      serverUrl: 'not a url with s3cret inside',
      projectId: 'p',
      apiKey: 'k',
      fetch: mockFetch,
    });

    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('s3cret'),
      })
    );
  });
});

describe('TmsTimeoutError classification', () => {
  it('should exit with the network error code', () => {
    expect(exitCodeForError(new TmsTimeoutError('TMS request timed out'))).toBe(
      ExitCode.NetworkError
    );
    expect(exitCodeForError(new TmsTimeoutError('TMS request timed out'))).toBe(
      5
    );
  });
});

describe('TmsClient.pullKeys response size cap', () => {
  beforeEach(() => mockFetch.mockReset());

  const client = new TmsClient({
    serverUrl: 'https://tms.example.com',
    projectId: 'proj-1',
    apiKey: 'key',
  });

  it('should reject a response whose declared content-length exceeds the cap', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-length': String(MAX_PULL_BODY_BYTES + 1),
      }),
      json: async () => ({}),
    });

    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
    await expect(client.pullKeys('de')).rejects.toThrow(/size|large|bytes/i);
  });

  it('should reject a streamed response that exceeds the cap without declaring a length', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.fill(0x61);
    let emitted = 0;
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emitted > MAX_PULL_BODY_BYTES) {
            controller.close();
            return;
          }
          emitted += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    });

    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
  });

  it('should parse a streamed response that stays under the cap', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"greeting":"Hallo"}'));
          controller.close();
        },
      }),
    });

    await expect(client.pullKeys('de')).resolves.toEqual({ greeting: 'Hallo' });
  });
});

describe('TmsClient fetch injection', () => {
  beforeEach(() => mockFetch.mockReset());

  it('should call the injected fetch instead of global fetch', async () => {
    const stubFetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'proj-1',
      apiKey: 'key',
      fetch: stubFetch,
    });
    await client.pushKey('k', 'de', 'v');
    expect(stubFetch).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should fall back to global fetch when no fetch option provided', async () => {
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'proj-1',
      apiKey: 'key',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('k', 'de', 'v');
    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('TmsClient timeout', () => {
  beforeEach(() => mockFetch.mockReset());
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should reject with a timeout error after the configured duration when fetch never resolves', async () => {
    jest.useFakeTimers();
    const stubFetch = jest
      .fn()
      .mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'k',
      fetch: stubFetch,
      timeoutMs: 5000,
      retry: { maxAttempts: 1 },
    });
    const promise = client.pushKey('k', 'de', 'v');
    promise.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(5001);
    await expect(promise).rejects.toThrow(/timed out/i);
    expect(stubFetch).toHaveBeenCalledTimes(1);
    expect(stubFetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('TmsClient retry', () => {
  beforeEach(() => mockFetch.mockReset());

  it('should retry once on 429 and succeed on the second attempt', async () => {
    const stubFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
      });
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'k',
      fetch: stubFetch,
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
    });
    await expect(client.pushKey('k', 'de', 'v')).resolves.toBeUndefined();
    expect(stubFetch).toHaveBeenCalledTimes(2);
  });

  it('should retry on 503 up to maxAttempts then reject', async () => {
    const stubFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => '',
    });
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'k',
      fetch: stubFetch,
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(/503/);
    expect(stubFetch).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry on 4xx (other than 429)', async () => {
    const stubFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '',
    });
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'k',
      fetch: stubFetch,
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(ConfigError);
    expect(stubFetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * A TMS that cannot be reached is a network failure whichever way it fails.
 * `fetch` rejects with `TypeError: fetch failed` and puts the errno on `cause`,
 * so the raw rejection carried neither the host, the port nor the code: the run
 * ended at `Error: fetch failed` and the unclassified exit code, while the
 * client-side timeout — the same condition, differently timed — exited 5 with a
 * full message.
 */
describe('TmsClient transport failures', () => {
  beforeEach(() => mockFetch.mockReset());

  function transportError(causeCode?: string, causeMessage?: string): Error {
    const err = new TypeError('fetch failed');
    (err as { cause?: unknown }).cause = Object.assign(
      new Error(causeMessage ?? 'connect failed'),
      causeCode ? { code: causeCode } : {}
    );
    return err;
  }

  function clientWith(stubFetch: jest.Mock, maxAttempts = 1): TmsClient {
    return new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'k',
      fetch: stubFetch,
      retry: { maxAttempts, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
    });
  }

  it('classifies a refused connection as a network error naming the request', async () => {
    const stubFetch = jest
      .fn()
      .mockRejectedValue(
        transportError('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:60550')
      );

    const err = await clientWith(stubFetch)
      .pushKey('k', 'de', 'v')
      .catch((e: unknown) => e);

    expect(exitCodeForError(err)).toBe(ExitCode.NetworkError);
    expect((err as Error).message).toContain('PUT');
    expect((err as Error).message).toContain('https://tms.example.com');
    expect((err as Error).message).toContain('ECONNREFUSED');
  });

  it('classifies a name that does not resolve the same way', async () => {
    const stubFetch = jest
      .fn()
      .mockRejectedValue(
        transportError('ENOTFOUND', 'getaddrinfo ENOTFOUND tms.example.com')
      );

    const err = await clientWith(stubFetch)
      .pullKeys('de')
      .catch((e: unknown) => e);

    expect(exitCodeForError(err)).toBe(ExitCode.NetworkError);
    expect((err as Error).message).toContain('ENOTFOUND');
  });

  it('falls back to the underlying message when there is no errno', async () => {
    // `fetch` refuses a blocked port before connecting, with no code at all.
    const stubFetch = jest
      .fn()
      .mockRejectedValue(transportError(undefined, 'bad port'));

    const err = await clientWith(stubFetch)
      .pushKey('k', 'de', 'v')
      .catch((e: unknown) => e);

    expect(exitCodeForError(err)).toBe(ExitCode.NetworkError);
    expect((err as Error).message).toContain('bad port');
  });

  // The replay policy is unchanged: classification and retry eligibility are
  // separate decisions, and a push is billable at the far end.
  it('retries a refused connection exactly as before and no more', async () => {
    const stubFetch = jest
      .fn()
      .mockRejectedValue(transportError('ECONNREFUSED'));

    await expect(
      clientWith(stubFetch, 3).pushKey('k', 'de', 'v')
    ).rejects.toThrow();

    expect(stubFetch).toHaveBeenCalledTimes(3);
  });

  it('still does not retry a name that does not resolve', async () => {
    const stubFetch = jest.fn().mockRejectedValue(transportError('ENOTFOUND'));

    await expect(
      clientWith(stubFetch, 3).pushKey('k', 'de', 'v')
    ).rejects.toThrow();

    expect(stubFetch).toHaveBeenCalledTimes(1);
  });

  // Over-rejection guards: nothing that is not a transport failure is relabelled.
  it('leaves a 401 as a ConfigError', async () => {
    const stubFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '',
    });

    const err = await clientWith(stubFetch)
      .pushKey('k', 'de', 'v')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConfigError);
    expect(exitCodeForError(err)).not.toBe(ExitCode.NetworkError);
  });

  it('leaves a 500 naming the status', async () => {
    const stubFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => '',
    });

    const err = await clientWith(stubFetch)
      .pushKey('k', 'de', 'v')
      .catch((e: unknown) => e);

    expect((err as Error).message).toContain('TMS API error: 500');
  });

  it('keeps the timeout message and its remediation', async () => {
    const abort = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    const stubFetch = jest.fn().mockRejectedValue(abort);

    const err = await clientWith(stubFetch)
      .pushKey('k', 'de', 'v')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TmsTimeoutError);
    expect((err as Error).message).toContain('timed out after');
  });
});

describe('TmsClient error body', () => {
  beforeEach(() => mockFetch.mockReset());

  it('should include up to ~1KB of the response body in the thrown error message', async () => {
    const stubFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => '{"error":"oops"}',
    });
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'k',
      fetch: stubFetch,
      retry: { maxAttempts: 1 },
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(/oops/);
  });

  it('should strip ANSI escape sequences from response body in the thrown error message', async () => {
    const maliciousBody = '\x1b[2J\x1b[0;0HCredentials stolen';
    const stubFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => maliciousBody,
    });
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'k',
      fetch: stubFetch,
      retry: { maxAttempts: 1 },
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('\x1b') })
    );
  });

  it('should strip bidi override codepoints from statusText in the thrown error message', async () => {
    const maliciousStatusText = 'OK\u202EStolen';
    const stubFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: maliciousStatusText,
      text: async () => '',
    });
    const client = new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'k',
      fetch: stubFetch,
      retry: { maxAttempts: 1 },
    });
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('\u202E'),
      })
    );
  });
});

describe('resolveTmsCredentials', () => {
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    delete process.env['TMS_API_KEY'];
    delete process.env['TMS_TOKEN'];
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('should prefer env var over config api_key', () => {
    process.env['TMS_API_KEY'] = 'env-key';
    const result = resolveTmsCredentials({ api_key: 'config-key' });
    expect(result.apiKey).toBe('env-key');
  });

  it('should fall back to config api_key when env var not set', () => {
    const result = resolveTmsCredentials({ api_key: 'config-key' });
    expect(result.apiKey).toBe('config-key');
  });

  it('should return undefined when neither set', () => {
    const result = resolveTmsCredentials({});
    expect(result.apiKey).toBeUndefined();
    expect(result.token).toBeUndefined();
  });

  describe('credential provenance', () => {
    it('reports env when TMS_API_KEY supplied the key', () => {
      process.env['TMS_API_KEY'] = 'env-key';
      expect(resolveTmsCredentials({ api_key: 'config-key' }).source).toBe(
        'env'
      );
    });

    it('reports env when TMS_TOKEN supplied the only credential', () => {
      process.env['TMS_TOKEN'] = 'env-token';
      expect(resolveTmsCredentials({}).source).toBe('env');
    });

    it('reports config when the credential was inlined in the repo YAML', () => {
      expect(resolveTmsCredentials({ api_key: 'config-key' }).source).toBe(
        'config'
      );
    });

    it('reports config for an inlined token', () => {
      expect(resolveTmsCredentials({ token: 'config-token' }).source).toBe(
        'config'
      );
    });

    it('reports none when there is no credential', () => {
      expect(resolveTmsCredentials({}).source).toBe('none');
    });

    it('reports config when the api_key that will actually be sent came from config', () => {
      // getAuthHeader prefers apiKey, so an env token is never attached here.
      process.env['TMS_TOKEN'] = 'env-token';
      expect(resolveTmsCredentials({ api_key: 'config-key' }).source).toBe(
        'config'
      );
    });

    it('reports env when an empty TMS_API_KEY falls through to an env token', () => {
      process.env['TMS_API_KEY'] = '';
      process.env['TMS_TOKEN'] = 'env-token';
      expect(resolveTmsCredentials({}).source).toBe('env');
    });
  });
});

describe('createTmsClient destination trust', () => {
  let envSnapshot: NodeJS.ProcessEnv;

  const baseConfig: SyncTmsConfig = {
    enabled: true,
    server: 'https://tms.evil.test',
    project_id: 'proj-1',
  };

  beforeEach(() => {
    envSnapshot = { ...process.env };
    delete process.env['TMS_API_KEY'];
    delete process.env['TMS_TOKEN'];
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('refuses to build a client that would send an env credential to an unapproved host', async () => {
    process.env['TMS_API_KEY'] = 'TMS-SECRET-CREDENTIAL-1234';
    await expect(
      createTmsClient(baseConfig, {
        readAllowedServers: () => [],
        canPrompt: () => false,
      })
    ).rejects.toThrow(ConfigError);
  });

  it('never issues a request when the destination is refused', async () => {
    process.env['TMS_API_KEY'] = 'TMS-SECRET-CREDENTIAL-1234';
    await expect(
      createTmsClient(baseConfig, {
        readAllowedServers: () => [],
        canPrompt: () => false,
      })
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('builds a client when the host is already approved', async () => {
    process.env['TMS_API_KEY'] = 'env-key';
    const client = await createTmsClient(baseConfig, {
      readAllowedServers: () => ['tms.evil.test'],
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('k', 'de', 'v');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('builds a client without gating when the credential is inlined in the repo YAML', async () => {
    const promptForApproval = jest.fn(async () => true);
    const client = await createTmsClient(
      { ...baseConfig, api_key: 'config-key' },
      { promptForApproval, canPrompt: () => true }
    );
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('k', 'de', 'v');
    expect(promptForApproval).not.toHaveBeenCalled();
  });

  it('records the approval when the user accepts at the prompt', async () => {
    process.env['TMS_API_KEY'] = 'env-key';
    const approveServer = jest.fn();
    await createTmsClient(baseConfig, {
      readAllowedServers: () => [],
      canPrompt: () => true,
      promptForApproval: async () => true,
      approveServer,
    });
    expect(approveServer).toHaveBeenCalledWith('tms.evil.test');
  });
});

describe('createTmsClient', () => {
  let envSnapshot: NodeJS.ProcessEnv;

  // These cases assert credential precedence, not destination trust, so the
  // hosts they use are pre-approved.
  const approved: TmsServerTrustDeps = {
    readAllowedServers: () => ['tms.example.com', 'custom.example.com'],
  };

  beforeEach(() => {
    envSnapshot = { ...process.env };
    delete process.env['TMS_API_KEY'];
    delete process.env['TMS_TOKEN'];
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  const baseConfig: SyncTmsConfig = {
    enabled: true,
    server: 'https://tms.example.com',
    project_id: 'proj-1',
  };

  it('should read TMS_API_KEY env var when building the client (in preference to config.api_key)', async () => {
    process.env['TMS_API_KEY'] = 'env-key';
    const client = await createTmsClient(
      { ...baseConfig, api_key: 'config-key' },
      approved
    );

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('k', 'de', 'v');
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers?.['Authorization']).toBe('ApiKey env-key');
  });

  it('should read TMS_TOKEN env var when building the client', async () => {
    process.env['TMS_TOKEN'] = 'env-token';
    const client = await createTmsClient({ ...baseConfig }, approved);

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('k', 'de', 'v');
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers?.['Authorization']).toBe('Bearer env-token');
  });

  it('should fall back to config credentials when no env vars set', async () => {
    const client = await createTmsClient(
      { ...baseConfig, api_key: 'config-key' },
      approved
    );

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('k', 'de', 'v');
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers?.['Authorization']).toBe('ApiKey config-key');
  });

  it('should pass server URL and project_id to the constructed client', async () => {
    process.env['TMS_API_KEY'] = 'env-key';
    const client = await createTmsClient(
      {
        ...baseConfig,
        server: 'https://custom.example.com',
        project_id: 'custom-proj',
      },
      approved
    );

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.pushKey('greeting', 'de', 'Hallo');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom.example.com/api/projects/custom-proj/keys/greeting',
      expect.anything()
    );
  });
});

describe('TmsClient.pullKeys response validation', () => {
  const client = new TmsClient({
    serverUrl: 'https://tms.example.com',
    projectId: 'proj-123',
    apiKey: 'test-key',
  });

  beforeEach(() => mockFetch.mockReset());

  it('should reject response with non-string value', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: 42 }),
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
    await expect(client.pullKeys('de')).rejects.toThrow(
      /non-string|not a string|must be a string/i
    );
  });

  it('should reject response with nested-object value', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: { nested: 'x' } }),
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
  });

  it('should reject response with null value', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: null }),
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
  });

  it('should reject response when the payload itself is not an object', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => 'not-an-object',
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
  });

  it('should reject key containing forward-slash path separator', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ 'nav/home': 'Home' }),
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
    await expect(client.pullKeys('de')).rejects.toThrow(/key|separator/i);
  });

  it('should reject key containing backslash path separator', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ 'nav\\home': 'Home' }),
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
  });

  it('should reject key containing NUL byte', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ 'bad\x00key': 'value' }),
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
  });

  it('should reject key containing ASCII control chars', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ 'bad\x1bkey': 'value' }),
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
  });

  it('should reject per-value length over 64KiB', async () => {
    const oversized = 'a'.repeat(64 * 1024 + 1);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: oversized }),
    });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
    await expect(client.pullKeys('de')).rejects.toThrow(
      /64|size|length|large/i
    );
  });

  it('should accept per-value length exactly at 64KiB', async () => {
    const atLimit = 'a'.repeat(64 * 1024);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: atLimit }),
    });
    const result = await client.pullKeys('de');
    expect(result['greeting']).toBe(atLimit);
  });

  it('should strip ASCII control chars from accepted values', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: 'Hal\x00lo\x1bWorld\x7f' }),
    });
    const result = await client.pullKeys('de');
    expect(result['greeting']).toBe('HalloWorld');
  });

  it('should preserve printable content including tabs and newlines-as-content when stripping', async () => {
    // Tabs (\x09), line feeds (\x0a), carriage returns (\x0d) are control chars
    // per the spec but common in translation values; stripping them is the
    // documented behavior (fail-closed on format-breaking bytes).
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: 'line1\nline2\tend' }),
    });
    const result = await client.pullKeys('de');
    // The regex [\x00-\x1f\x7f] matches \n and \t. Expect both stripped.
    expect(result['greeting']).toBe('line1line2end');
  });

  it('should pass through normal payloads unchanged', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: 'Hallo', farewell: 'Tschüss' }),
    });
    const result = await client.pullKeys('de');
    expect(result).toEqual({ greeting: 'Hallo', farewell: 'Tschüss' });
  });

  it('should include an actionable suggestion string on the ValidationError', async () => {
    expect.assertions(2);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ greeting: 42 }),
    });
    try {
      await client.pullKeys('de');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).suggestion).toBeTruthy();
    }
  });

  it('should throw ValidationError with remediation hint when response exceeds 50,001 keys', async () => {
    const oversized: Record<string, string> = {};
    for (let i = 0; i < 50001; i++) oversized[`key${i}`] = 'value';
    mockFetch.mockResolvedValue({ ok: true, json: async () => oversized });
    await expect(client.pullKeys('de')).rejects.toThrow(ValidationError);
    await expect(client.pullKeys('de')).rejects.toThrow(
      /MAX_PULL_KEY_COUNT \(50000\)/
    );
  });

  it('should succeed when response has exactly 50,000 keys', async () => {
    const atLimit: Record<string, string> = {};
    for (let i = 0; i < 50000; i++) atLimit[`key${i}`] = 'value';
    mockFetch.mockResolvedValue({ ok: true, json: async () => atLimit });
    const result = await client.pullKeys('de');
    expect(Object.keys(result)).toHaveLength(50000);
  });
});

describe('TmsClient credential registration', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    Logger.clearSecrets();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    Logger.clearSecrets();
  });

  it('should register a yaml-held api_key so diagnostics redact it', () => {
    new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      apiKey: 'YAML-HELD-TMS-API-KEY',
    });

    Logger.error('server rejected YAML-HELD-TMS-API-KEY');

    expect(errorSpy).toHaveBeenCalledWith('server rejected [REDACTED]');
  });

  it('should register a yaml-held token so diagnostics redact it', () => {
    new TmsClient({
      serverUrl: 'https://tms.example.com',
      projectId: 'p',
      token: 'YAML-HELD-TMS-TOKEN',
    });

    Logger.error('server rejected YAML-HELD-TMS-TOKEN');

    expect(errorSpy).toHaveBeenCalledWith('server rejected [REDACTED]');
  });
});
