/**
 * Cache Service
 * SQLite-based translation cache with LRU eviction
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CacheServiceOptions {
  dbPath?: string;
  maxSize?: number; // in bytes
  ttl?: number; // in milliseconds, 0 = disabled
}

export interface CacheStats {
  entries: number;
  totalSize: number;
  maxSize: number;
  enabled: boolean;
}

interface CacheRow {
  key: string;
  value: string;
  timestamp: number;
  size: number;
}

const DEFAULT_MAX_SIZE = 1024 * 1024 * 1024; // 1GB
const DEFAULT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export class CacheService {
  private static instance: CacheService | null = null;
  private static handlersRegistered: boolean = false;
  private db: Database.Database;
  private maxSize: number;
  private ttl: number;
  private enabled: boolean = true;
  private isClosed: boolean = false;

  constructor(options: CacheServiceOptions = {}) {
    const dbPath = options.dbPath ?? path.join(os.homedir(), '.deepl-cli', 'cache.db');
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.ttl = options.ttl ?? DEFAULT_TTL;

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initialize();
  }

  /**
   * Get singleton cache instance
   * Uses a shared instance to prevent resource leaks
   * Fix for Issue #4: Improved defensive programming with atomic handler registration
   */
  static getInstance(options?: CacheServiceOptions): CacheService {
    // Check if we need to create a new instance
    const needsNewInstance = !CacheService.instance || CacheService.instance.isClosed;

    // Register handlers atomically before instance creation for defensive programming
    // Set flag first to prevent any theoretical race conditions (even though Node.js is single-threaded)
    const needsHandlerRegistration = needsNewInstance && !CacheService.handlersRegistered;
    if (needsHandlerRegistration) {
      // Set flag immediately to make the operation atomic
      CacheService.handlersRegistered = true;
    }

    // Create instance if needed
    if (needsNewInstance) {
      CacheService.instance = new CacheService(options);
    }

    // Register cleanup handlers only once to prevent memory leaks
    // This happens after instance creation to ensure instance exists
    if (needsHandlerRegistration) {
      // Register cleanup on process exit (use 'once' to prevent duplicate handlers)
      process.once('exit', () => {
        CacheService.instance?.close();
      });

      // Handle unexpected termination
      process.once('SIGINT', () => {
        CacheService.instance?.close();
        process.exit(0);
      });

      process.once('SIGTERM', () => {
        CacheService.instance?.close();
        process.exit(0);
      });
    }

    // Instance is guaranteed to exist at this point (either already existed or just created)
    return CacheService.instance!;
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        size INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON cache(timestamp);
    `);
  }

  /**
   * Get value from cache
   */
  get(key: string): unknown {
    if (!this.enabled) {
      return null;
    }

    // Clean up expired entries first
    this.cleanupExpired();

    const stmt = this.db.prepare('SELECT value, timestamp FROM cache WHERE key = ?');
    const row = stmt.get(key) as CacheRow | undefined;

    if (!row) {
      return null;
    }

    // Check if entry is expired
    if (this.ttl > 0 && Date.now() - row.timestamp > this.ttl) {
      // Delete expired entry
      this.db.prepare('DELETE FROM cache WHERE key = ?').run(key);
      return null;
    }

    // Check for undefined marker
    if (row.value === '__UNDEFINED__') {
      return undefined;
    }

    try {
      return JSON.parse(row.value) as unknown;
    } catch (error) {
      // Cache corruption detected - log for debugging (Issue #11)
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`⚠ Cache corruption detected for key "${key}": ${errorMessage}. Removing entry.`);

      // Remove corrupted entry
      this.db.prepare('DELETE FROM cache WHERE key = ?').run(key);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  set(key: string, value: unknown): void {
    if (!this.enabled) {
      return;
    }

    // Don't cache undefined values (Issue #10)
    // Undefined typically indicates "no value" or an error, so caching it doesn't provide benefit
    // This eliminates the fragile magic string approach
    if (value === undefined) {
      return;
    }

    const json = JSON.stringify(value);
    const size = Buffer.byteLength(json, 'utf8');
    const timestamp = Date.now();

    // Clean up expired entries
    this.cleanupExpired();

    // Check if key already exists and get its size
    const existingStmt = this.db.prepare('SELECT size FROM cache WHERE key = ?');
    const existing = existingStmt.get(key) as { size: number } | undefined;
    const existingSize = existing?.size ?? 0;

    // Check if we need to evict old entries
    // If replacing, don't count existing entry's size
    this.evictIfNeeded(size - existingSize);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, timestamp, size)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(key, json, timestamp, size);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.db.exec('DELETE FROM cache');
  }

  /**
   * Get cache statistics
   */
  stats(): CacheStats {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total
      FROM cache
    `);
    const row = stmt.get() as { count: number; total: number };

    return {
      entries: row.count,
      totalSize: row.total,
      maxSize: this.maxSize,
      enabled: this.enabled,
    };
  }

  /**
   * Enable cache
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable cache
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Set maximum cache size
   */
  setMaxSize(maxSize: number): void {
    if (maxSize < 0) {
      throw new Error('Max size must be positive');
    }
    this.maxSize = maxSize;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (!this.isClosed) {
      this.db.close();
      this.isClosed = true;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    if (this.ttl === 0) {
      return; // TTL disabled
    }

    const expirationTime = Date.now() - this.ttl;
    this.db.prepare('DELETE FROM cache WHERE timestamp < ?').run(expirationTime);
  }

  /**
   * Evict oldest entries if needed to make space
   * Fix for Issue #9: Use SQL DELETE ... LIMIT to avoid loading all entries into memory
   */
  private evictIfNeeded(newEntrySize: number): void {
    const stats = this.stats();

    if (stats.totalSize + newEntrySize <= this.maxSize) {
      return; // Enough space available
    }

    // Calculate how much space we need to free
    // Add a small buffer to ensure we have enough space
    const toFree = stats.totalSize + newEntrySize - this.maxSize + 1;

    // Estimate how many entries to delete based on average size
    // This avoids loading all entries into memory for large caches
    const avgSize = stats.entries > 0 ? stats.totalSize / stats.entries : 1024;
    const estimatedEntries = Math.ceil(toFree / avgSize);

    // Add 20% buffer to ensure we delete enough entries
    // This handles cases where oldest entries are larger than average
    const entriesToDelete = Math.ceil(estimatedEntries * 1.2);

    // Delete oldest entries efficiently using SQL subquery
    // This executes entirely in SQLite without loading data into Node.js memory
    this.db.prepare(`
      DELETE FROM cache
      WHERE key IN (
        SELECT key FROM cache
        ORDER BY timestamp ASC
        LIMIT ?
      )
    `).run(entriesToDelete);
  }
}
