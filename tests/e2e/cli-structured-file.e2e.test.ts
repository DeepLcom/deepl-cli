/**
 * E2E Tests for Structured File (JSON/YAML) Translation
 * Tests complete user workflows without requiring real API key
 */

import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir, makeRunCLI } from '../helpers';

describe('Structured File Translation E2E', () => {
  const testConfig = createTestConfigDir('structured-e2e-config');
  const testFiles = createTestDir('structured-e2e');
  const testDir = testFiles.path;
  const { runCLI, runCLIAll, runCLIExpectError } = makeRunCLI(testConfig.path, {
    apiKey: 'fake-key-for-e2e',
  });

  afterAll(() => {
    testFiles.cleanup();
    testConfig.cleanup();
  });

  describe('JSON file support', () => {
    it('should accept JSON file input without "unsupported file type" error', () => {
      expect.assertions(1);
      const inputPath = path.join(testDir, 'test.json');
      const outputPath = path.join(testDir, 'test-es.json');

      fs.writeFileSync(inputPath, JSON.stringify({ key: 'Hello' }, null, 2));

      try {
        runCLI(
          `deepl translate "${inputPath}" --to es --output "${outputPath}"`
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout ?? '';
        // Should NOT fail with "Unsupported file type"
        expect(output).not.toContain('Unsupported file type');
      }
    });

    it('should translate empty JSON object without API call', () => {
      const inputPath = path.join(testDir, 'empty-e2e.json');
      const outputPath = path.join(testDir, 'empty-e2e-es.json');

      fs.writeFileSync(inputPath, '{}');

      const output = runCLI(
        `deepl translate "${inputPath}" --to es --output "${outputPath}"`
      );
      expect(output).toContain('Translated');

      const result = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(result).toEqual({});
    });

    it('should reject invalid JSON with clear error', () => {
      const inputPath = path.join(testDir, 'bad-e2e.json');
      const outputPath = path.join(testDir, 'bad-e2e-es.json');

      fs.writeFileSync(inputPath, '{ not: valid }');

      try {
        runCLI(
          `deepl translate "${inputPath}" --to es --output "${outputPath}"`
        );
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should reject empty JSON file with clear error', () => {
      const inputPath = path.join(testDir, 'empty-file-e2e.json');
      const outputPath = path.join(testDir, 'empty-file-e2e-es.json');

      fs.writeFileSync(inputPath, '');

      try {
        runCLI(
          `deepl translate "${inputPath}" --to es --output "${outputPath}"`
        );
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should preserve output indentation when JSON uses 4-space indent', () => {
      const inputPath = path.join(testDir, 'indent-e2e.json');
      const outputPath = path.join(testDir, 'indent-e2e-es.json');

      // Write an empty nested object — will be translated without API since no strings
      fs.writeFileSync(
        inputPath,
        JSON.stringify({ nested: { count: 42 } }, null, 4)
      );

      const output = runCLI(
        `deepl translate "${inputPath}" --to es --output "${outputPath}"`
      );
      expect(output).toContain('Translated');

      const raw = fs.readFileSync(outputPath, 'utf-8');
      // Should preserve 4-space indent for non-string values
      expect(raw).toContain('    "nested"');
    });

    it('should require --output for JSON file translation', () => {
      const inputPath = path.join(testDir, 'need-output-e2e.json');
      fs.writeFileSync(inputPath, JSON.stringify({ key: 'test' }, null, 2));

      try {
        runCLI(`deepl translate "${inputPath}" --to es`);
        fail('Should have thrown');
      } catch (error: any) {
        const output = error.stderr ?? error.stdout ?? '';
        expect(output).toMatch(/output/i);
      }
    });
  });

  describe('YAML file support', () => {
    it('should accept YAML file input without "unsupported file type" error', () => {
      expect.assertions(1);
      const inputPath = path.join(testDir, 'test.yaml');
      const outputPath = path.join(testDir, 'test-es.yaml');

      fs.writeFileSync(inputPath, 'key: Hello\n');

      try {
        runCLI(
          `deepl translate "${inputPath}" --to es --output "${outputPath}"`
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout ?? '';
        expect(output).not.toContain('Unsupported file type');
      }
    });

    it('should accept .yml file input without "unsupported file type" error', () => {
      expect.assertions(1);
      const inputPath = path.join(testDir, 'test.yml');
      const outputPath = path.join(testDir, 'test-es.yml');

      fs.writeFileSync(inputPath, 'key: Hello\n');

      try {
        runCLI(
          `deepl translate "${inputPath}" --to es --output "${outputPath}"`
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout ?? '';
        expect(output).not.toContain('Unsupported file type');
      }
    });

    it('should reject empty YAML file with clear error', () => {
      const inputPath = path.join(testDir, 'empty-e2e.yaml');
      const outputPath = path.join(testDir, 'empty-e2e-es.yaml');

      fs.writeFileSync(inputPath, '');

      try {
        runCLI(
          `deepl translate "${inputPath}" --to es --output "${outputPath}"`
        );
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('exit codes', () => {
    it('should exit with 0 for empty JSON object (no API needed)', () => {
      const inputPath = path.join(testDir, 'exit-code-e2e.json');
      const outputPath = path.join(testDir, 'exit-code-e2e-es.json');

      fs.writeFileSync(inputPath, '{}');

      // Should not throw (exit code 0)
      const output = runCLI(
        `deepl translate "${inputPath}" --to es --output "${outputPath}"`
      );
      expect(output).toContain('Translated');
    });

    it('should exit with non-zero for invalid JSON', () => {
      const inputPath = path.join(testDir, 'exit-bad-e2e.json');
      const outputPath = path.join(testDir, 'exit-bad-e2e-es.json');

      fs.writeFileSync(inputPath, 'NOT JSON');

      try {
        runCLI(
          `deepl translate "${inputPath}" --to es --output "${outputPath}"`
        );
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should exit with non-zero for invalid language code', () => {
      const inputPath = path.join(testDir, 'exit-lang-e2e.json');
      const outputPath = path.join(testDir, 'exit-lang-e2e-out.json');

      fs.writeFileSync(inputPath, JSON.stringify({ key: 'test' }, null, 2));

      try {
        runCLI(
          `deepl translate "${inputPath}" --to INVALID --output "${outputPath}"`
        );
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('input size ceiling', () => {
    const OVER_CEILING_BYTES = 11 * 1024 * 1024;

    /** Streams a large JSON file out without holding it in memory. */
    function writeOversizeJson(filePath: string): void {
      const handle = fs.openSync(filePath, 'w');
      try {
        fs.writeSync(handle, '{\n');
        let written = 2;
        let i = 0;
        while (written < OVER_CEILING_BYTES) {
          const line = `  "key_${i}": "value ${i}",\n`;
          fs.writeSync(handle, line);
          written += line.length;
          i += 1;
        }
        fs.writeSync(handle, '  "last": "value"\n}\n');
      } finally {
        fs.closeSync(handle);
      }
    }

    it('exits 6 naming the size and the limit, and writes no output', () => {
      const inputPath = path.join(testDir, 'oversize.json');
      const outputPath = path.join(testDir, 'oversize-es.json');
      writeOversizeJson(inputPath);

      const result = runCLIExpectError(
        `deepl translate "${inputPath}" --to es --output "${outputPath}"`
      );

      expect(result.status).toBe(6);
      expect(result.output).toMatch(/oversize\.json is 1[0-9.]+ MiB/);
      expect(result.output).toContain('exceeds the maximum of 10 MiB');
      expect(result.output).toContain('deepl sync');
      expect(fs.existsSync(outputPath)).toBe(false);

      fs.unlinkSync(inputPath);
    });

    it('fails only the oversize file in a directory run', () => {
      const inputDir = path.join(testDir, 'oversize-dir');
      const outputDir = path.join(testDir, 'oversize-dir-out');
      fs.mkdirSync(inputDir, { recursive: true });
      writeOversizeJson(path.join(inputDir, 'big.json'));
      fs.writeFileSync(
        path.join(inputDir, 'small.json'),
        JSON.stringify({ a: 'Hello' })
      );

      // runCLIExpectError returns stderr whenever stderr is non-empty, which
      // drops the per-file summary on stdout. runCLIAll merges the two with
      // 2>&1, so the merged text survives on the thrown error's stdout.
      let output: string;
      try {
        output = runCLIAll(
          `deepl translate "${inputDir}" --to es --output "${outputDir}"`
        );
      } catch (error) {
        output =
          (error as { stdout?: Buffer | string }).stdout?.toString() ?? '';
      }

      // Both files fail here — big.json on the ceiling, small.json because the
      // e2e key reaches no API — so the assertion is about which reason is
      // reported for which file, not about the exit code.
      expect(output).toMatch(/big\.json: big\.json is 1[0-9.]+ MiB/);
      expect(output).not.toMatch(/small\.json: small\.json is/);

      fs.rmSync(inputDir, { recursive: true, force: true });
    });
  });

  describe('file type detection', () => {
    it('should recognize JSON file by extension', () => {
      const inputPath = path.join(testDir, 'detect-test.json');
      const outputPath = path.join(testDir, 'detect-test-es.json');

      fs.writeFileSync(inputPath, '{}');

      // This should succeed (no API needed for empty object)
      const output = runCLI(
        `deepl translate "${inputPath}" --to es --output "${outputPath}"`
      );
      expect(output).toContain('Translated');
    });

    it('should handle JSON file in nested directory', () => {
      const nestedDir = path.join(testDir, 'detect-nested', 'sub');
      fs.mkdirSync(nestedDir, { recursive: true });

      const inputPath = path.join(nestedDir, 'locale.json');
      const outputPath = path.join(testDir, 'detect-nested-out.json');

      fs.writeFileSync(inputPath, '{}');

      const output = runCLI(
        `deepl translate "${inputPath}" --to es --output "${outputPath}"`
      );
      expect(output).toContain('Translated');
    });

    it('should create output directory if it does not exist', () => {
      const inputPath = path.join(testDir, 'create-dir-test.json');
      const outputPath = path.join(testDir, 'new-dir', 'nested', 'output.json');

      fs.writeFileSync(inputPath, '{}');

      runCLI(`deepl translate "${inputPath}" --to es --output "${outputPath}"`);
      expect(fs.existsSync(outputPath)).toBe(true);
    });
  });
});
