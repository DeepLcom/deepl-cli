/**
 * E2E Tests for --no-input Global Flag
 * Tests full CLI invocations verifying exit codes and error messages
 */

import { execSync } from 'child_process';

describe('--no-input E2E', () => {
  describe('help output', () => {
    it('should show --no-input in global help', () => {
      const output = execSync('deepl --help', { encoding: 'utf-8' });

      expect(output).toContain('--no-input');
    });
  });

  describe('cache clear', () => {
    it('should exit 0 and abort when --no-input is used without --yes', () => {
      const output = execSync('deepl --no-input cache clear 2>&1', {
        encoding: 'utf-8',
        shell: '/bin/sh',
      });

      expect(output).toContain('Aborted.');
    });
  });

  describe('init', () => {
    it('should exit with code 6 when --no-input is used', () => {
      expect.assertions(2);
      try {
        execSync('deepl --no-input init', { encoding: 'utf-8', stdio: 'pipe' });
      } catch (error: any) {
        expect(error.status).toBe(6);
        expect(error.stderr.toString()).toContain('not supported in non-interactive mode');
      }
    });
  });

  describe('write --interactive', () => {
    it('should exit with code 6 when --no-input is used', () => {
      expect.assertions(2);
      try {
        execSync('deepl --no-input write "test" --interactive', { encoding: 'utf-8', stdio: 'pipe' });
      } catch (error: any) {
        expect(error.status).toBe(6);
        expect(error.stderr.toString()).toContain('not supported in non-interactive mode');
      }
    });
  });
});
