/**
 * E2E tests for `write`/`correct` `--diff` and `--alternatives` under
 * `--format json`.
 *
 * Both modes declared the flag and ignored it: `--alternatives` returned the
 * numbered text list whatever the format, and `--diff` printed the human
 * three-block report in which the block labelled `Improved:` held a rendered
 * JSON document, so the unified diff described JSON scaffolding rather than
 * wording. Each now has a payload of its own, carrying `ok: true` so a consumer
 * discriminates it from the `ok: false` error envelope the same way the
 * `--check` result payload is discriminated.
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

/** Comes back from the mock with one word appended. */
const DIRTY_TEXT = 'Their going to the store';
/** Comes back from the mock as three improvements. */
const VARIANTS_TEXT = 'Please offer variants of this';

/** Built from the code point so the source carries no control byte. */
const ESC = String.fromCharCode(0x1b);

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

describe('write/correct output modes under --format json', () => {
  let mockServer: ChildProcess;
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

    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-modes-json-cfg-'));
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'mock-api-key-for-testing:fx' },
        api: { baseUrl: `http://127.0.0.1:${port}`, usePro: false },
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
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-modes-json-work-'));
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

  function run(args: string[], colored = false): RunResult {
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
          ...(colored ? { FORCE_COLOR: '3' } : { NO_COLOR: '1' }),
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

  const COMMANDS = [
    { label: 'write', command: 'write', improvedHeading: 'Improved:' },
    { label: 'correct', command: 'correct', improvedHeading: 'Corrected:' },
  ];

  describe.each(COMMANDS)('$label --diff --format json', (subject) => {
    it('emits the diff payload with the improved text, not a rendered document', () => {
      const result = run([
        subject.command,
        DIRTY_TEXT,
        '--diff',
        '--format',
        'json',
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        ok: boolean;
        original: string;
        improved: string;
        diff: string;
      };
      expect(payload.ok).toBe(true);
      expect(payload.original).toBe(DIRTY_TEXT);
      expect(payload.improved).toBe(`${DIRTY_TEXT} (improved)`);
      expect(Object.keys(payload).sort()).toEqual([
        'diff',
        'improved',
        'ok',
        'original',
      ]);
    });

    it('carries a unified patch of the text, free of JSON scaffolding', () => {
      const result = run([
        subject.command,
        DIRTY_TEXT,
        '--diff',
        '--format',
        'json',
      ]);

      const { diff } = JSON.parse(result.stdout) as { diff: string };
      expect(diff).toContain(`-${DIRTY_TEXT}`);
      expect(diff).toContain(`+${DIRTY_TEXT} (improved)`);
      expect(diff).not.toContain('"improved":');
      expect(diff).not.toContain('"language":');
    });

    it('leaves no colour escapes in the payload even when colour is forced', () => {
      const result = run(
        [subject.command, DIRTY_TEXT, '--diff', '--format', 'json'],
        true
      );

      expect(result.stdout).not.toContain(ESC);
      const { diff } = JSON.parse(result.stdout) as { diff: string };
      expect(diff).not.toContain(ESC);
    });

    it('reads a file input as the original', () => {
      fs.writeFileSync(path.join(workDir, 'draft.txt'), DIRTY_TEXT, 'utf-8');

      const result = run([
        subject.command,
        'draft.txt',
        '--diff',
        '--format',
        'json',
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout) as { original: string };
      expect(payload.original).toBe(DIRTY_TEXT);
    });
  });

  describe.each(COMMANDS)('$label --alternatives --format json', (subject) => {
    it('emits the alternatives as an array', () => {
      const result = run([
        subject.command,
        VARIANTS_TEXT,
        '--alternatives',
        '--format',
        'json',
      ]);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        ok: true,
        original: VARIANTS_TEXT,
        alternatives: [
          `${VARIANTS_TEXT} (simple)`,
          `${VARIANTS_TEXT} (business)`,
          `${VARIANTS_TEXT} (casual)`,
        ],
      });
    });

    it('emits a single-element array when the API offers one improvement', () => {
      const result = run([
        subject.command,
        DIRTY_TEXT,
        '--alternatives',
        '--format',
        'json',
      ]);

      expect(JSON.parse(result.stdout)).toEqual({
        ok: true,
        original: DIRTY_TEXT,
        alternatives: [`${DIRTY_TEXT} (improved)`],
      });
    });
  });

  // Over-rejection guards: every path that already worked must not move.
  describe.each(COMMANDS)('$label text mode is unchanged', (subject) => {
    it('prints the three-block diff report', () => {
      const result = run([subject.command, DIRTY_TEXT, '--diff']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Original:');
      expect(result.stdout).toContain(subject.improvedHeading);
      expect(result.stdout).toContain('Diff:');
      expect(result.stdout).toContain(`+${DIRTY_TEXT} (improved)`);
      expect(() => JSON.parse(result.stdout)).toThrow();
    });

    it('prints the numbered alternatives list', () => {
      const result = run([subject.command, VARIANTS_TEXT, '--alternatives']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`1. ${VARIANTS_TEXT} (simple)`);
      expect(result.stdout).toContain(`2. ${VARIANTS_TEXT} (business)`);
      expect(result.stdout).toContain(`3. ${VARIANTS_TEXT} (casual)`);
    });
  });

  describe.each(COMMANDS)(
    '$label other JSON payloads are unchanged',
    (subject) => {
      it('keeps the plain improvement payload, which carries no ok field', () => {
        const result = run([subject.command, DIRTY_TEXT, '--format', 'json']);

        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
          original: DIRTY_TEXT,
          improved: `${DIRTY_TEXT} (improved)`,
          changes: 1,
          language: 'auto-detected',
        });
      });

      it('keeps the --check result payload', () => {
        const result = run([
          subject.command,
          DIRTY_TEXT,
          '--check',
          '--format',
          'json',
        ]);

        expect(result.status).toBe(8);
        expect(JSON.parse(result.stdout)).toEqual({
          ok: true,
          mode: subject.command,
          needsChanges: true,
          changes: 1,
        });
      });
    }
  );

  // --output and --in-place receive whatever the improvement renders to, which
  // under --format json is the payload. That predates this change for the plain
  // path and is deliberately left as it stands.
  describe.each(COMMANDS)('$label --output under --format json', (subject) => {
    it('writes the plain improvement payload', () => {
      const result = run([
        subject.command,
        DIRTY_TEXT,
        '--format',
        'json',
        '--output',
        'out.json',
      ]);

      expect(result.status).toBe(0);
      expect(
        JSON.parse(fs.readFileSync(path.join(workDir, 'out.json'), 'utf-8'))
      ).toEqual({
        original: DIRTY_TEXT,
        improved: `${DIRTY_TEXT} (improved)`,
        changes: 1,
        language: 'auto-detected',
      });
    });

    it('writes the alternatives payload with --alternatives', () => {
      const result = run([
        subject.command,
        DIRTY_TEXT,
        '--alternatives',
        '--format',
        'json',
        '--output',
        'alts.json',
      ]);

      expect(result.status).toBe(0);
      expect(
        JSON.parse(fs.readFileSync(path.join(workDir, 'alts.json'), 'utf-8'))
      ).toEqual({
        ok: true,
        original: DIRTY_TEXT,
        alternatives: [`${DIRTY_TEXT} (improved)`],
      });
    });

    it('writes the numbered list with --alternatives in text mode', () => {
      const result = run([
        subject.command,
        DIRTY_TEXT,
        '--alternatives',
        '--output',
        'alts.txt',
      ]);

      expect(result.status).toBe(0);
      expect(fs.readFileSync(path.join(workDir, 'alts.txt'), 'utf-8')).toBe(
        `1. ${DIRTY_TEXT} (improved)`
      );
    });
  });
});
