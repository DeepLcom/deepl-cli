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

  describe('style-rules create --help', () => {
    it('should show create subcommand options', () => {
      const output = runCLI('style-rules create --help');
      expect(output).toContain('--name');
      expect(output).toContain('--language');
      expect(output).toContain('--rules');
      expect(output).toContain('--format');
    });
  });

  describe('style-rules show --help', () => {
    it('should show show subcommand options', () => {
      const output = runCLI('style-rules show --help');
      expect(output).toContain('--detailed');
      expect(output).toContain('--format');
      expect(output).toMatch(/<id>|id/);
    });
  });

  describe('style-rules update --help', () => {
    it('should show update subcommand options', () => {
      const output = runCLI('style-rules update --help');
      expect(output).toContain('--name');
      expect(output).toContain('--rules');
    });
  });

  describe('style-rules delete --help', () => {
    it('should show delete subcommand options', () => {
      const output = runCLI('style-rules delete --help');
      expect(output).toContain('--yes');
      expect(output).toContain('--dry-run');
    });
  });

  describe('style-rules instructions --help', () => {
    it('should show instructions subcommand', () => {
      const output = runCLI('style-rules instructions --help');
      expect(output).toContain('--format');
      expect(output).toMatch(/<style-id>|style-id/);
    });
  });

  describe('style-rules add-instruction --help', () => {
    it('should show add-instruction subcommand', () => {
      const output = runCLI('style-rules add-instruction --help');
      expect(output).toMatch(/<style-id>|style-id/);
      expect(output).toMatch(/<label>|label/);
      expect(output).toMatch(/<prompt>|prompt/);
      expect(output).toContain('--source-language');
    });
  });

  describe('style-rules update-instruction --help', () => {
    it('should show update-instruction subcommand', () => {
      const output = runCLI('style-rules update-instruction --help');
      expect(output).toMatch(/<style-id>|style-id/);
      expect(output).toMatch(/<label>|label/);
      expect(output).toMatch(/<prompt>|prompt/);
      expect(output).toContain('--source-language');
    });
  });

  describe('style-rules remove-instruction --help', () => {
    it('should show remove-instruction subcommand', () => {
      const output = runCLI('style-rules remove-instruction --help');
      expect(output).toContain('--yes');
      expect(output).toContain('--dry-run');
    });
  });
});
