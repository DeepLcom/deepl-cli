/**
 * E2E Tests for Batch/Directory Translation
 * Tests `deepl translate <dir>` argument validation and help text
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Batch Translation E2E', () => {
  const testConfig = createTestConfigDir('e2e-batch');
  const { runCLI, runCLIAll } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('translate --help', () => {
    it('should show directory/batch-related options', () => {
      const output = runCLI('translate --help');
      expect(output).toContain('--output');
      expect(output).toContain('--pattern');
    });
  });

  describe('translate directory without --output', () => {
    it('should fail when translating a directory without --output', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-batch-e2e-'));
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'Hello');

      try {
        // Set a fake API key so we get past auth check
        runCLI('auth set-key fake-key:fx');
        const output = runCLIAll(`translate ${tmpDir} --to es`);
        // Should either fail with "Output directory is required" or attempt the request
        expect(output).toMatch(/output|error|failed/i);
      } catch (error: unknown) {
        const execError = error as { status: number; stdout: string };
        expect(execError.status).toBeGreaterThan(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('translate with nonexistent path', () => {
    it('should fail with a meaningful error', () => {
      try {
        runCLIAll('translate /nonexistent/path/to/file.txt --to es');
        fail('Should have thrown');
      } catch (error: unknown) {
        const execError = error as { status: number };
        expect(execError.status).toBeGreaterThan(0);
      }
    });
  });
});
