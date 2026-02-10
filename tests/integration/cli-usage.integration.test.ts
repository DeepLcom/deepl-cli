/**
 * Integration Tests for Usage CLI Command
 * Tests the usage command CLI behavior and output formatting
 */

import { createTestConfigDir, makeRunCLI } from '../helpers';

describe('Usage CLI Integration', () => {
  const testConfig = createTestConfigDir('usage');
  const { runCLI } = makeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('deepl usage --help', () => {
    it('should display help for usage command', () => {
      const output = runCLI('deepl usage --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('deepl usage');
      expect(output).toContain('Show API usage statistics');
    });
  });

  describe('deepl usage without API key', () => {
    it('should require API key to be configured', () => {
      // Ensure no API key is set
      try {
        runCLI('deepl auth clear', { stdio: 'pipe' });
      } catch {
        // Ignore if already cleared
      }

      expect.assertions(1);
      try {
        runCLI('deepl usage', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should indicate API key is required
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });
  });

  describe('deepl usage command structure', () => {
    it('should be available as a command', () => {
      const helpOutput = runCLI('deepl --help');

      // Usage command should be listed in main help
      expect(helpOutput).toContain('usage');
      expect(helpOutput).toContain('Show API usage statistics');
    });

    it('should not require any arguments', () => {
      // Help should show no required arguments
      const output = runCLI('deepl usage --help');

      // Should be simple command with no required parameters
      expect(output).toContain('Usage: deepl usage');
      expect(output).not.toContain('<required');
      expect(output).not.toContain('[arguments]');
    });
  });
});
