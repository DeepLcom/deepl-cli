/**
 * E2E Tests for translate flag handling
 *
 * Flag-level behaviour of `deepl translate` that the workflow and success-path
 * suites do not reach: directory output requirements, comma-separated targets,
 * XML tag-handling combinations, table output, the removed
 * --enable-beta-languages flag, --api-url scheme enforcement, and rejection of
 * out-of-list values on the constrained options. The choice lists themselves
 * are asserted centrally in tests/unit/docs/documented-surface.test.ts.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir, makeRunCLI } from '../helpers';

describe('Translate CLI flags E2E', () => {
  const testConfig = createTestConfigDir('e2e-translate-flags');
  const testFiles = createTestDir('translate-flag-files');
  const testConfigDir = testConfig.path;
  const testDir = testFiles.path;
  const { runCLI } = makeRunCLI(testConfig.path);

  // Cached to avoid respawning the CLI for every help assertion.
  let translateHelp: string;

  beforeAll(() => {
    translateHelp = runCLI('deepl translate --help');
  });

  afterAll(() => {
    testConfig.cleanup();
    testFiles.cleanup();
  });

  describe('directory translation validation', () => {
    it('should require --output flag for directory translation', () => {
      // Create a test directory with files
      const testSubDir = path.join(testDir, 'subdir');
      fs.mkdirSync(testSubDir, { recursive: true });
      fs.writeFileSync(
        path.join(testSubDir, 'file1.txt'),
        'Content 1',
        'utf-8'
      );

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

      expect.assertions(1);
      try {
        // This will fail without API key, but should recognize valid arguments
        runCLI(
          `deepl translate "${testSubDir2}" --to es --output "${outputDir}"`,
          { stdio: 'pipe' }
        );
        // CLI accepted the arguments without error
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        // Should fail on API key, not argument validation
        expect(output).toMatch(/API key|auth/i);
      }
    });
  });

  describe('multiple target languages', () => {
    it('should accept comma-separated target languages', () => {
      const helpOutput = translateHelp;
      expect(helpOutput).toContain('--to <language>');
      expect(helpOutput).toContain('comma-separated');
    });

    it('should validate comma-separated format', () => {
      // Help should indicate comma-separated format is supported
      const helpOutput = translateHelp;
      expect(helpOutput).toContain('comma-separated');
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
    ])(
      'should show $flag flag in help',
      ({ flag, patterns, normalizeWhitespace }) => {
        const helpOutput = translateHelp;
        expect(helpOutput).toContain(flag);
        for (const pattern of patterns) {
          const text = normalizeWhitespace
            ? helpOutput.replace(/\s+/g, ' ')
            : helpOutput;
          expect(text).toMatch(pattern);
        }
      }
    );

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
      expect.assertions(1);
      try {
        runCLI(
          `deepl translate "<p>Hello</p>" --to es --tag-handling xml ${args}`,
          { stdio: 'pipe' }
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(
          new RegExp(`unknown.*option.*${flag.replace('--', '')}`, 'i')
        );
      }
    });

    it('should accept all XML tag handling flags together', () => {
      expect.assertions(1);
      try {
        runCLI(
          'deepl translate "<p>Hello</p>" --to es --tag-handling xml --outline-detection false --splitting-tags "br,hr" --non-splitting-tags "code" --ignore-tags "script"',
          { stdio: 'pipe' }
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });
  });

  describe('table output format', () => {
    it('should show table format option in help', () => {
      const helpOutput = translateHelp;
      expect(helpOutput).toContain('--format <format>');
      expect(helpOutput).toMatch(/json/i);
    });

    it('should accept --format table flag without error', () => {
      expect.assertions(2);
      try {
        runCLI('deepl translate "Hello" --to es,fr,de --format table', {
          stdio: 'pipe',
        });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/unknown.*format.*table/i);
        expect(output).not.toMatch(/invalid.*format/i);
      }
    });

    it('should recognize table format as valid option', () => {
      expect.assertions(2);
      try {
        runCLI('deepl translate "Test" --to es,fr --format table', {
          stdio: 'pipe',
        });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout ?? error.message;
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should work with multiple target languages', () => {
      expect.assertions(2);
      try {
        runCLI(
          'deepl translate "Hello world" --to es,fr,de,ja --format table',
          { stdio: 'pipe' }
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });

    it('should accept table format with other options', () => {
      expect.assertions(1);
      try {
        runCLI(
          'deepl translate "Test" --to es,fr --format table --formality more --context "Business email"',
          { stdio: 'pipe' }
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/invalid.*format/i);
      }
    });

    it('should accept table format with --show-billed-characters', () => {
      expect.assertions(2);
      try {
        runCLI(
          'deepl translate "Test" --to es,fr,de --format table --show-billed-characters --no-cache',
          { stdio: 'pipe' }
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/invalid.*format/i);
        expect(output).not.toMatch(/unknown.*option/i);
      }
    });
  });

  describe('--enable-beta-languages flag (removed)', () => {
    it('should not appear in help text', () => {
      const result = translateHelp;
      expect(result).not.toContain('--enable-beta-languages');
    });

    it('should be rejected as an unknown option', () => {
      expect.assertions(1);
      try {
        runCLI('deepl translate "Hello" --to es --enable-beta-languages', {
          stdio: 'pipe',
        });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/unknown.*option/i);
      }
    });
  });

  describe('--api-url HTTPS enforcement', () => {
    const runCLIWithKey = (command: string): string => {
      return execSync(command, {
        encoding: 'utf-8',
        timeout: 3000,
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
        runCLIWithKey(
          'deepl translate "Hello" --to es --api-url http://evil-server.com/v2'
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/Insecure HTTP URL rejected/i);
        expect(output).toMatch(/credential exposure/i);
      }
    });

    it('should accept https:// URLs', () => {
      expect.assertions(1);
      try {
        runCLIWithKey(
          'deepl translate "Hello" --to es --api-url https://api-free.deepl.com/v2'
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/Insecure HTTP URL rejected/i);
      }
    });

    it('should allow http://localhost for local testing', () => {
      expect.assertions(1);
      try {
        runCLIWithKey(
          'deepl translate "Hello" --to es --api-url http://localhost:3000/v2'
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/Insecure HTTP URL rejected/i);
      }
    });

    it('should allow http://127.0.0.1 for local testing', () => {
      expect.assertions(1);
      try {
        runCLIWithKey(
          'deepl translate "Hello" --to es --api-url http://127.0.0.1:5000/v2'
        );
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).not.toMatch(/Insecure HTTP URL rejected/i);
      }
    });
  });

  describe('choices validation for enum options', () => {
    it('should reject invalid --formality value', () => {
      expect.assertions(8);
      try {
        runCLI('deepl translate "Hello" --to es --formality super_formal', {
          stdio: 'pipe',
        });
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

    it('should reject invalid --tag-handling value', () => {
      expect.assertions(5);
      try {
        runCLI('deepl translate "Hello" --to es --tag-handling json', {
          stdio: 'pipe',
        });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/--tag-handling/);
        expect(output).toMatch(/invalid/i);
        expect(output).toMatch(/Allowed choices/i);
        expect(output).toContain('xml');
        expect(output).toContain('html');
      }
    });

    it('should reject invalid --model-type value', () => {
      expect.assertions(6);
      try {
        runCLI('deepl translate "Hello" --to es --model-type fast', {
          stdio: 'pipe',
        });
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

    it('should reject invalid --split-sentences value', () => {
      expect.assertions(6);
      try {
        runCLI('deepl translate "Hello" --to es --split-sentences always', {
          stdio: 'pipe',
        });
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

    it('should show choices in help text for constrained options', () => {
      const helpOutput = translateHelp;
      expect(helpOutput).toMatch(/--formality.*choices/is);
      expect(helpOutput).toMatch(/--tag-handling.*choices/is);
      expect(helpOutput).toMatch(/--model-type.*choices/is);
      expect(helpOutput).toMatch(/--split-sentences.*choices/is);
    });
  });
});
