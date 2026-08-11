/**
 * E2E tests for a response the server cuts off mid-body.
 *
 * The 200 status stays attached to the axios error, which used to make the
 * failure read as an API error the caller's input could fix (exit 6). The
 * request counts are asserted alongside the exit code because the replay
 * policy must not change: a 200 says the server accepted — and may have billed
 * — the request, so the billable POST is still sent exactly once.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir, makeNodeRunCLI } from '../helpers';

describe('CLI truncated response E2E', () => {
  const testConfig = createTestConfigDir('e2e-truncated-response');
  const testFiles = createTestDir('e2e-truncated-response-files');
  let runner: ReturnType<typeof makeNodeRunCLI>;
  let server: ChildProcess;
  let baseUrl: string;
  let countFile: string;

  function startServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const serverScript = path.join(__dirname, 'truncating-server.cjs');
      const child = spawn('node', [serverScript, countFile], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      server = child;
      let output = '';

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const match = output.match(/PORT=(\d+)/);
        if (match) {
          resolve(parseInt(match[1]!, 10));
        }
      });

      child.on('error', reject);
      setTimeout(
        () => reject(new Error('Truncating server did not start within 15s')),
        15000
      );
    });
  }

  function requestCount(): number {
    return parseInt(fs.readFileSync(countFile, 'utf-8'), 10);
  }

  beforeAll(async () => {
    runner = makeNodeRunCLI(testConfig.path, { apiKey: 'test-api-key' });
    countFile = path.join(testFiles.path, 'requests.txt');
    const port = await startServer();
    baseUrl = `http://127.0.0.1:${port}`;
    // `--api-url` is a `translate` option, so the GET command needs the
    // endpoint from config.
    fs.writeFileSync(
      path.join(testConfig.path, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'test-api-key' },
        api: { baseUrl, usePro: false },
        cache: { enabled: false },
        output: { format: 'text', color: false },
      })
    );
  });

  afterAll(() => {
    server.kill();
    testConfig.cleanup();
    testFiles.cleanup();
  });

  it('exits 5 (network error) rather than 6 when the response body is cut short', () => {
    const result = runner.runCLIExpectError(
      `--max-retries 3 translate "Hello" --to es --api-url ${baseUrl} --no-cache`,
      { timeout: 30000 }
    );

    expect(result.status).toBe(5);
    expect(result.output).not.toMatch(/API error/);
    expect(result.output).toMatch(/body did not arrive intact/);
  });

  it('still sends the billable POST exactly once', () => {
    const before = requestCount();

    runner.runCLIExpectError(
      `--max-retries 3 translate "Bonjour" --to es --api-url ${baseUrl} --no-cache`,
      { timeout: 30000 }
    );

    expect(requestCount() - before).toBe(1);
  });

  it('still replays an idempotent GET up to --max-retries times', () => {
    const before = requestCount();

    const result = runner.runCLIExpectError('--max-retries 2 usage', {
      timeout: 30000,
    });

    expect(result.status).toBe(5);
    expect(requestCount() - before).toBe(3);
  });
});
