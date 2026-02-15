/**
 * Integration Tests for Voice CLI Command
 * Tests the voice command CLI behavior, argument validation, and error handling.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir, makeRunCLI } from '../helpers';

describe('Voice CLI Integration', () => {
  const testConfig = createTestConfigDir('voice');
  const testFiles = createTestDir('voice-files');
  const testDir = testFiles.path;
  const { runCLI } = makeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
    testFiles.cleanup();
  });

  describe('deepl voice --help', () => {
    it('should display help for voice command', () => {
      const output = runCLI('deepl voice --help');

      expect(output).toContain('Usage:');
      expect(output).toContain('deepl voice');
      expect(output).toContain('Translate audio');
      expect(output).toContain('--to');
      expect(output).toContain('--from');
      expect(output).toContain('--formality');
      expect(output).toContain('--glossary');
      expect(output).toContain('--content-type');
      expect(output).toContain('--chunk-size');
      expect(output).toContain('--chunk-interval');
      expect(output).toContain('--no-stream');
      expect(output).toContain('--format');
    });

    it('should show usage examples in help text', () => {
      const output = runCLI('deepl voice --help');

      expect(output).toContain('Examples:');
      expect(output).toContain('recording.ogg');
      expect(output).toContain('--to de');
    });

    it('should show format choices', () => {
      const output = runCLI('deepl voice --help');

      expect(output).toContain('text');
      expect(output).toContain('json');
    });

    it('should show reconnection options in help', () => {
      const output = runCLI('deepl voice --help');

      expect(output).toContain('--no-reconnect');
      expect(output).toContain('--max-reconnect-attempts');
    });

    it('should show formality choices', () => {
      const output = runCLI('deepl voice --help');

      expect(output).toContain('formal');
      expect(output).toContain('more');
      expect(output).toContain('informal');
      expect(output).toContain('less');
    });

  });

  describe('argument validation', () => {
    it('should require a file argument', () => {
      expect.assertions(1);
      try {
        runCLI('deepl voice --to de', { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/missing|required|argument/i);
      }
    });

    it('should require --to flag', () => {
      const testFile = path.join(testDir, 'test.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      expect.assertions(1);
      try {
        runCLI(`deepl voice ${testFile}`, { stdio: 'pipe' });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/target language|--to/i);
      }
    });
  });

  describe('deepl voice without API key', () => {
    it('should fail when no API key is available', () => {
      const testFile = path.join(testDir, 'test-noauth.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      try {
        runCLI('deepl auth clear', { excludeApiKey: true });
      } catch {
        // Ignore
      }

      expect.assertions(1);
      try {
        runCLI(`deepl voice ${testFile} --to de`, { excludeApiKey: true });
      } catch (error: any) {
        const output = error.stderr ?? error.stdout;
        expect(output).toMatch(/API key|auth|not set/i);
      }
    });
  });

  describe('voice appears in main help', () => {
    it('should list voice command in main help', () => {
      const output = runCLI('deepl --help');
      expect(output).toContain('voice');
    });
  });
});
