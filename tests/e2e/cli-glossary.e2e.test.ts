/**
 * E2E Tests for Glossary Command
 * Tests the `deepl glossary` command end-to-end
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Glossary Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-glossary');
  const { runCLI, runCLIExpectError } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('glossary --help', () => {
    it('should display help text', () => {
      const output = runCLI('glossary --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('glossary');
      expect(output).toContain('Options:');
    });

    it('should describe the command', () => {
      const output = runCLI('glossary --help');

      expect(output).toMatch(/glossar|manage/i);
    });

    it('should list subcommands', () => {
      const output = runCLI('glossary --help');

      expect(output).toContain('Commands:');
      expect(output).toContain('create');
      expect(output).toContain('list');
      expect(output).toContain('show');
      expect(output).toContain('delete');
    });
  });

  describe('glossary list without API key', () => {
    it('should require API key', () => {
      const result = runCLIExpectError('glossary list', { apiKey: '' });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/api key/i);
    });
  });

  describe('glossary subcommand help', () => {
    it('should show help for glossary list', () => {
      const output = runCLI('glossary list --help');

      expect(output).toContain('list');
      expect(output).toContain('--format');
    });

    it('should show help for glossary create', () => {
      const output = runCLI('glossary create --help');

      expect(output).toContain('create');
    });

    it('should show help for glossary delete', () => {
      const output = runCLI('glossary delete --help');

      expect(output).toContain('delete');
      expect(output).toContain('--yes');
    });
  });

  describe('glossary error handling', () => {
    it('should require arguments for show subcommand', () => {
      const result = runCLIExpectError('glossary show');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/missing|argument|required/i);
    });

    it('should require arguments for delete subcommand', () => {
      const result = runCLIExpectError('glossary delete');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/missing|argument|required/i);
    });

    it('should require arguments for entries subcommand', () => {
      const result = runCLIExpectError('glossary entries');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/missing|argument|required/i);
    });
  });

  describe('glossary command structure', () => {
    it('should be registered as a command', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toContain('glossary');
    });

    it('should show glossary in main help with description', () => {
      const helpOutput = runCLI('--help');

      expect(helpOutput).toMatch(/glossar/i);
    });
  });
});
