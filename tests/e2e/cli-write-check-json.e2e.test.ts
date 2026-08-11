/**
 * E2E tests for `write --check` / `correct --check` under `--format json`.
 *
 * `--check` reports a RESULT, not an error: exit 0 when the text is clean and
 * exit 8 when it needs changes. The exit code is the primary signal and the
 * JSON payload carries the detail behind it — how many changes, which file, and
 * which of the two commands ran — so a CI job can act on the verdict without
 * scraping prose off stderr. The error envelope covers the failure case only,
 * which is why this path needs a success shape of its own.
 */

import {
  spawn,
  spawnSync,
  ChildProcess,
  SpawnSyncReturns,
} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

/** Comes back from the mock unchanged, so the check is clean. */
const CLEAN_TEXT = 'This sentence is already polished';
/** Comes back with one word appended, so the check reports one change. */
const DIRTY_TEXT = 'Their going to the store';

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface CheckPayload {
  ok: true;
  mode: 'write' | 'correct';
  needsChanges: boolean;
  changes: number;
  file?: string;
}

describe('write/correct --check under --format json', () => {
  let mockServer: ChildProcess;
  let baseUrl: string;
  let configDir: string;
  let workDir: string;

  function startMockServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'write-check-server.cjs');
      const child = spawn('node', [script], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      mockServer = child;

      let output = '';
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const match = output.match(/PORT=(\d+)/);
        if (match) {
          resolve(parseInt(match[1]!, 10));
        }
      });
      child.stderr.on('data', (data: Buffer) => {
        process.stderr.write(`[write-check-server] ${data.toString()}`);
      });
      child.on('error', reject);
      setTimeout(
        () => reject(new Error('mock server did not start within 15s')),
        15000
      );
    });
  }

  beforeAll(async () => {
    const port = await startMockServer();
    baseUrl = `http://127.0.0.1:${port}`;

    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-check-json-cfg-'));
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'mock-api-key-for-testing:fx' },
        api: { baseUrl, usePro: false },
        cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
        defaults: {
          targetLangs: [],
          formality: 'default',
          preserveFormatting: true,
        },
      }),
      { mode: 0o600 }
    );
  }, 30000);

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-check-json-work-'));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  afterAll(() => {
    if (mockServer) {
      mockServer.kill('SIGTERM');
    }
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  function run(args: string[]): RunResult {
    const result: SpawnSyncReturns<string> = spawnSync(
      'node',
      [CLI_PATH, ...args],
      {
        encoding: 'utf-8',
        cwd: workDir,
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: configDir,
          DEEPL_API_KEY: 'mock-api-key-for-testing:fx',
          NO_COLOR: '1',
        },
        timeout: 20000,
      }
    );
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  /**
   * Parses the payload off stdout alone. The CLI warns on stderr in the same run
   * (the mock is not a DeepL endpoint), so a merged stream would not parse.
   */
  function parsePayload(stdout: string): CheckPayload {
    const payload = JSON.parse(stdout) as CheckPayload;
    expect(payload.ok).toBe(true);
    return payload;
  }

  const COMMANDS: Array<{
    label: string;
    command: string;
    mode: 'write' | 'correct';
    needsLabel: string;
  }> = [
    {
      label: 'write',
      command: 'write',
      mode: 'write',
      needsLabel: 'needs improvement',
    },
    {
      label: 'correct',
      command: 'correct',
      mode: 'correct',
      needsLabel: 'needs correction',
    },
  ];

  describe.each(COMMANDS)('$label --check --format json', (subject) => {
    it('emits the result payload on stdout and exits 8 when changes are needed', () => {
      const result = run([
        subject.command,
        DIRTY_TEXT,
        '--check',
        '--format',
        'json',
      ]);

      expect(result.status).toBe(8);
      const payload = parsePayload(result.stdout);
      expect(payload).toEqual({
        ok: true,
        mode: subject.mode,
        needsChanges: true,
        changes: 1,
      });
    });

    it('emits the result payload on stdout and exits 0 when the text is clean', () => {
      const result = run([
        subject.command,
        CLEAN_TEXT,
        '--check',
        '--format',
        'json',
      ]);

      expect(result.status).toBe(0);
      const payload = parsePayload(result.stdout);
      expect(payload).toEqual({
        ok: true,
        mode: subject.mode,
        needsChanges: false,
        changes: 0,
      });
    });

    it('names the checked file when the input is a path', () => {
      const filePath = path.join(workDir, 'draft.txt');
      fs.writeFileSync(filePath, DIRTY_TEXT, 'utf-8');

      const result = run([
        subject.command,
        'draft.txt',
        '--check',
        '--format',
        'json',
      ]);

      expect(result.status).toBe(8);
      const payload = parsePayload(result.stdout);
      expect(payload.needsChanges).toBe(true);
      expect(payload.file).toBe(fs.realpathSync(filePath));
    });

    it('omits the file key when the input is text', () => {
      const result = run([
        subject.command,
        DIRTY_TEXT,
        '--check',
        '--format',
        'json',
      ]);

      expect(Object.keys(parsePayload(result.stdout))).not.toContain('file');
    });

    it('counts the same changes the text-mode report counts', () => {
      const jsonResult = run([
        subject.command,
        DIRTY_TEXT,
        '--check',
        '--format',
        'json',
      ]);
      const textResult = run([subject.command, DIRTY_TEXT, '--check']);

      expect(jsonResult.status).toBe(textResult.status);
      expect(parsePayload(jsonResult.stdout).changes).toBe(1);
      expect(textResult.stderr).toContain('(1 potential changes)');
    });
  });

  // Over-rejection guards: the paths that already worked must not move.
  describe.each(COMMANDS)(
    '$label --check text mode is unchanged',
    (subject) => {
      it('reports the verdict on stderr with stdout empty when changes are needed', () => {
        const result = run([subject.command, DIRTY_TEXT, '--check']);

        expect(result.status).toBe(8);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          `⚠ Text ${subject.needsLabel} (1 potential changes)`
        );
      });

      it('reports a clean verdict on stderr with stdout empty', () => {
        const result = run([subject.command, CLEAN_TEXT, '--check']);

        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('✓ Text looks good');
      });

      it('still names the file on stderr for file input', () => {
        fs.writeFileSync(path.join(workDir, 'draft.txt'), DIRTY_TEXT, 'utf-8');

        const result = run([subject.command, 'draft.txt', '--check']);

        expect(result.status).toBe(8);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('File: draft.txt');
      });
    }
  );

  describe.each(COMMANDS)('$label without --check is unchanged', (subject) => {
    it('keeps the non-check JSON payload shape', () => {
      const result = run([subject.command, DIRTY_TEXT, '--format', 'json']);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        original: DIRTY_TEXT,
        improved: `${DIRTY_TEXT} (improved)`,
        changes: 1,
        language: 'auto-detected',
      });
    });

    it('keeps the plain-text output', () => {
      const result = run([subject.command, DIRTY_TEXT]);

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(`${DIRTY_TEXT} (improved)`);
    });
  });

  // --fix shares the check computation, so it shares the defect: the text it
  // writes to the file must be the improved text under either format.
  describe.each(COMMANDS)(
    '$label --fix writes text, not a payload',
    (subject) => {
      it('writes the improved text with --format json', () => {
        const filePath = path.join(workDir, 'fixme.txt');
        fs.writeFileSync(filePath, DIRTY_TEXT, 'utf-8');

        const result = run([
          subject.command,
          'fixme.txt',
          '--fix',
          '--format',
          'json',
        ]);

        expect(result.status).toBe(0);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe(
          `${DIRTY_TEXT} (improved)`
        );
      });

      it('writes the improved text in text mode', () => {
        const filePath = path.join(workDir, 'fixme.txt');
        fs.writeFileSync(filePath, DIRTY_TEXT, 'utf-8');

        const result = run([subject.command, 'fixme.txt', '--fix']);

        expect(result.status).toBe(0);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe(
          `${DIRTY_TEXT} (improved)`
        );
      });

      it('leaves a clean file untouched with --format json', () => {
        const filePath = path.join(workDir, 'clean.txt');
        fs.writeFileSync(filePath, CLEAN_TEXT, 'utf-8');

        const result = run([
          subject.command,
          'clean.txt',
          '--fix',
          '--format',
          'json',
        ]);

        expect(result.status).toBe(0);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe(CLEAN_TEXT);
      });
    }
  );
});
