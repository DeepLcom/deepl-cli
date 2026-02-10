/**
 * Integration Tests for Translate CLI Command
 * Tests the translate command CLI behavior, argument validation, and error handling
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import nock from 'nock';
import { createTestConfigDir, createTestDir, makeRunCLI, DEEPL_FREE_API_URL } from '../helpers';

describe('Translate CLI Integration', () => {
  const testConfig = createTestConfigDir('test-translate');
  const testFiles = createTestDir('translate-files');
  const testConfigDir = testConfig.path;
  const testDir = testFiles.path;
  const { runCLI } = makeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
    testFiles.cleanup();
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

      expect.assertions(1);
      try {
        runCLI('deepl translate "Hello" --to es', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should indicate API key is required
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });
  });

  describe('required arguments validation', () => {
    it('should require --to flag or config default for translation', () => {
      expect.assertions(1);
      try {
        runCLI('deepl translate "Hello"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/target language|--to/i);
      }
    });

    it('should accept text argument with --to flag', () => {
      const helpOutput = runCLI('deepl translate --help');
      // Verify command structure accepts text argument
      expect(helpOutput).toContain('[text]');
      expect(helpOutput).toContain('--to <language>');
    });
  });

  describe('default target language from config', () => {
    const runCLINoApiKey = (command: string, options: { stdio?: any } = {}): string => {
      const env: Record<string, string | undefined> = { ...process.env, DEEPL_CONFIG_DIR: testConfigDir };
      delete env['DEEPL_API_KEY'];
      return execSync(command, {
        encoding: 'utf-8',
        env,
        ...options,
      });
    };

    it('should show error mentioning both --to and config when neither is set', () => {
      // Clear any config that might have targetLangs set
      const configPath = path.join(testConfigDir, 'config.json');
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      expect.assertions(2);
      try {
        runCLINoApiKey('deepl translate "Hello"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/--to/);
        expect(output).toMatch(/defaults\.targetLangs/);
      }
    });

    it('should use config default target language when --to is omitted', () => {
      const configPath = path.join(testConfigDir, 'config.json');
      const config = {
        auth: {},
        api: { baseUrl: 'https://api.deepl.com', usePro: true },
        defaults: {
          targetLangs: ['es'],
          formality: 'default',
          preserveFormatting: true,
        },
        cache: { enabled: true, maxSize: 1073741824, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: true },
        watch: { debounceMs: 500, autoCommit: false, pattern: '*.md' },
        team: {},
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

      expect.assertions(1);
      try {
        // Without --to, should fall back to config default 'es'
        // Will still fail because no API key, but should NOT fail on missing --to
        runCLINoApiKey('deepl translate "Hello"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on missing target language
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('file translation validation', () => {
    it('should require --output flag for file translation', () => {
      // Create a test file
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello world', 'utf-8');

      expect.assertions(1);
      try {
        runCLI(`deepl translate "${testFile}" --to es`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Will fail on API key or output requirement
        expect(output).toMatch(/API key|auth|output/i);
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

      expect.assertions(1);
      try {
        runCLI(`deepl translate "${nonExistentFile}" --to es --output output.txt`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should indicate file not found or API key missing
        expect(output).toMatch(/not found|does not exist|API key|auth/i);
      }
    });
  });

  describe('directory translation validation', () => {
    it('should require --output flag for directory translation', () => {
      // Create a test directory with files
      const testSubDir = path.join(testDir, 'subdir');
      fs.mkdirSync(testSubDir, { recursive: true });
      fs.writeFileSync(path.join(testSubDir, 'file1.txt'), 'Content 1', 'utf-8');

      expect.assertions(1);
      try {
        runCLI(`deepl translate "${testSubDir}" --to es`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Will fail on API key or output requirement
        expect(output).toMatch(/API key|auth|output/i);
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
      expect(helpOutput).toContain('comma-separated');
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
    it('should show clear error when --to omitted and no config default', () => {
      // Clear config to ensure no default targetLangs
      const configPath = path.join(testConfigDir, 'config.json');
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      const env = { ...process.env, DEEPL_CONFIG_DIR: testConfigDir };
      (env as Record<string, string | undefined>)['DEEPL_API_KEY'] = undefined;

      expect.assertions(1);
      try {
        execSync('deepl translate "Hello"', {
          encoding: 'utf-8',
          env,
          stdio: 'pipe',
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/--to|target/i);
      }
    });

    it('should show clear error for file without output', () => {
      const testFile = path.join(testDir, 'error-test.txt');
      fs.writeFileSync(testFile, 'Test', 'utf-8');

      expect.assertions(1);
      try {
        runCLI(`deepl translate "${testFile}" --to es`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth|output/i);
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
      expect(output).toContain('default: plain');
      expect(output).toContain('text)');
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
      expect(helpOutput.replace(/\s+/g, ' ')).toMatch(/should not be used to split sentences/i);
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

  describe('table output format', () => {
    it('should show table format option in help', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain('--format <format>');
      expect(helpOutput).toMatch(/json/i);
    });

    it('should accept --format table flag without error', () => {
      try {
        runCLI('deepl translate "Hello" --to es,fr,de --format table', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not on unknown format
        expect(output).not.toMatch(/unknown.*format.*table/i);
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should recognize table format as valid option', () => {
      try {
        runCLI('deepl translate "Test" --to es,fr --format table', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        // Should not contain invalid format error
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should work with multiple target languages', () => {
      try {
        runCLI('deepl translate "Hello world" --to es,fr,de,ja --format table', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should not reject the format or language combination
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should accept table format with other options', () => {
      try {
        runCLI('deepl translate "Test" --to es,fr --format table --formality more --context "Business email"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should accept combination of options
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept table format with --show-billed-characters', () => {
      try {
        runCLI('deepl translate "Test" --to es,fr,de --format table --show-billed-characters --no-cache', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should accept both flags together
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('--custom-instruction flag', () => {
    it('should display --custom-instruction in help text', () => {
      const output = runCLI('deepl translate --help');
      expect(output).toContain('--custom-instruction');
    });

    it('should accept a single --custom-instruction flag', () => {
      try {
        runCLI('deepl translate "Hello" --to es --custom-instruction "Use informal tone"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not flag parsing
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept multiple --custom-instruction flags', () => {
      try {
        runCLI('deepl translate "Hello" --to es --custom-instruction "Use informal tone" --custom-instruction "Preserve brand names"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not flag parsing
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --custom-instruction with other options', () => {
      try {
        runCLI('deepl translate "Hello" --to es --formality more --custom-instruction "Keep it formal" --model-type quality_optimized', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('--style-id flag', () => {
    it('should show --style-id in help text', () => {
      const result = runCLI('deepl translate --help');
      expect(result).toContain('--style-id');
    });

    it('should accept --style-id flag', () => {
      try {
        runCLI('deepl translate "Hello" --to es --style-id "abc-123-def"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --style-id with other options', () => {
      try {
        runCLI('deepl translate "Hello" --to es --style-id "abc-123" --formality more', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('--enable-beta-languages flag', () => {
    it('should show --enable-beta-languages in help text', () => {
      const result = runCLI('deepl translate --help');
      expect(result).toContain('--enable-beta-languages');
    });

    it('should accept --enable-beta-languages flag', () => {
      try {
        runCLI('deepl translate "Hello" --to es --enable-beta-languages', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --enable-beta-languages with other options', () => {
      try {
        runCLI('deepl translate "Hello" --to es --enable-beta-languages --formality more', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('style-rules command', () => {
    it('should show style-rules in main help', () => {
      const result = runCLI('deepl --help');
      expect(result).toContain('style-rules');
    });

    it('should show list subcommand in style-rules help', () => {
      const result = runCLI('deepl style-rules --help');
      expect(result).toContain('list');
    });

    it('should show --detailed flag in style-rules list help', () => {
      const result = runCLI('deepl style-rules list --help');
      expect(result).toContain('--detailed');
      expect(result).toContain('--page');
      expect(result).toContain('--page-size');
      expect(result).toContain('--format');
    });

    it('should require API key for style-rules list', () => {
      try {
        runCLI('deepl style-rules list', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('expanded language support', () => {
    it('should accept extended language codes', () => {
      try {
        runCLI('deepl translate "Hello" --to sw', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail on API key, not language validation
        expect(output).not.toMatch(/Invalid target language/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept ES-419 target variant', () => {
      try {
        runCLI('deepl translate "Hello" --to es-419', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/Invalid target language/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept zh-hans and zh-hant variants', () => {
      try {
        runCLI('deepl translate "Hello" --to zh-hans', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/Invalid target language/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept newly added core languages (he, vi)', () => {
      try {
        runCLI('deepl translate "Hello" --to he', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/Invalid target language/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('--tag-handling-version flag', () => {
    it('should show --tag-handling-version in help text', () => {
      const result = runCLI('deepl translate --help');
      expect(result).toContain('--tag-handling-version');
    });

    it('should accept --tag-handling-version with --tag-handling', () => {
      try {
        runCLI('deepl translate "<p>Hello</p>" --to es --tag-handling html --tag-handling-version v2', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('--api-url HTTPS enforcement', () => {
    const runCLIWithKey = (command: string): string => {
      return execSync(command, {
        encoding: 'utf-8',
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: testConfigDir,
          DEEPL_API_KEY: 'fake-key-for-url-validation',
        },
      });
    };

    it('should reject http:// URLs for remote hosts', () => {
      expect.assertions(2);
      try {
        runCLIWithKey('deepl translate "Hello" --to es --api-url http://evil-server.com/v2');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/Insecure HTTP URL rejected/i);
        expect(output).toMatch(/credential exposure/i);
      }
    });

    it('should accept https:// URLs', () => {
      try {
        runCLIWithKey('deepl translate "Hello" --to es --api-url https://api-free.deepl.com/v2');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should NOT fail on URL validation; may fail on auth or network
        expect(output).not.toMatch(/Insecure HTTP URL rejected/i);
      }
    });

    it('should allow http://localhost for local testing', () => {
      try {
        runCLIWithKey('deepl translate "Hello" --to es --api-url http://localhost:3000/v2');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should NOT fail on URL validation; may fail on connection
        expect(output).not.toMatch(/Insecure HTTP URL rejected/i);
      }
    });

    it('should allow http://127.0.0.1 for local testing', () => {
      try {
        runCLIWithKey('deepl translate "Hello" --to es --api-url http://127.0.0.1:5000/v2');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should NOT fail on URL validation; may fail on connection
        expect(output).not.toMatch(/Insecure HTTP URL rejected/i);
      }
    });
  });

  describe('choices validation for enum options', () => {
    it('should reject invalid --formality value', () => {
      expect.assertions(8);
      try {
        runCLI('deepl translate "Hello" --to es --formality super_formal', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/--formality/);
        expect(output).toMatch(/invalid/i);
        expect(output).toMatch(/Allowed choices/i);
        expect(output).toContain('default');
        expect(output).toContain('more');
        expect(output).toContain('less');
        expect(output).toContain('prefer_more');
        expect(output).toContain('prefer_less');
      }
    });

    it('should accept all valid --formality values', () => {
      const validValues = ['default', 'more', 'less', 'prefer_more', 'prefer_less'];
      for (const value of validValues) {
        try {
          runCLI(`deepl translate "Hello" --to es --formality ${value}`, { stdio: 'pipe' });
        } catch (error: any) {
          const output = error.stderr || error.stdout || '';
          expect(output).not.toMatch(/invalid.*Allowed choices/i);
        }
      }
    });

    it('should reject invalid --tag-handling value', () => {
      expect.assertions(5);
      try {
        runCLI('deepl translate "Hello" --to es --tag-handling json', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/--tag-handling/);
        expect(output).toMatch(/invalid/i);
        expect(output).toMatch(/Allowed choices/i);
        expect(output).toContain('xml');
        expect(output).toContain('html');
      }
    });

    it('should accept valid --tag-handling values', () => {
      const validValues = ['xml', 'html'];
      for (const value of validValues) {
        try {
          runCLI(`deepl translate "<p>Hello</p>" --to es --tag-handling ${value}`, { stdio: 'pipe' });
        } catch (error: any) {
          const output = error.stderr || error.stdout || '';
          expect(output).not.toMatch(/invalid.*Allowed choices/i);
        }
      }
    });

    it('should reject invalid --model-type value', () => {
      expect.assertions(6);
      try {
        runCLI('deepl translate "Hello" --to es --model-type fast', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/--model-type/);
        expect(output).toMatch(/invalid/i);
        expect(output).toMatch(/Allowed choices/i);
        expect(output).toContain('quality_optimized');
        expect(output).toContain('prefer_quality_optimized');
        expect(output).toContain('latency_optimized');
      }
    });

    it('should accept valid --model-type values', () => {
      const validValues = ['quality_optimized', 'prefer_quality_optimized', 'latency_optimized'];
      for (const value of validValues) {
        try {
          runCLI(`deepl translate "Hello" --to es --model-type ${value}`, { stdio: 'pipe' });
        } catch (error: any) {
          const output = error.stderr || error.stdout || '';
          expect(output).not.toMatch(/invalid.*Allowed choices/i);
        }
      }
    });

    it('should reject invalid --split-sentences value', () => {
      expect.assertions(6);
      try {
        runCLI('deepl translate "Hello" --to es --split-sentences always', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/--split-sentences/);
        expect(output).toMatch(/invalid/i);
        expect(output).toMatch(/Allowed choices/i);
        expect(output).toContain('on');
        expect(output).toContain('off');
        expect(output).toContain('nonewlines');
      }
    });

    it('should accept valid --split-sentences values', () => {
      const validValues = ['on', 'off', 'nonewlines'];
      for (const value of validValues) {
        try {
          runCLI(`deepl translate "Hello" --to es --split-sentences ${value}`, { stdio: 'pipe' });
        } catch (error: any) {
          const output = error.stderr || error.stdout || '';
          expect(output).not.toMatch(/invalid.*Allowed choices/i);
        }
      }
    });

    it('should show choices in help text for constrained options', () => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toMatch(/--formality.*choices/is);
      expect(helpOutput).toMatch(/--tag-handling.*choices/is);
      expect(helpOutput).toMatch(/--model-type.*choices/is);
      expect(helpOutput).toMatch(/--split-sentences.*choices/is);
    });
  });
});

/**
 * Nock-based HTTP validation tests for the translate command integration path.
 *
 * These tests exercise the full path from TranslationService through DeepLClient
 * to HTTP (intercepted by nock), validating the request structure that the CLI
 * translate command produces. The TranslateCommand class itself cannot be imported
 * directly in Jest due to ESM-only dependencies (ora), so we test at the service
 * layer which is the next integration point below the command handler.
 *
 * Path validated: TranslationService -> DeepLClient -> TranslationClient -> HTTP (nock)
 */
describe('Translate CLI Integration - nock HTTP validation', () => {
  const FREE_API_URL = DEEPL_FREE_API_URL;
  const API_KEY = 'test-nock-key:fx';

  let client: import('../../src/api/deepl-client.js').DeepLClient;
  let mockConfig: import('../../src/storage/config.js').ConfigService;
  let mockCache: import('../../src/storage/cache.js').CacheService;
  let translationService: import('../../src/services/translation.js').TranslationService;

  // Dynamically imported constructors
  let DeepLClient: typeof import('../../src/api/deepl-client.js').DeepLClient;
  let TranslationService: typeof import('../../src/services/translation.js').TranslationService;

  beforeAll(async () => {
    ({ DeepLClient } = await import('../../src/api/deepl-client.js'));
    ({ TranslationService } = await import('../../src/services/translation.js'));
  });

  beforeEach(() => {
    client = new DeepLClient(API_KEY);

    mockConfig = {
      get: () => ({
        auth: {},
        api: { baseUrl: '', usePro: false },
        defaults: { targetLangs: [], formality: 'default', preserveFormatting: false },
        cache: { enabled: false },
        output: { format: 'text', color: false },
        proxy: {},
      }),
      getValue: () => undefined,
    } as unknown as import('../../src/storage/config.js').ConfigService;

    mockCache = {
      get: jest.fn(() => null),
      set: jest.fn(),
    } as unknown as import('../../src/storage/cache.js').CacheService;

    translationService = new TranslationService(client, mockConfig, mockCache);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should POST to /v2/translate with correct text and target_lang', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.text).toBe('Hello');
        expect(body.target_lang).toBe('ES');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    const result = await translationService.translate('Hello', { targetLang: 'es' as any });

    expect(result.text).toBe('Hola');
    expect(scope.isDone()).toBe(true);
  });

  it('should include source_lang when --from is specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.source_lang).toBe('EN');
        expect(body.target_lang).toBe('ES');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', { targetLang: 'es' as any, sourceLang: 'en' as any });

    expect(scope.isDone()).toBe(true);
  });

  it('should include formality when --formality is specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.formality).toBe('more');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', { targetLang: 'es' as any, formality: 'more' });

    expect(scope.isDone()).toBe(true);
  });

  it('should include preserve_formatting when --preserve-formatting is specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.preserve_formatting).toBe('1');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', { targetLang: 'es' as any, preserveFormatting: true });

    expect(scope.isDone()).toBe(true);
  });

  it('should include context when --context is specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.context).toBe('greeting');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', { targetLang: 'es' as any, context: 'greeting' });

    expect(scope.isDone()).toBe(true);
  });

  it('should include split_sentences when --split-sentences is specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.split_sentences).toBe('nonewlines');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', { targetLang: 'es' as any, splitSentences: 'nonewlines' });

    expect(scope.isDone()).toBe(true);
  });

  it('should include tag_handling when --tag-handling is specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.tag_handling).toBe('html');
        return true;
      })
      .reply(200, {
        translations: [{ text: '<p>Hola</p>', detected_source_language: 'EN' }],
      });

    await translationService.translate('<p>Hello</p>', { targetLang: 'es' as any, tagHandling: 'html' });

    expect(scope.isDone()).toBe(true);
  });

  it('should include model_type when --model-type is specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.model_type).toBe('quality_optimized');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', { targetLang: 'es' as any, modelType: 'quality_optimized' });

    expect(scope.isDone()).toBe(true);
  });

  it('should include show_billed_characters when --show-billed-characters is specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.show_billed_characters).toBe('1');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN', billed_characters: 5 }],
      });

    const result = await translationService.translate('Hello', {
      targetLang: 'es' as any,
      showBilledCharacters: true,
    });

    expect(result.text).toBe('Hola');
    expect(result.billedCharacters).toBe(5);
    expect(scope.isDone()).toBe(true);
  });

  it('should return valid JSON-serializable result with correct fields', async () => {
    nock(FREE_API_URL)
      .post('/v2/translate')
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    const result = await translationService.translate('Hello', { targetLang: 'es' as any });

    const json = JSON.parse(JSON.stringify(result));
    expect(json.text).toBe('Hola');
    expect(json.detectedSourceLang).toBe('en');
  });

  it('should correctly return translated text from API response', async () => {
    nock(FREE_API_URL)
      .post('/v2/translate')
      .reply(200, {
        translations: [{ text: 'Bonjour le monde', detected_source_language: 'EN' }],
      });

    const result = await translationService.translate('Hello world', { targetLang: 'fr' as any });

    expect(result.text).toBe('Bonjour le monde');
  });

  it('should send multiple parameters together in a single request', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.text).toBe('Hello world');
        expect(body.target_lang).toBe('DE');
        expect(body.source_lang).toBe('EN');
        expect(body.formality).toBe('less');
        expect(body.context).toBe('casual conversation');
        expect(body.model_type).toBe('quality_optimized');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hallo Welt', detected_source_language: 'EN' }],
      });

    const result = await translationService.translate('Hello world', {
      targetLang: 'de' as any,
      sourceLang: 'en' as any,
      formality: 'less',
      context: 'casual conversation',
      modelType: 'quality_optimized',
    });

    expect(result.text).toBe('Hallo Welt');
    expect(scope.isDone()).toBe(true);
  });

  it('should handle 403 authentication errors gracefully', async () => {
    nock(FREE_API_URL)
      .post('/v2/translate')
      .reply(403, { message: 'Authorization failed' });

    await expect(
      translationService.translate('Hello', { targetLang: 'es' as any })
    ).rejects.toThrow(/Authentication failed/);
  });

  it('should handle 429 rate limit errors', async () => {
    nock(FREE_API_URL)
      .post('/v2/translate')
      .times(4)
      .reply(429, { message: 'Too many requests' });

    await expect(
      translationService.translate('Hello', { targetLang: 'es' as any })
    ).rejects.toThrow(/Rate limit exceeded/);
  });

  it('should use Authorization header with DeepL-Auth-Key', async () => {
    const scope = nock(FREE_API_URL, {
      reqheaders: {
        'authorization': `DeepL-Auth-Key ${API_KEY}`,
      },
    })
      .post('/v2/translate')
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', { targetLang: 'es' as any });

    expect(scope.isDone()).toBe(true);
  });

  it('should use form-encoded content type', async () => {
    const scope = nock(FREE_API_URL, {
      reqheaders: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    })
      .post('/v2/translate')
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', { targetLang: 'es' as any });

    expect(scope.isDone()).toBe(true);
  });

  it('should include custom_instructions when specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.custom_instructions).toEqual(['Use informal tone', 'Keep it short']);
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', {
      targetLang: 'es' as any,
      customInstructions: ['Use informal tone', 'Keep it short'],
    });

    expect(scope.isDone()).toBe(true);
  });

  it('should include style_id when specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.style_id).toBe('abc-123-def');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', {
      targetLang: 'es' as any,
      styleId: 'abc-123-def',
    });

    expect(scope.isDone()).toBe(true);
  });

  it('should include enable_beta_languages when specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.enable_beta_languages).toBe('1');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', {
      targetLang: 'es' as any,
      enableBetaLanguages: true,
    });

    expect(scope.isDone()).toBe(true);
  });

  it('should include XML tag handling parameters when specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.tag_handling).toBe('xml');
        expect(body.outline_detection).toBe('0');
        expect(body.splitting_tags).toBe('br,hr');
        expect(body.non_splitting_tags).toBe('code,pre');
        expect(body.ignore_tags).toBe('script,style');
        return true;
      })
      .reply(200, {
        translations: [{ text: '<p>Hola</p>', detected_source_language: 'EN' }],
      });

    await translationService.translate('<p>Hello</p>', {
      targetLang: 'es' as any,
      tagHandling: 'xml',
      outlineDetection: false,
      splittingTags: ['br', 'hr'],
      nonSplittingTags: ['code', 'pre'],
      ignoreTags: ['script', 'style'],
    });

    expect(scope.isDone()).toBe(true);
  });

  it('should include tag_handling_version when specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.tag_handling).toBe('html');
        expect(body.tag_handling_version).toBe('v2');
        return true;
      })
      .reply(200, {
        translations: [{ text: '<p>Hola</p>', detected_source_language: 'EN' }],
      });

    await translationService.translate('<p>Hello</p>', {
      targetLang: 'es' as any,
      tagHandling: 'html',
      tagHandlingVersion: 'v2',
    });

    expect(scope.isDone()).toBe(true);
  });

  it('should parse model_type_used from response', async () => {
    nock(FREE_API_URL)
      .post('/v2/translate')
      .reply(200, {
        translations: [{
          text: 'Hola',
          detected_source_language: 'EN',
          model_type_used: 'quality_optimized',
        }],
      });

    const result = await translationService.translate('Hello', { targetLang: 'es' as any });

    expect(result.text).toBe('Hola');
    expect(result.modelTypeUsed).toBe('quality_optimized');
  });

  it('should parse detected_source_language from response', async () => {
    nock(FREE_API_URL)
      .post('/v2/translate')
      .reply(200, {
        translations: [{
          text: 'Hola',
          detected_source_language: 'EN',
        }],
      });

    const result = await translationService.translate('Hello', { targetLang: 'es' as any });

    expect(result.detectedSourceLang).toBe('en');
  });

  it('should include glossary_id when specified', async () => {
    const scope = nock(FREE_API_URL)
      .post('/v2/translate', (body) => {
        expect(body.glossary_id).toBe('gl-abc-123');
        return true;
      })
      .reply(200, {
        translations: [{ text: 'Hola', detected_source_language: 'EN' }],
      });

    await translationService.translate('Hello', {
      targetLang: 'es' as any,
      glossaryId: 'gl-abc-123',
    });

    expect(scope.isDone()).toBe(true);
  });
});
