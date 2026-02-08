/**
 * Tests for CLI exit code when no arguments provided (Issue deepl-cli-422)
 *
 * Validates that running 'deepl' with no arguments exits with code 0.
 */

import { execSync } from 'child_process';
import * as path from 'path';

describe('CLI no-args exit code', () => {
  const cliPath = path.resolve(__dirname, '../../src/cli/index.ts');

  it('should exit with code 0 when no arguments are provided', () => {
    // Run the CLI with ts-node and capture exit code
    // We use tsx/ts-node to execute the TypeScript source directly
    try {
      const output = execSync(
        `node --loader ts-node/esm "${cliPath}"`,
        {
          encoding: 'utf-8',
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
          timeout: 10000,
        }
      );
      // If it exits 0, execSync won't throw
      expect(output).toContain('deepl');
    } catch (error: any) {
      // If execSync throws, the exit code was non-zero
      fail(`CLI exited with code ${error.status as number}, expected 0. stderr: ${error.stderr as string}`);
    }
  });

  it('should show help text when no arguments are provided', () => {
    try {
      const output = execSync(
        `node --loader ts-node/esm "${cliPath}"`,
        {
          encoding: 'utf-8',
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
          timeout: 10000,
        }
      );
      expect(output).toContain('DeepL CLI');
      expect(output).toContain('translate');
    } catch (error: any) {
      fail(`CLI exited with non-zero code: ${error.status as number}`);
    }
  });
});
