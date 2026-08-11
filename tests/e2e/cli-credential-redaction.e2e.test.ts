/**
 * E2E tests for credential redaction in CLI diagnostics.
 *
 * These drive the built CLI binary as a subprocess because the credential the
 * redactor has to cover is the one the CLI resolved for itself: a config-file
 * key wins over DEEPL_API_KEY, so only a real run proves it is registered.
 * The mock server echoes the bare key value rather than the whole
 * `Authorization` header, so the header pattern cannot mask a missing
 * registration.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';
import { createTestConfigDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const CONFIG_KEY = 'CONFIG-FILE-KEY-WINS:fx';
const ENV_KEY = 'ENV-KEY-LOSES-TO-CONFIG:fx';

interface CLIResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCLI(
  args: string[],
  env: Record<string, string | undefined>
): Promise<CLIResult> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, NO_COLOR: '1', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function reserveClosedPort(): Promise<number> {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

describe('CLI credential redaction E2E', () => {
  const testConfig = createTestConfigDir('e2e-credential-redaction');

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('a config-file key echoed back by the server', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        const header = req.headers['authorization'] ?? '';
        const bareKey = header.replace(/^DeepL-Auth-Key\s+/i, '');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `credential rejected: ${bareKey}` }));
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      );
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      fs.writeFileSync(
        path.join(testConfig.path, 'config.json'),
        JSON.stringify({
          auth: { apiKey: CONFIG_KEY },
          api: { baseUrl },
        })
      );
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('should redact the config-file key from the error message', async () => {
      const result = await runCLI(
        ['translate', 'hello', '--to', 'de', '--no-cache'],
        { DEEPL_CONFIG_DIR: testConfig.path, DEEPL_API_KEY: ENV_KEY }
      );

      expect(result.stderr).toContain('credential rejected: [REDACTED]');
      expect(result.stderr).not.toContain(CONFIG_KEY);
      expect(result.status).toBe(6);
    });
  });

  describe('a one-character DEEPL_API_KEY', () => {
    let configDir: string;

    beforeAll(async () => {
      const closedPort = await reserveClosedPort();
      configDir = path.join(testConfig.path, 'short-key');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({ api: { baseUrl: `http://127.0.0.1:${closedPort}` } })
      );
    });

    it('should leave ordinary words in the diagnostics intact', async () => {
      const result = await runCLI(
        ['translate', 'hello', '--to', 'de', '--no-cache'],
        { DEEPL_CONFIG_DIR: configDir, DEEPL_API_KEY: 'k' }
      );

      expect(result.stderr).toContain(
        'Check your internet connection and proxy settings'
      );
      expect(result.stderr).toContain('Network error');
      expect(result.stderr).not.toContain('[REDACTED]');
      expect(result.status).toBe(5);
    });
  });
});
