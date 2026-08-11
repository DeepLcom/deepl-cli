/**
 * E2E tests for the placeholder post-condition on the three translate paths.
 *
 * An engine that re-cases or re-spaces the `__VAR_n__` token the CLI substituted
 * for a user's `{username}` used to have that token printed to stdout, written to
 * a file, and written across a whole directory — every time at exit 0, with no
 * warning. Only `sync` caught it, because only `sync` has a validator.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir, makeNodeRunCLI } from '../helpers';

describe('CLI placeholder post-condition E2E', () => {
  const testConfig = createTestConfigDir('e2e-placeholder-postcondition');
  const testFiles = createTestDir('e2e-placeholder-postcondition-files');
  let runner: ReturnType<typeof makeNodeRunCLI>;
  let server: ChildProcess;
  let baseUrl: string;

  function startManglingServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'node',
        [path.join(__dirname, 'mangling-server.cjs')],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        }
      );

      server = child;
      let output = '';
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const match = output.match(/PORT=(\d+)/);
        if (match) resolve(parseInt(match[1]!, 10));
      });
      child.on('error', reject);
      setTimeout(
        () => reject(new Error('Mangling server did not start within 15s')),
        15000
      );
    });
  }

  beforeAll(async () => {
    runner = makeNodeRunCLI(testConfig.path, { apiKey: 'test-api-key' });
    const port = await startManglingServer();
    baseUrl = `http://127.0.0.1:${port}`;
  }, 30000);

  afterAll(() => {
    server.kill();
    testConfig.cleanup();
    testFiles.cleanup();
  });

  it('refuses to print a translation that lost the placeholder', () => {
    const result = runner.runCLIExpectError(
      `translate "Welcome back, {username}!" --to de --no-cache --api-url ${baseUrl}`,
      { timeout: 30000 }
    );

    expect(result.status).toBe(5);
    expect(result.output).toContain('{username}');
    expect(result.output).not.toContain('Var_0');
  });

  it('writes no output file when a single file lost the placeholder', () => {
    const input = path.join(testFiles.path, 'one.txt');
    const output = path.join(testFiles.path, 'one.de.txt');
    fs.writeFileSync(input, 'Welcome back, {username}!\n');

    const result = runner.runCLIExpectError(
      `translate ${input} --to de --no-cache --output ${output} --api-url ${baseUrl}`,
      { timeout: 30000 }
    );

    expect(result.status).toBe(5);
    expect(fs.existsSync(output)).toBe(false);
  });

  it('fails only the affected files in a directory run', () => {
    const dir = path.join(testFiles.path, 'src');
    const out = path.join(testFiles.path, 'out');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'with.txt'), 'Welcome back, {username}!\n');
    fs.writeFileSync(path.join(dir, 'without.txt'), 'Nothing to preserve\n');

    const result = runner.runCLIExpectError(
      `translate ${dir} --to de --no-cache --output ${out} --api-url ${baseUrl}`,
      { timeout: 30000 }
    );

    // The per-file reason is on stdout, which this helper drops when the
    // endpoint notice has written to stderr; the unit suite covers its wording.
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(out, 'with.de.txt'))).toBe(false);
    // A file with no placeholders is unaffected and still translated.
    expect(fs.existsSync(path.join(out, 'without.de.txt'))).toBe(true);
  });

  it('translates normally when the text has no placeholders', () => {
    const output = runner.runCLIAll(
      `translate "Nothing to preserve" --to de --no-cache --api-url ${baseUrl}`,
      { timeout: 30000 }
    );

    expect(output).toContain('[de] Nothing to preserve');
  });
});
