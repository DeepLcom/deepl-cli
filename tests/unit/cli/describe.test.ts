import { Command, Option } from 'commander';
import { describeProgram } from '../../../src/cli/commands/describe';

describe('describeProgram', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program
      .name('deepl')
      .description('DeepL CLI')
      .version('1.0.0')
      .option('-q, --quiet', 'Suppress output')
      .option('-c, --config <file>', 'Config file', 'default.json');

    program
      .command('translate')
      .description('Translate text or files')
      .option('-t, --to <lang>', 'Target language')
      .option('-f, --from <lang>', 'Source language')
      .addOption(
        new Option('--formality <level>', 'Formality').choices([
          'default',
          'more',
          'less',
        ])
      );

    program
      .command('show')
      .description('Show a glossary')
      .argument('<name-or-id>', 'Glossary name or ID')
      .argument('[target-lang]', 'Restrict to one target language');

    const sync = program
      .command('sync')
      .alias('sy')
      .description('Sync translations with TMS');
    sync.command('push').description('Push translations');
    sync.command('pull').description('Pull translations');
    sync
      .command('legacy-name', { hidden: true })
      .description('Renamed; kept to point callers at the new name');
  });

  describe('shape', () => {
    it('returns program name and description at root', () => {
      const result = describeProgram(program);
      expect(result.name).toBe('deepl');
      expect(result.description).toBe('DeepL CLI');
    });

    it('returns top-level global options with flags and description', () => {
      const result = describeProgram(program);
      const quiet = result.options.find((o) => o.flags.includes('--quiet'));
      expect(quiet).toBeDefined();
      expect(quiet?.description).toBe('Suppress output');
    });

    it('includes defaultValue on options that set one', () => {
      const result = describeProgram(program);
      const config = result.options.find((o) => o.flags.includes('--config'));
      expect(config?.defaultValue).toBe('default.json');
    });

    it('returns subcommands with their descriptions', () => {
      const result = describeProgram(program);
      const names = result.commands.map((c) => c.name);
      expect(names).toContain('translate');
      expect(names).toContain('sync');
    });

    it('captures subcommand options', () => {
      const result = describeProgram(program);
      const translate = result.commands.find((c) => c.name === 'translate');
      expect(translate).toBeDefined();
      const to = translate?.options.find((o) => o.flags.includes('--to'));
      expect(to?.description).toBe('Target language');
    });

    it('recurses into nested subcommands', () => {
      const result = describeProgram(program);
      const sync = result.commands.find((c) => c.name === 'sync');
      expect(sync).toBeDefined();
      const subNames = sync?.commands.map((c) => c.name);
      expect(subNames).toEqual(expect.arrayContaining(['push', 'pull']));
    });

    it('captures command aliases', () => {
      const result = describeProgram(program);
      const sync = result.commands.find((c) => c.name === 'sync');
      expect(sync?.aliases).toContain('sy');
    });

    it('returns aliases as empty array when none set', () => {
      const result = describeProgram(program);
      const translate = result.commands.find((c) => c.name === 'translate');
      expect(translate?.aliases).toEqual([]);
    });
  });

  describe('option choices', () => {
    // Commander rejects a value outside the list, so the list is part of the
    // CLI's contract and a consumer of _describe has to be able to see it.
    it('reports the accepted values of a constrained option', () => {
      const translate = describeProgram(program).commands.find(
        (c) => c.name === 'translate'
      );
      const formality = translate?.options.find((o) =>
        o.flags.includes('--formality')
      );

      expect(formality?.choices).toEqual(['default', 'more', 'less']);
    });

    it('omits choices on an option that accepts any value', () => {
      const translate = describeProgram(program).commands.find(
        (c) => c.name === 'translate'
      );
      const to = translate?.options.find((o) => o.flags.includes('--to'));

      expect(to).not.toHaveProperty('choices');
    });
  });

  describe('positional arguments', () => {
    it('reports each argument in declaration order', () => {
      const show = describeProgram(program).commands.find(
        (c) => c.name === 'show'
      );

      expect(show?.arguments.map((a) => a.name)).toEqual([
        'name-or-id',
        'target-lang',
      ]);
    });

    it('distinguishes required from optional arguments', () => {
      const show = describeProgram(program).commands.find(
        (c) => c.name === 'show'
      );

      expect(show?.arguments).toEqual([
        { name: 'name-or-id', required: true },
        { name: 'target-lang', required: false },
      ]);
    });

    it('reports an empty list for a command taking no arguments', () => {
      const translate = describeProgram(program).commands.find(
        (c) => c.name === 'translate'
      );

      expect(translate?.arguments).toEqual([]);
    });
  });

  describe('hidden commands', () => {
    // Hidden subcommands are usually renamed-command rejectors. They are part of
    // the parsed surface but not of the documented one, so a consumer of
    // _describe needs to tell them apart without hard-coding their names.
    it('marks a hidden subcommand as hidden', () => {
      const sync = describeProgram(program).commands.find(
        (c) => c.name === 'sync'
      );
      const legacy = sync?.commands.find((c) => c.name === 'legacy-name');

      expect(legacy?.hidden).toBe(true);
    });

    it('marks a visible subcommand as not hidden', () => {
      const sync = describeProgram(program).commands.find(
        (c) => c.name === 'sync'
      );

      expect(sync?.commands.find((c) => c.name === 'push')?.hidden).toBe(false);
      expect(sync?.hidden).toBe(false);
    });

    it('still reports the hidden command so the surface stays complete', () => {
      const sync = describeProgram(program).commands.find(
        (c) => c.name === 'sync'
      );

      expect(sync?.commands.map((c) => c.name)).toEqual(
        expect.arrayContaining(['push', 'pull', 'legacy-name'])
      );
    });
  });

  describe('serialization', () => {
    it('produces JSON-serializable output', () => {
      const result = describeProgram(program);
      expect(() => JSON.stringify(result)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(result));
      expect(parsed.name).toBe('deepl');
    });
  });
});
