/**
 * E2E Tests for Languages Command
 * Tests the `deepl languages` command end-to-end
 *
 * Note: These tests focus on CLI behavior, argument parsing, and error handling.
 * Full API integration is tested separately in integration tests.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Languages Command E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  const testConfig = createTestConfigDir('e2e-languages');
  const { runCLI } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  const runCLIWithEnv = (
    command: string,
    env: Record<string, string> = {}
  ): { status: number; stdout: string; stderr: string } => {
    const result = spawnSync('node', [CLI_PATH, ...command.split(' ')], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfig.path,
        ...env,
      },
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  };

  describe('languages --help', () => {
    it('should display help text', () => {
      const output = runCLI('languages --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('languages');
      expect(output).toContain('Options:');
      expect(output).toContain('List supported source and target languages');
    });

    it('should show source and target options', () => {
      const output = runCLI('languages --help');

      expect(output).toContain('--source');
      expect(output).toContain('--target');
      expect(output).toContain('Show only source languages');
      expect(output).toContain('Show only target languages');
    });

    it('should display short flags', () => {
      const output = runCLI('languages --help');

      expect(output).toContain('-s,');
      // -t short flag removed from languages to avoid conflict with --to in other commands
    });
  });

  describe('languages without API key (graceful degradation)', () => {
    it('should show languages from registry without API key', () => {
      const result = runCLIWithEnv('languages', { DEEPL_API_KEY: '' });

      // Should succeed (not crash) and show registry data
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Source Languages:');
      expect(result.stdout).toContain('Target Languages:');
    });

    it('should show extended languages section without API key', () => {
      const result = runCLIWithEnv('languages', { DEEPL_API_KEY: '' });

      expect(result.stdout).toContain('Extended Languages');
      expect(result.stdout).toContain('quality_optimized only');
    });

    it('should show core languages without API key', () => {
      const result = runCLIWithEnv('languages --source', { DEEPL_API_KEY: '' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('English');
      expect(result.stdout).toContain('German');
      expect(result.stdout).toContain('French');
    });

    it('should show regional variants in target without API key', () => {
      const result = runCLIWithEnv('languages --target', { DEEPL_API_KEY: '' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('English (British)');
      expect(result.stdout).toContain('English (American)');
    });

    // Anchored rows rather than substrings, so a variant listed under the wrong
    // label or dropped from the bundled snapshot fails here. noColor because the
    // code is chalk.cyan'd; excludeApiKey to read the snapshot, not the API.
    it('should list regional variants against their own labels', () => {
      const output = runCLI('languages --target', {
        excludeApiKey: true,
        noColor: true,
      });

      expect(output).toMatch(/^\s+de-ch\s+German \(Swiss\)$/m);
      expect(output).toMatch(/^\s+fr-ca\s+French \(Canadian\)$/m);
      expect(output).toMatch(/^\s+de-de\s+German$/m);
      expect(output).toMatch(/^\s+fr-fr\s+French$/m);
    });

    it('should warn about missing API key', () => {
      const result = runCLIWithEnv('languages', { DEEPL_API_KEY: '' });

      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/no api key|local.*registry/i);
    });

    it('should list the same languages in --format json as in text output', () => {
      // Both formats read the same bundled snapshot, so both list the same
      // languages when there is no API key.
      const result = runCLIWithEnv('languages --format json', {
        DEEPL_API_KEY: '',
      });

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        source: Array<{ language: string; name: string }>;
        target: Array<{ language: string; name: string }>;
      };
      expect(parsed.source.length).toBeGreaterThan(100);
      expect(parsed.target.length).toBeGreaterThan(parsed.source.length);
      expect(parsed.source).toEqual(
        expect.arrayContaining([{ language: 'de', name: 'German' }])
      );
      expect(parsed.target.map((entry) => entry.language)).toContain('en-gb');
    });

    it('should list target-only languages in --format json --target', () => {
      const result = runCLIWithEnv('languages --target --format json', {
        DEEPL_API_KEY: '',
      });

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as Array<{ language: string }>;
      expect(parsed.map((entry) => entry.language)).toContain('pt-br');
    });
  });

  describe('languages --features (against the mock API)', () => {
    const featuresConfig = createTestConfigDir('e2e-languages-features');
    let mockServerProcess: ChildProcess | undefined;
    let featuresRunCLI: (command: string) => string;

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

    beforeAll(async () => {
      const port = await startMockServer();
      const config = {
        auth: { apiKey: 'mock-api-key-for-testing:fx' },
        api: { baseUrl: `http://127.0.0.1:${port}`, usePro: false },
        cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
      };
      fs.writeFileSync(
        path.join(featuresConfig.path, 'config.json'),
        JSON.stringify(config, null, 2)
      );
      featuresRunCLI = makeNodeRunCLI(featuresConfig.path, {
        noColor: true,
        timeout: 15000,
      }).runCLI;
    }, 30000);

    afterAll(() => {
      if (mockServerProcess) {
        mockServerProcess.kill('SIGTERM');
      }
      featuresConfig.cleanup();
    });

    it('should list the features each language supports', () => {
      const output = featuresRunCLI('languages --target --features');

      const german = output.split('\n').find((line) => line.includes('German'));
      const english = output
        .split('\n')
        .find((line) => line.includes('English (British)'));

      // formality is what varies across the languages the mock describes, so it
      // is the per-row annotation; glossary is shared by all of them and is
      // reported once at the end rather than on every row.
      expect(german).toContain('formality');
      expect(english).not.toContain('formality');
      expect(output).toContain('glossary');
    });

    it('should scope the shared-feature note to the languages it has data for', () => {
      const output = featuresRunCLI('languages --target --features');

      // The listing also carries snapshot languages the mock never returned, so
      // the note must not speak for them.
      expect(output).toContain(
        'All languages with reported features also support'
      );
      const zulu = output.split('\n').find((line) => line.includes('Zulu'));
      expect(zulu).toContain('no feature data');
    });

    // Column suppression is asserted in the unit tests: the row set here is the
    // whole registry, so the languages this mock does not return report no
    // features and nothing comes out uniform.
    it('should drop the [F] shorthand in favour of the matrix', () => {
      const output = featuresRunCLI('languages --target --features');

      expect(output).not.toContain('[F]');
    });

    it('should keep the [F] shorthand when features are not requested', () => {
      const output = featuresRunCLI('languages --target');

      expect(output).toContain('[F]');
      expect(output).not.toContain('tag handling');
    });

    it('should include the matrix in JSON only when requested', () => {
      const withFeatures = JSON.parse(
        featuresRunCLI('languages --target --features --format json')
      );
      const without = JSON.parse(
        featuresRunCLI('languages --target --format json')
      );

      expect(
        withFeatures.find((l: { language: string }) => l.language === 'de')
          .features
      ).toEqual({
        formality: { status: 'stable' },
        glossary: { status: 'stable' },
        tag_handling: { status: 'stable' },
      });
      expect(
        without.find((l: { language: string }) => l.language === 'de')
      ).not.toHaveProperty('features');
    });
  });

  describe('languages command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('languages');
      expect(helpOutput).toContain(
        'List supported source and target languages'
      );
    });

    it('should support --quiet flag', () => {
      const result = runCLIWithEnv('languages --quiet', { DEEPL_API_KEY: '' });

      // Should not fail due to invalid flag
      expect(result.stdout + result.stderr).not.toMatch(
        /unknown option.*quiet/i
      );
    });

    it('should support combining --source and --quiet', () => {
      const result = runCLIWithEnv('languages --source --quiet', {
        DEEPL_API_KEY: '',
      });

      expect(result.stdout + result.stderr).not.toMatch(/unknown option/i);
    });

    it('should support combining --target and --quiet', () => {
      const result = runCLIWithEnv('languages --target --quiet', {
        DEEPL_API_KEY: '',
      });

      expect(result.stdout + result.stderr).not.toMatch(/unknown option/i);
    });
  });

  describe('languages flag combinations', () => {
    it('should handle both --source and --target flags together', () => {
      const result = runCLIWithEnv('languages --source --target', {
        DEEPL_API_KEY: '',
      });

      // Should show both (or handle appropriately), not fail due to flag conflict
      expect(result.stdout + result.stderr).not.toMatch(
        /cannot use both|conflicting options/i
      );
    });

    it('should accept short flags', () => {
      const result = runCLIWithEnv('languages -s', { DEEPL_API_KEY: '' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Source Languages:');
    });

    it('should accept --target flag', () => {
      const result = runCLIWithEnv('languages --target', { DEEPL_API_KEY: '' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Target Languages:');
    });
  });
});
