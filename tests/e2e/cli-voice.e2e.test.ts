/**
 * E2E Tests for Voice CLI Command
 * Tests complete voice command workflows without requiring real API key.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createTestConfigDir, createTestDir, makeRunCLI } from '../helpers';

describe('Voice CLI E2E', () => {
  const testFiles = createTestDir('voice-e2e');
  const testConfig = createTestConfigDir('voice-e2e-config');
  const testDir = testFiles.path;
  const { runCLI, runCLIAll } = makeRunCLI(testConfig.path);

  afterAll(() => {
    testFiles.cleanup();
    testConfig.cleanup();
  });

  describe('Help text', () => {
    it('should display complete help for voice command', () => {
      const output = runCLI('deepl voice --help');

      expect(output).toContain('Translate audio');
      expect(output).toContain('<file>');
      expect(output).toContain('--to');
      expect(output).toContain('--from');
      expect(output).toContain('--formality');
      expect(output).toContain('--glossary');
      expect(output).toContain('--content-type');
      expect(output).toContain('--chunk-size');
      expect(output).toContain('--chunk-interval');
      expect(output).toContain('--no-stream');
      expect(output).toContain('--format');
      expect(output).toContain('--no-reconnect');
      expect(output).toContain('--max-reconnect-attempts');
    });

    it('should show voice in main help', () => {
      const output = runCLI('deepl --help');
      expect(output).toContain('voice');
    });

    it('should show examples in help text', () => {
      const output = runCLI('deepl voice --help');
      expect(output).toContain('Examples:');
      expect(output).toContain('.ogg');
      expect(output).toContain('.mp3');
    });
  });

  describe('Insecure API URL in config', () => {
    // Its own config dir: the point of the test is a poisoned config.json, and
    // the rest of this file shares one.
    it('should reject an http:// base URL rather than sending audio to it', () => {
      const insecureConfig = createTestConfigDir('voice-e2e-insecure');
      const audioFile = path.join(testDir, 'insecure-url.mp3');
      fs.writeFileSync(audioFile, Buffer.alloc(100));
      fs.writeFileSync(
        path.join(insecureConfig.path, 'config.json'),
        JSON.stringify({
          auth: { apiKey: 'test-key-for-url-validation' },
          api: { baseUrl: 'http://evil-server.example.com/v2', usePro: false },
        })
      );
      const { runCLIAll: runInsecure } = makeRunCLI(insecureConfig.path);

      let output: string;
      try {
        output = runInsecure(`deepl voice ${audioFile} --to de`);
      } catch (error) {
        const failure = error as { stdout?: unknown; stderr?: unknown };
        output = String(failure.stdout ?? '') + String(failure.stderr ?? '');
      }
      insecureConfig.cleanup();

      expect(output).toMatch(/Insecure HTTP URL rejected/i);
    });
  });

  describe('Exit codes', () => {
    it('should exit with non-zero when no file argument provided', () => {
      expect.assertions(1);
      try {
        runCLI('deepl voice --to de');
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should exit with non-zero when --to is missing', () => {
      const testFile = path.join(testDir, 'exit-code-test.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      expect.assertions(1);
      try {
        runCLI(`deepl voice ${testFile}`);
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should exit with non-zero when no API key is set', () => {
      const testFile = path.join(testDir, 'exit-code-nokey.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const cleanEnv: Record<string, string | undefined> = {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfig.path,
      };
      delete cleanEnv['DEEPL_API_KEY'];

      try {
        execSync('deepl auth clear', {
          encoding: 'utf-8',
          env: cleanEnv,
          stdio: 'pipe',
        });
      } catch {
        // Ignore
      }

      expect.assertions(1);
      try {
        execSync(`deepl voice ${testFile} --to de`, {
          encoding: 'utf-8',
          env: cleanEnv,
        });
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('Validation before the glossary round trip', () => {
    // Resolving --glossary lists the account's glossaries, so a command that
    // fails locally must fail before that request rather than after it. The
    // config points at a dead port, so a regression that resolved first would
    // report a network error instead of the local rejection.
    const orderConfig = createTestConfigDir('voice-e2e-glossary-order');
    const orderCLI = makeRunCLI(orderConfig.path, { noColor: true });

    beforeAll(() => {
      fs.writeFileSync(
        path.join(orderConfig.path, 'config.json'),
        JSON.stringify({
          auth: { apiKey: 'mock-api-key-for-testing:fx' },
          api: { baseUrl: 'http://127.0.0.1:9/v2', usePro: false },
        })
      );
    });

    afterAll(() => {
      orderConfig.cleanup();
    });

    it('should reject an invalid target language ahead of glossary resolution', () => {
      const testFile = path.join(testDir, 'glossary-order.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const result = orderCLI.runCLIExpectError(
        `deepl voice ${testFile} --to bogus --glossary my-glossary`
      );

      expect(result.status).toBe(6);
      expect(result.output).toContain('Invalid voice target language');
      expect(result.output).not.toMatch(/Network error/);
    });

    it('should reject an invalid content type ahead of glossary resolution', () => {
      const testFile = path.join(testDir, 'glossary-order-ct.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const result = orderCLI.runCLIExpectError(
        `deepl voice ${testFile} --to de --content-type audio/wav --glossary my-glossary`
      );

      expect(result.status).toBe(6);
      expect(result.output).toContain('Invalid voice content type');
      expect(result.output).not.toMatch(/Network error/);
    });
  });

  describe('Error messages', () => {
    it('should show clear error when API key is not set', () => {
      const testFile = path.join(testDir, 'error-msg-test.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const cleanEnv: Record<string, string | undefined> = {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfig.path,
      };
      delete cleanEnv['DEEPL_API_KEY'];

      try {
        execSync('deepl auth clear', {
          encoding: 'utf-8',
          env: cleanEnv,
          stdio: 'pipe',
        });
      } catch {
        // Ignore
      }

      expect.assertions(1);
      try {
        execSync(`deepl voice ${testFile} --to de 2>&1`, {
          encoding: 'utf-8',
          env: cleanEnv,
          shell: '/bin/sh',
        });
      } catch (error: any) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|not set/i);
      }
    });

    it('should show error for missing --to flag', () => {
      const testFile = path.join(testDir, 'error-to-test.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      expect.assertions(1);
      try {
        runCLIAll(`deepl voice ${testFile}`);
      } catch (error: any) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/target language|--to/i);
      }
    });
  });

  describe('Format validation', () => {
    it('should accept --format text without commander error', () => {
      const testFile = path.join(testDir, 'format-text.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const cleanEnv: Record<string, string | undefined> = {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfig.path,
      };
      delete cleanEnv['DEEPL_API_KEY'];

      expect.assertions(1);
      try {
        execSync(`deepl voice ${testFile} --to de --format text 2>&1`, {
          encoding: 'utf-8',
          env: cleanEnv,
          shell: '/bin/sh',
        });
      } catch (error: any) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const output = error.stderr || error.stdout;
        // Should fail at auth, not at format validation
        expect(output).toMatch(/API key|not set|auth/i);
      }
    });

    it('should accept --format json without commander error', () => {
      const testFile = path.join(testDir, 'format-json.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const cleanEnv: Record<string, string | undefined> = {
        ...process.env,
        DEEPL_CONFIG_DIR: testConfig.path,
      };
      delete cleanEnv['DEEPL_API_KEY'];

      expect.assertions(1);
      try {
        execSync(`deepl voice ${testFile} --to de --format json 2>&1`, {
          encoding: 'utf-8',
          env: cleanEnv,
          shell: '/bin/sh',
        });
      } catch (error: any) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/API key|not set|auth/i);
      }
    });

    it('should reject invalid --format values', () => {
      const testFile = path.join(testDir, 'format-invalid.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      expect.assertions(1);
      try {
        runCLI(`deepl voice ${testFile} --to de --format xml`);
        throw new Error('Should have thrown');
      } catch (error: any) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/text|json|choices|allowed/i);
      }
    });
  });

  describe('Formality validation', () => {
    it('should reject invalid formality levels', () => {
      const testFile = path.join(testDir, 'formality-invalid.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      expect.assertions(1);
      try {
        runCLI(`deepl voice ${testFile} --to de --formality extreme`);
        throw new Error('Should have thrown');
      } catch (error: any) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/choices|allowed|more|less/i);
      }
    });
  });
});
