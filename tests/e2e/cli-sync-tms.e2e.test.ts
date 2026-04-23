/**
 * E2E tests for `deepl sync push` and `deepl sync pull`.
 *
 * Complements tests/integration/sync-tms.integration.test.ts (service layer,
 * nock-driven). These invoke the built CLI binary as a subprocess and assert
 * exit codes, stdout/stderr, and that the real HTTP requests sent by the CLI
 * hit the mock server with the expected Authorization header.
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import nock from 'nock';
import { createTestConfigDir, createTestDir } from '../helpers';
import { buildSyncConfigYaml } from '../helpers/sync-harness';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

interface CapturedRequest {
  method: string;
  url: string;
  projectId: string;
  authHeader: string | null;
  body: string | null;
}

interface MockServerState {
  requests: CapturedRequest[];
  pushed: Record<string, Record<string, string>>;
  pullResponses: Record<string, Record<string, string>>;
  forceStatus: number | null;
  forceBody: Record<string, unknown> | null;
}

describe('CLI Sync TMS E2E', () => {
  const testConfig = createTestConfigDir('e2e-sync-tms');
  const testFiles = createTestDir('e2e-sync-tms-files');
  let mockServerProcess: ChildProcess;
  let baseUrl: string;

  function startMockServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const serverScript = path.join(__dirname, 'mock-deepl-server.cjs');
      const child = spawn('node', [serverScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      mockServerProcess = child;
      let output = '';

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const match = output.match(/PORT=(\d+)/);
        if (match) {
          resolve(parseInt(match[1]!, 10));
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const msg = data.toString();
        if (!msg.includes('ExperimentalWarning') && !msg.includes('--experimental')) {
          process.stderr.write(`[mock-server stderr] ${msg}`);
        }
      });

      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== null && code !== 0) {
          reject(new Error(`Mock server exited with code ${code}`));
        }
      });

      setTimeout(() => reject(new Error('Mock server did not start within 15s')), 15000);
    });
  }

  function writeDeeplConfig(configDir: string, apiUrl: string): void {
    const config = {
      auth: { apiKey: 'mock-api-key-for-testing:fx' },
      api: { baseUrl: apiUrl, usePro: false },
      defaults: { targetLangs: [], formality: 'default', preserveFormatting: true },
      cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
      output: { format: 'text', verbose: false, color: false },
      watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2));
  }

  function writeSyncYaml(
    opts: {
      targetLocales?: string[];
      includeTmsBlock?: boolean;
      tmsApiKey?: string;
    } = {},
  ): void {
    const tms = opts.includeTmsBlock
      ? {
          enabled: true,
          server: baseUrl,
          project_id: 'e2e-proj',
          ...(opts.tmsApiKey !== undefined && { api_key: opts.tmsApiKey }),
        }
      : undefined;
    const yaml = buildSyncConfigYaml({
      targetLocales: opts.targetLocales ?? ['de'],
      buckets: { json: { include: ['locales/en.json'] } },
      ...(tms && { tms }),
    });
    fs.writeFileSync(path.join(testFiles.path, '.deepl-sync.yaml'), yaml);
  }

  function writeSource(keys: Record<string, string> = { greeting: 'Hello', farewell: 'Goodbye' }): void {
    const dir = path.join(testFiles.path, 'locales');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify(keys, null, 2) + '\n');
  }

  function writeTargetLocale(locale: string, keys: Record<string, string>): void {
    const dir = path.join(testFiles.path, 'locales');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${locale}.json`), JSON.stringify(keys, null, 2) + '\n');
  }

  function buildEnv(extra: Record<string, string> = {}): Record<string, string | undefined> {
    return {
      ...process.env,
      DEEPL_CONFIG_DIR: testConfig.path,
      NO_COLOR: '1',
      ...extra,
    };
  }

  // Note: execSync is used here intentionally for E2E CLI testing -- the input
  // is fully controlled test data with no user-supplied values.
  function runSyncAll(args: string, extraEnv: Record<string, string> = {}): string {
    return execSync(`node ${CLI_PATH} sync ${args} 2>&1`, {
      encoding: 'utf-8',
      shell: '/bin/sh',
      cwd: testFiles.path,
      env: buildEnv(extraEnv),
      timeout: 15000,
    });
  }

  function runSyncExpectError(
    args: string,
    extraEnv: Record<string, string> = {},
  ): { status: number; output: string } {
    try {
      const output = execSync(`node ${CLI_PATH} sync ${args} 2>&1`, {
        encoding: 'utf-8',
        shell: '/bin/sh',
        cwd: testFiles.path,
        env: buildEnv(extraEnv),
        timeout: 15000,
      });
      return { status: 0, output };
    } catch (error: unknown) {
      const err = error as { status?: number; stderr?: string; stdout?: string };
      return {
        status: err.status ?? 1,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty stderr should fall through to stdout
        output: err.stderr?.toString() || err.stdout?.toString() || '',
      };
    }
  }

  async function resetMockServer(): Promise<void> {
    await fetch(`${baseUrl}/__reset`, { method: 'POST' });
  }

  async function configureMockServer(cfg: {
    pullResponses?: Record<string, Record<string, string>>;
    forceStatus?: number;
    forceBody?: Record<string, unknown>;
  }): Promise<void> {
    await fetch(`${baseUrl}/__configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
  }

  async function inspectMockServer(): Promise<MockServerState> {
    const res = await fetch(`${baseUrl}/__inspect`);
    return (await res.json()) as MockServerState;
  }

  beforeAll(async () => {
    // tests/setup.ts calls nock.disableNetConnect() globally; re-enable
    // for localhost so our in-process fetch() control-plane calls reach
    // the mock server. The CLI subprocess bypasses nock naturally.
    nock.enableNetConnect('127.0.0.1');
    const port = await startMockServer();
    baseUrl = `http://127.0.0.1:${port}`;
    writeDeeplConfig(testConfig.path, baseUrl);
  }, 30000);

  beforeEach(async () => {
    // setup.ts's afterEach calls nock.cleanAll() which clears our
    // enableNetConnect allowance; re-enable before each test.
    nock.enableNetConnect('127.0.0.1');
    await resetMockServer();
    const localesDir = path.join(testFiles.path, 'locales');
    if (fs.existsSync(localesDir)) {
      fs.rmSync(localesDir, { recursive: true, force: true });
    }
    for (const name of ['.deepl-sync.lock', '.deepl-sync.yaml']) {
      const p = path.join(testFiles.path, name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  afterAll(() => {
    if (mockServerProcess) mockServerProcess.kill('SIGTERM');
    testConfig.cleanup();
    testFiles.cleanup();
  });

  // ---- Case 9: push happy path ----
  it('push: exits 0, stdout reports count, TMS observes PUTs with expected Authorization header', async () => {
    writeSyncYaml({ includeTmsBlock: true });
    writeSource({ greeting: 'Hello', farewell: 'Goodbye' });
    writeTargetLocale('de', { greeting: 'Hallo', farewell: 'Auf Wiedersehen' });

    const output = runSyncAll('push', { TMS_API_KEY: 'e2e-key' });

    expect(output).toMatch(/Pushed \d+ translations to TMS/);

    const state = await inspectMockServer();
    expect(state.requests.length).toBeGreaterThan(0);
    for (const req of state.requests) {
      expect(req.method).toBe('PUT');
      expect(req.authHeader).toBe('ApiKey e2e-key');
    }
    expect(state.pushed['de']).toBeDefined();
    expect(Object.keys(state.pushed['de']!).sort()).toEqual(['farewell', 'greeting']);
    expect(state.pushed['de']!['greeting']).toBe('Hallo');
    expect(state.pushed['de']!['farewell']).toBe('Auf Wiedersehen');
  });

  // ---- Case 10: pull happy path ----
  it('pull --locale de: exits 0, target file on disk matches TMS response', async () => {
    await configureMockServer({
      pullResponses: {
        de: { greeting: 'Hallo (approved)', farewell: 'Tschuess (approved)' },
      },
    });

    writeSyncYaml({ includeTmsBlock: true });
    writeSource({ greeting: 'Hello', farewell: 'Goodbye' });

    const output = runSyncAll('pull --locale de', { TMS_API_KEY: 'e2e-key' });

    expect(output).toMatch(/Pulled \d+ translations from TMS/);

    const targetFile = path.join(testFiles.path, 'locales', 'de.json');
    expect(fs.existsSync(targetFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(targetFile, 'utf-8')) as Record<string, string>;
    expect(parsed['greeting']).toBe('Hallo (approved)');
    expect(parsed['farewell']).toBe('Tschuess (approved)');

    const state = await inspectMockServer();
    expect(state.requests.some((r) => r.method === 'GET' && r.url.includes('locale=de'))).toBe(true);
  });

  // ---- Case 11: missing tms: block ----
  it('push with no tms block: exits non-zero, stderr contains actionable remediation', () => {
    writeSyncYaml({ includeTmsBlock: false });
    writeSource();

    const result = runSyncExpectError('push');
    expect(result.status).toBeGreaterThan(0);
    expect(result.output).toContain('TMS integration not configured');
    expect(result.output).toContain('tms:');
  });

  // ---- Case 12: wrong credentials surface an actionable auth error ----
  it('push with wrong credentials: exits non-zero, stderr names TMS_API_KEY and references 401', async () => {
    await configureMockServer({ forceStatus: 401, forceBody: { error: 'Unauthorized' } });

    writeSyncYaml({ includeTmsBlock: true });
    writeSource({ k: 'Hello' });
    writeTargetLocale('de', { k: 'Hallo' });

    const result = runSyncExpectError('push', { TMS_API_KEY: 'wrong-key' });
    expect(result.status).toBeGreaterThan(0);
    expect(result.output).toMatch(/TMS authentication failed \(401/);
    // The actionable-error UX names the env vars the user should check.
    expect(result.output).toMatch(/TMS_API_KEY|TMS_TOKEN/);
  });
});
