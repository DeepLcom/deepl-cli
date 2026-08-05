/**
 * E2E Tests for Style Rules Command
 *
 * The subcommand surface -- synopsis, description and options -- is asserted
 * from one table, so a new subcommand is covered by adding a row. Style-rule
 * behaviour that needs a Pro account is covered by the nock suite in
 * cli-style-rules.integration.test.ts; what belongs here is argument
 * validation and the --dry-run paths, which run without credentials.
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

const SUBCOMMANDS: Array<{
  name: string;
  synopsis: string;
  description: string;
  options: string[];
}> = [
  {
    name: 'list',
    synopsis: 'list [options]',
    description: 'List all style rules',
    options: ['--detailed', '--page', '--page-size', '--format'],
  },
  {
    name: 'create',
    synopsis: 'create [options]',
    description: 'Create a new style rule list',
    options: ['--name', '--language', '--rules', '--format'],
  },
  {
    name: 'show',
    synopsis: 'show [options] <id>',
    description: 'Show a single style rule list',
    options: ['--detailed', '--format'],
  },
  {
    name: 'update',
    synopsis: 'update [options] <id>',
    description: 'Update a style rule list',
    options: ['--name', '--rules'],
  },
  {
    name: 'delete',
    synopsis: 'delete [options] <id>',
    description: 'Delete a style rule list',
    options: ['--yes', '--dry-run'],
  },
  {
    name: 'instructions',
    synopsis: 'instructions [options] <style-id>',
    description: 'List custom instructions for a style rule',
    options: ['--format'],
  },
  {
    name: 'add-instruction',
    synopsis: 'add-instruction [options] <style-id> <label> <prompt>',
    description: 'Add a custom instruction to a style rule',
    options: ['--source-language'],
  },
  {
    name: 'update-instruction',
    synopsis: 'update-instruction [options] <style-id> <label> <prompt>',
    description: 'Update a custom instruction on a style rule',
    options: ['--source-language'],
  },
  {
    name: 'remove-instruction',
    synopsis: 'remove-instruction [options] <style-id> <label>',
    description: 'Remove a custom instruction from a style rule',
    options: ['--yes', '--dry-run'],
  },
];

/** Invocations one positional argument short of what the subcommand requires. */
const TOO_FEW_ARGUMENTS: Array<[string, string]> = [
  ['show', 'style-rules show'],
  ['update', 'style-rules update'],
  ['delete', 'style-rules delete'],
  ['instructions', 'style-rules instructions'],
  ['add-instruction', 'style-rules add-instruction sr-1 tone'],
  ['update-instruction', 'style-rules update-instruction sr-1 tone'],
  ['remove-instruction', 'style-rules remove-instruction sr-1'],
];

describe('Style Rules Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-style-rules');
  const { runCLI, runCLIExpectError } = makeNodeRunCLI(testConfig.path, {
    noColor: true,
  });

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('style-rules --help', () => {
    it('should list every subcommand with its description', () => {
      const output = runCLI('style-rules --help');

      expect(output).toContain('Manage DeepL style rules');
      expect(output).toContain('Pro API only');
      expect(output).toContain('Examples:');
      for (const { name, description } of SUBCOMMANDS) {
        expect(output).toContain(name);
        expect(output).toContain(description);
      }
    });

    it('should declare the required arguments of every subcommand', () => {
      const output = runCLI('style-rules --help');

      for (const { synopsis } of SUBCOMMANDS) {
        expect(output).toContain(synopsis);
      }
    });

    it('should offer each subcommand its own options', () => {
      for (const { name, options } of SUBCOMMANDS) {
        const output = runCLI(`style-rules ${name} --help`);

        for (const option of options) {
          expect(output).toContain(option);
        }
      }
    });
  });

  describe('required arguments', () => {
    // Asserting the failure is *not* about credentials shows commander refused
    // on arity before the command could reach the API.
    it.each(TOO_FEW_ARGUMENTS)(
      'should refuse %s when a positional argument is missing',
      (_name, invocation) => {
        const result = runCLIExpectError(invocation, { excludeApiKey: true });

        expect(result.status).toBeGreaterThan(0);
        expect(result.output).toMatch(/missing required argument/i);
        expect(result.output).not.toMatch(/API key/i);
      }
    );

    it('should require --name and --language on create', () => {
      const result = runCLIExpectError('style-rules create', {
        excludeApiKey: true,
      });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/required.*(--name|--language)/i);
    });

    it('should exit 6 when update is given neither --name nor --rules', () => {
      const result = runCLIExpectError('style-rules update sr-1', {
        excludeApiKey: true,
      });

      expect(result.status).toBe(6);
    });
  });

  describe('--dry-run', () => {
    // Runs to completion without credentials, which is what makes it safe to
    // assert on real output here rather than on a failure message.
    it('should report the deletion it would perform without performing it', () => {
      const output = runCLI('style-rules delete sr-1 --dry-run', {
        excludeApiKey: true,
      });

      expect(output).toContain('[dry-run]');
      expect(output).toContain('sr-1');
    });

    it('should report the instruction removal it would perform', () => {
      const output = runCLI(
        'style-rules remove-instruction sr-1 tone --dry-run',
        {
          excludeApiKey: true,
        }
      );

      expect(output).toContain('[dry-run]');
      expect(output).toContain('sr-1');
      expect(output).toContain('tone');
    });
  });

  describe('credentials', () => {
    it('should require an API key to reach the style-rules API', () => {
      const result = runCLIExpectError('style-rules list', {
        excludeApiKey: true,
      });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/API key|auth/i);
    });
  });

  describe('command structure', () => {
    it('should show style-rules in main help', () => {
      const output = runCLI('--help');

      expect(output).toContain('style-rules');
    });
  });
});
