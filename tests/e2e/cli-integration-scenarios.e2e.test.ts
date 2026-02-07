/**
 * E2E Tests for Integration Scenarios
 * Tests real-world workflows and multi-step scenarios
 *
 * These tests validate complete user journeys combining multiple CLI features.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('CLI Integration Scenarios E2E', () => {
  const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');
  let testConfigDir: string;
  let testDir: string;

  beforeAll(() => {
    // Create isolated test config and file directories
    testConfigDir = path.join(os.tmpdir(), `.deepl-cli-e2e-scenarios-${Date.now()}`);
    fs.mkdirSync(testConfigDir, { recursive: true });

    testDir = path.join(os.tmpdir(), `deepl-scenarios-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  const runCLI = (command: string, apiKey?: string): string => {
    return execSync(`node ${CLI_PATH} ${command}`, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfigDir,
        ...(apiKey !== undefined && { DEEPL_API_KEY: apiKey }),
      },
    });
  };

  // Helper that captures both stdout and stderr (for success messages via Logger.success)
  const runCLIAll = (command: string, apiKey?: string): string => {
    return execSync(`node ${CLI_PATH} ${command} 2>&1`, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfigDir,
        ...(apiKey !== undefined && { DEEPL_API_KEY: apiKey }),
      },
      shell: '/bin/sh',
    });
  };

  const runCLIExpectError = (command: string, apiKey?: string): { status: number; output: string } => {
    try {
      const output = execSync(`node ${CLI_PATH} ${command}`, {
        encoding: 'utf-8',
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: testConfigDir,
          ...(apiKey !== undefined && { DEEPL_API_KEY: apiKey }),
        },
      });
      return { status: 0, output };
    } catch (error: any) {
      return {
        status: error.status || 1,
        output: error.stderr?.toString() || error.stdout?.toString() || '',
      };
    }
  };

  describe('configuration workflows', () => {
    it('should persist config settings across invocations', () => {
      // Set a config value using valid path (e.g., cache.enabled)
      const setOutput = runCLIAll('config set cache.enabled true');
      expect(setOutput).toMatch(/set|saved|updated/i);

      // Retrieve the value in a separate invocation
      const getOutput = runCLI('config get cache.enabled');
      expect(getOutput).toMatch(/true|enabled/i);
    });

    it('should list all configuration values', () => {
      // List all config (should return JSON or formatted output)
      const listOutput = runCLI('config list');

      // Should show configuration (format may be JSON or plain text)
      expect(listOutput).toBeTruthy();
      expect(listOutput.length).toBeGreaterThan(0);
    });

    it('should handle config get for non-existent key', () => {
      const output = runCLI('config get nonexistent.key.that.does.not.exist');

      // Should either show empty/null or indicate key not found
      expect(output).toBeTruthy(); // Some output is returned
    });

    it('should support cache configuration', () => {
      // Enable cache
      const enableOutput = runCLIAll('config set cache.enabled true');
      expect(enableOutput).toMatch(/set|saved/i);

      // Verify it was set
      const getOutput = runCLI('config get cache.enabled');
      expect(getOutput).toMatch(/true|enabled/i);

      // Disable cache
      const disableOutput = runCLIAll('config set cache.enabled false');
      expect(disableOutput).toMatch(/set|saved/i);
    });
  });

  describe('cache workflows', () => {
    it('should show cache statistics', () => {
      const output = runCLI('cache stats');

      // Should show stats (even if cache is empty)
      expect(output).toMatch(/cache|statistics|entries|size/i);
    });

    it('should clear cache successfully', () => {
      const output = runCLIAll('cache clear');

      expect(output).toMatch(/cleared|empty|deleted/i);
    });

    it('should show stats after clearing cache', () => {
      // Clear cache
      runCLI('cache clear');

      // Check stats show empty cache
      const output = runCLI('cache stats');
      expect(output).toMatch(/cache|0|empty/i);
    });
  });

  describe('translation error recovery', () => {
    it('should recover from missing API key error', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      // First attempt without API key should fail
      const failResult = runCLIExpectError(`translate "${testFile}" --to es`, '');
      expect(failResult.status).toBeGreaterThan(0);
      expect(failResult.output).toMatch(/api key/i);

      // Second attempt with API key should proceed (will fail at actual API call)
      const successResult = runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');
      expect(successResult.status).toBeGreaterThan(0);
      // Should fail at API call, not API key validation
      expect(successResult.output).not.toMatch(/api key.*required/i);
    });

    it('should handle invalid target language gracefully', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const result = runCLIExpectError(`translate "${testFile}" --to invalid-lang`, 'test-key:fx');

      expect(result.status).toBeGreaterThan(0);
      // Should show meaningful error about invalid language
      expect(result.output).toBeTruthy();
    });

    it('should handle file read errors gracefully', () => {
      const nonexistentFile = path.join(testDir, 'does-not-exist.txt');

      const result = runCLIExpectError(`translate "${nonexistentFile}" --to es`, 'test-key:fx');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/file|not found|does not exist|enoent|authentication|invalid.*key/i);
    });
  });

  describe('help and documentation', () => {
    it('should show global help', () => {
      const output = runCLI('--help');

      expect(output).toContain('Usage:');
      expect(output).toContain('Commands:');
      expect(output).toContain('Options:');
    });

    it('should show help for translate command', () => {
      const output = runCLI('translate --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('translate');
      expect(output).toContain('--to');
    });

    it('should show help for config command', () => {
      const output = runCLI('config --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('config');
    });

    it('should show help for cache command', () => {
      const output = runCLI('cache --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('cache');
    });

    it('should show version information', () => {
      const output = runCLI('--version');

      // Should show version number
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('multi-file translation scenarios', () => {
    it('should translate multiple files in sequence', () => {
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');
      fs.writeFileSync(file1, 'First file');
      fs.writeFileSync(file2, 'Second file');

      // Translate first file
      const result1 = runCLIExpectError(`translate "${file1}" --to es`, 'test-key:fx');
      expect(result1.status).toBeGreaterThan(0); // Will fail at API call

      // Translate second file (should work independently)
      const result2 = runCLIExpectError(`translate "${file2}" --to es`, 'test-key:fx');
      expect(result2.status).toBeGreaterThan(0); // Will fail at API call

      // Both should fail for same reason (API call), not due to interference
      expect(result1.output).not.toMatch(/file.*in use|locked/i);
      expect(result2.output).not.toMatch(/file.*in use|locked/i);
    });

    it('should handle directory translation with pattern matching', () => {
      // Create test directory with mixed files
      const translDir = path.join(testDir, 'translation-test');
      fs.mkdirSync(translDir, { recursive: true });
      fs.writeFileSync(path.join(translDir, 'doc1.txt'), 'Text 1');
      fs.writeFileSync(path.join(translDir, 'doc2.md'), '# Markdown');
      fs.writeFileSync(path.join(translDir, 'ignore.pdf'), 'PDF content');

      // Translate directory (will fail at API call but should parse correctly)
      const result = runCLIExpectError(`translate "${translDir}" --to es`, 'test-key:fx');

      // Should not fail due to directory structure issues
      expect(result.output).not.toMatch(/invalid.*directory|not.*directory/i);
    });
  });

  describe('flag combination scenarios', () => {
    it('should combine translation options correctly', () => {
      const testFile = path.join(testDir, 'combo-test.txt');
      fs.writeFileSync(testFile, 'Test content');

      const result = runCLIExpectError(
        `translate "${testFile}" --to es --formality formal --preserve-formatting`,
        'test-key:fx'
      );

      // Should not fail due to flag conflicts
      expect(result.output).not.toMatch(/conflicting.*options|cannot.*combine/i);
    });

    it('should accept multiple target languages', () => {
      const testFile = path.join(testDir, 'multi-lang.txt');
      fs.writeFileSync(testFile, 'Multi-language test');

      const result = runCLIExpectError(`translate "${testFile}" --to es,fr,de`, 'test-key:fx');

      // Should not fail due to multiple targets being invalid
      expect(result.output).not.toMatch(/invalid.*multiple.*targets/i);
    });

    it('should respect quiet mode flag', () => {
      const testFile = path.join(testDir, 'quiet-test.txt');
      fs.writeFileSync(testFile, 'Quiet test');

      const result = runCLIExpectError(`translate "${testFile}" --to es --quiet`, 'test-key:fx');

      // Should not fail due to quiet flag
      expect(result.output).not.toMatch(/unknown option.*quiet/i);
    });
  });

  describe('output formatting scenarios', () => {
    it('should accept preserve-code flag', () => {
      const testFile = path.join(testDir, 'code-test.txt');
      fs.writeFileSync(testFile, 'Some text with `code`');

      const result = runCLIExpectError(`translate "${testFile}" --to es --preserve-code`, 'test-key:fx');

      expect(result.output).not.toMatch(/unknown option.*preserve-code/i);
    });

    it('should accept preserve-formatting flag', () => {
      const testFile = path.join(testDir, 'format-test.txt');
      fs.writeFileSync(testFile, 'Line 1\n\nLine 2');

      const result = runCLIExpectError(`translate "${testFile}" --to es --preserve-formatting`, 'test-key:fx');

      expect(result.output).not.toMatch(/unknown option.*preserve-formatting/i);
    });

    it('should accept output flag for custom output path', () => {
      const testFile = path.join(testDir, 'input.txt');
      const outputFile = path.join(testDir, 'custom-output.txt');
      fs.writeFileSync(testFile, 'Input content');

      const result = runCLIExpectError(`translate "${testFile}" --to es --output "${outputFile}"`, 'test-key:fx');

      expect(result.output).not.toMatch(/unknown option.*output/i);
    });
  });

  describe('command chaining and sequences', () => {
    it('should allow consecutive config operations', () => {
      // Set cache enabled multiple times in sequence
      runCLI('config set cache.enabled true');
      const test1 = runCLI('config get cache.enabled');
      expect(test1).toMatch(/true/i);

      runCLI('config set cache.enabled false');
      const test2 = runCLI('config get cache.enabled');
      expect(test2).toMatch(/false/i);

      runCLI('config set cache.enabled true');
      const test3 = runCLI('config get cache.enabled');
      expect(test3).toMatch(/true/i);
    });

    it('should allow cache operations between translations', () => {
      const testFile = path.join(testDir, 'cache-sequence.txt');
      fs.writeFileSync(testFile, 'Cache test');

      // Clear cache
      runCLI('cache clear');

      // Attempt translation (will fail at API)
      runCLIExpectError(`translate "${testFile}" --to es`, 'test-key:fx');

      // Check cache stats
      const stats = runCLI('cache stats');
      expect(stats).toMatch(/cache|statistics/i);
    });
  });

  describe('edge cases and robustness', () => {
    it('should handle empty file gracefully', () => {
      const emptyFile = path.join(testDir, 'empty.txt');
      fs.writeFileSync(emptyFile, '');

      const result = runCLIExpectError(`translate "${emptyFile}" --to es`, 'test-key:fx');

      // Should handle empty file (may fail at API or validation)
      expect(result.status).toBeGreaterThan(0);
    });

    it('should handle very long file paths', () => {
      const longDir = path.join(testDir, 'a'.repeat(50), 'b'.repeat(50));
      fs.mkdirSync(longDir, { recursive: true });
      const longFile = path.join(longDir, 'file-with-very-long-path.txt');
      fs.writeFileSync(longFile, 'Test content');

      const result = runCLIExpectError(`translate "${longFile}" --to es`, 'test-key:fx');

      // Should not fail due to path length (unless OS limit exceeded)
      expect(result.status).toBeGreaterThan(0);
    });

    it('should handle special characters in file names', () => {
      const specialFile = path.join(testDir, 'file with spaces & special.txt');
      fs.writeFileSync(specialFile, 'Special chars');

      const result = runCLIExpectError(`translate "${specialFile}" --to es`, 'test-key:fx');

      // Should handle special characters in path
      expect(result.output).not.toMatch(/invalid.*character.*path/i);
    });

    it('should reject invalid flag combinations', () => {
      const testFile = path.join(testDir, 'invalid-flag.txt');
      fs.writeFileSync(testFile, 'Test');

      const result = runCLIExpectError(`translate "${testFile}" --to es --invalid-flag-that-does-not-exist`, 'test-key');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/unknown option|invalid.*flag|unrecognized/i);
    });

    it('should handle duplicate flags gracefully', () => {
      const testFile = path.join(testDir, 'duplicate.txt');
      fs.writeFileSync(testFile, 'Duplicate test');

      // Last value should win for duplicate flags
      const result = runCLIExpectError(`translate "${testFile}" --to es --to fr`, 'test-key:fx');

      // Should not crash, though behavior may vary (last flag wins or error)
      expect(result.status).toBeGreaterThan(0);
    });
  });
});
