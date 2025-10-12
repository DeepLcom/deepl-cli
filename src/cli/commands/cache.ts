/**
 * Cache Command
 * Manages translation cache
 */

import { CacheService } from '../../storage/cache.js';
import { ConfigService } from '../../storage/config.js';

interface CacheStats {
  entries: number;
  totalSize: number;
  maxSize: number;
  enabled: boolean;
}

export class CacheCommand {
  private cache: CacheService;
  private config: ConfigService;

  constructor(cache: CacheService, config: ConfigService) {
    this.cache = cache;
    this.config = config;
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<CacheStats> {
    return this.cache.stats();
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Enable cache with optional max size
   */
  async enable(maxSize?: number): Promise<void> {
    // Set max size if provided
    if (maxSize !== undefined) {
      this.config.set('cache.maxSize', maxSize);
      this.cache.setMaxSize(maxSize);
    }

    // Enable cache
    this.cache.enable();
  }

  /**
   * Disable cache
   */
  async disable(): Promise<void> {
    this.cache.disable();
  }

  /**
   * Format cache statistics for display
   */
  formatStats(stats: CacheStats): string {
    const totalSizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
    const maxSizeMB = (stats.maxSize / (1024 * 1024)).toFixed(2);
    const status = stats.enabled ? 'enabled' : 'disabled';
    const percentUsed = stats.maxSize > 0
      ? ((stats.totalSize / stats.maxSize) * 100).toFixed(1)
      : '0.0';

    return [
      `Cache Status: ${status}`,
      `Entries: ${stats.entries}`,
      `Size: ${totalSizeMB} MB / ${maxSizeMB} MB (${percentUsed}% used)`,
    ].join('\n');
  }
}
