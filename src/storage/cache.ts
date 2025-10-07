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
  private db: Database.Database;
  private maxSize: number;
  private ttl: number;
  private enabled: boolean = true;

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
    } catch {
      // Invalid JSON, remove entry
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

    // Handle undefined - JSON.stringify(undefined) returns undefined (not a string)
    // We store it as a special marker
    const json = value === undefined ? '__UNDEFINED__' : JSON.stringify(value);
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
   * Close database connection
   */
  close(): void {
    this.db.close();
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
   */
  private evictIfNeeded(newEntrySize: number): void {
    const stats = this.stats();

    if (stats.totalSize + newEntrySize <= this.maxSize) {
      return; // Enough space available
    }

    // Calculate how much space we need to free
    // Add a small buffer to ensure we have enough space
    const toFree = stats.totalSize + newEntrySize - this.maxSize + 1;

    // Get oldest entries to delete
    const stmt = this.db.prepare(`
      SELECT key, size
      FROM cache
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all() as Array<{ key: string; size: number }>;

    // Delete entries until we've freed enough space
    let freed = 0;
    const deleteStmt = this.db.prepare('DELETE FROM cache WHERE key = ?');

    for (const row of rows) {
      deleteStmt.run(row.key);
      freed += row.size;

      // Keep deleting until we've freed enough
      if (freed >= toFree) {
        break;
      }
    }
  }
}
