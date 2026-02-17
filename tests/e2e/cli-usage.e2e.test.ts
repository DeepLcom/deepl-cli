/**
 * E2E Tests for Usage Command
 * Tests the `deepl usage` command end-to-end
 *
 * Note: These tests focus on CLI behavior, argument parsing, and error handling.
 * Full API integration is tested separately in integration tests.
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Usage Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-usage');
  const { runCLI, runCLIExpectError } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('usage --help', () => {
    it('should display help text', () => {
      const output = runCLI('usage --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('usage');
      expect(output).toContain('Options:');
    });

    it('should describe the command', () => {
      const output = runCLI('usage --help');

      expect(output).toMatch(/character|usage|statistics|limit/i);
    });

    it('should show available options', () => {
      const output = runCLI('usage --help');

      expect(output).toContain('help');
    });
  });

  describe('usage error handling', () => {
    it('should require API key', () => {
      const result = runCLIExpectError('usage', { apiKey: '' });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });

    it('should show error for invalid API key format', () => {
      const result = runCLIExpectError('usage', { apiKey: 'invalid-key' });

      expect(result.status).toBeGreaterThan(0);
      // Should fail during API call or validation
      expect(result.output).toMatch(/error|invalid|api/i);
    });

    it('should not accept unexpected arguments', () => {
      const result = runCLIExpectError('usage extra-arg', { apiKey: 'test-key' });

      // Should either ignore extra args or fail
      expect(result.status).toBeGreaterThan(0);
    });
  });

  describe('usage command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('usage');
      expect(helpOutput).toMatch(/character|usage/i);
    });

    it('should support --quiet flag', () => {
      // Test that --quiet flag is accepted (even if command fails due to missing API key)
      const result = runCLIExpectError('usage --quiet', { apiKey: '' });

      // Should fail due to API key, not due to invalid flag
      expect(result.output).not.toMatch(/unknown option.*quiet/i);
    });

    it('should handle authentication errors gracefully', () => {
      const result = runCLIExpectError('usage', { apiKey: 'invalid-api-key-format' });

      expect(result.status).toBeGreaterThan(0);
      // Should show meaningful error message
      expect(result.output).toMatch(/error|authentication|invalid/i);
    });
  });

  describe('usage command behavior', () => {
    it('should accept valid API key format', () => {
      // Test with valid format but fake key (will fail at API call)
      const result = runCLIExpectError('usage', { apiKey: 'test-key-123:fx' });

      expect(result.status).toBeGreaterThan(0);
      // Should fail at API call, not at validation
      expect(result.output).toMatch(/authentication|invalid.*key|403/i);
    });
  });
});
