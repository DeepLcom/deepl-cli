/**
 * Tests for size parsing utility
 */

import { parseSize, formatSize } from '../../src/utils/parse-size';

describe('parseSize()', () => {
  describe('plain numbers (bytes)', () => {
    it('should parse plain number as bytes', () => {
      expect(parseSize('100')).toBe(100);
      expect(parseSize('1024')).toBe(1024);
      expect(parseSize('0')).toBe(0);
    });

    it('should handle whitespace', () => {
      expect(parseSize('  100  ')).toBe(100);
    });

    it('should throw error for negative numbers', () => {
      expect(() => parseSize('-100')).toThrow('Size must be positive');
    });

    it('should throw error for empty string', () => {
      expect(() => parseSize('')).toThrow('Size cannot be empty');
      expect(() => parseSize('   ')).toThrow('Size cannot be empty');
    });
  });

  describe('kilobytes', () => {
    it('should parse K suffix', () => {
      expect(parseSize('1K')).toBe(1024);
      expect(parseSize('10K')).toBe(10 * 1024);
      expect(parseSize('100K')).toBe(100 * 1024);
    });

    it('should parse KB suffix', () => {
      expect(parseSize('1KB')).toBe(1024);
      expect(parseSize('10KB')).toBe(10 * 1024);
      expect(parseSize('100KB')).toBe(100 * 1024);
    });

    it('should handle decimal values', () => {
      expect(parseSize('1.5K')).toBe(Math.floor(1.5 * 1024));
      expect(parseSize('2.5KB')).toBe(Math.floor(2.5 * 1024));
    });

    it('should be case insensitive', () => {
      expect(parseSize('100k')).toBe(100 * 1024);
      expect(parseSize('100kb')).toBe(100 * 1024);
      expect(parseSize('100Kb')).toBe(100 * 1024);
    });
  });

  describe('megabytes', () => {
    it('should parse M suffix', () => {
      expect(parseSize('1M')).toBe(1024 * 1024);
      expect(parseSize('10M')).toBe(10 * 1024 * 1024);
      expect(parseSize('100M')).toBe(100 * 1024 * 1024);
    });

    it('should parse MB suffix', () => {
      expect(parseSize('1MB')).toBe(1024 * 1024);
      expect(parseSize('10MB')).toBe(10 * 1024 * 1024);
      expect(parseSize('100MB')).toBe(100 * 1024 * 1024);
    });

    it('should handle decimal values', () => {
      expect(parseSize('1.5M')).toBe(Math.floor(1.5 * 1024 * 1024));
      expect(parseSize('2.5MB')).toBe(Math.floor(2.5 * 1024 * 1024));
    });
  });

  describe('gigabytes', () => {
    it('should parse G suffix', () => {
      expect(parseSize('1G')).toBe(1024 * 1024 * 1024);
      expect(parseSize('2G')).toBe(2 * 1024 * 1024 * 1024);
    });

    it('should parse GB suffix', () => {
      expect(parseSize('1GB')).toBe(1024 * 1024 * 1024);
      expect(parseSize('2GB')).toBe(2 * 1024 * 1024 * 1024);
    });

    it('should handle decimal values', () => {
      expect(parseSize('1.5G')).toBe(Math.floor(1.5 * 1024 * 1024 * 1024));
    });
  });

  describe('terabytes', () => {
    it('should parse T suffix', () => {
      expect(parseSize('1T')).toBe(1024 * 1024 * 1024 * 1024);
    });

    it('should parse TB suffix', () => {
      expect(parseSize('1TB')).toBe(1024 * 1024 * 1024 * 1024);
    });
  });

  describe('whitespace handling', () => {
    it('should handle whitespace between number and unit', () => {
      expect(parseSize('100 M')).toBe(100 * 1024 * 1024);
      expect(parseSize('100  MB')).toBe(100 * 1024 * 1024);
    });

    it('should trim leading and trailing whitespace', () => {
      expect(parseSize('  100M  ')).toBe(100 * 1024 * 1024);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid format', () => {
      expect(() => parseSize('abc')).toThrow('Invalid size format');
      expect(() => parseSize('100X')).toThrow('Invalid size format');
      expect(() => parseSize('M100')).toThrow('Invalid size format');
    });

    it('should throw error for negative sizes', () => {
      expect(() => parseSize('-1M')).toThrow('Invalid size format');
    });
  });
});

describe('formatSize()', () => {
  it('should format bytes', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(100)).toBe('100 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('should format kilobytes', () => {
    expect(formatSize(1024)).toBe('1.00 KB');
    expect(formatSize(10 * 1024)).toBe('10.00 KB');
    expect(formatSize(1536)).toBe('1.50 KB'); // 1.5 KB
  });

  it('should format megabytes', () => {
    expect(formatSize(1024 * 1024)).toBe('1.00 MB');
    expect(formatSize(10 * 1024 * 1024)).toBe('10.00 MB');
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.50 MB');
  });

  it('should format gigabytes', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatSize(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
    expect(formatSize(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB');
  });
});
