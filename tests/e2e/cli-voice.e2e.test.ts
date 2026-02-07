/**
 * E2E Tests for Voice CLI Command
 * Tests complete voice command workflows without requiring real API key.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Voice CLI E2E', () => {
  const testDir = path.join(os.tmpdir(), `.deepl-cli-voice-e2e-${Date.now()}`);
  const testConfigDir = path.join(os.tmpdir(), `.deepl-cli-voice-e2e-config-${Date.now()}`);

  const runCLI = (command: string): string => {
    return execSync(command, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
    });
  };

  const runCLIAll = (command: string): string => {
    return execSync(`${command} 2>&1`, {
      encoding: 'utf-8',
      env: { ...process.env, DEEPL_CONFIG_DIR: testConfigDir },
      shell: '/bin/sh',
    });
  };

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
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

  describe('Exit codes', () => {
    it('should exit with non-zero when no file argument provided', () => {
      expect.assertions(1);
      try {
        runCLI('deepl voice --to de');
        fail('Should have thrown');
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
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should exit with non-zero when no API key is set', () => {
      const testFile = path.join(testDir, 'exit-code-nokey.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const cleanEnv: Record<string, string | undefined> = { ...process.env, DEEPL_CONFIG_DIR: testConfigDir };
      delete cleanEnv['DEEPL_API_KEY'];

      try {
        execSync('deepl auth clear', { encoding: 'utf-8', env: cleanEnv, stdio: 'pipe' });
      } catch {
        // Ignore
      }

      expect.assertions(1);
      try {
        execSync(`deepl voice ${testFile} --to de`, { encoding: 'utf-8', env: cleanEnv });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('Error messages', () => {
    it('should show clear error when API key is not set', () => {
      const testFile = path.join(testDir, 'error-msg-test.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const cleanEnv: Record<string, string | undefined> = { ...process.env, DEEPL_CONFIG_DIR: testConfigDir };
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
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/target language|--to/i);
      }
    });
  });

  describe('Format validation', () => {
    it('should accept --format text without commander error', () => {
      const testFile = path.join(testDir, 'format-text.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const cleanEnv: Record<string, string | undefined> = { ...process.env, DEEPL_CONFIG_DIR: testConfigDir };
      delete cleanEnv['DEEPL_API_KEY'];

      expect.assertions(1);
      try {
        execSync(`deepl voice ${testFile} --to de --format text 2>&1`, {
          encoding: 'utf-8',
          env: cleanEnv,
          shell: '/bin/sh',
        });
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        // Should fail at auth, not at format validation
        expect(output).toMatch(/API key|not set|auth/i);
      }
    });

    it('should accept --format json without commander error', () => {
      const testFile = path.join(testDir, 'format-json.mp3');
      fs.writeFileSync(testFile, Buffer.alloc(100));

      const cleanEnv: Record<string, string | undefined> = { ...process.env, DEEPL_CONFIG_DIR: testConfigDir };
      delete cleanEnv['DEEPL_API_KEY'];

      expect.assertions(1);
      try {
        execSync(`deepl voice ${testFile} --to de --format json 2>&1`, {
          encoding: 'utf-8',
          env: cleanEnv,
          shell: '/bin/sh',
        });
      } catch (error: any) {
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
        fail('Should have thrown');
      } catch (error: any) {
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
        fail('Should have thrown');
      } catch (error: any) {
        const output = error.stderr || error.stdout;
        expect(output).toMatch(/choices|allowed|more|less/i);
      }
    });
  });
});
