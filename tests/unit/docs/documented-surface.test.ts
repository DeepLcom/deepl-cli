/**
 * Checks every `deepl …` invocation in the user-facing docs against the CLI's
 * real surface, reported by the hidden `_describe` command, so a documented
 * command or flag that stops existing fails here rather than reaching a reader.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getAllLanguageCodes } from '../../../src/data/language-registry';

interface DescribedCommand {
  name: string;
  aliases: string[];
  options: { flags: string }[];
  commands: DescribedCommand[];
}

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI_ENTRY = path.join(ROOT, 'dist', 'cli', 'index.js');
const DOCS = ['README.md', 'docs/API.md', 'docs/SYNC.md', 'docs/TROUBLESHOOTING.md'];

/** Deliberate misspellings used to demonstrate did-you-mean suggestions. */
const TYPO_EXAMPLES = new Set(['transalte', 'translte', 'glossry', 'conifg', 'descibe']);

const LANGUAGE_CODES = getAllLanguageCodes();

function longFlags(options: { flags: string }[]): string[] {
  return options.flatMap((option) => option.flags.match(/--[a-z0-9-]+/g) ?? []);
}

function describeSurface(): DescribedCommand {
  const raw = execFileSync(process.execPath, [CLI_ENTRY, '_describe', '--format', 'json'], {
    encoding: 'utf-8',
  });
  return JSON.parse(raw) as DescribedCommand;
}

describe('documented CLI surface', () => {
  let surface: DescribedCommand;
  let globalFlags: Set<string>;

  beforeAll(() => {
    surface = describeSurface();
    globalFlags = new Set([...longFlags(surface.options), '--help', '--version']);
  });

  function resolveCommand(tokens: string[]): DescribedCommand | undefined {
    let current: DescribedCommand | undefined = surface;
    for (const token of tokens) {
      current = current?.commands.find(
        (candidate) => candidate.name === token || candidate.aliases.includes(token),
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

  function invocations(markdown: string): string[] {
    return markdown
      .split('\n')
      .map((line) => line.replace(/^\s*[$>]\s*/, '').trim())
      .filter((line) => line.startsWith('deepl '))
      .map((line) => line.slice('deepl '.length));
  }

  describe.each(DOCS)('%s', (docPath) => {
    let documented: string[];

    beforeAll(() => {
      documented = invocations(fs.readFileSync(path.join(ROOT, docPath), 'utf-8'));
    });

    it('documents at least one invocation', () => {
      expect(documented.length).toBeGreaterThan(0);
    });

    it('references only commands the CLI provides', () => {
      const unknown = documented.filter((invocation) => {
        const tokens = commandTokens(invocation);
        if (tokens.length === 0 || TYPO_EXAMPLES.has(tokens[0]!)) return false;
        return resolveCommand(tokens) === undefined && resolveCommand([tokens[0]!]) === undefined;
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

        const accepted = new Set([...longFlags(command.options), ...globalFlags]);
        // A flag may belong to a subcommand named after the first flag-free
        // tokens, so accept anything the parent chain declares too.
        for (let depth = 1; depth < tokens.length; depth++) {
          const ancestor = resolveCommand(tokens.slice(0, depth));
          if (ancestor) longFlags(ancestor.options).forEach((flag) => accepted.add(flag));
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
      const lines = fs.readFileSync(path.join(ROOT, docPath), 'utf-8').split('\n');
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
        (name) => resolveCommand([name]) === undefined,
      );

      expect(unknown).toEqual([]);
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
