/**
 * E2E Tests for TM Command
 * Tests the `deepl tm` command end-to-end
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('TM Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-tm');
  const { runCLI, runCLIExpectError } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('tm --help', () => {
    it('displays help text for the tm parent command', () => {
      const output = runCLI('tm --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('tm');
      expect(output).toContain('Options:');
      expect(output).toContain('Commands:');
      expect(output).toContain('list');
    });

    it('advertises the Examples block cross-referencing translate --translation-memory', () => {
      const output = runCLI('tm --help');

      expect(output).toMatch(/--translation-memory/);
    });
  });

  describe('tm list --help', () => {
    it('shows --format option with text/json choices', () => {
      const output = runCLI('tm list --help');

      expect(output).toContain('list');
      expect(output).toContain('--format');
      expect(output).toMatch(/text/);
      expect(output).toMatch(/json/);
    });
  });

  describe('tm list without API key', () => {
    it('requires API key', () => {
      const result = runCLIExpectError('tm list', { apiKey: '' });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });
  });

  describe('tm command structure', () => {
    it('is registered as a top-level command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('tm');
    });
  });
});
