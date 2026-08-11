/**
 * E2E Tests for the --no-input Global Flag
 *
 * Covers the commands that would otherwise prompt: the confirmation guard on
 * `cache clear`, and the two commands that need a terminal and must refuse
 * rather than block on one.
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('--no-input E2E', () => {
  const testConfig = createTestConfigDir('e2e-no-input');
  const { runCLI, runCLIAll, runCLIExpectError } = makeNodeRunCLI(
    testConfig.path
  );

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('help output', () => {
    it('should show --no-input in global help', () => {
      const output = runCLI('--help');

      expect(output).toContain('--no-input');
    });
  });

  describe('cache clear', () => {
    it('should abort rather than prompt when --yes is absent', () => {
      const output = runCLIAll('--no-input cache clear');

      expect(output).toContain('Aborted.');
    });

    it('should proceed when --yes supplies the confirmation', () => {
      const output = runCLIAll('--no-input cache clear --yes');

      expect(output).toContain('Cache cleared successfully');
    });
  });

  describe('init', () => {
    it('should exit 6 and point at auth set-key instead of prompting', () => {
      const result = runCLIExpectError('--no-input init');

      expect(result.status).toBe(6);
      expect(result.output).toContain('not supported in non-interactive mode');
      expect(result.output).toContain('deepl auth set-key');
    });

    // The path taken by `docker run` without -it, by CI, and by piped
    // invocations: the wizard must refuse rather than prompt into an EOF.
    it('should exit 6 when stdin is not a terminal', () => {
      const result = runCLIExpectError('init < /dev/null');

      expect(result.status).toBe(6);
      expect(result.output).toContain('not supported in non-interactive mode');
      expect(result.output).not.toContain('unsettled top-level await');
    });
  });

  describe('write --interactive', () => {
    it('should exit 6 rather than opening an interactive session', () => {
      const result = runCLIExpectError('--no-input write "test" --interactive');

      expect(result.status).toBe(6);
      expect(result.output).toContain('requires an interactive terminal');
    });
  });
});
