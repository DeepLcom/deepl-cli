/**
 * E2E Tests for Glossary Command
 *
 * The subcommand surface is asserted from one table rather than once per
 * subcommand, so a new subcommand is covered by adding a row. Glossary
 * behaviour that needs an account -- creating, listing, entry edits -- belongs
 * to the glossary service and client unit suites; what matters here is that
 * every subcommand declares its required arguments and refuses to run without
 * them.
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

/** Every `glossary` subcommand, with the synopsis its help must show. */
const SUBCOMMANDS: Array<{
  name: string;
  synopsis: string;
  description: string;
}> = [
  {
    name: 'create',
    synopsis: 'create <name> <source-lang> <target-lang> <file>',
    description: 'Create a glossary from TSV/CSV file',
  },
  {
    name: 'list',
    synopsis: 'list [options]',
    description: 'List all glossaries',
  },
  {
    name: 'show',
    synopsis: 'show [options] <name-or-id>',
    description: 'Show glossary details',
  },
  {
    name: 'entries',
    synopsis: 'entries [options] <name-or-id>',
    description: 'Show glossary entries',
  },
  {
    name: 'delete',
    synopsis: 'delete [options] <name-or-id>',
    description: 'Delete a glossary',
  },
  {
    name: 'languages',
    synopsis: 'languages',
    description: 'List supported glossary language pairs',
  },
  {
    name: 'add-entry',
    synopsis: 'add-entry [options] <name-or-id> <source> <target>',
    description: 'Add a new entry to a glossary',
  },
  {
    name: 'update-entry',
    synopsis: 'update-entry [options] <name-or-id> <source> <new-target>',
    description: 'Update an existing entry in a glossary',
  },
  {
    name: 'remove-entry',
    synopsis: 'remove-entry [options] <name-or-id> <source>',
    description: 'Remove an entry from a glossary',
  },
  {
    name: 'rename',
    synopsis: 'rename <name-or-id> <new-name>',
    description: 'Rename a glossary',
  },
  {
    name: 'update',
    synopsis: 'update [options] <name-or-id>',
    description: 'Update glossary name and/or dictionary entries',
  },
  {
    name: 'replace-dictionary',
    synopsis: 'replace-dictionary <name-or-id> <target-lang> <file>',
    description: 'Replace all entries in a glossary dictionary',
  },
  {
    name: 'delete-dictionary',
    synopsis: 'delete-dictionary [options] <name-or-id> <target-lang>',
    description: 'Delete a dictionary from a multilingual glossary',
  },
];

/** Invocations one argument short of what the subcommand requires. */
const TOO_FEW_ARGUMENTS: Array<[string, string]> = [
  ['create', 'glossary create "Test" en de'],
  ['show', 'glossary show'],
  ['entries', 'glossary entries'],
  ['delete', 'glossary delete'],
  ['add-entry', 'glossary add-entry "Test" "Hello"'],
  ['update-entry', 'glossary update-entry "Test" "Hello"'],
  ['remove-entry', 'glossary remove-entry "Test"'],
  ['rename', 'glossary rename "Test"'],
  ['update', 'glossary update'],
  ['replace-dictionary', 'glossary replace-dictionary "Test" de'],
  ['delete-dictionary', 'glossary delete-dictionary "Test"'],
];

describe('Glossary Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-glossary');
  const { runCLI, runCLIAll, runCLIExpectError } = makeNodeRunCLI(
    testConfig.path,
    { noColor: true }
  );

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('glossary --help', () => {
    it('should list every subcommand with its description', () => {
      const output = runCLI('glossary --help');

      expect(output).toContain('Manage translation glossaries');
      for (const { name, description } of SUBCOMMANDS) {
        expect(output).toContain(name);
        expect(output).toContain(description);
      }
    });

    it('should declare the required arguments of every subcommand', () => {
      const output = runCLI('glossary --help');

      for (const { synopsis } of SUBCOMMANDS) {
        expect(output).toContain(synopsis);
      }
    });

    it('should offer --format json on the reading subcommands', () => {
      for (const subcommand of ['list', 'show', 'entries']) {
        const output = runCLI(`glossary ${subcommand} --help`);

        expect(output).toContain('--format');
        expect(output).toContain('json');
      }
    });
  });

  describe('required arguments', () => {
    // Asserting the failure is *not* about credentials is the point: it shows
    // commander refused on arity before the command could reach the API.
    it.each(TOO_FEW_ARGUMENTS)(
      'should refuse %s when an argument is missing',
      (_name, invocation) => {
        const result = runCLIExpectError(invocation, { excludeApiKey: true });

        expect(result.status).toBeGreaterThan(0);
        expect(result.output).toMatch(/missing required argument/i);
        expect(result.output).not.toMatch(/API key/i);
      }
    );
  });

  describe('glossary delete confirmation', () => {
    it('should abort rather than delete when --yes is absent', () => {
      const output = runCLIAll('glossary delete "My Glossary"');

      expect(output).toContain('Aborted');
    });

    it('should document both confirmation flags', () => {
      const output = runCLI('glossary delete --help');

      expect(output).toContain('--yes');
      expect(output).toContain('-y');
    });
  });

  describe('credentials', () => {
    it('should require an API key to reach the glossary API', () => {
      const result = runCLIExpectError('glossary list', {
        excludeApiKey: true,
      });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/API key|auth|not set/i);
    });
  });

  describe('command structure', () => {
    it('should show glossary in main help with its description', () => {
      const output = runCLI('--help');

      expect(output).toContain('glossary');
      expect(output).toContain('Manage translation glossaries');
    });
  });
});
