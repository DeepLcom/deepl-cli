/**
 * Tests for Cache Service
 * Following TDD approach - RED phase
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CacheService } from '../../src/storage/cache';

describe('CacheService', () => {
  let cacheService: CacheService;
  let testCacheDir: string;
  let testCachePath: string;

  beforeEach(() => {
    // Create temporary cache directory
    testCacheDir = path.join(os.tmpdir(), `deepl-cli-test-${Date.now()}`);
    testCachePath = path.join(testCacheDir, 'cache.db');

    // Ensure directory exists before creating cache service
    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir, { recursive: true });
    }

    // Create cache service with test path
    cacheService = new CacheService({ dbPath: testCachePath, maxSize: 1024 * 100 }); // 100KB for tests
  });

  afterEach(() => {
    // Cleanup
    if (cacheService) {
      cacheService.close();
    }
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create a new CacheService instance', () => {
      expect(cacheService).toBeInstanceOf(CacheService);
    });

    it('should create database file', () => {
      expect(fs.existsSync(testCachePath)).toBe(true);
    });

    it('should create cache directory if it does not exist', () => {
      expect(fs.existsSync(testCacheDir)).toBe(true);
    });

    it('should initialize with default settings', () => {
      const stats = cacheService.stats();
      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.enabled).toBe(true);
    });
  });

  describe('get()', () => {
    it('should return null for non-existent key', () => {
      const value = cacheService.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should retrieve cached value', () => {
      cacheService.set('test-key', { text: 'Hello' });
      const value = cacheService.get('test-key');
      expect(value).toEqual({ text: 'Hello' });
    });

    it('should return null when cache is disabled', () => {
      cacheService.set('test-key', { text: 'Hello' });
      cacheService.disable();
      const value = cacheService.get('test-key');
      expect(value).toBeNull();
    });

    it('should handle expired entries', async () => {
      const shortTTL = 100; // 100ms
      const service = new CacheService({ dbPath: testCachePath, ttl: shortTTL });

      service.set('test-key', { text: 'Hello' });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const value = service.get('test-key');
      expect(value).toBeNull();

      service.close();
    });
  });

  describe('set()', () => {
    it('should store value in cache', () => {
      cacheService.set('test-key', { text: 'Hello' });
      const value = cacheService.get('test-key');
      expect(value).toEqual({ text: 'Hello' });
    });

    it('should update existing key', () => {
      cacheService.set('test-key', { text: 'Hello' });
      cacheService.set('test-key', { text: 'Updated' });
      const value = cacheService.get('test-key');
      expect(value).toEqual({ text: 'Updated' });
    });

    it('should not store when cache is disabled', () => {
      cacheService.disable();
      cacheService.set('test-key', { text: 'Hello' });
      cacheService.enable();
      const value = cacheService.get('test-key');
      expect(value).toBeNull();
    });

    it('should handle complex objects', () => {
      const complexObj = {
        text: 'Hello',
        meta: { lang: 'es', formality: 'more' },
        translations: ['Hola', 'Buenos días'],
      };
      cacheService.set('complex', complexObj);
      const value = cacheService.get('complex');
      expect(value).toEqual(complexObj);
    });

    it('should track entry size correctly', () => {
      cacheService.set('test', { text: 'Hello' });
      const stats = cacheService.stats();
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe('clear()', () => {
    it('should remove all cached entries', () => {
      cacheService.set('key1', { text: 'Value 1' });
      cacheService.set('key2', { text: 'Value 2' });
      cacheService.clear();

      const value1 = cacheService.get('key1');
      const value2 = cacheService.get('key2');

      expect(value1).toBeNull();
      expect(value2).toBeNull();
    });

    it('should reset stats after clear', () => {
      cacheService.set('key1', { text: 'Value 1' });
      cacheService.clear();

      const stats = cacheService.stats();
      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('stats()', () => {
    it('should return cache statistics', () => {
      const stats = cacheService.stats();
      expect(stats).toHaveProperty('entries');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('enabled');
    });

    it('should track number of entries', () => {
      cacheService.set('key1', { text: 'Value 1' });
      cacheService.set('key2', { text: 'Value 2' });

      const stats = cacheService.stats();
      expect(stats.entries).toBe(2);
    });

    it('should calculate total size', () => {
      cacheService.set('key1', { text: 'Small' });
      cacheService.set('key2', { text: 'A much longer text value' });

      const stats = cacheService.stats();
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('should show maxSize configuration', () => {
      const stats = cacheService.stats();
      expect(stats.maxSize).toBe(1024 * 100); // 100KB from beforeEach
    });
  });

  describe('enable() / disable()', () => {
    it('should enable cache', () => {
      cacheService.disable();
      cacheService.enable();
      const stats = cacheService.stats();
      expect(stats.enabled).toBe(true);
    });

    it('should disable cache', () => {
      cacheService.disable();
      const stats = cacheService.stats();
      expect(stats.enabled).toBe(false);
    });

    it('should prevent caching when disabled', () => {
      cacheService.disable();
      cacheService.set('test', { text: 'Hello' });
      cacheService.enable();
      const value = cacheService.get('test');
      expect(value).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when cache is full', () => {
      // Fill cache to capacity
      const largeValue = { text: 'x'.repeat(1000) }; // ~1KB per entry

      // Fill cache completely
      for (let i = 0; i < 150; i++) {
        cacheService.set(`key-${i}`, largeValue);
      }

      const stats = cacheService.stats();

      // Cache should be at or under max size
      expect(stats.totalSize).toBeLessThanOrEqual(stats.maxSize);

      // Some entries should have been evicted (can't fit all 150)
      expect(stats.entries).toBeLessThan(150);

      // Oldest entries should be gone, newest should exist
      const veryOldEntry = cacheService.get('key-0');
      const recentEntry = cacheService.get('key-149');

      expect(veryOldEntry).toBeNull();
      expect(recentEntry).toBeDefined();
    });

    it('should maintain cache size under maxSize', () => {
      const largeValue = { text: 'x'.repeat(1000) };

      for (let i = 0; i < 150; i++) {
        cacheService.set(`key-${i}`, largeValue);
      }

      const stats = cacheService.stats();
      expect(stats.totalSize).toBeLessThanOrEqual(stats.maxSize);
    });

    it('should evict multiple entries if needed', () => {
      // Fill cache completely
      for (let i = 0; i < 100; i++) {
        cacheService.set(`key-${i}`, { text: 'x'.repeat(1000) });
      }

      // Add very large entry that should require evicting multiple small ones
      cacheService.set('huge', { text: 'x'.repeat(30000) }); // ~30KB

      const statsAfter = cacheService.stats();

      // Cache should still be under max size
      expect(statsAfter.totalSize).toBeLessThanOrEqual(statsAfter.maxSize);

      // Large entry should exist
      const largeEntry = cacheService.get('huge');
      expect(largeEntry).toBeDefined();

      // At least some old entries should have been evicted
      const oldEntry = cacheService.get('key-0');
      expect(oldEntry).toBeNull();
    });

    it('should evict entries efficiently without loading all into memory (Issue #9)', () => {
      // Create a cache service with small max size for testing
      const smallCache = new CacheService({
        dbPath: testCachePath,
        maxSize: 10 * 1024, // 10KB
      });

      // Fill cache with many small entries (simulate large cache)
      for (let i = 0; i < 50; i++) {
        smallCache.set(`key-${i}`, { text: 'x'.repeat(200) }); // ~200 bytes each
      }

      const statsBefore = smallCache.stats();

      // Cache should be at capacity
      expect(statsBefore.totalSize).toBeLessThanOrEqual(statsBefore.maxSize);

      // Add new entry that requires eviction
      smallCache.set('new-key', { text: 'x'.repeat(1000) }); // ~1KB

      const statsAfter = smallCache.stats();

      // Cache should still be under max size
      expect(statsAfter.totalSize).toBeLessThanOrEqual(statsAfter.maxSize);

      // New entry should exist
      const newEntry = smallCache.get('new-key');
      expect(newEntry).toBeDefined();

      // Oldest entries should be evicted
      const veryOldEntry = smallCache.get('key-0');
      expect(veryOldEntry).toBeNull();

      // Some recent entries should still exist
      const recentEntry = smallCache.get(`key-${49}`);
      expect(recentEntry).toBeDefined();

      smallCache.close();
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should respect TTL setting', async () => {
      const service = new CacheService({
        dbPath: testCachePath,
        ttl: 100, // 100ms
      });

      service.set('test', { text: 'Hello' });

      // Should exist immediately
      let value = service.get('test');
      expect(value).toBeDefined();

      // Should expire after TTL
      await new Promise(resolve => setTimeout(resolve, 150));
      value = service.get('test');
      expect(value).toBeNull();

      service.close();
    });

    it('should not expire entries when TTL is disabled', async () => {
      const service = new CacheService({
        dbPath: testCachePath,
        ttl: 0, // Disabled
      });

      service.set('test', { text: 'Hello' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const value = service.get('test');
      expect(value).toBeDefined();

      service.close();
    });
  });

  describe('edge cases', () => {
    it('should handle empty values', () => {
      cacheService.set('empty', '');
      const value = cacheService.get('empty');
      expect(value).toBe('');
    });

    it('should handle null values', () => {
      cacheService.set('null', null);
      const value = cacheService.get('null');
      expect(value).toBeNull();
    });

    it('should not cache undefined values (Issue #10)', () => {
      // Undefined values should not be cached (no entry created)
      // This avoids the fragile magic string approach
      cacheService.set('undefined-key', undefined);

      // Should return null (cache miss) since undefined wasn't stored
      const value = cacheService.get('undefined-key');
      expect(value).toBeNull();

      // No cache entry should exist
      const stats = cacheService.stats();
      expect(stats.entries).toBe(0);
    });

    it('should handle very large entries', () => {
      const largeValue = { text: 'x'.repeat(50000) }; // ~50KB
      cacheService.set('large', largeValue);
      const value = cacheService.get('large');
      expect(value).toEqual(largeValue);
    });

    it('should handle special characters in keys', () => {
      const specialKey = 'key:with/special\\chars';
      cacheService.set(specialKey, { text: 'Hello' });
      const value = cacheService.get(specialKey);
      expect(value).toEqual({ text: 'Hello' });
    });

    it('should handle concurrent operations', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve(cacheService.set(`concurrent-${i}`, { value: i })));
      }

      await Promise.all(promises);

      const stats = cacheService.stats();
      expect(stats.entries).toBe(10);
    });

    it('should log warning when cache corruption is detected (Issue #11)', () => {
      // Mock console.warn to verify logging
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Manually insert corrupted data into the cache database
      // This simulates cache corruption that could happen due to:
      // - Database corruption
      // - Incomplete writes
      // - Concurrent modifications
      const db = (cacheService as any).db;
      const timestamp = Date.now();
      db.prepare(`
        INSERT INTO cache (key, value, timestamp, size)
        VALUES (?, ?, ?, ?)
      `).run('corrupted-key', 'invalid-json-{', timestamp, 15);

      // Attempt to retrieve the corrupted entry
      const value = cacheService.get('corrupted-key');

      // Should return null (entry was removed)
      expect(value).toBeNull();

      // Should have logged a warning about corruption
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls.length).toBeGreaterThan(0);
      const firstCall = consoleWarnSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall![0]).toContain('corruption');
      expect(firstCall![0]).toContain('corrupted-key');

      // Entry should be deleted from cache
      const stats = cacheService.stats();
      expect(stats.entries).toBe(0);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('database cleanup', () => {
    it('should remove expired entries on cleanup', async () => {
      const service = new CacheService({
        dbPath: testCachePath,
        ttl: 100,
      });

      service.set('key1', { text: 'Value 1' });
      service.set('key2', { text: 'Value 2' });

      await new Promise(resolve => setTimeout(resolve, 150));

      // Trigger cleanup by adding new entry
      service.set('key3', { text: 'Value 3' });

      const stats = service.stats();
      expect(stats.entries).toBe(1); // Only key3 should remain

      service.close();
    });
  });

  describe('close()', () => {
    it('should close database connection', () => {
      expect(() => cacheService.close()).not.toThrow();
    });

    it('should allow reopening after close', () => {
      cacheService.close();
      const newService = new CacheService({ dbPath: testCachePath });
      expect(newService).toBeInstanceOf(CacheService);
      newService.close();
    });
  });

  describe('singleton pattern (Issue #4)', () => {
    it('should return same instance on multiple getInstance calls', () => {
      const instance1 = CacheService.getInstance({ dbPath: testCachePath });
      const instance2 = CacheService.getInstance({ dbPath: testCachePath });

      expect(instance1).toBe(instance2);

      instance1.close();
    });

    it('should register exit handlers only once', () => {
      // Spy on process.once to verify handlers are only registered once
      const processOnceSpy = jest.spyOn(process, 'once');

      // Reset the singleton (access private static field via any cast)
      (CacheService as any).instance = null;
      (CacheService as any).handlersRegistered = false;

      // Call getInstance multiple times
      const instance1 = CacheService.getInstance({ dbPath: testCachePath });
      const instance2 = CacheService.getInstance({ dbPath: testCachePath });
      const instance3 = CacheService.getInstance({ dbPath: testCachePath });

      // Should only have registered handlers once (3 calls: exit, SIGINT, SIGTERM)
      expect(processOnceSpy).toHaveBeenCalledTimes(3);

      // All instances should be the same
      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);

      processOnceSpy.mockRestore();
      instance1.close();
    });

    it('should create new instance after close', () => {
      const instance1 = CacheService.getInstance({ dbPath: testCachePath });
      instance1.close();

      const instance2 = CacheService.getInstance({ dbPath: testCachePath });

      // Should be a different instance since first was closed
      expect(instance1).not.toBe(instance2);

      instance2.close();
    });

    it('should handle rapid getInstance calls without race condition', () => {
      // Reset singleton
      (CacheService as any).instance = null;
      (CacheService as any).handlersRegistered = false;

      // Spy on handler registration
      const processOnceSpy = jest.spyOn(process, 'once');

      // Simulate rapid calls (even though Node.js is single-threaded,
      // this tests the logic is correct)
      const instances = [];
      for (let i = 0; i < 10; i++) {
        instances.push(CacheService.getInstance({ dbPath: testCachePath }));
      }

      // All should be the same instance
      for (let i = 1; i < instances.length; i++) {
        expect(instances[i]).toBe(instances[0]);
      }

      // Handlers should only be registered once (3 calls: exit, SIGINT, SIGTERM)
      expect(processOnceSpy).toHaveBeenCalledTimes(3);

      processOnceSpy.mockRestore();
      instances[0]?.close();
    });
  });
});
