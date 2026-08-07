import * as fs from 'fs';
import * as crypto from 'crypto';
import { atomicWriteFile } from '../utils/atomic-write.js';
import { Logger } from '../utils/logger.js';
import { getOwnMember, setOwnMember } from '../utils/own-members.js';
import type { SyncLockFile, SyncLockEntry } from './types.js';
import { LOCK_FILE_VERSION, LOCK_FILE_COMMENT } from './types.js';

/** The per-file entry map, created on demand and setter-proof either way. */
export function ensureFileEntries(
  lockFile: SyncLockFile,
  filePath: string
): Record<string, SyncLockEntry> {
  const existing = getOwnMember(lockFile.entries, filePath);
  if (existing) return existing;
  const created: Record<string, SyncLockEntry> = {};
  setOwnMember(lockFile.entries, filePath, created);
  return created;
}

function filesystemSafeTimestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+/, '');
}

function backupLockFile(
  lockFilePath: string,
  raw: string,
  tag: string
): string | null {
  const backupPath = `${lockFilePath}.bak-${tag}-${filesystemSafeTimestamp()}`;
  try {
    fs.writeFileSync(backupPath, raw, 'utf-8');
    return backupPath;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.warn(
      `Failed to write lock file backup to ${backupPath}: ${message}`
    );
    return null;
  }
}

export function computeSourceHash(
  text: string,
  metadata?: Record<string, unknown>
): string {
  let input = text;
  if (metadata) {
    const plurals =
      metadata['plurals'] ??
      metadata['msgid_plural'] ??
      metadata['plural_forms'];
    if (plurals) {
      input += '\0' + JSON.stringify(plurals);
    }
  }
  return crypto
    .createHash('sha256')
    .update(input, 'utf-8')
    .digest('hex')
    .substring(0, 12);
}

export function createEmptyLockFile(sourceLocale: string): SyncLockFile {
  const now = new Date().toISOString();
  return {
    _comment: LOCK_FILE_COMMENT,
    version: LOCK_FILE_VERSION,
    generated_at: now,
    source_locale: sourceLocale,
    entries: {},
    stats: { total_keys: 0, total_translations: 0, last_sync: now },
  };
}

// Depth of `entries.<source file>.<i18n key>.translations.<locale>`, the level a
// translation entry sits at. Matched on the path rather than on the key name so
// an i18n key called `translations` is not mistaken for the container itself.
const TRANSLATION_DEPTH = 5;

function isTranslation(path: readonly string[]): boolean {
  return (
    path.length === TRANSLATION_DEPTH &&
    path[0] === 'entries' &&
    path[3] === 'translations'
  );
}

/**
 * Own, enumerable, serializable members in key order. Enumerated as pairs rather
 * than read back by key: an i18n key named `__proto__` is a real own property,
 * and indexing a plain object for it would reach the prototype instead.
 */
function sortedMembers(value: object): [string, unknown][] {
  return Object.entries(value)
    .filter(
      ([, member]) => member !== undefined && typeof member !== 'function'
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** One line, no indentation, keys still sorted. */
function serializeInline(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeInline).join(', ')}]`;
  }
  const members = sortedMembers(value).map(
    ([key, member]) => `${JSON.stringify(key)}: ${serializeInline(member)}`
  );
  return members.length === 0 ? '{}' : `{${members.join(', ')}}`;
}

// `path` is mutated in place rather than copied per member: a lockfile carries
// one node per translation per key, and a fresh array at each would allocate
// once for every one of them.
function serializeNode(value: unknown, indent: string, path: string[]): string {
  if (isTranslation(path) || value === null || typeof value !== 'object') {
    return serializeInline(value);
  }
  const childIndent = `${indent}  `;
  const members: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      path.push(String(index));
      members.push(childIndent + serializeNode(item, childIndent, path));
      path.pop();
    });
    return members.length === 0
      ? '[]'
      : `[\n${members.join(',\n')}\n${indent}]`;
  }
  for (const [key, member] of sortedMembers(value)) {
    path.push(key);
    members.push(
      `${childIndent}${JSON.stringify(key)}: ${serializeNode(member, childIndent, path)}`
    );
    path.pop();
  }
  return members.length === 0 ? '{}' : `{\n${members.join(',\n')}\n${indent}}`;
}

/**
 * The canonical on-disk form of a lock file, including its trailing newline.
 *
 * Every container is expanded one key per line, but each translation is emitted
 * on a single line. A translation is only meaningful whole — its hash, timestamp
 * and review status all describe one act of translating — and one field per line
 * makes those fields independently mergeable units, so `git merge` can combine
 * one side's hash with the other's review status and produce a translation that
 * existed on neither branch, with no conflict raised. One line per translation
 * makes the smallest region git can produce a whole entry.
 */
export function serializeLockFile(lockFile: SyncLockFile): string {
  return `${serializeNode(lockFile, '', [])}\n`;
}

/** A member that can carry lock file structure: an object, not null, not an array. */
function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The recorded sync timestamp when the file carries a usable one. */
function lastSyncOf(stats: unknown): string {
  if (isContainer(stats) && typeof stats['last_sync'] === 'string') {
    return stats['last_sync'];
  }
  return new Date().toISOString();
}

interface ShapeRepair {
  /** Members dropped for not having the shape the sync code dereferences. */
  dropped: number;
  entries: Record<string, Record<string, SyncLockEntry>>;
  totalKeys: number;
  totalTranslations: number;
}

/**
 * Rebuild `entries` from the members that have the shape the rest of sync
 * dereferences, and count what survives.
 *
 * A lock file is read from the repository, so every level of it is untrusted.
 * Malformed members are dropped one at a time rather than the file being
 * discarded whole: a key that loses its entry is translated again and billed
 * again, so discarding an entire lock file over one bad member would hand
 * whoever wrote it a full re-translation of the project.
 *
 * The result is a fresh object built with `setOwnMember`, so a file path or i18n
 * key named `__proto__` is carried across as an own property rather than
 * reaching a prototype setter.
 */
function repairEntryShape(entries: Record<string, unknown>): ShapeRepair {
  const repaired: Record<string, Record<string, SyncLockEntry>> = {};
  let dropped = 0;
  let totalKeys = 0;
  let totalTranslations = 0;

  for (const [filePath, fileEntries] of Object.entries(entries)) {
    if (!isContainer(fileEntries)) {
      dropped++;
      continue;
    }

    const repairedFile: Record<string, SyncLockEntry> = {};
    for (const [key, entry] of Object.entries(fileEntries)) {
      if (!isContainer(entry) || !isContainer(entry['translations'])) {
        dropped++;
        continue;
      }

      const translations: Record<string, unknown> = {};
      for (const [locale, translation] of Object.entries(
        entry['translations']
      )) {
        if (!isContainer(translation)) {
          dropped++;
          continue;
        }
        setOwnMember(translations, locale, translation);
        totalTranslations++;
      }

      setOwnMember(repairedFile, key, {
        ...entry,
        translations,
      } as unknown as SyncLockEntry);
      totalKeys++;
    }

    setOwnMember(repaired, filePath, repairedFile);
  }

  return { dropped, entries: repaired, totalKeys, totalTranslations };
}

// Per-manager memo of the entries-mutation counter value that `stats` were
// last computed for. Avoids walking every entry twice on each updateEntry /
// removeEntry (once in the method, once again in write()).
const lockFileMutationVersion = new WeakMap<SyncLockFile, number>();

function bumpMutationVersion(lockFile: SyncLockFile): void {
  lockFileMutationVersion.set(
    lockFile,
    (lockFileMutationVersion.get(lockFile) ?? 0) + 1
  );
}

function recomputeStats(lockFile: SyncLockFile): void {
  let totalKeys = 0;
  let totalTranslations = 0;
  for (const fileEntries of Object.values(lockFile.entries)) {
    for (const entry of Object.values(fileEntries)) {
      totalKeys++;
      totalTranslations += Object.keys(entry.translations).length;
    }
  }
  lockFile.stats.total_keys = totalKeys;
  lockFile.stats.total_translations = totalTranslations;
  lockFile.stats.last_sync = new Date().toISOString();
}

export class SyncLockManager {
  private readonly statsComputedFor = new WeakMap<SyncLockFile, number>();

  constructor(private readonly lockFilePath: string) {}

  async read(): Promise<SyncLockFile> {
    try {
      await fs.promises.access(this.lockFilePath);
    } catch {
      return createEmptyLockFile('');
    }

    const raw = await fs.promises.readFile(this.lockFilePath, 'utf-8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const backup = backupLockFile(this.lockFilePath, raw, 'corrupt');
      const suffix = backup
        ? ` Previous lock file backed up to ${backup}.`
        : '';
      Logger.warn(`Lock file corrupted, performing full sync.${suffix}`);
      return createEmptyLockFile('');
    }

    const obj = parsed as Record<string, unknown>;
    if (obj['version'] === undefined) {
      const backup = backupLockFile(this.lockFilePath, raw, 'v-unknown');
      const suffix = backup
        ? ` Previous lock file backed up to ${backup}.`
        : '';
      Logger.warn(
        `Lock file corrupted (missing version), performing full sync.${suffix}`
      );
      return createEmptyLockFile('');
    }
    if (obj['version'] !== LOCK_FILE_VERSION) {
      const versionTag =
        typeof obj['version'] === 'number' ? `v${obj['version']}` : 'v-unknown';
      const backup = backupLockFile(this.lockFilePath, raw, versionTag);
      const suffix = backup
        ? ` Previous lock file backed up to ${backup}.`
        : '';
      Logger.warn(
        `Unsupported lock file version ${obj['version']} (expected ${LOCK_FILE_VERSION}), performing full sync.${suffix}`
      );
      return createEmptyLockFile('');
    }
    if (!obj['entries'] || typeof obj['entries'] !== 'object') {
      const backup = backupLockFile(
        this.lockFilePath,
        raw,
        `v${LOCK_FILE_VERSION}-no-entries`
      );
      const suffix = backup
        ? ` Previous lock file backed up to ${backup}.`
        : '';
      Logger.warn(`Lock file missing entries, performing full sync.${suffix}`);
      return createEmptyLockFile('');
    }
    // An array cannot carry entries keyed by source path, so there is nothing
    // to salvage from one. Left to the full-sync path rather than repaired,
    // unlike a malformed member inside a real map.
    if (Array.isArray(obj['entries'])) {
      const backup = backupLockFile(
        this.lockFilePath,
        raw,
        `v${LOCK_FILE_VERSION}-entries-not-a-map`
      );
      const suffix = backup
        ? ` Previous lock file backed up to ${backup}.`
        : '';
      Logger.warn(
        `Lock file entries is not a map of source paths, performing full sync.${suffix}`
      );
      return createEmptyLockFile('');
    }

    const repair = repairEntryShape(obj['entries'] as Record<string, unknown>);
    if (repair.dropped > 0) {
      const backup = backupLockFile(
        this.lockFilePath,
        raw,
        `v${LOCK_FILE_VERSION}-malformed`
      );
      const suffix = backup
        ? ` Previous lock file backed up to ${backup}.`
        : '';
      Logger.warn(
        `Lock file contained ${repair.dropped} malformed ${repair.dropped === 1 ? 'entry' : 'entries'}, now dropped; the affected keys will be translated again.${suffix}`
      );
    }

    const lockFile = parsed as SyncLockFile;
    lockFile.entries = repair.entries;
    // `stats` is derived from `entries` and recomputed on every write that
    // follows a mutation, so the values on disk are never read for their own
    // sake. Replacing them outright is cheaper than validating them and cannot
    // leave the counts disagreeing with the entries they describe.
    lockFile.stats = {
      total_keys: repair.totalKeys,
      total_translations: repair.totalTranslations,
      last_sync: lastSyncOf(obj['stats']),
    };

    return lockFile;
  }

  async write(lockFile: SyncLockFile): Promise<void> {
    const mutationVersion = lockFileMutationVersion.get(lockFile) ?? 0;
    const lastComputed = this.statsComputedFor.get(lockFile);
    if (lastComputed !== mutationVersion) {
      recomputeStats(lockFile);
      this.statsComputedFor.set(lockFile, mutationVersion);
    } else {
      lockFile.stats.last_sync = new Date().toISOString();
    }
    lockFile.generated_at = new Date().toISOString();
    lockFile._comment = LOCK_FILE_COMMENT;
    await atomicWriteFile(
      this.lockFilePath,
      serializeLockFile(lockFile),
      'utf-8'
    );
  }

  async updateEntry(
    filePath: string,
    key: string,
    entry: SyncLockEntry
  ): Promise<void> {
    const lockFile = await this.read();
    setOwnMember(ensureFileEntries(lockFile, filePath), key, entry);
    bumpMutationVersion(lockFile);
    await this.write(lockFile);
  }

  async removeEntry(filePath: string, key: string): Promise<void> {
    const lockFile = await this.read();
    const fileEntries = getOwnMember(lockFile.entries, filePath);
    if (fileEntries) {
      delete fileEntries[key];
      if (Object.keys(fileEntries).length === 0) {
        delete lockFile.entries[filePath];
      }
    }
    bumpMutationVersion(lockFile);
    await this.write(lockFile);
  }

  async exists(): Promise<boolean> {
    try {
      await fs.promises.access(this.lockFilePath);
      return true;
    } catch {
      return false;
    }
  }
}
