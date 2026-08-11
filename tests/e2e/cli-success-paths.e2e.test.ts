/**
 * E2E Tests for CLI Success Paths
 * Uses a mock HTTP server (running in a separate process) to simulate
 * the DeepL API so we can test successful end-to-end workflows without
 * a real API key.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir, makeNodeRunCLI } from '../helpers';

describe('CLI Success Paths E2E', () => {
  const testConfig = createTestConfigDir('e2e-success');
  const testFiles = createTestDir('e2e-success-files');
  let testConfigDir: string;
  let testDir: string;
  let mockServerProcess: ChildProcess;
  let mockPort: number;
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
        if (
          !msg.includes('ExperimentalWarning') &&
          !msg.includes('--experimental')
        ) {
          process.stderr.write(`[mock-server stderr] ${msg}`);
        }
      });

      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== null && code !== 0) {
          reject(new Error(`Mock server exited with code ${code}`));
        }
      });

      setTimeout(
        () => reject(new Error('Mock server did not start within 15s')),
        15000
      );
    });
  }

  function writeConfig(configDir: string, apiUrl: string): void {
    const config = {
      auth: { apiKey: 'mock-api-key-for-testing:fx' },
      api: { baseUrl: apiUrl, usePro: false },
      defaults: {
        targetLangs: [],
        formality: 'default',
        preserveFormatting: true,
      },
      cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
      output: { format: 'text', verbose: false, color: false },
      watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
    };
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );
  }

  let runCLI: (command: string) => string;
  let runCLIAll: (command: string) => string;
  let runCLIPipe: (stdin: string, command: string) => string;
  let runCLIExpectError: (command: string) => {
    status: number;
    output: string;
  };

  beforeAll(async () => {
    testConfigDir = testConfig.path;
    testDir = testFiles.path;

    const helpers = makeNodeRunCLI(testConfigDir, {
      noColor: true,
      timeout: 15000,
    });
    runCLI = (command: string) => helpers.runCLI(command);
    runCLIAll = (command: string) => helpers.runCLIAll(command);
    runCLIPipe = (stdin: string, command: string) =>
      helpers.runCLIPipe(stdin, command);
    runCLIExpectError = (command: string) => helpers.runCLIExpectError(command);

    mockPort = await startMockServer();
    baseUrl = `http://127.0.0.1:${mockPort}`;

    writeConfig(testConfigDir, baseUrl);
  }, 30000);

  afterAll(() => {
    if (mockServerProcess) {
      mockServerProcess.kill('SIGTERM');
    }
    testConfig.cleanup();
    testFiles.cleanup();
  });

  describe('translate command success paths', () => {
    it('should translate text via --api-url flag', () => {
      const output = runCLI(`translate "Hello" --to es --api-url ${baseUrl}`);
      expect(output.trim().split('\n')[0]).toBe('Hola');
    });

    it('should translate text using config baseUrl', () => {
      const output = runCLI('translate "Hello world" --to es');
      expect(output.trim().split('\n')[0]).toBe('Hola mundo');
    });

    it('should translate with --from and --to flags', () => {
      const output = runCLI('translate "Good morning" --from en --to es');
      expect(output.trim().split('\n')[0]).toBe('Buenos dias');
    });

    it('should translate text from stdin pipe', () => {
      const output = runCLIPipe(
        'Translate me',
        `translate --to es --api-url ${baseUrl}`
      );
      expect(output.trim().split('\n')[0]).toBe('Traduceme');
    });

    it('should send a well-formed target the bundled snapshot does not list', () => {
      // The mock echoes "[TARGET] text", so reaching it at all proves the code
      // was not rejected locally. GET /v3/languages is the authority on which
      // languages exist, and the snapshot can lag it.
      const output = runCLI('translate "Unmapped" --to xx-yy');
      expect(output.trim().split('\n')[0]).toBe('[XX-YY] Unmapped');
    });

    it('should still reject a target that is not shaped like a language tag', () => {
      const result = runCLIExpectError('translate "Hello" --to notalanguage');
      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(
        /Invalid target language code: "notalanguage"/
      );
    });

    it('should translate a file and write to output', () => {
      const inputFile = path.join(testDir, 'input.txt');
      const outputFile = path.join(testDir, 'output.txt');
      fs.writeFileSync(inputFile, 'Hello', 'utf-8');

      runCLI(`translate "${inputFile}" --to es --output "${outputFile}"`);

      expect(fs.existsSync(outputFile)).toBe(true);
      const content = fs.readFileSync(outputFile, 'utf-8');
      expect(content).toContain('Hola');
    });

    it('should write <stem>.<lang>.<ext> when --output is an existing directory', () => {
      const inputFile = path.join(testDir, 'single-dir.md');
      const outDir = path.join(testDir, 'single-dir-out');
      fs.writeFileSync(inputFile, 'Hello', 'utf-8');
      fs.mkdirSync(outDir, { recursive: true });

      const output = runCLI(
        `translate "${inputFile}" --to es --output "${outDir}"`
      );

      const expected = path.join(outDir, 'single-dir.es.md');
      expect(output).toContain(expected);
      expect(fs.readFileSync(expected, 'utf-8')).toContain('Hola');
    });

    it('should treat a trailing slash on the output directory identically', () => {
      const inputFile = path.join(testDir, 'slash-dir.md');
      const outDir = path.join(testDir, 'slash-dir-out');
      fs.writeFileSync(inputFile, 'Hello', 'utf-8');
      fs.mkdirSync(outDir, { recursive: true });

      runCLI(
        `translate "${inputFile}" --to es --output "${outDir}${path.sep}"`
      );

      expect(
        fs.readFileSync(path.join(outDir, 'slash-dir.es.md'), 'utf-8')
      ).toContain('Hola');
    });

    it('should write a structured file into an output directory under its own stem', () => {
      const inputFile = path.join(testDir, 'messages.json');
      const outDir = path.join(testDir, 'structured-dir-out');
      fs.writeFileSync(inputFile, JSON.stringify({ greeting: 'Hello' }));
      fs.mkdirSync(outDir, { recursive: true });

      runCLI(`translate "${inputFile}" --to es --output "${outDir}"`);
      runCLI(`translate "${inputFile}" --to fr --output "${outDir}"`);

      expect(fs.existsSync(path.join(outDir, 'messages.es.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'messages.fr.json'))).toBe(true);
    });

    it('should create an output directory named with a trailing slash', () => {
      const inputFile = path.join(testDir, 'missing-dir.md');
      const outDir = path.join(testDir, 'missing-dir-out');
      fs.writeFileSync(inputFile, 'Hello', 'utf-8');

      runCLI(
        `translate "${inputFile}" --to es --output "${outDir}${path.sep}"`
      );

      expect(
        fs.readFileSync(path.join(outDir, 'missing-dir.es.md'), 'utf-8')
      ).toContain('Hola');
    });

    it('should still create a non-existent --output path as a file', () => {
      const inputFile = path.join(testDir, 'new-path.md');
      const outputFile = path.join(testDir, 'new-path-out', 'new.md');
      fs.writeFileSync(inputFile, 'Hello', 'utf-8');

      runCLI(`translate "${inputFile}" --to es --output "${outputFile}"`);

      expect(fs.readFileSync(outputFile, 'utf-8')).toContain('Hola');
    });

    it('should exit with code 0 on successful translation', () => {
      const output = runCLI('translate "Hello" --to es');
      expect(output).toContain('Hola');
    });

    it('should output JSON format when --format json is used', () => {
      const output = runCLI('translate "Hello" --to es --format json');
      const parsed = JSON.parse(output.trim());
      expect(parsed).toHaveProperty('text');
      expect(parsed.text).toBe('Hola');
    });
  });

  describe('local language validation across input modes', () => {
    it('should reject formality for an extended target before sending a file', () => {
      const inputFile = path.join(testDir, 'extended-file.txt');
      fs.writeFileSync(inputFile, 'Hello', 'utf-8');
      const outputFile = path.join(testDir, 'extended-file.af.txt');

      const result = runCLIExpectError(
        `translate "${inputFile}" --to af --formality more --output "${outputFile}"`
      );

      expect(result.status).toBe(6);
      expect(result.output).toContain('do not support formality');
      expect(fs.existsSync(outputFile)).toBe(false);
    });

    it('should reject formality for an extended target before scanning a directory', () => {
      const dirPath = path.join(testDir, 'extended-dir');
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'a.txt'), 'Hello', 'utf-8');

      const result = runCLIExpectError(
        `translate "${dirPath}" --to af --formality more --output "${testDir}/extended-dir-out"`
      );

      expect(result.status).toBe(6);
      expect(result.output).toContain('do not support formality');
    });

    it('should note an unknown code once per directory run, not once per call site', () => {
      const dirPath = path.join(testDir, 'deferral-dir');
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'a.txt'), 'Hello', 'utf-8');

      const output = runCLIAll(
        `translate "${dirPath}" --to de,ex --output "${testDir}/deferral-dir-out"`
      );

      const notices =
        output.match(/is not in the bundled language list/g) ?? [];
      expect(notices).toHaveLength(1);
      expect(output).toContain('"ex" is not in the bundled language list');
    });
  });

  describe('write command success paths', () => {
    it('should improve text using write command', () => {
      const output = runCLIAll('write "Their going to the store" --lang en-US');
      expect(output).toContain('Improved:');
    });

    it('should improve text without --lang (auto-detect)', () => {
      const output = runCLIAll('write "Some text to improve"');
      expect(output).toContain('Improved:');
    });

    it('should exit with code 0 on successful write', () => {
      const output = runCLIAll('write "Test text" --lang en-US');
      expect(output).toContain('Improved:');
    });
  });

  describe('usage command success paths', () => {
    it('should display usage statistics', () => {
      const output = runCLI('usage');
      expect(output).toContain('Character Usage:');
      expect(output).toContain('42,000');
      expect(output).toContain('500,000');
    });

    it('should show usage percentage', () => {
      const output = runCLI('usage');
      expect(output).toContain('8.4%');
    });

    it('should show remaining characters', () => {
      const output = runCLI('usage');
      expect(output).toContain('458,000');
    });

    it('should exit with code 0', () => {
      const output = runCLI('usage');
      expect(output).toContain('Character Usage:');
    });
  });

  describe('languages command success paths', () => {
    it('should display source and target languages from API', () => {
      const output = runCLIAll('languages');
      expect(output).toContain('Source Languages:');
      expect(output).toContain('Target Languages:');
    });

    it('should list source languages with --source flag', () => {
      const output = runCLIAll('languages --source');
      expect(output).toContain('English');
      expect(output).toContain('German');
      expect(output).toContain('French');
    });

    it('should list target languages with --target flag', () => {
      const output = runCLIAll('languages --target');
      expect(output).toContain('English (American)');
      expect(output).toContain('English (British)');
      expect(output).toContain('German');
    });

    it('should exit with code 0', () => {
      const output = runCLIAll('languages');
      expect(output).toContain('Source Languages:');
    });

    it('should report supportsFormality on every target in --format json', () => {
      // The documented JSON shape for targets. The features matrix rides along on
      // the same objects and is stripped without --features, so the two must not
      // be confused: this field stays.
      const output = runCLI('languages --target --format json');
      const parsed = JSON.parse(output.trim()) as Array<
        Record<string, unknown>
      >;

      expect(parsed.length).toBeGreaterThan(0);
      for (const entry of parsed) {
        expect(entry).toHaveProperty('supportsFormality');
        expect(typeof entry['supportsFormality']).toBe('boolean');
        expect(entry).not.toHaveProperty('features');
      }
      expect(
        parsed.find((e) => e['language'] === 'de')?.['supportsFormality']
      ).toBe(true);
      expect(
        parsed.find((e) => e['language'] === 'en')?.['supportsFormality']
      ).toBe(false);
    });

    it('should omit supportsFormality from source languages in --format json', () => {
      const output = runCLI('languages --source --format json');
      const parsed = JSON.parse(output.trim()) as Array<
        Record<string, unknown>
      >;

      expect(parsed.length).toBeGreaterThan(0);
      for (const entry of parsed) {
        expect(entry).not.toHaveProperty('supportsFormality');
      }
    });

    it('should include the features matrix only with --features', () => {
      const output = runCLI('languages --target --features --format json');
      const parsed = JSON.parse(output.trim()) as Array<
        Record<string, unknown>
      >;

      expect(parsed.find((e) => e['language'] === 'de')).toHaveProperty(
        'features'
      );
    });
  });
});
