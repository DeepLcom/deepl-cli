/**
 * E2E Tests for File Translation CLI
 * Tests the `deepl translate <file>` command end-to-end
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('File Translation E2E', () => {
  const testConfig = createTestConfigDir('e2e-file-translation');
  const { runCLI, runCLIExpectError } = makeNodeRunCLI(testConfig.path);
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `deepl-e2e-file-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('translate --help', () => {
    it('should display help text for translate command', () => {
      const output = runCLI('translate --help');

      expect(output).toContain('translate');
      expect(output).toContain('Options:');
    });

    it('should mention output option in help', () => {
      const output = runCLI('translate --help');

      expect(output).toMatch(/output/i);
    });

    it('should mention target language option', () => {
      const output = runCLI('translate --help');

      expect(output).toMatch(/target|--to/i);
    });
  });

  describe('translate file error handling', () => {
    it('should require API key for file translation', () => {
      const filePath = path.join(testDir, 'test.txt');
      fs.writeFileSync(filePath, 'Hello');

      const result = runCLIExpectError(`translate ${filePath} --to de`, {
        apiKey: '',
      });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });

    it('should error for non-existent file', () => {
      const result = runCLIExpectError(
        `translate /tmp/deepl-nonexistent-file-xyz-${Date.now()}.txt --to de`,
        { apiKey: 'test-key:fx' }
      );

      expect(result.status).toBeGreaterThan(0);
    });

    it('should handle authentication errors gracefully', () => {
      const filePath = path.join(testDir, 'test.txt');
      fs.writeFileSync(filePath, 'Hello');

      const result = runCLIExpectError(
        `translate ${filePath} --to de`,
        { apiKey: 'invalid-api-key-format:fx' }
      );

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toBeTruthy();
    });
  });

  describe('translate command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('translate');
    });

    it('should support --to flag', () => {
      const helpOutput = runCLI('translate --help');

      expect(helpOutput).toContain('--to');
    });

    it('should support --output flag', () => {
      const helpOutput = runCLI('translate --help');

      expect(helpOutput).toMatch(/-o.*--output/);
    });

    it('should support --from flag', () => {
      const helpOutput = runCLI('translate --help');

      expect(helpOutput).toMatch(/-f.*--from/);
    });

    it('should support --preserve-code flag', () => {
      const helpOutput = runCLI('translate --help');

      expect(helpOutput).toContain('--preserve-code');
    });
  });
});
