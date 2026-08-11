/**
 * E2E Tests for the non-standard-endpoint notice.
 *
 * The API key is attached to every request, so a redirected endpoint receives
 * it. These tests assert the redirect is announced on stderr without --verbose,
 * that stdout stays pure translation output, and that the notice names where the
 * redirect came from.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('CLI non-standard endpoint notice E2E', () => {
  const testConfig = createTestConfigDir('e2e-endpoint-notice');
  let runner: ReturnType<typeof makeNodeRunCLI>;
  let server: ChildProcess;
  let baseUrl: string;

  function startMockServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const serverScript = path.join(__dirname, 'mock-deepl-server.cjs');
      const child = spawn('node', [serverScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      server = child;
      let output = '';
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const match = output.match(/PORT=(\d+)/);
        if (match) resolve(parseInt(match[1]!, 10));
      });
      child.on('error', reject);
      setTimeout(
        () => reject(new Error('Mock server did not start within 15s')),
        15000
      );
    });
  }

  beforeAll(async () => {
    runner = makeNodeRunCLI(testConfig.path, { apiKey: 'test-api-key' });
    const port = await startMockServer();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.kill();
    testConfig.cleanup();
  });

  const configFile = () => path.join(testConfig.path, 'config.json');

  afterEach(() => {
    if (fs.existsSync(configFile())) fs.unlinkSync(configFile());
  });

  it('announces an --api-url redirect on stderr without --verbose', () => {
    const output = runner.runCLIAll(
      `translate "Hello" --to es --api-url ${baseUrl}`,
      { noColor: true }
    );

    expect(output).toContain(baseUrl);
    expect(output).toMatch(/API key/i);
    expect(output).toContain('--api-url');
    expect(output).toContain('Hola');
  });

  it('keeps the notice off stdout so redirected output stays pure data', () => {
    const stdoutOnly = runner.runCLI(
      `translate "Hello" --to es --api-url ${baseUrl}`,
      { noColor: true }
    );

    expect(stdoutOnly).toContain('Hola');
    expect(stdoutOnly).not.toContain(baseUrl);
    expect(stdoutOnly).not.toMatch(/Warning/i);
  });

  it('announces a config-file redirect and names the config file', () => {
    fs.writeFileSync(
      configFile(),
      JSON.stringify({ api: { baseUrl } }, null, 2)
    );

    const output = runner.runCLIAll('translate "Hello" --to es', {
      noColor: true,
    });

    expect(output).toContain(baseUrl);
    expect(output).toContain('api.baseUrl');
    expect(output).toContain(configFile());
    expect(output).toContain('Hola');
  });

  it('announces the redirect once, not once per API client', () => {
    const output = runner.runCLIAll(
      `translate "Hello world" --to es --api-url ${baseUrl}`,
      { noColor: true }
    );

    const occurrences = output.split(baseUrl).length - 1;
    expect(occurrences).toBe(1);
  });

  it('names the resolved origin on the verbose HTTP line', () => {
    const output = runner.runCLIAll(
      `-v translate "Good morning" --to es --api-url ${baseUrl}`,
      { noColor: true }
    );

    expect(output).toMatch(
      new RegExp(`\\[verbose\\] HTTP POST ${baseUrl}/v2/translate`)
    );
  });

  it('suppresses the notice under --quiet, like every other warning', () => {
    const output = runner.runCLIAll(
      `--quiet translate "Translate me" --to es --api-url ${baseUrl}`,
      { noColor: true }
    );

    expect(output).not.toMatch(/API key/i);
    expect(output).toContain('Traduceme');
  });
});
