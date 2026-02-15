/**
 * E2E Tests for Detect Command
 * Tests the `deepl detect` command end-to-end
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Detect Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-detect');
  const { runCLI, runCLIExpectError } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('detect --help', () => {
    it('should display help text', () => {
      const output = runCLI('detect --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('detect');
      expect(output).toContain('Options:');
    });

    it('should describe the command', () => {
      const output = runCLI('detect --help');

      expect(output).toMatch(/detect|language/i);
    });

    it('should show --format option', () => {
      const output = runCLI('detect --help');

      expect(output).toContain('--format');
    });

    it('should show text argument as optional', () => {
      const output = runCLI('detect --help');

      expect(output).toContain('[text]');
    });
  });

  describe('detect without API key', () => {
    it('should require API key', () => {
      const result = runCLIExpectError('detect "Bonjour le monde"', { apiKey: '' });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });
  });

  describe('detect with invalid API key', () => {
    it('should fail with authentication error', () => {
      const result = runCLIExpectError('detect "Hallo Welt"', { apiKey: 'invalid-key-123:fx' });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toBeTruthy();
    });
  });

  describe('detect command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('detect');
    });

    it('should show detect in main help with description', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toMatch(/detect.*language/i);
    });
  });

  describe('detect error handling', () => {
    it('should handle empty text gracefully', () => {
      const result = runCLIExpectError('detect ""', { apiKey: 'fake-key' });

      // Should fail either on validation or API call
      expect(result.output).toBeTruthy();
    });
  });
});
