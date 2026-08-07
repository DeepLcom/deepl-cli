import * as fs from 'fs';
import * as path from 'path';
import { ConfigError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

export const PROCESS_LOCK_FILE_NAME = '.deepl-sync.lock.pidfile';

const MAX_ACQUIRE_ATTEMPTS = 5;

interface PidFilePayload {
  pid: number;
  startedAt: string;
}

function isPidFilePayload(value: unknown): value is PidFilePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { pid?: unknown }).pid === 'number' &&
    Number.isInteger((value as { pid: number }).pid) &&
    (value as { pid: number }).pid > 0 &&
    typeof (value as { startedAt?: unknown }).startedAt === 'string'
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      return false;
    }
    // EPERM means the PID exists but we don't own it — still alive.
    return code === 'EPERM';
  }
}

interface PidFileInspection {
  /** null when the file holds content no sync wrote, which counts as stale. */
  payload: PidFilePayload | null;
  /** Identity of the file that was read, so a later reclaim can confirm it is
   * removing that same file rather than a replacement. */
  ino: number;
  dev: number;
}

/**
 * Reads the pidfile and its identity through a single descriptor, so the
 * payload and the inode cannot describe two different files.
 */
function inspectPidFile(pidFilePath: string): PidFileInspection | null {
  let fd: number;
  try {
    fd = fs.openSync(pidFilePath, fs.constants.O_RDONLY);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw err;
  }

  try {
    const stats = fs.fstatSync(fd);
    const raw = fs.readFileSync(fd, 'utf-8');
    let payload: PidFilePayload | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isPidFilePayload(parsed)) payload = parsed;
    } catch {
      // Malformed content counts as stale, handled by the caller.
    }
    return { payload, ino: stats.ino, dev: stats.dev };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Removes a pidfile already proven stale, without ever removing one this
 * process has not taken possession of.
 *
 * rename(2) is atomic, so of several syncs racing to break the same stale lock
 * exactly one can move that directory entry aside; the others get ENOENT.
 * Checking the inode *after* the move is what closes the read/unlink race: a
 * process whose staleness verdict has been overtaken by a winner captures the
 * winner's file, sees a different inode, and puts it back instead of deleting a
 * live lock.
 *
 * Returns true when the stale file is gone and the lock is free to retake.
 */
function reclaimStalePidFile(
  pidFilePath: string,
  stale: PidFileInspection
): boolean {
  const capturedPath = `${pidFilePath}.stale.${process.pid}`;
  try {
    fs.renameSync(pidFilePath, capturedPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return false;
    throw err;
  }

  let captured: fs.Stats;
  try {
    captured = fs.statSync(capturedPath);
  } catch {
    return false;
  }

  if (captured.ino !== stale.ino || captured.dev !== stale.dev) {
    try {
      fs.renameSync(capturedPath, pidFilePath);
    } catch {
      // The restore failed, so the path is left free rather than holding
      // someone else's lock. The caller re-reads either way.
    }
    return false;
  }

  try {
    fs.unlinkSync(capturedPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
  return true;
}

/**
 * Creates the pidfile, already holding its full payload, or throws EEXIST if
 * another process holds the lock.
 *
 * The payload is written to a private path and link(2)ed into place rather than
 * written through an O_EXCL descriptor at the final path. Creating it empty and
 * filling it afterwards leaves a window in which a live lock reads as malformed
 * — and a reader that catches that window judges the lock stale and deletes it,
 * which no identity check downstream can detect, because the file it inspected
 * really is the file it removed. link(2) publishes the name and the content in
 * one step and fails EEXIST if it loses, so it is also the atomic acquisition.
 */
function writePidFile(pidFilePath: string): void {
  const payload: PidFilePayload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  const stagingPath = `${pidFilePath}.new.${process.pid}`;
  const fd = fs.openSync(
    stagingPath,
    fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_WRONLY,
    0o644
  );
  try {
    fs.writeSync(fd, JSON.stringify(payload));
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.linkSync(stagingPath, pidFilePath);
  } finally {
    try {
      fs.unlinkSync(stagingPath);
    } catch {
      // Best effort: a leftover staging file is reused by this pid's next
      // attempt, and must not mask the link result.
    }
  }
}

export interface ProcessLockHandle {
  readonly pidFilePath: string;
  release(): void;
}

export function acquireSyncProcessLock(projectRoot: string): ProcessLockHandle {
  const pidFilePath = path.join(projectRoot, PROCESS_LOCK_FILE_NAME);

  // Every acquisition goes through the same O_EXCL create, including the one
  // after a stale file is cleared: taking the lock is the only step that may
  // decide the winner, so a create that loses reports another running sync
  // rather than crashing with a raw EEXIST.
  for (let attempt = 1; ; attempt++) {
    try {
      writePidFile(pidFilePath);
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
    }

    const existing = inspectPidFile(pidFilePath);
    if (existing?.payload && isProcessAlive(existing.payload.pid)) {
      throw new ConfigError(
        `Another \`deepl sync\` process is running in this directory (PID=${existing.payload.pid}, started ${existing.payload.startedAt}). Wait for it to finish or kill it before retrying.`,
        `If the process is definitely not running, remove ${PROCESS_LOCK_FILE_NAME} manually and retry.`
      );
    }

    if (attempt >= MAX_ACQUIRE_ATTEMPTS) {
      throw new ConfigError(
        `Could not take the \`deepl sync\` lock in this directory: ${PROCESS_LOCK_FILE_NAME} keeps being replaced by another process (${MAX_ACQUIRE_ATTEMPTS} attempts).`,
        `Wait for the other sync to finish, or remove ${PROCESS_LOCK_FILE_NAME} manually and retry.`
      );
    }

    // A pidfile that vanished between the failed create and the read needs no
    // reclaim; retry the create directly.
    if (existing !== null && reclaimStalePidFile(pidFilePath, existing)) {
      const stalePidLabel = existing.payload
        ? `PID=${existing.payload.pid}`
        : 'unknown PID';
      Logger.warn(
        `Removed stale ${PROCESS_LOCK_FILE_NAME} (${stalePidLabel} is not alive); reclaiming lock.`
      );
    }
  }

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    try {
      const current = inspectPidFile(pidFilePath)?.payload;
      if (current && current.pid !== process.pid) {
        // Another process reclaimed the lock; don't remove its pidfile.
        return;
      }
      fs.unlinkSync(pidFilePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        Logger.warn(
          `Failed to remove ${PROCESS_LOCK_FILE_NAME}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  };

  return { pidFilePath, release };
}
