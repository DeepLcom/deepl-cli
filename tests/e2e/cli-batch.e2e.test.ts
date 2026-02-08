/**
 * E2E Tests for Batch/Directory Translation
 * Tests `deepl translate <dir>` argument validation and help text
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Batch Translation E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  let testConfigDir: string;

  beforeAll(() => {
    testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-batch-${Date.now()}`);
    fs.mkdirSync(testConfigDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  const runCLIAll = (args: string): string => {
    return execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      shell: '/bin/sh',
    });
  };

  describe('translate --help', () => {
    it('should show directory/batch-related options', () => {
      const output = execSync(`node ${CLI_PATH} translate --help`, {
        encoding: 'utf-8',
        env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      });
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
        execSync(`node ${CLI_PATH} auth set-key fake-key:fx`, {
          encoding: 'utf-8',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
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
