import { Command } from 'commander';
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
      .option('-f, --from <lang>', 'Source language');

    const sync = program
      .command('sync')
      .alias('sy')
      .description('Sync translations with TMS');
    sync.command('push').description('Push translations');
    sync.command('pull').description('Pull translations');
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

  describe('serialization', () => {
    it('produces JSON-serializable output', () => {
      const result = describeProgram(program);
      expect(() => JSON.stringify(result)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(result));
      expect(parsed.name).toBe('deepl');
    });
  });
});
