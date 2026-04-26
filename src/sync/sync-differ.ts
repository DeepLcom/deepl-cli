import type { ExtractedEntry } from '../formats/format.js';
import type { SyncLockEntry, SyncDiff } from './types.js';
import { computeSourceHash } from './sync-lock.js';

export function computeDiff(
  lockEntries: Record<string, SyncLockEntry>,
  currentEntries: ExtractedEntry[],
): SyncDiff[] {
  const currentKeys = new Set(currentEntries.map((e) => e.key));
  const currentMap = new Map(currentEntries.map((e) => [e.key, e]));
  const diffs: SyncDiff[] = [];

  for (const [key, entry] of currentMap) {
    const lockEntry = lockEntries[key];
    if (!lockEntry) {
      diffs.push({ key, status: 'new', value: entry.value, metadata: entry.metadata });
    } else if (computeSourceHash(entry.value, entry.metadata) === lockEntry.source_hash) {
      const hasFailed = Object.values(lockEntry.translations).some(t => t.status === 'failed');
      if (hasFailed) {
        diffs.push({ key, status: 'stale', value: entry.value, previous_hash: lockEntry.source_hash, metadata: entry.metadata });
      } else {
        diffs.push({ key, status: 'current', value: entry.value, metadata: entry.metadata });
      }
    } else {
      diffs.push({
        key,
        status: 'stale',
        value: entry.value,
        previous_hash: lockEntry.source_hash,
        metadata: entry.metadata,
      });
    }
  }

  for (const key of Object.keys(lockEntries)) {
    if (!currentKeys.has(key)) {
      const lockEntry = lockEntries[key];
      if (lockEntry) {
        diffs.push({ key, status: 'deleted', previous_hash: lockEntry.source_hash });
      }
    }
  }

  diffs.sort((a, b) => a.key.localeCompare(b.key));
  return diffs;
}
