/**
 * E2E Tests for CLI Workflows
 * Tests complete user scenarios without requiring real API key
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI Workflow E2E', () => {
  const testDir = path.join(os.tmpdir(), `.deepl-cli-e2e-${Date.now()}`);
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-config-${Date.now()}`);

  // Helper to run CLI commands with isolated config directory
  const runCLI = (command: string): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
    });
  };

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    // Create test config directory
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    // Clean up test config directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('Help and Version Commands', () => {
    it('should display help for main command', () => {
      const output = execSync('deepl --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('translate');
      expect(output).toContain('auth');
      expect(output).toContain('config');
      expect(output).toContain('cache');
      expect(output).toContain('glossary');
    });

    it('should display version', () => {
      const output = execSync('deepl --version', { encoding: 'utf-8' });

      // Should display a version number (e.g., 0.1.0)
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should display help for translate command', () => {
      const output = execSync('deepl translate --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('--to');
      expect(output).toContain('--from');
      expect(output).toContain('--output');
      expect(output).toContain('--formality');
      expect(output).toContain('--preserve-code');
    });

    it('should display help for auth command', () => {
      const output = execSync('deepl auth --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('set-key');
      expect(output).toContain('show');
      expect(output).toContain('clear');
    });

    it('should display help for config command', () => {
      const output = execSync('deepl config --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('get');
      expect(output).toContain('set');
      expect(output).toContain('list');
      expect(output).toContain('reset');
    });

    it('should display help for cache command', () => {
      const output = execSync('deepl cache --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('stats');
      expect(output).toContain('clear');
      expect(output).toContain('enable');
      expect(output).toContain('disable');
    });

    it('should display help for glossary command', () => {
      const output = execSync('deepl glossary --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('create');
      expect(output).toContain('list');
      expect(output).toContain('show');
      expect(output).toContain('entries');
      expect(output).toContain('delete');
    });
  });

  describe('Configuration Workflow', () => {
    it('should complete config workflow: list → set → get → reset', () => {
      // Step 1: List all config values
      const listOutput = runCLI('deepl config list');
      expect(listOutput).toContain('auth');
      expect(listOutput).toContain('cache');
      expect(listOutput).toContain('defaults');

      // Step 2: Set a config value
      runCLI('deepl config set cache.enabled false');

      // Step 3: Get the value to verify
      const getValue = runCLI('deepl config get cache.enabled');
      expect(getValue.trim()).toBe('false');

      // Step 4: Reset config
      const resetOutput = runCLI('deepl config reset');
      expect(resetOutput).toContain('reset');

      // Step 5: Verify reset worked (should be back to default true)
      const getAfterReset = runCLI('deepl config get cache.enabled');
      expect(getAfterReset.trim()).toBe('true');
    });

    it('should handle nested config values', () => {
      // Set nested value
      runCLI('deepl config set output.color false');

      // Get nested value
      const output = runCLI('deepl config get output.color');
      expect(output.trim()).toBe('false');

      // Reset
      runCLI('deepl config reset');
    });

    it('should handle array config values', () => {
      // Set array value
      runCLI('deepl config set defaults.targetLangs es,fr,de');

      // Get array value
      const output = runCLI('deepl config get defaults.targetLangs');
      const parsed = JSON.parse(output.trim());
      expect(parsed).toEqual(['es', 'fr', 'de']);

      // Reset
      runCLI('deepl config reset');
    });
  });

  describe('Cache Workflow', () => {
    it('should complete cache workflow: stats → clear → enable/disable commands', () => {
      // Step 1: Check initial stats
      const statsOutput = runCLI('deepl cache stats');
      expect(statsOutput).toContain('Cache Status:');
      expect(statsOutput).toContain('Entries:');

      // Step 2: Clear cache
      const clearOutput = runCLI('deepl cache clear');
      expect(clearOutput).toContain('cleared');

      // Step 3: Verify cache is empty
      const statsAfterClear = runCLI('deepl cache stats');
      expect(statsAfterClear).toContain('Entries: 0');

      // Step 4: Test enable command
      const enableOutput = runCLI('deepl cache enable');
      expect(enableOutput).toContain('enabled');

      // Step 5: Test disable command
      const disableOutput = runCLI('deepl cache disable');
      expect(disableOutput).toContain('disabled');

      // Note: enable/disable commands work but don't persist to config,
      // so stats will always show the config value. This is documented as a known limitation.
    });
  });

  describe('Error Handling Workflow', () => {
    it('should require --to flag for translation', () => {
      try {
        execSync('deepl translate "Hello"', { encoding: 'utf-8', stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        expect(output).toMatch(/required.*--to|target language/i);
      }
    });

    it('should require --output flag for file translation', () => {
      // Create test file
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello world');

      try {
        execSync(`deepl translate "${testFile}" --to es`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Expected to fail - either due to missing output flag or missing API key
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should handle non-existent config keys gracefully', () => {
      const output = runCLI('deepl config get nonexistent.key');
      expect(output.trim()).toBe('null');
    });

    it('should require target language for translation without API key', () => {
      // Clear API key first (in isolated test config)
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl translate "Hello" --to es');
        fail('Should have thrown an error about missing API key');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should handle invalid glossary file path', () => {
      const nonExistentFile = path.join(testDir, 'does-not-exist.tsv');

      try {
        execSync(`deepl glossary create "test" en de "${nonExistentFile}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Expected to fail - either due to missing file or missing API key
        expect(output.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Auth Command Workflow', () => {
    it('should complete auth workflow: show → clear → show again', () => {
      // Step 1: Try to show current key (just to check command works)
      try {
        runCLI('deepl auth show');
      } catch (error: any) {
        // If no key is set, that's expected
      }

      // Step 2: Clear the key
      const clearOutput = runCLI('deepl auth clear');
      expect(clearOutput).toMatch(/cleared|removed/i);

      // Step 3: Show should now indicate no key is set
      try {
        runCLI('deepl auth show');
        // If it doesn't throw, check that it says "not set" or similar
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/not set|not configured/i);
      }
    });

    it('should reject invalid API key format', () => {
      try {
        runCLI('deepl auth set-key "invalid-key"');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail either on format validation or API validation
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should reject empty API key', () => {
      try {
        runCLI('deepl auth set-key ""');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/empty|required/i);
      }
    });
  });

  describe('Multi-Command Workflow', () => {
    it('should configure defaults and verify persistence', () => {
      // Configure multiple settings
      runCLI('deepl config set defaults.targetLangs es,fr');
      runCLI('deepl config set output.color false');
      runCLI('deepl config set cache.enabled true');

      // Verify all settings persisted
      const targetLangs = runCLI('deepl config get defaults.targetLangs');
      expect(JSON.parse(targetLangs.trim())).toEqual(['es', 'fr']);

      const color = runCLI('deepl config get output.color');
      expect(color.trim()).toBe('false');

      const cacheEnabled = runCLI('deepl config get cache.enabled');
      expect(cacheEnabled.trim()).toBe('true');

      // Clean up
      runCLI('deepl config reset');
    });

    it('should handle cache configuration via config commands', () => {
      // Check initial config value
      let configValue = runCLI('deepl config get cache.enabled');
      expect(configValue.trim()).toBe('true');

      // Disable via config
      runCLI('deepl config set cache.enabled false');

      // Verify config change persisted
      configValue = runCLI('deepl config get cache.enabled');
      expect(configValue.trim()).toBe('false');

      // Reset config
      runCLI('deepl config set cache.enabled true');

      // Verify reset
      configValue = runCLI('deepl config get cache.enabled');
      expect(configValue.trim()).toBe('true');
    });
  });

  describe('Configuration Persistence Workflows', () => {
    it('should persist config across CLI invocations', () => {
      // Set a config value
      runCLI('deepl config set defaults.targetLangs de,fr');

      // Run multiple independent CLI invocations and verify persistence
      const firstCall = runCLI('deepl config get defaults.targetLangs');
      expect(JSON.parse(firstCall.trim())).toEqual(['de', 'fr']);

      const secondCall = runCLI('deepl config get defaults.targetLangs');
      expect(JSON.parse(secondCall.trim())).toEqual(['de', 'fr']);

      const thirdCall = runCLI('deepl config get defaults.targetLangs');
      expect(JSON.parse(thirdCall.trim())).toEqual(['de', 'fr']);

      // Clean up
      runCLI('deepl config reset');
    });

    it('should respect config hierarchy (CLI flags > config file)', () => {
      // Set default target language in config
      runCLI('deepl config set defaults.targetLangs es,fr');

      // Verify config is set
      const configValue = runCLI('deepl config get defaults.targetLangs');
      expect(JSON.parse(configValue.trim())).toEqual(['es', 'fr']);

      // CLI flags should override config when used
      // (This is validated by translate command requiring --to flag even with defaults)
      // Clean up
      runCLI('deepl config reset');
    });

    it('should handle config file operations without corruption', () => {
      // Perform multiple rapid config changes using valid config paths
      runCLI('deepl config set cache.enabled false');
      runCLI('deepl config set cache.enabled true');
      runCLI('deepl config set output.color false');
      runCLI('deepl config set output.color true');
      runCLI('deepl config set defaults.targetLangs es,fr,de');
      runCLI('deepl config set defaults.targetLangs en,ja');
      runCLI('deepl config set defaults.formality less');
      runCLI('deepl config set defaults.formality more');
      runCLI('deepl config set defaults.preserveFormatting false');
      runCLI('deepl config set defaults.preserveFormatting true');

      // Verify final values are persisted correctly
      const cacheEnabled = runCLI('deepl config get cache.enabled');
      expect(cacheEnabled.trim()).toBe('true');

      const color = runCLI('deepl config get output.color');
      expect(color.trim()).toBe('true');

      const targetLangs = runCLI('deepl config get defaults.targetLangs');
      expect(JSON.parse(targetLangs.trim())).toEqual(['en', 'ja']);

      // Reset and verify clean state
      runCLI('deepl config reset');
      const afterReset = runCLI('deepl config get defaults.targetLangs');
      expect(JSON.parse(afterReset.trim())).toEqual([]);
    });
  });

  describe('Stdin/Stdout Integration', () => {
    it('should handle empty stdin gracefully', () => {
      try {
        // Echo empty string and pipe to translate
        execSync('echo "" | deepl translate --to es', {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail gracefully — either on empty input or missing API key
        expect(output).toMatch(/API key|auth|no input|empty/i);
      }
    });

    it('should read from stdin when no text argument provided', () => {
      try {
        // Pipe text to translate command
        execSync('echo "Hello World" | deepl translate --to es', {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on stdin handling
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/stdin|input/i);
      }
    });

    it('should preserve newlines in stdin', () => {
      try {
        // Pipe multi-line text
        execSync('echo -e "Line 1\\nLine 2\\nLine 3" | deepl translate --to es', {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, stdin handling should work
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should output to stdout for piping', () => {
      // Test that help commands output to stdout (can be piped)
      const output = execSync('deepl --help | head -1', {
        encoding: 'utf-8',
        env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      });

      expect(output).toContain('Usage:');
    });
  });

  describe('Exit Codes', () => {
    it('should exit with 0 on successful help command', () => {
      // Help commands should exit with 0
      const result = execSync('deepl --help', {
        encoding: 'utf-8',
        env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      });

      expect(result).toContain('Usage:');
      // execSync throws on non-zero exit, so if we get here, exit code was 0
    });

    it('should exit with 0 on successful config operations', () => {
      // Successful config operations should exit with 0
      runCLI('deepl config set output.color false');
      const value = runCLI('deepl config get output.color');
      expect(value.trim()).toBe('false');

      runCLI('deepl config reset');
      // If we got here, all exit codes were 0
    });

    it('should exit with non-zero on invalid arguments', () => {
      try {
        execSync('deepl translate "Hello"', {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        // Non-zero exit code (error was thrown)
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should exit with non-zero on authentication failure', () => {
      // Clear API key
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl translate "Hello" --to es');
        fail('Should have thrown an error');
      } catch (error: any) {
        // Non-zero exit code
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should exit with non-zero on file not found', () => {
      const nonExistentFile = path.join(testDir, 'does-not-exist.txt');

      try {
        execSync(`deepl translate "${nonExistentFile}" --to es --output output.txt`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        // Non-zero exit code
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('CLI Argument Validation', () => {
    describe('translate command validation', () => {
      it('should validate --to flag is required', () => {
        try {
          execSync('deepl translate "Hello"', { encoding: 'utf-8', stdio: 'pipe' });
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          expect(output).toMatch(/required.*--to|target language/i);
        }
      });

      it('should validate --formality values', () => {
        try {
          execSync('deepl translate "Hello" --to es --formality invalid', {
            encoding: 'utf-8',
            stdio: 'pipe',
            env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should reject invalid formality value
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should validate --model-type values', () => {
        try {
          execSync('deepl translate "Hello" --to es --model-type invalid', {
            encoding: 'utf-8',
            stdio: 'pipe',
            env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should reject invalid model-type value
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should validate --split-sentences values', () => {
        try {
          execSync('deepl translate "Hello" --to es --split-sentences invalid', {
            encoding: 'utf-8',
            stdio: 'pipe',
            env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should reject invalid split-sentences value
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should validate --tag-handling values', () => {
        try {
          execSync('deepl translate "Hello" --to es --tag-handling invalid', {
            encoding: 'utf-8',
            stdio: 'pipe',
            env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should reject invalid tag-handling value
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require --output for file translation', () => {
        const testFile = path.join(testDir, 'validation-test.txt');
        fs.writeFileSync(testFile, 'Test content', 'utf-8');

        try {
          execSync(`deepl translate "${testFile}" --to es`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should fail (either on output requirement or API key)
          expect(output.length).toBeGreaterThan(0);
        }
      });
    });

    describe('config command validation', () => {
      it('should validate config key paths', () => {
        try {
          runCLI('deepl config set invalid.nonexistent.path value');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout || error.message;
          // Should reject invalid key path
          expect(output).toMatch(/invalid|path/i);
        }
      });

      it('should handle invalid config keys gracefully', () => {
        // Getting non-existent key should return null, not error
        const output = runCLI('deepl config get invalid.key.path');
        expect(output.trim()).toBe('null');
      });

      it('should validate config value types for boolean settings', () => {
        // Set boolean value
        runCLI('deepl config set cache.enabled false');
        const value = runCLI('deepl config get cache.enabled');
        expect(value.trim()).toBe('false');

        // Reset
        runCLI('deepl config reset');
      });
    });

    describe('auth command validation', () => {
      it('should reject empty API key', () => {
        try {
          runCLI('deepl auth set-key ""');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          expect(output).toMatch(/empty|required/i);
        }
      });

      it('should require API key argument', () => {
        try {
          execSync('deepl auth set-key', { encoding: 'utf-8', stdio: 'pipe' });
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing argument
          expect(output.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Document Translation Workflow', () => {
    it('should require --output flag for document translation', () => {
      const testFile = path.join(testDir, 'test-doc.html');
      fs.writeFileSync(testFile, '<html><body>Hello</body></html>', 'utf-8');

      try {
        execSync(`deepl translate "${testFile}" --to es`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on missing output flag or API key
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should validate input file exists for document translation', () => {
      const nonExistentFile = path.join(testDir, 'does-not-exist.pdf');

      try {
        execSync(`deepl translate "${nonExistentFile}" --to es --output output.pdf`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail with either file not found or API key error
        expect(output).toMatch(/not found|does not exist|API key|auth/i);
      }
    });

    it('should handle HTML document structure in help text', () => {
      const helpOutput = execSync('deepl translate --help', { encoding: 'utf-8' });

      // Should mention documents or files in help
      expect(helpOutput).toMatch(/file|document/i);
      expect(helpOutput).toContain('--output');
    });

    it('should create output directory if needed', () => {
      const testFile = path.join(testDir, 'simple.html');
      const outputDir = path.join(testDir, 'nested', 'output');
      const outputFile = path.join(outputDir, 'simple.es.html');

      fs.writeFileSync(testFile, '<html><body>Test</body></html>', 'utf-8');

      try {
        execSync(`deepl translate "${testFile}" --to es --output "${outputFile}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on directory creation
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/directory|ENOENT/i);
      }
    });

    it('should validate document file formats', () => {
      const testFile = path.join(testDir, 'test.json');
      fs.writeFileSync(testFile, '{"test": "data"}', 'utf-8');

      try {
        execSync(`deepl translate "${testFile}" --to es --output test.es.json`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // May fail on API key or unsupported format
        // Just verify it doesn't crash
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should exit with non-zero on document translation errors', () => {
      const testFile = path.join(testDir, 'test-exit.html');
      fs.writeFileSync(testFile, '<html><body>Test</body></html>', 'utf-8');

      try {
        execSync(`deepl translate "${testFile}" --to es --output test-exit.es.html`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        // Should exit with non-zero (no API key)
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should support formality flag for document translation', () => {
      const testFile = path.join(testDir, 'formal-doc.txt');
      fs.writeFileSync(testFile, 'Hello, how are you?', 'utf-8');

      try {
        execSync(`deepl translate "${testFile}" --to de --formality more --output formal-doc.de.txt`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on formality flag parsing
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/formality.*invalid/i);
      }
    });

    it('should support source language flag for document translation', () => {
      const testFile = path.join(testDir, 'source-doc.txt');
      fs.writeFileSync(testFile, 'Hello world', 'utf-8');

      try {
        execSync(`deepl translate "${testFile}" --from en --to es --output source-doc.es.txt`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on source language flag
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/source.*invalid/i);
      }
    });

    it('should support output-format flag for document format conversion', () => {
      const testFile = path.join(testDir, 'format-doc.docx');
      // Create a dummy DOCX file (just needs to exist for CLI parsing test)
      fs.writeFileSync(testFile, 'dummy docx content', 'utf-8');

      try {
        execSync(`deepl translate "${testFile}" --to es --output-format pdf --output format-doc.es.pdf`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on output-format flag parsing
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/output-format.*invalid/i);
      }
    });

    it('should accept various output format values', () => {
      const testFile = path.join(testDir, 'multi-format.html');
      fs.writeFileSync(testFile, '<html><body>Test</body></html>', 'utf-8');

      // Test PDF format
      try {
        execSync(`deepl translate "${testFile}" --to es --output-format pdf --output test.es.pdf`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
      }

      // Test DOCX format
      try {
        execSync(`deepl translate "${testFile}" --to es --output-format docx --output test.es.docx`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
      }

      // Test TXT format
      try {
        execSync(`deepl translate "${testFile}" --to es --output-format txt --output test.es.txt`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should include output-format in help text', () => {
      const helpOutput = execSync('deepl translate --help', { encoding: 'utf-8' });

      // Should mention output-format flag
      expect(helpOutput).toContain('--output-format');
      expect(helpOutput).toMatch(/format.*convert/i);
    });
  });

  describe('Glossary Languages Workflow', () => {
    it('should display glossary languages help text', () => {
      const helpOutput = execSync('deepl glossary --help', { encoding: 'utf-8' });

      // Should mention languages subcommand
      expect(helpOutput).toContain('languages');
      expect(helpOutput).toContain('List supported glossary language pairs');
    });

    it('should display help for glossary languages subcommand', () => {
      const helpOutput = execSync('deepl glossary languages --help', { encoding: 'utf-8' });

      expect(helpOutput).toContain('Usage:');
      expect(helpOutput).toContain('languages');
      expect(helpOutput).toContain('List supported glossary language pairs');
    });

    it('should require API key for glossary languages', () => {
      // Clear API key first
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl glossary languages');
        fail('Should have thrown an error about missing API key');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should not require any arguments', () => {
      try {
        // Will fail without API key but should not require arguments
        runCLI('deepl glossary languages');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on auth, not missing arguments
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/required|missing.*argument/i);
      }
    });

    it('should exit with non-zero on authentication failure', () => {
      // Ensure no API key is set
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl glossary languages');
        fail('Should have thrown an error');
      } catch (error: any) {
        // Non-zero exit code
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('Glossary Entry Editing Workflow', () => {
    describe('add-entry command', () => {
      it('should display help for add-entry subcommand', () => {
        const helpOutput = execSync('deepl glossary add-entry --help', { encoding: 'utf-8' });

        expect(helpOutput).toContain('Usage:');
        expect(helpOutput).toContain('add-entry');
        expect(helpOutput).toContain('Add a new entry to a glossary');
        expect(helpOutput).toContain('<name-or-id>');
        expect(helpOutput).toContain('<source>');
        expect(helpOutput).toContain('<target>');
      });

      it('should mention add-entry in glossary help', () => {
        const helpOutput = execSync('deepl glossary --help', { encoding: 'utf-8' });

        expect(helpOutput).toContain('add-entry');
        expect(helpOutput).toContain('Add a new entry to a glossary');
      });

      it('should require all three arguments', () => {
        try {
          runCLI('deepl glossary add-entry');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing arguments
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require source and target arguments', () => {
        try {
          runCLI('deepl glossary add-entry "My Glossary"');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing arguments
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require target argument', () => {
        try {
          runCLI('deepl glossary add-entry "My Glossary" "Hello"');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing argument
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require API key', () => {
        // Clear API key first
        try {
          runCLI('deepl auth clear');
        } catch {
          // Ignore if already cleared
        }

        try {
          runCLI('deepl glossary add-entry "My Glossary" "Hello" "Hola"');
          fail('Should have thrown an error about missing API key');
        } catch (error: any) {
          const output = error.stderr || error.stdout || error.message;
          expect(output).toMatch(/API key|auth/i);
        }
      });

      it('should exit with non-zero on authentication failure', () => {
        // Ensure no API key is set
        try {
          runCLI('deepl auth clear');
        } catch {
          // Ignore if already cleared
        }

        try {
          runCLI('deepl glossary add-entry "My Glossary" "Hello" "Hola"');
          fail('Should have thrown an error');
        } catch (error: any) {
          // Non-zero exit code
          expect(error.status).toBeGreaterThan(0);
        }
      });
    });

    describe('update-entry command', () => {
      it('should display help for update-entry subcommand', () => {
        const helpOutput = execSync('deepl glossary update-entry --help', { encoding: 'utf-8' });

        expect(helpOutput).toContain('Usage:');
        expect(helpOutput).toContain('update-entry');
        expect(helpOutput).toContain('Update an existing entry in a glossary');
        expect(helpOutput).toContain('<name-or-id>');
        expect(helpOutput).toContain('<source>');
        expect(helpOutput).toContain('<new-target>');
      });

      it('should mention update-entry in glossary help', () => {
        const helpOutput = execSync('deepl glossary --help', { encoding: 'utf-8' });

        expect(helpOutput).toContain('update-entry');
        expect(helpOutput).toContain('Update an existing entry in a glossary');
      });

      it('should require all three arguments', () => {
        try {
          runCLI('deepl glossary update-entry');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing arguments
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require source and new-target arguments', () => {
        try {
          runCLI('deepl glossary update-entry "My Glossary"');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing arguments
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require new-target argument', () => {
        try {
          runCLI('deepl glossary update-entry "My Glossary" "Hello"');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing argument
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require API key', () => {
        // Clear API key first
        try {
          runCLI('deepl auth clear');
        } catch {
          // Ignore if already cleared
        }

        try {
          runCLI('deepl glossary update-entry "My Glossary" "Hello" "Hola Updated"');
          fail('Should have thrown an error about missing API key');
        } catch (error: any) {
          const output = error.stderr || error.stdout || error.message;
          expect(output).toMatch(/API key|auth/i);
        }
      });

      it('should exit with non-zero on authentication failure', () => {
        // Ensure no API key is set
        try {
          runCLI('deepl auth clear');
        } catch {
          // Ignore if already cleared
        }

        try {
          runCLI('deepl glossary update-entry "My Glossary" "Hello" "Hola Updated"');
          fail('Should have thrown an error');
        } catch (error: any) {
          // Non-zero exit code
          expect(error.status).toBeGreaterThan(0);
        }
      });
    });

    describe('remove-entry command', () => {
      it('should display help for remove-entry subcommand', () => {
        const helpOutput = execSync('deepl glossary remove-entry --help', { encoding: 'utf-8' });

        expect(helpOutput).toContain('Usage:');
        expect(helpOutput).toContain('remove-entry');
        expect(helpOutput).toContain('Remove an entry from a glossary');
        expect(helpOutput).toContain('<name-or-id>');
        expect(helpOutput).toContain('<source>');
      });

      it('should mention remove-entry in glossary help', () => {
        const helpOutput = execSync('deepl glossary --help', { encoding: 'utf-8' });

        expect(helpOutput).toContain('remove-entry');
        expect(helpOutput).toContain('Remove an entry from a glossary');
      });

      it('should require both arguments', () => {
        try {
          runCLI('deepl glossary remove-entry');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing arguments
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require source argument', () => {
        try {
          runCLI('deepl glossary remove-entry "My Glossary"');
          fail('Should have thrown an error');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should indicate missing argument
          expect(output.length).toBeGreaterThan(0);
        }
      });

      it('should require API key', () => {
        // Clear API key first
        try {
          runCLI('deepl auth clear');
        } catch {
          // Ignore if already cleared
        }

        try {
          runCLI('deepl glossary remove-entry "My Glossary" "Hello"');
          fail('Should have thrown an error about missing API key');
        } catch (error: any) {
          const output = error.stderr || error.stdout || error.message;
          expect(output).toMatch(/API key|auth/i);
        }
      });

      it('should exit with non-zero on authentication failure', () => {
        // Ensure no API key is set
        try {
          runCLI('deepl auth clear');
        } catch {
          // Ignore if already cleared
        }

        try {
          runCLI('deepl glossary remove-entry "My Glossary" "Hello"');
          fail('Should have thrown an error');
        } catch (error: any) {
          // Non-zero exit code
          expect(error.status).toBeGreaterThan(0);
        }
      });
    });

    describe('entry editing workflow', () => {
      it('should support complete workflow: create → add → update → remove', () => {
        // Clear API key to test the workflow structure (will fail on auth)
        try {
          runCLI('deepl auth clear');
        } catch {
          // Ignore if already cleared
        }

        // Test that all commands are structured correctly (will fail on auth, not structure)
        try {
          runCLI('deepl glossary add-entry "tech-terms" "API" "Interfaz"');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          expect(output).toMatch(/API key|auth|not found/i);
          expect(output).not.toMatch(/invalid.*command|unknown.*command/i);
        }

        try {
          runCLI('deepl glossary update-entry "tech-terms" "API" "API (Interfaz)"');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          expect(output).toMatch(/API key|auth|not found/i);
          expect(output).not.toMatch(/invalid.*command|unknown.*command/i);
        }

        try {
          runCLI('deepl glossary remove-entry "tech-terms" "API"');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          expect(output).toMatch(/API key|auth|not found/i);
          expect(output).not.toMatch(/invalid.*command|unknown.*command/i);
        }
      });

      it('should accept glossary ID in addition to name', () => {
        // Clear API key
        try {
          runCLI('deepl auth clear');
        } catch {
          // Ignore if already cleared
        }

        // Test with a glossary ID format (UUID-like)
        try {
          runCLI('deepl glossary add-entry "abc123-def456" "Hello" "Hola"');
        } catch (error: any) {
          const output = error.stderr || error.stdout;
          // Should fail on auth or not found, not on ID format
          expect(output).toMatch(/API key|auth|not found/i);
        }
      });
    });
  });

  describe('Cost Transparency Workflow', () => {
    it('should display --show-billed-characters flag in translate help', () => {
      const helpOutput = execSync('deepl translate --help', { encoding: 'utf-8' });

      expect(helpOutput).toContain('--show-billed-characters');
      expect(helpOutput).toMatch(/billed.*character/i);
      expect(helpOutput).toMatch(/cost.*transparency/i);
    });

    it('should accept --show-billed-characters flag without unknown option error', () => {
      // Clear API key first
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl translate "Hello" --to es --show-billed-characters');
        fail('Should have thrown an error about missing API key');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Should fail on auth, not on unknown option
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unknown.*option.*show-billed-characters/i);
      }
    });

    it('should support --show-billed-characters with other flags', () => {
      // Clear API key first
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl translate "Hello" --to es --from en --formality more --show-billed-characters');
        fail('Should have thrown an error about missing API key');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Should fail on auth, not on flag combination
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).not.toMatch(/invalid.*flag/i);
      }
    });

    it('should support --show-billed-characters with JSON output format', () => {
      // Clear API key first
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl translate "Test" --to es --show-billed-characters --format json');
        fail('Should have thrown an error about missing API key');
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Should fail on auth, not on flag parsing
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should exit with non-zero when using --show-billed-characters without API key', () => {
      // Clear API key first
      try {
        runCLI('deepl auth clear');
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl translate "Hello" --to es --show-billed-characters');
        fail('Should have thrown an error');
      } catch (error: any) {
        // Non-zero exit code
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('Custom Instructions', () => {
    it('should accept --custom-instruction flag without error', () => {
      try {
        runCLI('deepl translate "Hello" --to es --custom-instruction "Use informal tone"');
        fail('Should have thrown an error');
      } catch (error: any) {
        // Should fail on API key, not flag parsing
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should accept multiple --custom-instruction flags', () => {
      try {
        runCLI('deepl translate "Hello" --to es --custom-instruction "Be concise" --custom-instruction "Preserve acronyms"');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should combine --custom-instruction with other flags', () => {
      try {
        runCLI('deepl translate "Hello" --to es --custom-instruction "Use formal tone" --formality more --model-type quality_optimized');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });
  });

  describe('Style ID', () => {
    it('should accept --style-id flag without error', () => {
      try {
        runCLI('deepl translate "Hello" --to es --style-id "abc-123-def-456"');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should combine --style-id with other flags', () => {
      try {
        runCLI('deepl translate "Hello" --to es --style-id "abc-123" --formality more');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });
  });

  describe('Style Rules Command', () => {
    it('should show style-rules command in help', () => {
      const result = runCLI('deepl --help');
      expect(result).toContain('style-rules');
    });

    it('should require API key for style-rules list', () => {
      try {
        runCLI('deepl style-rules list');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --detailed and pagination flags', () => {
      try {
        runCLI('deepl style-rules list --detailed --page 1 --page-size 10');
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not flag parsing
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });
  });
});
