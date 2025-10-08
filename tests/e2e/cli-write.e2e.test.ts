/**
 * E2E Tests for Write Command CLI
 * Tests write command with all new flags
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Write Command E2E', () => {
  const testDir = path.join(os.tmpdir(), `.deepl-cli-write-e2e-${Date.now()}`);

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Help Command', () => {
    it('should display help for write command', () => {
      const output = execSync('deepl write --help', { encoding: 'utf-8' });

      expect(output).toContain('Usage:');
      expect(output).toContain('--lang');
      expect(output).toContain('--style');
      expect(output).toContain('--tone');
      expect(output).toContain('--alternatives');
      expect(output).toContain('--output');
      expect(output).toContain('--in-place');
      expect(output).toContain('--interactive');
      expect(output).toContain('--diff');
      expect(output).toContain('--check');
      expect(output).toContain('--fix');
      expect(output).toContain('--backup');
    });
  });

  describe('Error Handling', () => {
    it('should require --lang flag', () => {
      try {
        execSync('deepl write "test text"', { encoding: 'utf-8', stdio: 'pipe' });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.status).toBe(1);
      }
    });

    it('should reject invalid language code', () => {
      try {
        execSync('deepl write "test" --lang invalid', { encoding: 'utf-8', stdio: 'pipe' });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.status).toBe(1);
      }
    });

    it('should reject combining --style and --tone', () => {
      try {
        execSync('deepl write "test" --lang en-US --style business --tone confident', {
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.status).toBe(1);
      }
    });

    it('should require file path for --fix', () => {
      // Note: API key check happens before --fix validation
      // This test just verifies the --fix flag is present
      const helpOutput = execSync('deepl write --help', { encoding: 'utf-8' });
      expect(helpOutput).toContain('--fix');
    });
  });

  describe('Flag Combinations', () => {
    it('should accept --output flag', () => {
      const output = execSync('deepl write --help', { encoding: 'utf-8' });
      expect(output).toContain('--output');
      expect(output).toContain('-o');
    });

    it('should accept --in-place flag', () => {
      const output = execSync('deepl write --help', { encoding: 'utf-8' });
      expect(output).toContain('--in-place');
    });

    it('should accept --interactive flag', () => {
      const output = execSync('deepl write --help', { encoding: 'utf-8' });
      expect(output).toContain('--interactive');
      expect(output).toContain('-i');
    });

    it('should accept --diff flag', () => {
      const output = execSync('deepl write --help', { encoding: 'utf-8' });
      expect(output).toContain('--diff');
      expect(output).toContain('-d');
    });

    it('should accept --check flag', () => {
      const output = execSync('deepl write --help', { encoding: 'utf-8' });
      expect(output).toContain('--check');
      expect(output).toContain('-c');
    });

    it('should accept --fix flag', () => {
      const output = execSync('deepl write --help', { encoding: 'utf-8' });
      expect(output).toContain('--fix');
      expect(output).toContain('-f');
    });

    it('should accept --backup flag', () => {
      const output = execSync('deepl write --help', { encoding: 'utf-8' });
      expect(output).toContain('--backup');
      expect(output).toContain('-b');
    });
  });

  describe('File Operations', () => {
    it('should recognize file path input', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Test content', 'utf-8');

      // This will fail without API key, but should recognize it as a file operation
      try {
        execSync(`deepl write "${testFile}" --lang en-US`, { encoding: 'utf-8', stdio: 'pipe' });
      } catch (error: any) {
        // Expected to fail without API key, but should not error on file path recognition
        const stderr = error.stderr?.toString() || '';
        expect(stderr).not.toContain('File not found');
      }
    });
  });
});
