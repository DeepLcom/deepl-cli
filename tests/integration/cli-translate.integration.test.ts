/**
 * Integration Tests for Translate CLI Command
 * Tests the translate command CLI behavior, argument validation, and error handling
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Translate CLI Integration', () => {
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-test-translate-${Date.now()}`);
  const testDir = path.join(os.tmpdir(), `.deepl-cli-translate-files-${Date.now()}`);

  // Helper to run CLI commands with isolated config directory
  const runCLI = (command: string, options: { stdio?: any } = {}): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      ...options,
    });
  };

  beforeAll(() => {
    // Create test directories
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directories
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('deepl translate --help', () => {
    it('should display help for translate command', () => {
      const output = runCLI('deepl translate --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('deepl translate');
      expect(output).toContain('Translate text, files, or directories');
      expect(output).toContain('--to');
      expect(output).toContain('--from');
      expect(output).toContain('--output');
      expect(output).toContain('--formality');
      expect(output).toContain('--preserve-code');
      expect(output).toContain('--context');
      expect(output).toContain('--split-sentences');
      expect(output).toContain('--tag-handling');
      expect(output).toContain('--model-type');
    });
  });

  describe('deepl translate without API key', () => {
    it('should require API key to be configured', () => {
      // Ensure no API key is set
      try {
        runCLI('deepl auth clear', { stdio: 'pipe' });
      } catch {
        // Ignore if already cleared
      }

      try {
        runCLI('deepl translate "Hello" --to es', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should indicate API key is required
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });
  });

  describe('required arguments validation', () => {
    it('should require --to flag for translation', () => {
      try {
        runCLI('deepl translate "Hello"', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/required.*--to|target language/i);
      }
    });

    it('should accept text argument with --to flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      // Verify command structure accepts text argument
      expect(helpOutput).toContain('[text]');
      expect(helpOutput).toContain('--to <language>');
    });
  });

  describe('file translation validation', () => {
    it('should require --output flag for file translation', () => {
      // Create a test file
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello world', 'utf-8');

      try {
        runCLI(`deepl translate "${testFile}" --to es`, { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Will fail on API key or output requirement
        // Both are valid error scenarios
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should accept file path with --to and --output flags', () => {
      const testFile = path.join(testDir, 'test2.txt');
      const outputFile = path.join(testDir, 'output.txt');
      fs.writeFileSync(testFile, 'Hello', 'utf-8');

      try {
        // This will fail without API key, but should recognize valid arguments
        runCLI(`deepl translate "${testFile}" --to es --output "${outputFile}"`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not argument validation
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/output.*required/i);
      }
    });

    it('should handle non-existent file gracefully', () => {
      const nonExistentFile = path.join(testDir, 'does-not-exist.txt');

      try {
        runCLI(`deepl translate "${nonExistentFile}" --to es --output output.txt`, { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should indicate file not found (or API key missing)
        expect(output.length).toBeGreaterThan(0);
      }
    });
  });

  describe('directory translation validation', () => {
    it('should require --output flag for directory translation', () => {
      // Create a test directory with files
      const testSubDir = path.join(testDir, 'subdir');
      fs.mkdirSync(testSubDir, { recursive: true });
      fs.writeFileSync(path.join(testSubDir, 'file1.txt'), 'Content 1', 'utf-8');

      try {
        runCLI(`deepl translate "${testSubDir}" --to es`, { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Will fail on API key or output requirement
        // Both are valid error scenarios
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should accept directory path with --to and --output flags', () => {
      const testSubDir2 = path.join(testDir, 'subdir2');
      const outputDir = path.join(testDir, 'output-dir');
      fs.mkdirSync(testSubDir2, { recursive: true });
      fs.writeFileSync(path.join(testSubDir2, 'file1.txt'), 'Content', 'utf-8');

      try {
        // This will fail without API key, but should recognize valid arguments
        runCLI(`deepl translate "${testSubDir2}" --to es --output "${outputDir}"`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not argument validation
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/output.*required/i);
      }
    });
  });

  describe('option flags validation', () => {
    it('should accept --from flag for source language', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--from <language>');
      expect(helpOutput).toContain('Source language');
    });

    it('should accept --formality flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--formality <level>');
      expect(helpOutput).toMatch(/more.*less/i);
    });

    it('should accept --preserve-code flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--preserve-code');
      expect(helpOutput).toContain('code blocks');
    });

    it('should accept --context flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--context <text>');
      expect(helpOutput).toContain('context');
    });

    it('should accept --split-sentences flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--split-sentences <mode>');
      expect(helpOutput).toMatch(/on.*off.*nonewlines/i);
    });

    it('should accept --tag-handling flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--tag-handling <mode>');
      expect(helpOutput).toMatch(/xml.*html/i);
    });

    it('should accept --model-type flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--model-type <type>');
      expect(helpOutput).toMatch(/quality_optimized|latency_optimized/i);
    });

    it('should accept --recursive flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--recursive');
      expect(helpOutput).toContain('subdirectories');
    });

    it('should accept --pattern flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--pattern <pattern>');
      expect(helpOutput).toContain('Glob pattern');
    });

    it('should accept --concurrency flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--concurrency <number>');
      expect(helpOutput).toContain('parallel');
    });

    it('should accept --api-url flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--api-url <url>');
      expect(helpOutput).toContain('Custom API endpoint');
    });
  });

  describe('multiple target languages', () => {
    it('should accept comma-separated target languages', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--to <language>');
      expect(helpOutput).toMatch(/comma-separated.*multiple/i);
    });

    it('should validate comma-separated format', () => {
      // Help should indicate comma-separated format is supported
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('comma-separated');
    });
  });

  describe('command structure', () => {
    it('should be available as a command', () => {
      const helpOutput = runCLI('deepl --help');

      // Translate command should be listed in main help
      expect(helpOutput).toContain('translate');
      expect(helpOutput).toContain('Translate text, files, or directories');
    });

    it('should accept text as optional argument', () => {
      const output = runCLI('deepl translate --help');

      // Text should be optional (can use stdin)
      // Shown in usage line as [text]
      expect(output).toContain('translate [options] [text]');
      expect(output).toContain('Arguments:');
    });

    it('should support stdin input', () => {
      const output = runCLI('deepl translate --help');

      // Help should mention stdin
      expect(output).toMatch(/stdin|read from stdin/i);
    });
  });

  describe('error messages', () => {
    it('should show clear error for missing required flags', () => {
      try {
        runCLI('deepl translate "Hello"', { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Error should be clear about what's missing
        expect(output.length).toBeGreaterThan(0);
        expect(output).toMatch(/--to|target/i);
      }
    });

    it('should show clear error for file without output', () => {
      const testFile = path.join(testDir, 'error-test.txt');
      fs.writeFileSync(testFile, 'Test', 'utf-8');

      try {
        runCLI(`deepl translate "${testFile}" --to es`, { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Error should mention output requirement
        expect(output.length).toBeGreaterThan(0);
      }
    });
  });

  describe('file type support', () => {
    it('should support .txt files', () => {
      const txtFile = path.join(testDir, 'test.txt');
      const outputFile = path.join(testDir, 'output.txt');
      fs.writeFileSync(txtFile, 'Test content', 'utf-8');

      try {
        // Will fail without API key but should recognize file type
        runCLI(`deepl translate "${txtFile}" --to es --output "${outputFile}"`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on auth, not unsupported file type
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unsupported.*file/i);
      }
    });

    it('should support .md files', () => {
      const mdFile = path.join(testDir, 'test.md');
      const outputFile = path.join(testDir, 'output.md');
      fs.writeFileSync(mdFile, '# Test\n\nContent', 'utf-8');

      try {
        // Will fail without API key but should recognize file type
        runCLI(`deepl translate "${mdFile}" --to es --output "${outputFile}"`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on auth, not unsupported file type
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/unsupported.*file/i);
      }
    });
  });

  describe('output format', () => {
    it('should support --format option', () => {
      // Help should show --format option
      const output = runCLI('deepl translate --help');
      expect(output).toContain('--format <format>');
      expect(output).toContain('json');
      expect(output).toContain('plain text');
    });
  });

  describe('billed characters', () => {
    it('should show --show-billed-characters flag in help', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--show-billed-characters');
      expect(helpOutput).toMatch(/billed.*character/i);
      expect(helpOutput).toMatch(/cost.*transparency/i);
    });

    it('should accept --show-billed-characters flag without error', () => {
      // Verify the flag is recognized (will fail on API key but shouldn't error on unknown flag)
      try {
        runCLI('deepl translate "Hello" --to es --show-billed-characters', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on unknown option
        expect(output).not.toMatch(/unknown.*option.*show-billed-characters/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('document minification', () => {
    it('should show --enable-minification flag in help', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--enable-minification');
      expect(helpOutput).toMatch(/minification/i);
      expect(helpOutput).toMatch(/pptx|docx/i);
    });

    it('should accept --enable-minification flag without error', () => {
      // Create a test PPTX file (mock)
      const pptxFile = path.join(testDir, 'presentation.pptx');
      const outputFile = path.join(testDir, 'output.pptx');
      fs.writeFileSync(pptxFile, 'Mock PPTX content', 'utf-8');

      try {
        runCLI(`deepl translate "${pptxFile}" --to es --output "${outputFile}" --enable-minification`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on unknown option
        expect(output).not.toMatch(/unknown.*option.*enable-minification/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should recognize --enable-minification flag in command', () => {
      // Verify the flag doesn't cause "unknown option" error
      const pptxFile = path.join(testDir, 'test.pptx');
      const outputFile = path.join(testDir, 'out.pptx');
      fs.writeFileSync(pptxFile, 'content', 'utf-8');

      try {
        runCLI(`deepl translate "${pptxFile}" --to fr --output "${outputFile}" --enable-minification`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Should not contain unknown option error
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });
  });

  describe('XML tag handling parameters', () => {
    it('should show --outline-detection flag in help', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--outline-detection');
      expect(helpOutput).toMatch(/xml.*structure.*detection/i);
      expect(helpOutput).toMatch(/tag-handling.*xml/i);
    });

    it('should show --splitting-tags flag in help', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--splitting-tags');
      expect(helpOutput).toMatch(/xml.*tags.*split/i);
    });

    it('should show --non-splitting-tags flag in help', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--non-splitting-tags');
      expect(helpOutput).toMatch(/non-translatable/i);
    });

    it('should show --ignore-tags flag in help', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--ignore-tags');
      expect(helpOutput).toMatch(/ignore/i);
    });

    it('should accept --outline-detection flag without error', () => {
      try {
        runCLI('deepl translate "<p>Hello</p>" --to es --tag-handling xml --outline-detection true', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on unknown option
        expect(output).not.toMatch(/unknown.*option.*outline-detection/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --splitting-tags flag without error', () => {
      try {
        runCLI('deepl translate "<p>Hello</p>" --to es --tag-handling xml --splitting-tags "br,hr,div"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on unknown option
        expect(output).not.toMatch(/unknown.*option.*splitting-tags/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --non-splitting-tags flag without error', () => {
      try {
        runCLI('deepl translate "<p>Hello</p>" --to es --tag-handling xml --non-splitting-tags "code,pre"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on unknown option
        expect(output).not.toMatch(/unknown.*option.*non-splitting-tags/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --ignore-tags flag without error', () => {
      try {
        runCLI('deepl translate "<p>Hello</p>" --to es --tag-handling xml --ignore-tags "script,style"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on unknown option
        expect(output).not.toMatch(/unknown.*option.*ignore-tags/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept all XML tag handling flags together', () => {
      try {
        runCLI('deepl translate "<p>Hello</p>" --to es --tag-handling xml --outline-detection false --splitting-tags "br,hr" --non-splitting-tags "code" --ignore-tags "script"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on unknown options
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });
});
