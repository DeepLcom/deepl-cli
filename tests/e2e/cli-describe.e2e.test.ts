/**
 * E2E Tests for hidden _describe command
 * Emits the CLI subcommand tree + flag vocabulary as JSON for operator-local
 * QA harness drift detection. Not documented in API.md.
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

interface DescribeOption {
  flags: string;
  description: string;
  defaultValue?: unknown;
}

interface DescribeCommand {
  name: string;
  description: string;
  aliases: string[];
  options: DescribeOption[];
  commands: DescribeCommand[];
}

describe('_describe Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-describe');
  const { runCLI, runCLIExpectError } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('--format json', () => {
    it('emits valid JSON', () => {
      const output = runCLI('_describe --format json');
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('includes program-level name and description', () => {
      const output = runCLI('_describe --format json');
      const parsed = JSON.parse(output) as DescribeCommand;
      expect(parsed.name).toBe('deepl');
      expect(typeof parsed.description).toBe('string');
    });

    it('includes top-level subcommands', () => {
      const output = runCLI('_describe --format json');
      const parsed = JSON.parse(output) as DescribeCommand;
      const names = parsed.commands.map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(['translate', 'write']));
    });

    it('includes flag vocabulary on subcommands', () => {
      const output = runCLI('_describe --format json');
      const parsed = JSON.parse(output) as DescribeCommand;
      const translate = parsed.commands.find((c) => c.name === 'translate');
      expect(translate).toBeDefined();
      expect(Array.isArray(translate?.options)).toBe(true);
    });

    it('captures nested subcommands (e.g. auth set-key)', () => {
      const output = runCLI('_describe --format json');
      const parsed = JSON.parse(output) as DescribeCommand;
      const auth = parsed.commands.find((c) => c.name === 'auth');
      expect(auth).toBeDefined();
      const subNames = auth?.commands.map((c) => c.name) ?? [];
      expect(subNames.length).toBeGreaterThan(0);
      expect(subNames).toContain('set-key');
    });
  });

  describe('help output', () => {
    it('does not appear in top-level --help', () => {
      const output = runCLI('--help');
      expect(output).not.toContain('_describe');
    });
  });

  describe('error handling', () => {
    it('rejects unsupported format values', () => {
      const result = runCLIExpectError('_describe --format yaml');
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/format|unsupported|invalid/i);
    });
  });
});
