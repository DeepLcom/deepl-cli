/**
 * E2E subprocess test for `deepl watch --auto-commit` reporting.
 *
 * A watch session that failed to commit a translation used to exit 0 with the
 * failure only logged. The real CLI runs against a real git repository, with
 * the output directory in .gitignore so `git add` fails deterministically.
 */

import { spawn, type ChildProcess } from 'child_process';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
const SERVER_PATH = path.join(
  process.cwd(),
  'tests/e2e/watch-delay-server.cjs'
);

describe('deepl watch --auto-commit exit status (subprocess)', () => {
  let tmpDir: string;
  let configDir: string;
  let srcDir: string;
  let outDir: string;
  let child: ChildProcess | null = null;
  let server: ChildProcess | null = null;
  let cliOutput = '';

  async function startServer(): Promise<number> {
    server = spawn('node', [SERVER_PATH], {
      env: { ...process.env, FAST_MS: '50' },
      stdio: ['ignore', 'pipe', 'pipe'],
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

  function git(args: string[], cwd: string = tmpDir): void {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
  }

  function initRepo(dir: string): void {
    git(['init', '-q'], dir);
    git(['config', 'user.email', 'test@test.com'], dir);
    git(['config', 'user.name', 'Test'], dir);
  }

  async function startWatch(port: number, runFrom = tmpDir): Promise<void> {
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
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DEEPL_CONFIG_DIR: configDir,
      NO_COLOR: '1',
    };
    delete env['DEEPL_API_KEY'];

    child = spawn(
      'node',
      [
        CLI_PATH,
        'watch',
        srcDir,
        '--to',
        'de',
        '--output',
        outDir,
        '--auto-commit',
      ],
      { cwd: runFrom, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const collect = (chunk: Buffer): void => {
      cliOutput += chunk.toString();
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    expect(
      await waitUntil(() => /Watching for changes/.test(cliOutput), 20000)
    ).toBe(true);
  }

  /** Edit until the watcher reacts: readiness precedes chokidar's first scan. */
  async function editUntilTranslated(file: string): Promise<boolean> {
    const deadline = Date.now() + 30000;
    let n = 0;
    while (Date.now() < deadline) {
      fs.writeFileSync(file, `EDIT-${n++}\n`);
      if (await waitUntil(() => /Translated/.test(cliOutput), 1500))
        return true;
    }
    return false;
  }

  function stopAndWait(): Promise<number | null> {
    return new Promise((resolve) => {
      child?.once('exit', (code) => resolve(code));
      child?.kill('SIGINT');
    });
  }

  beforeEach(() => {
    configDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-ac-cfg-'))
    );
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-ac-'))
    );
    srcDir = path.join(tmpDir, 'src');
    outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    cliOutput = '';

    initRepo(tmpDir);
    fs.writeFileSync(path.join(srcDir, 'doc.md'), 'BASE\n');
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
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

  it('exits 12 when an auto-commit failed during the session', async () => {
    // git refuses to add an ignored path, so every auto-commit fails.
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'out/\n');
    git(['add', '.gitignore']);
    git(['commit', '-qm', 'ignore out']);

    const port = await startServer();
    await startWatch(port);
    expect(await editUntilTranslated(path.join(srcDir, 'doc.md'))).toBe(true);
    expect(
      await waitUntil(() => /Auto-commit failed/.test(cliOutput), 15000)
    ).toBe(true);

    const code = await stopAndWait();

    expect(cliOutput).toContain('Auto-commit failures: 1');
    expect(code).toBe(12);
  }, 90000);

  it('commits into the watched repository when started from another one', async () => {
    // The terminal sits in an unrelated repository; the translations belong to
    // the watched one.
    const otherRepo = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-ac-other-'))
    );
    initRepo(otherRepo);
    fs.writeFileSync(path.join(otherRepo, 'README.md'), 'other\n');
    git(['add', '-A'], otherRepo);
    git(['commit', '-qm', 'init'], otherRepo);

    try {
      const port = await startServer();
      await startWatch(port, otherRepo);
      expect(await editUntilTranslated(path.join(srcDir, 'doc.md'))).toBe(true);
      expect(
        await waitUntil(() => /Auto-committed/.test(cliOutput), 15000)
      ).toBe(true);

      const code = await stopAndWait();

      expect(cliOutput).not.toContain('Auto-commit failed');
      expect(code).toBe(0);

      const watchedLog = execFileSync(
        'git',
        ['log', '--oneline', '--name-only'],
        { cwd: tmpDir, encoding: 'utf-8' }
      );
      expect(watchedLog).toContain('auto-translate');
      expect(watchedLog).toContain('out/doc.de.md');

      const otherLog = execFileSync('git', ['log', '--oneline'], {
        cwd: otherRepo,
        encoding: 'utf-8',
      });
      expect(otherLog).not.toContain('auto-translate');
    } finally {
      fs.rmSync(otherRepo, { recursive: true, force: true });
    }
  }, 90000);

  it('refuses before translating when the output directory is in no repository', async () => {
    const plainOut = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-ac-plain-'))
    );
    outDir = plainOut;

    try {
      const port = await startServer();
      const configPath = path.join(configDir, 'config.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          auth: { apiKey: 'mock-api-key-for-testing:fx' },
          api: { baseUrl: `http://127.0.0.1:${port}`, usePro: false },
          cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
          output: { format: 'text', verbose: false, color: false },
        })
      );
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DEEPL_CONFIG_DIR: configDir,
        NO_COLOR: '1',
      };
      delete env['DEEPL_API_KEY'];

      child = spawn(
        'node',
        [
          CLI_PATH,
          'watch',
          srcDir,
          '--to',
          'de',
          '--output',
          plainOut,
          '--auto-commit',
        ],
        { cwd: tmpDir, env, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const collect = (chunk: Buffer): void => {
        cliOutput += chunk.toString();
      };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);

      const code = await new Promise<number | null>((resolve) => {
        child?.once('exit', (exitCode) => resolve(exitCode));
      });

      expect(code).toBe(6);
      expect(cliOutput).toContain('--auto-commit needs a git repository');
      expect(cliOutput).not.toContain('Watching for changes');
      expect(fs.readdirSync(plainOut)).toEqual([]);
    } finally {
      fs.rmSync(plainOut, { recursive: true, force: true });
    }
  }, 60000);

  it('exits 0 when every auto-commit succeeded', async () => {
    const port = await startServer();
    await startWatch(port);
    expect(await editUntilTranslated(path.join(srcDir, 'doc.md'))).toBe(true);
    expect(await waitUntil(() => /Auto-committed/.test(cliOutput), 15000)).toBe(
      true
    );

    const code = await stopAndWait();

    expect(cliOutput).not.toContain('Auto-commit failed');
    expect(code).toBe(0);
  }, 90000);
});
