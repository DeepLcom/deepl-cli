import * as fs from 'fs';
import * as path from 'path';
import { ConfigError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

export const PROCESS_LOCK_FILE_NAME = '.deepl-sync.lock.pidfile';

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

function readExistingPidFile(pidFilePath: string): PidFilePayload | null {
  let raw: string;
  try {
    raw = fs.readFileSync(pidFilePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw err;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPidFilePayload(parsed)) return parsed;
  } catch {
    // fall through — treat malformed content as stale below
  }
  return null;
}

function writePidFile(pidFilePath: string): void {
  const payload: PidFilePayload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  const fd = fs.openSync(pidFilePath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o644);
  try {
    fs.writeSync(fd, JSON.stringify(payload));
  } finally {
    fs.closeSync(fd);
  }
}

export interface ProcessLockHandle {
  readonly pidFilePath: string;
  release(): void;
}

export function acquireSyncProcessLock(projectRoot: string): ProcessLockHandle {
  const pidFilePath = path.join(projectRoot, PROCESS_LOCK_FILE_NAME);

  try {
    writePidFile(pidFilePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw err;

    const existing = readExistingPidFile(pidFilePath);
    if (existing && isProcessAlive(existing.pid)) {
      throw new ConfigError(
        `Another \`deepl sync\` process is running in this directory (PID=${existing.pid}, started ${existing.startedAt}). Wait for it to finish or kill it before retrying.`,
        `If the process is definitely not running, remove ${PROCESS_LOCK_FILE_NAME} manually and retry.`,
      );
    }

    const stalePidLabel = existing ? `PID=${existing.pid}` : 'unknown PID';
    Logger.warn(
      `Removing stale ${PROCESS_LOCK_FILE_NAME} (${stalePidLabel} is not alive); reclaiming lock.`,
    );
    try {
      fs.unlinkSync(pidFilePath);
    } catch (unlinkErr) {
      const unlinkCode = (unlinkErr as NodeJS.ErrnoException).code;
      if (unlinkCode !== 'ENOENT') throw unlinkErr;
    }
    writePidFile(pidFilePath);
  }

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    try {
      const current = readExistingPidFile(pidFilePath);
      if (current && current.pid !== process.pid) {
        // Another process reclaimed the lock; don't remove its pidfile.
        return;
      }
      fs.unlinkSync(pidFilePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        Logger.warn(
          `Failed to remove ${PROCESS_LOCK_FILE_NAME}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  return { pidFilePath, release };
}
