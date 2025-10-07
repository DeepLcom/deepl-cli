/**
 * Integration Tests for Cache CLI Commands
 * Tests cache management with real database operations
 */

import { execSync } from 'child_process';

describe('Cache CLI Integration', () => {
  describe('deepl cache stats', () => {
    it('should show cache statistics', () => {
      const output = execSync('deepl cache stats', { encoding: 'utf-8' });

      // Should contain key metrics
      expect(output).toContain('Cache Status:');
      expect(output).toContain('Entries:');
      expect(output).toContain('Size:');
    });

    it('should show if cache is enabled or disabled', () => {
      const output = execSync('deepl cache stats', { encoding: 'utf-8' });

      // Should show status
      expect(output).toMatch(/Cache Status: (enabled|disabled)/);
    });

    it('should show size in MB and percentage', () => {
      const output = execSync('deepl cache stats', { encoding: 'utf-8' });

      // Should show size format
      expect(output).toMatch(/Size: [\d.]+ MB/);
      expect(output).toMatch(/[\d.]+% used/);
    });
  });

  describe('deepl cache enable', () => {
    it('should enable cache successfully', () => {
      const output = execSync('deepl cache enable', { encoding: 'utf-8' });

      expect(output).toContain('✓ Cache enabled');
    });

    it('should not error if cache already enabled', () => {
      // Enable twice
      execSync('deepl cache enable', { encoding: 'utf-8' });
      const output = execSync('deepl cache enable', { encoding: 'utf-8' });

      expect(output).toContain('✓ Cache enabled');
    });
  });

  describe('deepl cache disable', () => {
    it('should disable cache successfully', () => {
      const output = execSync('deepl cache disable', { encoding: 'utf-8' });

      expect(output).toContain('✓ Cache disabled');
    });

    it('should not error if cache already disabled', () => {
      // Disable twice
      execSync('deepl cache disable', { encoding: 'utf-8' });
      const output = execSync('deepl cache disable', { encoding: 'utf-8' });

      expect(output).toContain('✓ Cache disabled');
    });
  });

  describe('deepl cache clear', () => {
    it('should clear cache successfully', () => {
      const output = execSync('deepl cache clear', { encoding: 'utf-8' });

      expect(output).toContain('✓ Cache cleared successfully');
    });

    it('should not error when cache is empty', () => {
      // Clear twice
      execSync('deepl cache clear', { encoding: 'utf-8' });
      const output = execSync('deepl cache clear', { encoding: 'utf-8' });

      expect(output).toContain('✓ Cache cleared successfully');
    });
  });

  describe('cache workflow', () => {
    it('should handle enable -> clear -> disable workflow', () => {
      // Enable
      const enableOutput = execSync('deepl cache enable', { encoding: 'utf-8' });
      expect(enableOutput).toContain('✓ Cache enabled');

      // Clear
      const clearOutput = execSync('deepl cache clear', { encoding: 'utf-8' });
      expect(clearOutput).toContain('✓ Cache cleared successfully');

      // Stats should show 0 entries
      const statsOutput = execSync('deepl cache stats', { encoding: 'utf-8' });
      expect(statsOutput).toContain('Entries: 0');

      // Disable
      const disableOutput = execSync('deepl cache disable', { encoding: 'utf-8' });
      expect(disableOutput).toContain('✓ Cache disabled');
    });
  });
});
