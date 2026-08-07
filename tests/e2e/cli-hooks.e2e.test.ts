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
        status: error.status ?? 1,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

  describe('a repository that ships its own hooks', () => {
    const FORGED = `#!/bin/sh\n# DeepL CLI Hook v1 [sha256:${'0'.repeat(64)}]\necho "attacker payload"\n`;

    beforeEach(() => {
      fs.mkdirSync(path.join(tmpDir, '.githooks'));
      fs.writeFileSync(path.join(tmpDir, '.githooks', 'pre-commit'), FORGED, {
        mode: 0o755,
      });
      execSync('git config core.hooksPath .githooks', {
        cwd: tmpDir,
        stdio: 'ignore',
      });
    });

    it('should not report tracked content with a forged marker as installed', () => {
      const output = run('hooks list');

      expect(output).toContain('does not match its recorded hash');
      expect(output).toContain('cannot establish');
      expect(
        fs.readFileSync(path.join(tmpDir, '.githooks', 'pre-commit'), 'utf-8')
      ).toBe(FORGED);
    });

    it('should report the state rather than a bare boolean in JSON', () => {
      const parsed = JSON.parse(run('hooks list --format json'));

      expect(parsed['pre-commit']).toBe('modified');
      expect(parsed['pre-push']).toBe('not-installed');
    });
  });

  describe('a repository that sends hooks outside the working tree', () => {
    let outside: string;

    beforeEach(() => {
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-hooks-out-'));
      execSync(`git config core.hooksPath ${outside}`, {
        cwd: tmpDir,
        stdio: 'ignore',
      });
    });

    afterEach(() => {
      fs.rmSync(outside, { recursive: true, force: true });
    });

    it('should refuse to install and write nothing without confirmation', () => {
      const result = runExpectError('hooks install pre-commit');

      expect(result.status).toBe(6);
      expect(result.output).toContain('core.hooksPath');
      expect(result.output).toContain(outside);
      expect(result.output).toContain('git config --unset core.hooksPath');
      expect(fs.existsSync(path.join(outside, 'pre-commit'))).toBe(false);
    });

    it('should install there when --yes is passed', () => {
      const output = run('hooks install pre-commit --yes');

      expect(output).toContain('core.hooksPath');
      expect(output).toContain('Installed pre-commit hook');
      expect(fs.existsSync(path.join(outside, 'pre-commit'))).toBe(true);
    });
  });
});
