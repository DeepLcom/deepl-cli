/**
 * E2E Tests for Hooks Command
 * Tests `deepl hooks install/uninstall/list/path` in a real temp git repo
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTestConfigDir } from '../helpers';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

describe('Hooks Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-hooks');
  let tmpDir: string;

  function run(args: string): string {
    return execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: 'utf-8',
      cwd: tmpDir,
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfig.path,
        NO_COLOR: '1',
      },
    });
  }

  function runExpectError(args: string): { status: number; output: string } {
    try {
      const output = run(args);
      return { status: 0, output };
    } catch (error: any) {
      return {
        status: error.status || 1,
        output: error.stderr?.toString() || error.stdout?.toString() || '',
      };
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-hooks-e2e-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    testConfig.cleanup();
  });

  it('should install a pre-commit hook and create the file', () => {
    const output = run('hooks install pre-commit');
    expect(output).toContain('Installed pre-commit hook');

    const hookFile = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    expect(fs.existsSync(hookFile)).toBe(true);

    const content = fs.readFileSync(hookFile, 'utf-8');
    expect(content).toContain('#!/bin/sh');
    expect(content).toContain('DeepL CLI Hook');
  });

  it('should list hooks showing installed status', () => {
    run('hooks install pre-commit');

    const output = run('hooks list');
    expect(output).toContain('pre-commit');
    expect(output).toContain('installed');
  });

  it('should show the hook path', () => {
    const output = run('hooks path pre-commit');
    expect(output).toContain('hooks');
    expect(output).toContain('pre-commit');
  });

  it('should uninstall a previously installed hook', () => {
    run('hooks install pre-commit');

    const hookFile = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    expect(fs.existsSync(hookFile)).toBe(true);

    const output = run('hooks uninstall pre-commit');
    expect(output).toContain('Uninstalled pre-commit hook');
    expect(fs.existsSync(hookFile)).toBe(false);
  });

  it('should reject invalid hook type', () => {
    const { status, output } = runExpectError('hooks install not-a-hook');
    expect(status).toBeGreaterThan(0);
    expect(output).toContain('Invalid hook type');
  });
});
