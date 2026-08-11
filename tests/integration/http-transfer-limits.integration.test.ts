import * as http from 'http';
import type { AddressInfo } from 'net';
import nock from 'nock';
import {
  HttpClient,
  MAX_RESPONSE_BYTES,
  MAX_TRANSFER_BYTES,
  RequestPolicy,
} from '../../src/api/http-client';
import { DocumentClient } from '../../src/api/document-client';
import { NetworkError } from '../../src/utils/errors';

class TestHttpClient extends HttpClient {
  requestsFor<T>(path: string, policy?: RequestPolicy): Promise<T> {
    return this.makeRawRequest<T>('GET', path, () => ({}), policy);
  }

  get axiosDefaults(): Record<string, unknown> {
    return this.client.defaults;
  }
}

interface Harness {
  url: string;
  requestCount: () => number;
  close: () => Promise<void>;
}

async function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<Harness> {
  let requests = 0;
  const sockets = new Set<import('net').Socket>();
  const server = http.createServer((req, res) => {
    requests++;
    handler(req, res);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('clientError', () => {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requestCount: () => requests,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

describe('HttpClient transfer limits', () => {
  let harness: Harness | undefined;
  let client: TestHttpClient | undefined;

  beforeEach(() => {
    // setup.ts disables net connect globally; these cases need the real
    // loopback server because nock cannot trickle a body.
    nock.enableNetConnect('127.0.0.1');
  });

  afterEach(async () => {
    client?.destroy();
    client = undefined;
    await harness?.close();
    harness = undefined;
  });

  describe('configured caps', () => {
    it('should apply a finite response and body cap to the shared axios instance', () => {
      client = new TestHttpClient('test-key');

      expect(client.axiosDefaults['maxContentLength']).toBe(MAX_RESPONSE_BYTES);
      expect(client.axiosDefaults['maxBodyLength']).toBe(MAX_TRANSFER_BYTES);
    });
  });

  describe('oversized response bodies', () => {
    it('should reject a body larger than the cap instead of buffering it', async () => {
      harness = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pad: 'x'.repeat(16 * 1024) }));
      });
      client = new TestHttpClient('test-key', {
        baseUrl: harness.url,
        maxRetries: 0,
      });

      await expect(
        client.requestsFor('/v2/usage', { maxContentLength: 1024 })
      ).rejects.toThrow(NetworkError);
    });

    it('should name the exceeded limit rather than surface the axios internal', async () => {
      harness = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pad: 'x'.repeat(4 * 1024 * 1024) }));
      });
      client = new TestHttpClient('test-key', {
        baseUrl: harness.url,
        maxRetries: 0,
      });

      await expect(
        client.requestsFor('/v2/usage', { maxContentLength: 1024 * 1024 })
      ).rejects.toThrow(/response body exceeded the 1MiB size limit/);
    });

    it('should not replay a size-cap rejection on an idempotent method', async () => {
      harness = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pad: 'x'.repeat(16 * 1024) }));
      });
      client = new TestHttpClient('test-key', {
        baseUrl: harness.url,
        maxRetries: 3,
      });

      await expect(
        client.requestsFor('/v2/usage', { maxContentLength: 1024 })
      ).rejects.toThrow(NetworkError);
      expect(harness.requestCount()).toBe(1);
    });
  });

  describe('trickling response bodies', () => {
    it('should abort on the request deadline even while bytes keep arriving', async () => {
      harness = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"pad":"');
        const timer = setInterval(() => res.write('x'), 20);
        res.on('close', () => clearInterval(timer));
      });
      client = new TestHttpClient('test-key', {
        baseUrl: harness.url,
        timeout: 300,
        maxRetries: 0,
      });

      const start = Date.now();
      await expect(client.requestsFor('/v2/usage')).rejects.toThrow(
        /Network timeout/
      );
      expect(Date.now() - start).toBeLessThan(3000);
    }, 15000);
  });

  describe('DocumentClient', () => {
    it('should raise the response cap for the single-use download only', async () => {
      const documentClient = new DocumentClient('test-key');
      const spy = jest
        .spyOn(
          documentClient as unknown as {
            executeWithRetry: (
              method: string,
              path: string,
              buildConfig: () => Record<string, unknown>,
              policy?: RequestPolicy
            ) => Promise<unknown>;
          },
          'executeWithRetry'
        )
        .mockResolvedValue(Buffer.from('translated'));

      await documentClient.downloadDocument({
        documentId: 'doc-1',
        documentKey: 'key-1',
      });

      expect(spy.mock.calls[0]?.[3]).toEqual({
        maxRetries: 0,
        timeout: 300_000,
        maxContentLength: MAX_TRANSFER_BYTES,
      });
      documentClient.destroy();
    });
  });
});
