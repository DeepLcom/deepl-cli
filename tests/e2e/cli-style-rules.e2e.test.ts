/**
 * E2E Tests for Style Rules Command
 * Tests `deepl style-rules` help text and argument validation
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Style Rules Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-style-rules');
  const { runCLI } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('style-rules --help', () => {
    it('should show help with available subcommands', () => {
      const output = runCLI('style-rules --help');
      expect(output).toContain('Manage DeepL style rules');
      expect(output).toContain('list');
      expect(output).toContain('Pro API only');
    });

    it('should show examples in help text', () => {
      const output = runCLI('style-rules --help');
      expect(output).toContain('deepl style-rules list');
      expect(output).toContain('--detailed');
      expect(output).toContain('--format json');
    });
  });

  describe('style-rules list --help', () => {
    it('should show list subcommand options', () => {
      const output = runCLI('style-rules list --help');
      expect(output).toContain('--detailed');
      expect(output).toContain('--page');
      expect(output).toContain('--page-size');
      expect(output).toContain('--format');
    });
  });
});
