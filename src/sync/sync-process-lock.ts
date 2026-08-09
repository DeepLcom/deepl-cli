import * as fs from 'fs';
import * as path from 'path';
import { ConfigError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

export const PROCESS_LOCK_FILE_NAME = '.deepl-sync.lock.pidfile';

const MAX_ACQUIRE_ATTEMPTS = 5;

/**
 * How long a pidfile whose holder this user cannot probe is trusted, measured
 * from the start time the holder recorded. Generous on purpose: the lock is
 * held for one sync pass (watch mode retakes it per change), so a day is far
 * beyond any run, while still bounding a pidfile nothing can disprove.
 */
export const UNOWNED_HOLDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

/** `unowned`: the PID exists but belongs to a user this process cannot signal. */
type ProcessLiveness = 'alive' | 'dead' | 'unowned';

function probeProcess(pid: number): ProcessLiveness {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM' ? 'unowned' : 'dead';
  }
}

function isCredibleStartTime(startedAt: string): boolean {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return false;
  // Absolute distance, so a start time far enough ahead of this clock to be
  // impossible counts against the holder just as an ancient one does, while
  // ordinary skew between two machines' clocks does not.
  return Math.abs(Date.now() - started) <= UNOWNED_HOLDER_MAX_AGE_MS;
}

/**
 * Describes why a recorded holder does not hold the lock, or null when it must
 * be treated as still running.
 *
 * A probe that succeeds is conclusive and is never overridden: taking the lock
 * from a process known to be running is the concurrent-writer hazard the lock
 * exists to prevent. EPERM is not conclusive — it is equally what a PID
 * recycled by an unrelated process looks like — so it is trusted only while the
 * holder's own recorded start time keeps it plausible.
 */
function staleHolderReason(payload: PidFilePayload): string | null {
  const liveness = probeProcess(payload.pid);
  if (liveness === 'alive') return null;
  if (liveness === 'dead') return `PID=${payload.pid} is not alive`;
  if (isCredibleStartTime(payload.startedAt)) return null;
  return (
    `PID=${payload.pid} belongs to another user and its recorded start time ` +
    `${payload.startedAt} is not one a running sync could have`
  );
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

export interface SyncProcessLockOptions {
  /**
   * Removes an existing pidfile whatever its holder looks like. The operator's
   * escape hatch for a lock whose holder cannot be disproved — a PID recycled
   * by this user's own process, or one reported by a container's PID namespace.
   */
  breakLock?: boolean;
}

function holderLabel(inspection: PidFileInspection): string {
  return inspection.payload
    ? ` held by PID=${inspection.payload.pid} (started ${inspection.payload.startedAt})`
    : '';
}

export function acquireSyncProcessLock(
  projectRoot: string,
  options?: SyncProcessLockOptions
): ProcessLockHandle {
  const pidFilePath = path.join(projectRoot, PROCESS_LOCK_FILE_NAME);

  // Every acquisition goes through the same exclusive link(2) create, including
  // the one after a stale file is cleared: taking the lock is the only step
  // that may decide the winner, so a create that loses reports another running
  // sync rather than crashing with a raw EEXIST.
  for (let attempt = 1; ; attempt++) {
    try {
      writePidFile(pidFilePath);
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
    }

    const existing = inspectPidFile(pidFilePath);

    // Honoured on the first attempt only: it breaks the lock the operator saw,
    // not whichever sync happens to take the freed slot afterwards.
    if (existing !== null && attempt === 1 && options?.breakLock) {
      if (reclaimStalePidFile(pidFilePath, existing)) {
        Logger.warn(
          `--break-lock: removed ${PROCESS_LOCK_FILE_NAME}${holderLabel(existing)}. ` +
            'If that sync is still running, both runs can now write the same files concurrently.'
        );
      }
      continue;
    }

    const staleReason = existing?.payload
      ? staleHolderReason(existing.payload)
      : null;
    if (existing?.payload && staleReason === null) {
      throw new ConfigError(
        `Another \`deepl sync\` process is running in this directory (PID=${existing.payload.pid}, started ${existing.payload.startedAt}). Wait for it to finish or kill it before retrying.`,
        `If the process is definitely not running, retry with --break-lock, or remove ${PROCESS_LOCK_FILE_NAME} manually.`
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
      Logger.warn(
        `Removed stale ${PROCESS_LOCK_FILE_NAME} (${staleReason ?? 'unknown PID is not alive'}); reclaiming lock.`
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
