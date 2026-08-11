/**
 * E2E subprocess test for `deepl watch` write ordering.
 *
 * The built CLI runs as a child process against a mock translate endpoint that
 * answers the first edit's text slowly and the second's quickly, so the API
 * completes out of request order. The file left in the output directory must
 * hold the translation of the newest source version.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const SERVER_PATH = path.join(
  process.cwd(),
  'tests/e2e/watch-delay-server.cjs'
);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('deepl watch write ordering (subprocess)', () => {
  let tmpDir: string;
  let configDir: string;
  let srcDir: string;
  let outDir: string;
  let child: ChildProcess | null = null;
  let server: ChildProcess | null = null;
  let cliOutput = '';
  let serverLog = '';

  async function startServer(): Promise<number> {
    server = spawn('node', [SERVER_PATH], {
      env: {
        ...process.env,
        SLOW_MATCH: 'VERSION-A',
        SLOW_MS: '2500',
        FAST_MS: '100',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stderr?.on('data', (chunk: Buffer) => {
      serverLog += chunk.toString();
    });
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('mock server did not start')),
        10000
      );
      server?.stdout?.on('data', (chunk: Buffer) => {
        const match = /PORT=(\d+)/.exec(chunk.toString());
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
    });
  }

  function waitUntil(
    predicate: () => boolean,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = (): void => {
        if (predicate()) return resolve(true);
        if (Date.now() - start >= timeoutMs) return resolve(false);
        setTimeout(check, 50);
      };
      check();
    });
  }

  /** Lines the mock logged for texts carrying `marker`, in order. */
  const linesFor = (marker: string): string[] =>
    serverLog.split('\n').filter((line) => line.includes(marker));

  /**
   * Write `content` until the mock reports a request for it. "Watching for
   * changes" prints before chokidar's initial scan completes, and an edit made
   * during that scan is folded into the baseline rather than reported, so a
   * single write is not enough to know the watcher is live.
   */
  async function writeUntilRequested(
    file: string,
    content: string,
    marker: string
  ): Promise<boolean> {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      fs.writeFileSync(file, content);
      if (await waitUntil(() => linesFor(marker).length > 0, 1500)) return true;
    }
    return false;
  }

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-ord-cfg-'));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-ord-'));
    srcDir = path.join(tmpDir, 'src');
    outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    cliOutput = '';
    serverLog = '';
  });

  afterEach(async () => {
    if (child && !child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
      await new Promise<void>((resolve) => {
        if (child?.exitCode === null) child.once('exit', () => resolve());
        else resolve();
      });
    }
    child = null;
    if (server && !server.killed) server.kill('SIGKILL');
    server = null;
    for (const dir of [tmpDir, configDir]) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes the newest source version even when its translation returns first', async () => {
    const port = await startServer();
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'mock-api-key-for-testing:fx' },
        api: { baseUrl: `http://127.0.0.1:${port}`, usePro: false },
        cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
        watch: { debounceMs: 150, autoCommit: false },
      })
    );

    const source = path.join(srcDir, 'doc.md');
    fs.writeFileSync(source, 'BASE\n');

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DEEPL_CONFIG_DIR: configDir,
      NO_COLOR: '1',
    };
    delete env['DEEPL_API_KEY'];

    child = spawn(
      'node',
      [CLI_PATH, 'watch', srcDir, '--to', 'de', '--output', outDir],
      { cwd: tmpDir, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const collect = (chunk: Buffer): void => {
      cliOutput += chunk.toString();
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    expect(
      await waitUntil(() => /Watching for changes/.test(cliOutput), 20000)
    ).toBe(true);

    // The second edit has to land while the first translation is in flight, so
    // wait for the first request rather than for a fixed delay.
    expect(await writeUntilRequested(source, 'VERSION-A\n', 'VERSION-A')).toBe(
      true
    );
    fs.writeFileSync(source, 'VERSION-B\n');

    // Read the file only once both translations have been answered, or the
    // assertion could catch a value the losing writer then replaces.
    expect(
      await waitUntil(
        () =>
          linesFor('RESP').filter((l) => l.includes('VERSION-')).length >= 2,
        40000
      )
    ).toBe(true);
    await sleep(500);

    const output = path.join(outDir, 'doc.de.md');
    expect(fs.existsSync(output)).toBe(true);
    expect(fs.readFileSync(output, 'utf-8')).toBe('de:VERSION-B\n');

    // VERSION-B is requested only after VERSION-A has been answered.
    expect(linesFor('VERSION-')).toEqual([
      'REQ ["VERSION-A\\n"]',
      'RESP ["VERSION-A\\n"]',
      'REQ ["VERSION-B\\n"]',
      'RESP ["VERSION-B\\n"]',
    ]);
  }, 120000);
});
