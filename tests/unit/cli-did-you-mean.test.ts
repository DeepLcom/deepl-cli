/**
 * Tests for did-you-mean suggestion on unknown commands (Issue deepl-cli-u4p)
 */

import { execSync } from 'child_process';
import * as path from 'path';

describe('CLI did-you-mean suggestions', () => {
  const cliPath = path.resolve(__dirname, '../../src/cli/index.ts');

  function runCLI(args: string): { stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(
        `node --loader ts-node/esm "${cliPath}" ${args}`,
        {
          encoding: 'utf-8',
          env: { ...process.env, NODE_NO_WARNINGS: '1', NO_COLOR: '1' },
          timeout: 10000,
        }
      );
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: (error.stdout as string) ?? '',
        stderr: (error.stderr as string) ?? '',
        exitCode: error.status as number,
      };
    }
  }

  it('should suggest "translate" when user types "transalte"', () => {
    const result = runCLI('transalte');
    expect(result.exitCode).toBeGreaterThan(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Unknown command: transalte');
    expect(combined).toContain('Did you mean: deepl translate?');
  });

  it('should suggest "glossary" when user types "glossry"', () => {
    const result = runCLI('glossry');
    expect(result.exitCode).toBeGreaterThan(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Did you mean: deepl glossary?');
  });

  it('should suggest "config" when user types "conifg"', () => {
    const result = runCLI('conifg');
    expect(result.exitCode).toBeGreaterThan(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Did you mean: deepl config?');
  });

  it('should not suggest for completely unrelated input', () => {
    const result = runCLI('xyzabc123');
    expect(result.exitCode).toBeGreaterThan(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Unknown command: xyzabc123');
    expect(combined).not.toContain('Did you mean');
  });

  it('should show help suggestion for unknown commands', () => {
    const result = runCLI('xyzabc123');
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('deepl --help');
  });
});
