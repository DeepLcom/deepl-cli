/**
 * E2E Tests for Watch Command --git-staged
 * Tests the `deepl watch --git-staged` flag end-to-end
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Watch Command E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  let testConfigDir: string;

  beforeAll(() => {
    testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-watch-${Date.now()}`);
    fs.mkdirSync(testConfigDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  const runCLI = (command: string): string => {
    return execSync(`node ${CLI_PATH} ${command}`, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfigDir,
      },
    });
  };

  describe('watch --help', () => {
    it('should show --git-staged option without "not yet implemented"', () => {
      const output = runCLI('watch --help');
      expect(output).toContain('--git-staged');
      expect(output).toContain('snapshot at startup');
      expect(output).not.toContain('not yet implemented');
    });
  });

  describe('watch --dry-run --git-staged', () => {
    it('should show git-staged info in dry-run output', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-e2e-'));
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'Hello');

      try {
        const output = runCLI(`watch ${tmpDir} --targets es --dry-run --git-staged`);
        expect(output).toContain('[dry-run]');
        expect(output).toContain('Git-staged');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
