import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Completion CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-completion-${Date.now()}`);

  const runCLI = (command: string): string => {
    const { DEEPL_API_KEY: _, ...envWithoutKey } = process.env;
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...envWithoutKey, DEEPL_CONFIG_DIR: testConfigDir },
    });
  };

  const runCLIAll = (command: string): string => {
    const { DEEPL_API_KEY: _, ...envWithoutKey } = process.env;
    return execSync(`${command} 2>&1`, {
      encoding: 'utf-8',
      env: { ...envWithoutKey, DEEPL_CONFIG_DIR: testConfigDir },
      shell: '/bin/sh',
    });
  };

  beforeAll(() => {
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('deepl completion bash', () => {
    it('should output a valid bash completion script', () => {
      const output = runCLI('deepl completion bash');
      expect(output).toContain('_deepl_completions');
      expect(output).toContain('complete -F _deepl_completions deepl');
      expect(output).toContain('compgen');
      expect(output).toContain('COMPREPLY');
    });

    it('should include all registered top-level commands', () => {
      const output = runCLI('deepl completion bash');
      const expectedCommands = [
        'translate', 'auth', 'usage', 'languages', 'watch',
        'write', 'config', 'cache', 'glossary', 'hooks',
        'style-rules', 'admin', 'completion',
      ];
      for (const cmd of expectedCommands) {
        expect(output).toContain(cmd);
      }
    });

    it('should include subcommand completions', () => {
      const output = runCLI('deepl completion bash');
      expect(output).toContain('auth)');
      expect(output).toContain('set-key');
      expect(output).toContain('cache)');
      expect(output).toContain('stats');
    });
  });

  describe('deepl completion zsh', () => {
    it('should output a valid zsh completion script', () => {
      const output = runCLI('deepl completion zsh');
      expect(output).toContain('#compdef deepl');
      expect(output).toContain('_deepl()');
      expect(output).toContain('_arguments -C');
    });

    it('should include command descriptions', () => {
      const output = runCLI('deepl completion zsh');
      expect(output).toContain('translate:');
      expect(output).toContain('auth:');
      expect(output).toContain('cache:');
    });

    it('should include subcommand dispatch functions', () => {
      const output = runCLI('deepl completion zsh');
      expect(output).toContain('_deepl_auth()');
      expect(output).toContain('_deepl_cache()');
      expect(output).toContain('_deepl_glossary()');
    });
  });

  describe('deepl completion fish', () => {
    it('should output a valid fish completion script', () => {
      const output = runCLI('deepl completion fish');
      expect(output).toContain('complete -c deepl');
      expect(output).toContain('__fish_use_subcommand');
    });

    it('should include subcommand scoping', () => {
      const output = runCLI('deepl completion fish');
      expect(output).toContain('__fish_seen_subcommand_from auth');
      expect(output).toContain('__fish_seen_subcommand_from cache');
    });

    it('should disable default file completions', () => {
      const output = runCLI('deepl completion fish');
      expect(output).toContain('complete -c deepl -f');
    });
  });

  describe('error handling', () => {
    it('should fail with unsupported shell type', () => {
      expect(() => {
        runCLI('deepl completion powershell');
      }).toThrow();
    });

    it('should fail with no shell argument', () => {
      expect(() => {
        runCLIAll('deepl completion');
      }).toThrow();
    });
  });

  describe('help text', () => {
    it('should show help with --help flag', () => {
      const output = runCLIAll('deepl completion --help');
      expect(output).toContain('Generate shell completion scripts');
      expect(output).toContain('bash');
      expect(output).toContain('zsh');
      expect(output).toContain('fish');
    });
  });
});
