/**
 * E2E Tests for Shell Completion Command
 *
 * Asserts the generated scripts are actually loadable by each shell -- the
 * dispatch functions, the completion builtins they call, and the subcommand
 * scoping -- rather than only that some output was produced.
 *
 * The command vocabulary each script must offer is derived from the hidden
 * `_describe` command rather than listed here, so a newly registered command is
 * covered the day it lands.
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

interface DescribedCommand {
  name: string;
  aliases: string[];
  commands: DescribedCommand[];
  hidden: boolean;
}

/**
 * Commander's `help` command is created on demand, so `_describe` never reports
 * it, and it is offered only where the command has no action handler of its own
 * -- present under `glossary`, absent under `sync`. It is filtered out of both
 * sides of every comparison below rather than predicted.
 */
const IMPLICIT_COMMAND = 'help';

describe('Completion Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-completion');
  const { runCLI, runCLIAll } = makeNodeRunCLI(testConfig.path, {
    excludeApiKey: true,
  });

  /** Commands a user can type at the first position, aliases included. */
  let expectedTopLevel: string[];
  /** Commands with subcommands of their own, which each script must scope. */
  let expectedParents: string[];
  let expectedSubcommands: Map<string, string[]>;

  beforeAll(() => {
    const surface = JSON.parse(
      runCLI('_describe --format json')
    ) as DescribedCommand;

    const visible = (cmd: DescribedCommand): DescribedCommand[] =>
      cmd.commands.filter((child) => !child.hidden);

    expectedTopLevel = visible(surface).flatMap((cmd) => [
      cmd.name,
      ...cmd.aliases,
    ]);

    expectedSubcommands = new Map(
      visible(surface)
        .map((cmd): [string, string[]] => [
          cmd.name,
          visible(cmd).map((sub) => sub.name),
        ])
        .filter(([, subs]) => subs.length > 0)
    );
    expectedParents = [...expectedSubcommands.keys()];
  });

  afterAll(() => {
    testConfig.cleanup();
  });

  /** Word lists mix commands and flags; only the commands are derived. */
  function commandWords(words: string[]): string[] {
    return words
      .filter((word) => !word.startsWith('-') && word !== IMPLICIT_COMMAND)
      .sort();
  }

  describe('completion bash', () => {
    let script: string;

    beforeAll(() => {
      script = runCLI('completion bash');
    });

    /** The `compgen -W` list guarded by `cword -eq 1`, i.e. the top-level one. */
    function topLevelWords(): string[] {
      const match = script.match(
        /cword\} -eq 1 \]\]; then\s*COMPREPLY=\(\$\(compgen -W "([^"]*)"/
      );
      expect(match).not.toBeNull();
      return match![1]!.split(' ');
    }

    function branchWords(parent: string): string[] {
      const match = script.match(
        new RegExp(
          `\\n\\s*${parent}\\)\\n\\s*COMPREPLY=\\(\\$\\(compgen -W "([^"]*)"`
        )
      );
      expect(match).not.toBeNull();
      return match![1]!.split(' ');
    }

    it('should output a valid bash completion script', () => {
      expect(script).toContain('_deepl_completions');
      expect(script).toContain('complete -F _deepl_completions deepl');
      expect(script).toContain('compgen');
      expect(script).toContain('COMPREPLY');
    });

    it('should offer exactly the registered top-level commands', () => {
      expect(commandWords(topLevelWords())).toEqual(
        [...expectedTopLevel].sort()
      );
    });

    it('should offer exactly the registered subcommands under each parent', () => {
      const actual: Record<string, string[]> = {};
      const expected: Record<string, string[]> = {};
      for (const parent of expectedParents) {
        actual[parent] = commandWords(branchWords(parent));
        expected[parent] = [...expectedSubcommands.get(parent)!].sort();
      }

      expect(actual).toEqual(expected);
    });
  });

  describe('completion zsh', () => {
    let script: string;

    beforeAll(() => {
      script = runCLI('completion zsh');
    });

    /** The `commands=(...)` array inside `_deepl()`, one `'name:description'` per line. */
    function topLevelEntries(): string[] {
      const body = script.slice(script.indexOf('_deepl() {'));
      const list = body.slice(
        body.indexOf('commands=('),
        body.indexOf('\n    )')
      );
      return [...list.matchAll(/'([^:']+):/g)].map((match) => match[1]!);
    }

    it('should output a valid zsh completion script', () => {
      expect(script).toContain('#compdef deepl');
      expect(script).toContain('_deepl()');
      expect(script).toContain('_arguments -C');
    });

    it('should describe exactly the registered top-level commands', () => {
      expect(commandWords(topLevelEntries())).toEqual(
        [...expectedTopLevel].sort()
      );
    });

    it('should include a dispatch function for every parent command', () => {
      // Hyphens are not valid in a zsh function name, so `style-rules` is
      // dispatched by `_deepl_style_rules`.
      const missing = expectedParents.filter(
        (parent) => !script.includes(`_deepl_${parent.replace(/-/g, '_')}()`)
      );

      expect(missing).toEqual([]);
    });
  });

  describe('completion fish', () => {
    let script: string;

    beforeAll(() => {
      script = runCLI('completion fish');
    });

    it('should output a valid fish completion script', () => {
      expect(script).toContain('complete -c deepl');
      expect(script).toContain('__fish_use_subcommand');
    });

    it('should offer exactly the registered top-level commands', () => {
      const offered = [
        ...script.matchAll(/-n '__fish_use_subcommand' -a '([^']+)'/g),
      ].map((match) => match[1]!);

      expect(commandWords(offered)).toEqual([...expectedTopLevel].sort());
    });

    it('should scope completions to every parent command', () => {
      const missing = expectedParents.filter(
        (parent) =>
          !script.includes(`__fish_seen_subcommand_from ${parent}'`) &&
          !script.includes(`__fish_seen_subcommand_from ${parent};`)
      );

      expect(missing).toEqual([]);
    });

    it('should disable default file completions', () => {
      expect(script).toContain('complete -c deepl -f');
    });
  });

  describe('error handling', () => {
    it('should fail with unsupported shell type', () => {
      expect(() => {
        runCLI('completion powershell');
      }).toThrow();
    });

    it('should fail with no shell argument', () => {
      expect(() => {
        runCLIAll('completion');
      }).toThrow();
    });
  });

  describe('help text', () => {
    it('should show help with --help flag', () => {
      const output = runCLIAll('completion --help');
      expect(output).toContain('Generate shell completion scripts');
      expect(output).toContain('bash');
      expect(output).toContain('zsh');
      expect(output).toContain('fish');
    });
  });
});
