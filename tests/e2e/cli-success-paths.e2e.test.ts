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
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2));
  }

  let runCLI: (command: string) => string;
  let runCLIAll: (command: string) => string;
  let runCLIPipe: (stdin: string, command: string) => string;

  beforeAll(async () => {
    testConfigDir = testConfig.path;
    testDir = testFiles.path;

    const helpers = makeNodeRunCLI(testConfigDir, { noColor: true, timeout: 15000 });
    runCLI = (command: string) => helpers.runCLI(command);
    runCLIAll = (command: string) => helpers.runCLIAll(command);
    runCLIPipe = (stdin: string, command: string) => helpers.runCLIPipe(stdin, command);

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
      const output = runCLIPipe('Translate me', `translate --to es --api-url ${baseUrl}`);
      expect(output.trim().split('\n')[0]).toBe('Traduceme');
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

    it('should exit with code 0 on successful translation', () => {
      const output = runCLI('translate "Hello" --to es');
      expect(output).toBeTruthy();
    });

    it('should output JSON format when --format json is used', () => {
      const output = runCLI('translate "Hello" --to es --format json');
      const parsed = JSON.parse(output.trim());
      expect(parsed).toHaveProperty('text');
      expect(parsed.text).toBe('Hola');
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
      expect(output).toBeTruthy();
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
      expect(output).toBeTruthy();
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
      expect(output).toBeTruthy();
    });
  });
});
