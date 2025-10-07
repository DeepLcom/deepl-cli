/**
 * Tests for Cache Command
 * Following TDD approach - RED phase
 */

import { CacheCommand } from '../../src/cli/commands/cache';
import { CacheService } from '../../src/storage/cache';

// Mock CacheService
jest.mock('../../src/storage/cache');

describe('CacheCommand', () => {
  let cacheCommand: CacheCommand;
  let mockCacheService: jest.Mocked<CacheService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock CacheService
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
      stats: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<CacheService>;

    cacheCommand = new CacheCommand(mockCacheService);
  });

  describe('stats()', () => {
    it('should return cache statistics', async () => {
      mockCacheService.stats.mockReturnValue({
        entries: 10,
        totalSize: 1024 * 50, // 50KB
        maxSize: 1024 * 1024 * 1024, // 1GB
        enabled: true,
      });

      const stats = await cacheCommand.stats();

      expect(stats).toEqual({
        entries: 10,
        totalSize: 1024 * 50,
        maxSize: 1024 * 1024 * 1024,
        enabled: true,
      });
      expect(mockCacheService.stats).toHaveBeenCalledTimes(1);
    });

    it('should return stats when cache is empty', async () => {
      mockCacheService.stats.mockReturnValue({
        entries: 0,
        totalSize: 0,
        maxSize: 1024 * 1024 * 1024,
        enabled: true,
      });

      const stats = await cacheCommand.stats();

      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
    });

    it('should show disabled status', async () => {
      mockCacheService.stats.mockReturnValue({
        entries: 5,
        totalSize: 1024,
        maxSize: 1024 * 1024 * 1024,
        enabled: false,
      });

      const stats = await cacheCommand.stats();

      expect(stats.enabled).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should clear all cache entries', async () => {
      mockCacheService.clear.mockReturnValue(undefined);

      await cacheCommand.clear();

      expect(mockCacheService.clear).toHaveBeenCalledTimes(1);
    });

    it('should not throw error when cache is already empty', async () => {
      mockCacheService.clear.mockReturnValue(undefined);

      await expect(cacheCommand.clear()).resolves.not.toThrow();
    });
  });

  describe('enable()', () => {
    it('should enable cache', async () => {
      mockCacheService.enable.mockReturnValue(undefined);

      await cacheCommand.enable();

      expect(mockCacheService.enable).toHaveBeenCalledTimes(1);
    });

    it('should not throw error if cache is already enabled', async () => {
      mockCacheService.enable.mockReturnValue(undefined);

      await expect(cacheCommand.enable()).resolves.not.toThrow();
    });
  });

  describe('disable()', () => {
    it('should disable cache', async () => {
      mockCacheService.disable.mockReturnValue(undefined);

      await cacheCommand.disable();

      expect(mockCacheService.disable).toHaveBeenCalledTimes(1);
    });

    it('should not throw error if cache is already disabled', async () => {
      mockCacheService.disable.mockReturnValue(undefined);

      await expect(cacheCommand.disable()).resolves.not.toThrow();
    });
  });

  describe('formatStats()', () => {
    it('should format cache statistics for display', () => {
      const stats = {
        entries: 10,
        totalSize: 1024 * 1024 * 50, // 50MB
        maxSize: 1024 * 1024 * 1024, // 1GB
        enabled: true,
      };

      const formatted = cacheCommand.formatStats(stats);

      expect(formatted).toContain('10');
      expect(formatted).toContain('50');
      expect(formatted).toContain('1024');
      expect(formatted).toContain('enabled');
    });

    it('should format bytes to MB', () => {
      const stats = {
        entries: 5,
        totalSize: 1024 * 1024 * 100, // 100MB
        maxSize: 1024 * 1024 * 1024, // 1GB
        enabled: true,
      };

      const formatted = cacheCommand.formatStats(stats);

      expect(formatted).toContain('100');
    });

    it('should format bytes to GB', () => {
      const stats = {
        entries: 5,
        totalSize: 1024 * 1024 * 1024 * 0.5, // 0.5GB
        maxSize: 1024 * 1024 * 1024 * 2, // 2GB
        enabled: true,
      };

      const formatted = cacheCommand.formatStats(stats);

      expect(formatted).toContain('512');
      expect(formatted).toContain('2048');
    });

    it('should show disabled status', () => {
      const stats = {
        entries: 5,
        totalSize: 1024,
        maxSize: 1024 * 1024,
        enabled: false,
      };

      const formatted = cacheCommand.formatStats(stats);

      expect(formatted).toContain('disabled');
    });
  });

  describe('edge cases', () => {
    it('should handle cache service errors gracefully', async () => {
      mockCacheService.stats.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(cacheCommand.stats()).rejects.toThrow('Database error');
    });

    it('should handle very large cache sizes', async () => {
      mockCacheService.stats.mockReturnValue({
        entries: 1000000,
        totalSize: 1024 * 1024 * 1024 * 10, // 10GB
        maxSize: 1024 * 1024 * 1024 * 20, // 20GB
        enabled: true,
      });

      const stats = await cacheCommand.stats();

      expect(stats.entries).toBe(1000000);
    });
  });
});
