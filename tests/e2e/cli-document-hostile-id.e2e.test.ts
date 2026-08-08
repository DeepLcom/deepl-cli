/**
 * E2E test for a hostile `document_id` in a document upload response.
 *
 * The upload response chooses the path of every follow-up request the client
 * makes, so a redirected endpoint that answers with `../../v3/glossaries`
 * steers those requests onto a different route. The unit tests assert against
 * a mocked axios instance; this one asserts against a real socket, so what is
 * proven here is that the redirected request line never reaches the wire.
 *
 * Uses a dedicated mock (tests/e2e/hostile-document-server.cjs) run as a child
 * process so the CLI subprocess can reach it over TCP.
 */

import { spawn, ChildProcess, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import nock from 'nock';

import { createTestConfigDir, createTestDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const MOCK_SERVER_SCRIPT = path.join(__dirname, 'hostile-document-server.cjs');

describe('CLI document translation against a hostile document_id E2E', () => {
  const testConfig = createTestConfigDir('e2e-hostile-doc');
  const testFiles = createTestDir('e2e-hostile-doc-files');
  let mockServerProcess: ChildProcess;
  let baseUrl: string;

  function startMockServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [MOCK_SERVER_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      mockServerProcess = child;
      let output = '';

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const match = output.match(/PORT=(\d+)/);
        if (match) resolve(parseInt(match[1]!, 10));
      });
      child.stderr.on('data', (data: Buffer) => {
        const msg = data.toString();
        if (
          !msg.includes('ExperimentalWarning') &&
          !msg.includes('--experimental')
        ) {
          process.stderr.write(`[hostile-doc stderr] ${msg}`);
        }
      });
      child.on('error', reject);
      setTimeout(
        () => reject(new Error('Mock server did not start within 15s')),
        15000
      );
    });
  }

  async function recordedRequests(): Promise<
    { method: string; url: string }[]
  > {
    const res = await fetch(`${baseUrl}/__requests`);
    return (await res.json()) as { method: string; url: string }[];
  }

  beforeAll(async () => {
    nock.enableNetConnect('127.0.0.1');
    const port = await startMockServer();
    baseUrl = `http://127.0.0.1:${port}`;
    fs.writeFileSync(
      path.join(testConfig.path, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'mock-api-key-for-testing:fx' },
        cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
      })
    );
  }, 30000);

  beforeEach(() => {
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    if (mockServerProcess) mockServerProcess.kill('SIGTERM');
    testConfig.cleanup();
    testFiles.cleanup();
  });

  it('refuses the traversal, sends no follow-up request, and writes no output file', async () => {
    const input = path.join(testFiles.path, 'report.pdf');
    const output = path.join(testFiles.path, 'report.de.pdf');
    fs.writeFileSync(input, Buffer.from('%PDF-1.4 test content'));

    const run = spawnSync(
      'node',
      [
        CLI_PATH,
        'translate',
        input,
        '--to',
        'de',
        '--output',
        output,
        '--api-url',
        baseUrl,
      ],
      {
        encoding: 'utf-8',
        cwd: testFiles.path,
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: testConfig.path,
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20000,
      }
    );

    // NetworkError: the endpoint is at fault, not anything the user typed.
    expect(run.status).toBe(5);
    expect(run.stderr).toContain('Unexpected API response: document_id');
    expect(fs.existsSync(output)).toBe(false);

    const requests = await recordedRequests();
    expect(requests).toEqual([{ method: 'POST', url: '/v2/document' }]);
  }, 30000);
});
