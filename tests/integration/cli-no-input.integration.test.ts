/**
 * Integration Tests for --no-input Global Flag
 * Tests that --no-input suppresses interactive prompts and guards interactive-only commands
 */

import { createTestConfigDir, makeRunCLI } from '../helpers';

describe('--no-input flag', () => {
  const testConfig = createTestConfigDir('no-input');
  const { runCLIAll, runCLIExpectError } = makeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('cache clear --no-input', () => {
    it('should abort without prompting', () => {
      const output = runCLIAll('deepl --no-input cache clear');

      expect(output).toContain('Aborted.');
    });

    it('should proceed when --yes is also provided', () => {
      const output = runCLIAll('deepl --no-input cache clear --yes');

      expect(output).toContain('Cache cleared successfully');
    });
  });

  describe('write --interactive --no-input', () => {
    it('should error with exit code 6', () => {
      const result = runCLIExpectError('deepl --no-input write "test text" --interactive');

      expect(result.status).toBe(6);
      expect(result.output).toContain('not supported in non-interactive mode');
    });
  });

  describe('init --no-input', () => {
    it('should error with exit code 6', () => {
      const result = runCLIExpectError('deepl --no-input init');

      expect(result.status).toBe(6);
      expect(result.output).toContain('not supported in non-interactive mode');
    });

    it('should suggest auth set-key alternative', () => {
      const result = runCLIExpectError('deepl --no-input init');

      expect(result.output).toContain('deepl auth set-key');
    });
  });
});
