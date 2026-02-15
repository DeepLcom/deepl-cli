/**
 * Integration Tests for Translate CLI Command
 * Tests the translate command CLI behavior, argument validation, and error handling
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir, makeRunCLI } from '../helpers';

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
      expect.assertions(1);
      try {
        runCLI('deepl translate "Hello" --to es', { excludeApiKey: true });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
        // Should fail on API key, not argument validation
        expect(output).toMatch(/API key|auth/i);
        expect(output).not.toMatch(/output.*required/i);
      }
    });
  });

  describe('option flags validation', () => {
    it.each([
      { flag: '--from <language>', description: 'Source language' },
      { flag: '--formality <level>', descriptionPattern: /more.*less/i },
      { flag: '--preserve-code', description: 'code blocks' },
      { flag: '--context <text>', description: 'context' },
      { flag: '--split-sentences <mode>', descriptionPattern: /on.*off.*nonewlines/i },
      { flag: '--tag-handling <mode>', descriptionPattern: /xml.*html/i },
      { flag: '--model-type <type>', descriptionPattern: /quality_optimized|latency_optimized/i },
      { flag: '--no-recursive', description: 'subdirectories' },
      { flag: '--pattern <pattern>', description: 'Glob pattern' },
      { flag: '--concurrency <number>', description: 'parallel' },
      { flag: '--api-url <url>', description: 'Custom API endpoint' },
    ])('should accept $flag flag', ({ flag, description, descriptionPattern }) => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain(flag);
      if (description) {
        expect(helpOutput).toContain(description);
      }
      if (descriptionPattern) {
        expect(helpOutput).toMatch(descriptionPattern);
      }
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
      expect(output).toContain('text');
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout ?? error.message;
        // Should not contain unknown option error
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });
  });

  describe('XML tag handling parameters', () => {
    it.each([
      {
        flag: '--outline-detection',
        patterns: [/xml.*structure.*detection/i, /tag-handling.*xml/i],
      },
      {
        flag: '--splitting-tags',
        patterns: [/xml.*tags.*split/i],
      },
      {
        flag: '--non-splitting-tags',
        patterns: [/should not be used to split sentences/i],
        normalizeWhitespace: true,
      },
      {
        flag: '--ignore-tags',
        patterns: [/ignore/i],
      },
    ])('should show $flag flag in help', ({ flag, patterns, normalizeWhitespace }) => {
      const helpOutput = runCLI('deepl translate --help');
      expect(helpOutput).toContain(flag);
      for (const pattern of patterns) {
        const text = normalizeWhitespace ? helpOutput.replace(/\s+/g, ' ') : helpOutput;
        expect(text).toMatch(pattern);
      }
    });

    it.each([
      {
        flag: '--outline-detection',
        args: '--outline-detection true',
      },
      {
        flag: '--splitting-tags',
        args: '--splitting-tags "br,hr,div"',
      },
      {
        flag: '--non-splitting-tags',
        args: '--non-splitting-tags "code,pre"',
      },
      {
        flag: '--ignore-tags',
        args: '--ignore-tags "script,style"',
      },
    ])('should accept $flag flag without error', ({ flag, args }) => {
      try {
        runCLI(`deepl translate "<p>Hello</p>" --to es --tag-handling xml ${args}`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(new RegExp(`unknown.*option.*${flag.replace('--', '')}`, 'i'));
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept all XML tag handling flags together', () => {
      try {
        runCLI('deepl translate "<p>Hello</p>" --to es --tag-handling xml --outline-detection false --splitting-tags "br,hr" --non-splitting-tags "code" --ignore-tags "script"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout ?? error.message;
        // Should not contain invalid format error
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should work with multiple target languages', () => {
      try {
        runCLI('deepl translate "Hello world" --to es,fr,de,ja --format table', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        // Should not reject the format or language combination
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should accept table format with other options', () => {
      try {
        runCLI('deepl translate "Test" --to es,fr --format table --formality more --context "Business email"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        // Should accept combination of options
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept table format with --show-billed-characters', () => {
      try {
        runCLI('deepl translate "Test" --to es,fr,de --format table --show-billed-characters --no-cache', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
        // Should fail on API key, not flag parsing
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept multiple --custom-instruction flags', () => {
      try {
        runCLI('deepl translate "Hello" --to es --custom-instruction "Use informal tone" --custom-instruction "Preserve brand names"', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        // Should fail on API key, not flag parsing
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --custom-instruction with other options', () => {
      try {
        runCLI('deepl translate "Hello" --to es --formality more --custom-instruction "Keep it formal" --model-type quality_optimized', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --style-id with other options', () => {
      try {
        runCLI('deepl translate "Hello" --to es --style-id "abc-123" --formality more', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept --enable-beta-languages with other options', () => {
      try {
        runCLI('deepl translate "Hello" --to es --enable-beta-languages --formality more', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('expanded language support', () => {
    it('should accept extended language codes', () => {
      try {
        runCLI('deepl translate "Hello" --to sw', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        // Should fail on API key, not language validation
        expect(output).not.toMatch(/Invalid target language/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept ES-419 target variant', () => {
      try {
        runCLI('deepl translate "Hello" --to es-419', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/Invalid target language/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept zh-hans and zh-hant variants', () => {
      try {
        runCLI('deepl translate "Hello" --to zh-hans', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/Invalid target language/i);
        expect(output).toMatch(/API key|auth/i);
      }
    });

    it('should accept newly added core languages (he, vi)', () => {
      try {
        runCLI('deepl translate "Hello" --to he', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/Insecure HTTP URL rejected/i);
        expect(output).toMatch(/credential exposure/i);
      }
    });

    it('should accept https:// URLs', () => {
      try {
        runCLIWithKey('deepl translate "Hello" --to es --api-url https://api-free.deepl.com/v2');
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        // Should NOT fail on URL validation; may fail on auth or network
        expect(output).not.toMatch(/Insecure HTTP URL rejected/i);
      }
    });

    it('should allow http://localhost for local testing', () => {
      try {
        runCLIWithKey('deepl translate "Hello" --to es --api-url http://localhost:3000/v2');
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        // Should NOT fail on URL validation; may fail on connection
        expect(output).not.toMatch(/Insecure HTTP URL rejected/i);
      }
    });

    it('should allow http://127.0.0.1 for local testing', () => {
      try {
        runCLIWithKey('deepl translate "Hello" --to es --api-url http://127.0.0.1:5000/v2');
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
        const output = error.stderr ?? error.stdout;
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
          const output = error.stderr ?? error.stdout ?? '';
          expect(output).not.toMatch(/invalid.*Allowed choices/i);
        }
      }
    });

    it('should reject invalid --tag-handling value', () => {
      expect.assertions(5);
      try {
        runCLI('deepl translate "Hello" --to es --tag-handling json', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
          const output = error.stderr ?? error.stdout ?? '';
          expect(output).not.toMatch(/invalid.*Allowed choices/i);
        }
      }
    });

    it('should reject invalid --model-type value', () => {
      expect.assertions(6);
      try {
        runCLI('deepl translate "Hello" --to es --model-type fast', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
          const output = error.stderr ?? error.stdout ?? '';
          expect(output).not.toMatch(/invalid.*Allowed choices/i);
        }
      }
    });

    it('should reject invalid --split-sentences value', () => {
      expect.assertions(6);
      try {
        runCLI('deepl translate "Hello" --to es --split-sentences always', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
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
          const output = error.stderr ?? error.stdout ?? '';
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
