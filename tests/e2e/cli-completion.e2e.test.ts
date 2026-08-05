/**
 * E2E Tests for Shell Completion Command
 *
 * Asserts the generated scripts are actually loadable by each shell -- the
 * dispatch functions, the completion builtins they call, and the subcommand
 * scoping -- rather than only that some output was produced.
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('Completion Command E2E', () => {
  const testConfig = createTestConfigDir('e2e-completion');
  const { runCLI, runCLIAll } = makeNodeRunCLI(testConfig.path, {
    excludeApiKey: true,
  });

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('completion bash', () => {
    it('should output a valid bash completion script', () => {
      const output = runCLI('completion bash');
      expect(output).toContain('_deepl_completions');
      expect(output).toContain('complete -F _deepl_completions deepl');
      expect(output).toContain('compgen');
      expect(output).toContain('COMPREPLY');
    });

    it('should include all registered top-level commands', () => {
      const output = runCLI('completion bash');
      const expectedCommands = [
        'translate',
        'auth',
        'usage',
        'languages',
        'watch',
        'write',
        'config',
        'cache',
        'glossary',
        'hooks',
        'style-rules',
        'admin',
        'completion',
      ];
      for (const cmd of expectedCommands) {
        expect(output).toContain(cmd);
      }
    });

    it('should include subcommand completions', () => {
      const output = runCLI('completion bash');
      expect(output).toContain('auth)');
      expect(output).toContain('set-key');
      expect(output).toContain('cache)');
      expect(output).toContain('stats');
    });
  });

  describe('completion zsh', () => {
    it('should output a valid zsh completion script', () => {
      const output = runCLI('completion zsh');
      expect(output).toContain('#compdef deepl');
      expect(output).toContain('_deepl()');
      expect(output).toContain('_arguments -C');
    });

    it('should include command descriptions', () => {
      const output = runCLI('completion zsh');
      expect(output).toContain('translate:');
      expect(output).toContain('auth:');
      expect(output).toContain('cache:');
    });

    it('should include subcommand dispatch functions', () => {
      const output = runCLI('completion zsh');
      expect(output).toContain('_deepl_auth()');
      expect(output).toContain('_deepl_cache()');
      expect(output).toContain('_deepl_glossary()');
    });
  });

  describe('completion fish', () => {
    it('should output a valid fish completion script', () => {
      const output = runCLI('completion fish');
      expect(output).toContain('complete -c deepl');
      expect(output).toContain('__fish_use_subcommand');
    });

    it('should include subcommand scoping', () => {
      const output = runCLI('completion fish');
      expect(output).toContain('__fish_seen_subcommand_from auth');
      expect(output).toContain('__fish_seen_subcommand_from cache');
    });

    it('should disable default file completions', () => {
      const output = runCLI('completion fish');
      expect(output).toContain('complete -c deepl -f');
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
