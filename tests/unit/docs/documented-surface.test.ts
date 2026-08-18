/**
 * Checks every `deepl …` invocation in the user-facing docs against the CLI's
 * real surface, reported by the hidden `_describe` command, so a documented
 * command or flag that stops existing fails here rather than reaching a reader.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getAllLanguageCodes } from '../../../src/data/language-registry';

interface DescribedOption {
  flags: string;
  choices?: string[];
}

interface DescribedCommand {
  name: string;
  aliases: string[];
  arguments: { name: string; required: boolean }[];
  options: DescribedOption[];
  commands: DescribedCommand[];
  hidden: boolean;
}

/**
 * Every command taking a required positional argument, and which arguments it
 * requires. Relaxing one to optional, or adding a new required one, changes the
 * CLI's calling convention for anyone already scripting against it.
 */
const REQUIRED_ARGUMENTS: Record<string, string[]> = {
  voice: ['file'],
  watch: ['path'],
  completion: ['shell'],
  'config set': ['key', 'value'],
  'hooks install': ['hook-type'],
  'hooks uninstall': ['hook-type'],
  'hooks path': ['hook-type'],
  'glossary create': ['name', 'source-lang', 'target-lang', 'file'],
  'glossary show': ['name-or-id'],
  'glossary entries': ['name-or-id'],
  'glossary delete': ['name-or-id'],
  'glossary update': ['name-or-id'],
  'glossary rename': ['name-or-id', 'new-name'],
  'glossary add-entry': ['name-or-id', 'source', 'target'],
  'glossary update-entry': ['name-or-id', 'source', 'new-target'],
  'glossary remove-entry': ['name-or-id', 'source'],
  'glossary replace-dictionary': ['name-or-id', 'target-lang', 'file'],
  'glossary delete-dictionary': ['name-or-id', 'target-lang'],
  'style-rules show': ['id'],
  'style-rules update': ['id'],
  'style-rules delete': ['id'],
  'style-rules instructions': ['style-id'],
  'style-rules add-instruction': ['style-id', 'label', 'prompt'],
  'style-rules update-instruction': ['style-id', 'label', 'prompt'],
  'style-rules remove-instruction': ['style-id', 'label'],
  'admin keys deactivate': ['key-id'],
  'admin keys rename': ['key-id', 'label'],
  'admin keys set-limit': ['key-id', 'characters'],
};

/**
 * Vocabularies shared by more than one option. Naming them keeps the table
 * below scannable and makes a change to one enum a single edit.
 */
const FORMALITY = [
  'default',
  'more',
  'less',
  'prefer_more',
  'prefer_less',
  'formal',
  'informal',
];
const MODEL_TYPE = [
  'quality_optimized',
  'prefer_quality_optimized',
  'latency_optimized',
];
const TEXT_JSON = ['text', 'json'];
const TEXT_JSON_TABLE = ['text', 'json', 'table'];

/**
 * Every option that constrains its argument to a fixed set, and the set it
 * accepts. Commander rejects anything outside the list, so each entry is part
 * of the CLI's contract: dropping a value breaks callers already passing it,
 * and adding one is a surface change that belongs in the docs.
 */
const OPTION_CHOICES: Record<string, string[]> = {
  'translate --formality': FORMALITY,
  'translate --model-type': MODEL_TYPE,
  'translate --split-sentences': ['on', 'off', 'nonewlines'],
  'translate --output-format': ['docx'],
  'translate --tag-handling': ['xml', 'html'],
  'translate --tag-handling-version': ['v1', 'v2'],
  'translate --format': TEXT_JSON_TABLE,
  'write --format': TEXT_JSON,
  'correct --format': TEXT_JSON,
  'voice --formality': FORMALITY,
  'voice --source-language-mode': ['auto', 'fixed'],
  'voice --format': TEXT_JSON,
  'glossary list --format': TEXT_JSON,
  'glossary show --format': TEXT_JSON,
  'glossary entries --format': TEXT_JSON,
  'tm list --format': TEXT_JSON,
  'watch --formality': FORMALITY,
  'sync --formality': FORMALITY,
  'sync --model-type': MODEL_TYPE,
  'sync --format': TEXT_JSON,
  'sync init --format': TEXT_JSON,
  'sync status --format': TEXT_JSON,
  'sync validate --format': TEXT_JSON,
  'sync audit --format': TEXT_JSON,
  'sync export --format': TEXT_JSON,
  'sync resolve --format': TEXT_JSON,
  'sync push --format': TEXT_JSON,
  'sync pull --format': TEXT_JSON,
  'hooks list --format': TEXT_JSON,
  'config get --format': TEXT_JSON,
  'config list --format': TEXT_JSON,
  'cache stats --format': TEXT_JSON_TABLE,
  'style-rules list --format': TEXT_JSON_TABLE,
  'style-rules create --format': TEXT_JSON,
  'style-rules show --format': TEXT_JSON,
  'style-rules update --format': TEXT_JSON,
  'style-rules instructions --format': TEXT_JSON_TABLE,
  'style-rules add-instruction --format': TEXT_JSON,
  'style-rules update-instruction --format': TEXT_JSON,
  'usage --format': TEXT_JSON_TABLE,
  'languages --format': TEXT_JSON_TABLE,
  'detect --format': TEXT_JSON,
  'admin keys list --format': TEXT_JSON,
  'admin keys create --format': TEXT_JSON,
  'admin usage --format': TEXT_JSON,
};

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI_ENTRY = path.join(ROOT, 'dist', 'cli', 'index.js');
/**
 * docs/MIGRATION.md is deliberately absent: it documents the 1.x surface a reader
 * is migrating off, so it names flags this CLI no longer accepts and codes in the
 * casing it no longer prints. Adding it here fails these checks by design.
 */
const DOCS = [
  'README.md',
  'docs/API.md',
  'docs/SYNC.md',
  'docs/TROUBLESHOOTING.md',
];

/** Deliberate misspellings used to demonstrate did-you-mean suggestions. */
const TYPO_EXAMPLES = new Set([
  'transalte',
  'translte',
  'glossry',
  'conifg',
  'descibe',
]);

const LANGUAGE_CODES = getAllLanguageCodes();

function longFlags(options: { flags: string }[]): string[] {
  return options.flatMap((option) => option.flags.match(/--[a-z0-9-]+/g) ?? []);
}

function describeSurface(): DescribedCommand {
  const raw = execFileSync(
    process.execPath,
    [CLI_ENTRY, '_describe', '--format', 'json'],
    {
      encoding: 'utf-8',
    }
  );
  return JSON.parse(raw) as DescribedCommand;
}

describe('documented CLI surface', () => {
  let surface: DescribedCommand;
  let globalFlags: Set<string>;

  beforeAll(() => {
    surface = describeSurface();
    globalFlags = new Set([
      ...longFlags(surface.options),
      '--help',
      '--version',
    ]);
  });

  function resolveCommand(tokens: string[]): DescribedCommand | undefined {
    let current: DescribedCommand | undefined = surface;
    for (const token of tokens) {
      current = current?.commands.find(
        (candidate) =>
          candidate.name === token || candidate.aliases.includes(token)
      );
      if (!current) return undefined;
    }
    return current;
  }

  /** Command tokens are the words before the first flag or shell operator. */
  function commandTokens(invocation: string): string[] {
    const tokens: string[] = [];
    for (const token of invocation.split(/\s+/)) {
      if (token.startsWith('-') || /^[|&><$"'`]/.test(token)) break;
      tokens.push(token);
    }
    return tokens;
  }

  /**
   * Every `deepl …` run a reader could copy: whole lines in fenced blocks, and
   * inline-code spans in prose, which a line-start test never sees.
   */
  function invocations(markdown: string): string[] {
    const wholeLines = markdown
      .split('\n')
      .map((line) => line.replace(/^\s*[$>]\s*/, '').trim())
      .filter((line) => line.startsWith('deepl '))
      .map((line) => line.slice('deepl '.length));
    const inlineCode = [...markdown.matchAll(/`deepl\s+([^`\n]+)`/g)].map(
      (match) => match[1]!.trim()
    );
    return [...wholeLines, ...inlineCode];
  }

  describe.each(DOCS)('%s', (docPath) => {
    let documented: string[];

    beforeAll(() => {
      documented = invocations(
        fs.readFileSync(path.join(ROOT, docPath), 'utf-8')
      );
    });

    it('documents at least one invocation', () => {
      expect(documented.length).toBeGreaterThan(0);
    });

    it('references only commands the CLI provides', () => {
      const unknown = documented.filter((invocation) => {
        const tokens = commandTokens(invocation);
        if (tokens.length === 0 || TYPO_EXAMPLES.has(tokens[0]!)) return false;
        return (
          resolveCommand(tokens) === undefined &&
          resolveCommand([tokens[0]!]) === undefined
        );
      });

      expect(unknown).toEqual([]);
    });

    it('references only flags the CLI accepts', () => {
      const unknown: string[] = [];

      for (const invocation of documented) {
        const tokens = commandTokens(invocation);
        if (tokens.length === 0 || TYPO_EXAMPLES.has(tokens[0]!)) continue;

        const command = resolveCommand(tokens) ?? resolveCommand([tokens[0]!]);
        if (!command) continue;

        const accepted = new Set([
          ...longFlags(command.options),
          ...globalFlags,
        ]);
        // A flag may belong to a subcommand named after the first flag-free
        // tokens, so accept anything the parent chain declares too.
        for (let depth = 1; depth < tokens.length; depth++) {
          const ancestor = resolveCommand(tokens.slice(0, depth));
          if (ancestor)
            longFlags(ancestor.options).forEach((flag) => accepted.add(flag));
        }

        for (const flag of invocation.match(/--[a-z0-9-]+/g) ?? []) {
          if (!accepted.has(flag)) {
            unknown.push(`${invocation}  ->  ${flag}`);
          }
        }
      }

      expect(unknown).toEqual([]);
    });

    it('shows language codes in the lowercase the CLI prints', () => {
      // Every code the CLI displays is lowercase. Documented output that shows
      // `[ES]` or a `│ ES │` table cell does not match what a reader will see,
      // and copying it into a script that compares codes gives a wrong answer.
      // Matched against the registry so markdown badges like `[![CI](...)]` and
      // labels that are not languages are left alone.
      const lines = fs
        .readFileSync(path.join(ROOT, docPath), 'utf-8')
        .split('\n');
      const offenders: string[] = [];

      for (const line of lines) {
        const candidates = [
          ...(line.match(/\[([A-Z]{2,3}(?:-[A-Z0-9]{2,4})?)\]/g) ?? []),
          ...(line.match(/│\s*([A-Z]{2,3}(?:-[A-Z0-9]{2,4})?)\s*│/g) ?? []),
        ];
        for (const candidate of candidates) {
          const code = candidate.replace(/[[\]│\s]/g, '').toLowerCase();
          if (LANGUAGE_CODES.has(code)) {
            offenders.push(`${candidate.trim()}  in  ${line.trim()}`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });
  });

  describe('command-group table in docs/API.md', () => {
    // The table claims to match `deepl --help`, so a command missing from it
    // reads as one the CLI does not have. `correct` was absent from the Core
    // Commands row for a whole release while having its own reference section,
    // which no invocation-level check can see.
    function groupedCommands(): Set<string> {
      const contents = fs.readFileSync(path.join(ROOT, 'docs/API.md'), 'utf-8');
      const table = contents.slice(contents.indexOf('## Commands'));
      const names = new Set<string>();

      let started = false;
      for (const line of table.split('\n')) {
        const isGroupRow = line.startsWith('| **');
        if (isGroupRow) started = true;
        else if (started) break;
        if (!isGroupRow) continue;

        for (const cell of line.match(/`([a-z-]+)`/g) ?? []) {
          names.add(cell.replace(/`/g, ''));
        }
      }
      return names;
    }

    it('lists every command the CLI exposes in --help', () => {
      const documented = groupedCommands();
      const missing = surface.commands
        .map((command) => command.name)
        .filter((name) => !name.startsWith('_') && name !== 'help')
        .filter((name) => !documented.has(name));

      expect(missing).toEqual([]);
    });

    it('lists no command the CLI does not provide', () => {
      const unknown = [...groupedCommands()].filter(
        (name) => resolveCommand([name]) === undefined
      );

      expect(unknown).toEqual([]);
    });
  });

  // Walks the whole tree. Hidden commands are renamed-command rejectors: part of
  // the parsed surface but not the documented one, and _describe reports the
  // flag so neither check below needs to know their names.
  function eachCommand(
    visit: (command: DescribedCommand, commandPath: string[]) => void
  ): void {
    const walk = (cmd: DescribedCommand, prefix: string[]): void => {
      for (const child of cmd.commands) {
        if (child.name === 'help' || child.hidden) continue;
        const next = [...prefix, child.name];
        visit(child, next);
        walk(child, next);
      }
    };
    walk(surface, []);
  }

  describe('subcommand coverage', () => {
    it('documents an invocation of every subcommand', () => {
      // A top-level command missing from docs/API.md's table is caught above.
      // This catches the subcommand case, where a new `glossary` or `sync` verb
      // can ship with no documented invocation at all.
      const documentedPaths = new Set<string>();
      for (const docPath of DOCS) {
        const contents = fs.readFileSync(path.join(ROOT, docPath), 'utf-8');
        for (const invocation of invocations(contents)) {
          const tokens = commandTokens(invocation);
          for (let depth = 1; depth <= tokens.length; depth++) {
            documentedPaths.add(tokens.slice(0, depth).join(' '));
          }
        }
      }

      const undocumented: string[] = [];
      eachCommand((_command, commandPath) => {
        if (commandPath.length < 2) return;
        const joined = commandPath.join(' ');
        if (!documentedPaths.has(joined)) undocumented.push(joined);
      });

      expect(undocumented).toEqual([]);
    });
  });

  describe('positional argument surface', () => {
    it('requires exactly the arguments recorded above', () => {
      const actual: Record<string, string[]> = {};
      eachCommand((command, commandPath) => {
        const required = command.arguments
          .filter((argument) => argument.required)
          .map((argument) => argument.name);
        if (required.length > 0) actual[commandPath.join(' ')] = required;
      });

      expect(actual).toEqual(REQUIRED_ARGUMENTS);
    });

    it('declares optional arguments after required ones', () => {
      // Commander cannot parse a required argument that follows an optional one,
      // so the declaration order is a correctness constraint, not a style rule.
      const offenders: string[] = [];
      eachCommand((command, commandPath) => {
        const firstOptional = command.arguments.findIndex((a) => !a.required);
        if (firstOptional === -1) return;
        const requiredAfter = command.arguments
          .slice(firstOptional)
          .some((a) => a.required);
        if (requiredAfter) offenders.push(commandPath.join(' '));
      });

      expect(offenders).toEqual([]);
    });
  });

  describe('option choice surface', () => {
    it('accepts exactly the choice lists recorded above', () => {
      const actual: Record<string, string[]> = {};
      eachCommand((command, commandPath) => {
        for (const option of command.options) {
          if (!option.choices) continue;
          const long = option.flags.match(/--[a-z0-9-]+/)?.[0];
          if (!long) continue;
          actual[`${commandPath.join(' ')} ${long}`] = option.choices;
        }
      });

      expect(actual).toEqual(OPTION_CHOICES);
    });
  });

  describe('retired endpoints', () => {
    // Language listings moved to GET /v3/languages; the v2 endpoints are
    // formally deprecated, so no doc should teach a reader to call them.
    const RETIRED = ['/v2/languages', '/v2/glossary-language-pairs'];

    it.each(DOCS)('%s references no retired language endpoint', (docPath) => {
      const contents = fs.readFileSync(path.join(ROOT, docPath), 'utf-8');
      const found = RETIRED.filter((endpoint) => contents.includes(endpoint));

      expect(found).toEqual([]);
    });
  });
});
