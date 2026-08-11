/**
 * Unit tests for the `deepl sync` process lock.
 *
 * The lock arbitrates between concurrent syncs in one directory, so its error
 * paths are the interesting ones: a liveness probe that cannot see the process
 * it is asking about, a pidfile holding content no sync wrote, and a pidfile
 * that changes owner or disappears between the check and the unlink.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    output: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  acquireSyncProcessLock,
  PROCESS_LOCK_FILE_NAME,
  UNOWNED_HOLDER_MAX_AGE_MS,
} from '../../../src/sync/sync-process-lock';
import { Logger } from '../../../src/utils/logger';
import { ConfigError } from '../../../src/utils/errors';

// `import * as fs` compiles to a namespace object whose properties are
// non-configurable getters, so jest.spyOn cannot replace them. Those getters
// read through to the module object below, which is what the code under test
// resolves its own `fs.*` calls against.
const fsModule = require('fs') as typeof fs;

function errnoError(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

/** A start time the given number of milliseconds in the past, as a holder records it. */
function startedMsAgo(ageMs: number): string {
  return new Date(Date.now() - ageMs).toISOString();
}

describe('acquireSyncProcessLock', () => {
  let projectRoot: string;
  let pidFilePath: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-lock-'));
    pidFilePath = path.join(projectRoot, PROCESS_LOCK_FILE_NAME);
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  /** Plant a pidfile as some other process would have left it. */
  function plantPidFile(contents: unknown): void {
    fs.writeFileSync(
      pidFilePath,
      typeof contents === 'string' ? contents : JSON.stringify(contents)
    );
  }

  function ownerPid(): number {
    const parsed: unknown = JSON.parse(fs.readFileSync(pidFilePath, 'utf-8'));
    return (parsed as { pid: number }).pid;
  }

  describe('acquiring a free lock', () => {
    it('writes a pidfile naming this process', () => {
      const handle = acquireSyncProcessLock(projectRoot);

      expect(handle.pidFilePath).toBe(pidFilePath);
      expect(ownerPid()).toBe(process.pid);
      handle.release();
      expect(fs.existsSync(pidFilePath)).toBe(false);
    });

    /**
     * A pidfile that exists before its payload does reads as malformed, and a
     * concurrent sync that catches that window judges the live lock stale and
     * removes it. No identity check downstream can catch that: the file it
     * inspected really is the file it deleted.
     */
    it('writes the payload before the pidfile appears at its final path', () => {
      const realWriteSync = fsModule.writeSync;
      let finalPathExisted: boolean | undefined;
      jest
        .spyOn(fsModule, 'writeSync')
        .mockImplementation((...args: Parameters<typeof fs.writeSync>) => {
          finalPathExisted ??= fs.existsSync(pidFilePath);
          return realWriteSync(...args);
        });

      const handle = acquireSyncProcessLock(projectRoot);

      expect(finalPathExisted).toBe(false);
      expect(ownerPid()).toBe(process.pid);
      handle.release();
    });

    it('leaves no staging file behind', () => {
      const handle = acquireSyncProcessLock(projectRoot);
      handle.release();

      expect(fs.readdirSync(projectRoot)).toEqual([]);
    });

    it('propagates a pidfile write failure that is not EEXIST', () => {
      let caught: unknown;
      try {
        acquireSyncProcessLock(path.join(projectRoot, 'no-such-directory'));
      } catch (error) {
        caught = error;
      }

      expect((caught as NodeJS.ErrnoException | undefined)?.code).toBe(
        'ENOENT'
      );
      expect(caught).not.toBeInstanceOf(ConfigError);
    });
  });

  describe('liveness probe', () => {
    it('refuses the lock when the pidfile names a process that is genuinely running', () => {
      plantPidFile({ pid: process.pid, startedAt: '2026-01-01T00:00:00.000Z' });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
      expect(fs.existsSync(pidFilePath)).toBe(true);
    });

    it('refuses the lock when the probe reports EPERM, which means a process this user does not own', () => {
      plantPidFile({ pid: 4242, startedAt: startedMsAgo(60_000) });
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw errnoError('EPERM');
      });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
    });

    it('names the holding PID and its start time when refusing', () => {
      const startedAt = startedMsAgo(60_000);
      plantPidFile({ pid: 4242, startedAt });
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw errnoError('EPERM');
      });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(
        new RegExp(`PID=4242, started ${startedAt.replace(/\./g, '\\.')}`)
      );
    });

    it('tells the operator how to break a lock it refuses', () => {
      plantPidFile({ pid: process.pid, startedAt: startedMsAgo(60_000) });

      let caught: unknown;
      try {
        acquireSyncProcessLock(projectRoot);
      } catch (error) {
        caught = error;
      }

      expect((caught as ConfigError).suggestion).toMatch(/--break-lock/);
    });

    it('reclaims the lock when the probe reports ESRCH', () => {
      plantPidFile({ pid: 4242, startedAt: '2026-01-01T00:00:00.000Z' });
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw errnoError('ESRCH');
      });

      const handle = acquireSyncProcessLock(projectRoot);

      expect(ownerPid()).toBe(process.pid);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('PID=4242')
      );
      handle.release();
    });

    it('treats an unrecognised probe error as not alive rather than propagating it', () => {
      plantPidFile({ pid: 4242, startedAt: '2026-01-01T00:00:00.000Z' });
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw errnoError('EINVAL');
      });

      const handle = acquireSyncProcessLock(projectRoot);

      expect(ownerPid()).toBe(process.pid);
      handle.release();
    });
  });

  /**
   * EPERM says the PID exists and belongs to someone else, which is equally
   * what a PID recycled by an unrelated process looks like. Without an upper
   * bound on the recorded start time such a pidfile refuses every later sync
   * for as long as it exists.
   */
  describe('a holder this user cannot probe', () => {
    function plantUnownedHolder(startedAt: unknown): void {
      plantPidFile({ pid: 4242, startedAt });
      jest.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (pid === 4242) throw errnoError('EPERM');
        return true;
      });
    }

    it('reclaims the lock when the recorded start time is older than any sync can run', () => {
      plantUnownedHolder(startedMsAgo(30 * UNOWNED_HOLDER_MAX_AGE_MS));

      const handle = acquireSyncProcessLock(projectRoot);

      expect(ownerPid()).toBe(process.pid);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('PID=4242')
      );
      handle.release();
    });

    it('says why it distrusted the holder when it reclaims', () => {
      plantUnownedHolder(startedMsAgo(30 * UNOWNED_HOLDER_MAX_AGE_MS));

      const handle = acquireSyncProcessLock(projectRoot);

      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('another user')
      );
      handle.release();
    });

    it('reclaims the lock when the recorded start time is not a date', () => {
      plantUnownedHolder('halfway through last tuesday');

      const handle = acquireSyncProcessLock(projectRoot);

      expect(ownerPid()).toBe(process.pid);
      handle.release();
    });

    it('reclaims the lock when the recorded start time is impossibly far ahead of this clock', () => {
      plantUnownedHolder(startedMsAgo(-30 * UNOWNED_HOLDER_MAX_AGE_MS));

      const handle = acquireSyncProcessLock(projectRoot);

      expect(ownerPid()).toBe(process.pid);
      handle.release();
    });

    it('refuses a holder that started moments ago', () => {
      plantUnownedHolder(startedMsAgo(1_000));

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
      expect(ownerPid()).toBe(4242);
    });

    it('refuses a holder still inside the age ceiling', () => {
      plantUnownedHolder(startedMsAgo(UNOWNED_HOLDER_MAX_AGE_MS - 60_000));

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
      expect(ownerPid()).toBe(4242);
    });

    it('refuses a holder whose clock runs a little ahead of this one', () => {
      plantUnownedHolder(startedMsAgo(-60_000));

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
      expect(ownerPid()).toBe(4242);
    });

    /**
     * Ageing exists to escape a verdict nothing can disprove. A probe that
     * succeeds is not that: taking the lock from a process known to be running
     * is the concurrent-writer hazard the lock exists to prevent.
     */
    it('never ages out a holder the probe reports as genuinely running', () => {
      plantPidFile({
        pid: process.pid,
        startedAt: startedMsAgo(365 * UNOWNED_HOLDER_MAX_AGE_MS),
      });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
      expect(ownerPid()).toBe(process.pid);
    });
  });

  describe('breakLock', () => {
    it('takes the lock from a holder that is genuinely running', () => {
      plantPidFile({ pid: 4242, startedAt: startedMsAgo(60_000) });
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      const handle = acquireSyncProcessLock(projectRoot, { breakLock: true });

      expect(ownerPid()).toBe(process.pid);
      handle.release();
    });

    it('names the holder it broke and warns what that permits', () => {
      const startedAt = startedMsAgo(60_000);
      plantPidFile({ pid: 4242, startedAt });
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      const handle = acquireSyncProcessLock(projectRoot, { breakLock: true });

      const warnings = jest
        .mocked(Logger.warn)
        .mock.calls.map((args) => String(args[0]))
        .join('\n');
      expect(warnings).toContain('PID=4242');
      expect(warnings).toContain(startedAt);
      expect(warnings).toMatch(/concurrent|same files/i);
      handle.release();
    });

    it('is silent when there was no lock to break', () => {
      const handle = acquireSyncProcessLock(projectRoot, { breakLock: true });

      expect(ownerPid()).toBe(process.pid);
      expect(Logger.warn).not.toHaveBeenCalled();
      handle.release();
    });

    it('reports the running sync rather than breaking twice when a new holder takes the freed slot', () => {
      plantPidFile({ pid: 4242, startedAt: startedMsAgo(60_000) });
      jest.spyOn(process, 'kill').mockImplementation(() => true);
      const realRename = fsModule.renameSync;
      let broken = false;
      jest.spyOn(fsModule, 'renameSync').mockImplementation((from, to) => {
        realRename(from, to);
        if (!broken) {
          broken = true;
          plantPidFile({ pid: 5555, startedAt: startedMsAgo(1_000) });
        }
      });

      expect(() =>
        acquireSyncProcessLock(projectRoot, { breakLock: true })
      ).toThrow(/PID=5555/);
      expect(ownerPid()).toBe(5555);
    });
  });

  describe('unreadable pidfile contents', () => {
    it.each([
      ['content that is not JSON', 'not json at all'],
      ['JSON that is not an object', '"a bare string"'],
      ['an object with no pid', '{"startedAt":"2026-01-01T00:00:00.000Z"}'],
      [
        'a fractional pid',
        '{"pid":1.5,"startedAt":"2026-01-01T00:00:00.000Z"}',
      ],
      ['a zero pid', '{"pid":0,"startedAt":"2026-01-01T00:00:00.000Z"}'],
      ['a negative pid', '{"pid":-1,"startedAt":"2026-01-01T00:00:00.000Z"}'],
      ['no startedAt', '{"pid":4242}'],
    ])('reclaims the lock when the pidfile holds %s', (_label, contents) => {
      plantPidFile(contents);

      const handle = acquireSyncProcessLock(projectRoot);

      expect(ownerPid()).toBe(process.pid);
      handle.release();
    });

    it('reports an unknown PID rather than guessing when the pidfile is unreadable', () => {
      plantPidFile('not json at all');

      const handle = acquireSyncProcessLock(projectRoot);

      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unknown PID')
      );
      handle.release();
    });

    it('never probes liveness for an unreadable pidfile', () => {
      plantPidFile('not json at all');
      const killSpy = jest.spyOn(process, 'kill');

      const handle = acquireSyncProcessLock(projectRoot);

      expect(killSpy).not.toHaveBeenCalled();
      handle.release();
    });

    it('propagates a pidfile read failure that is not ENOENT', () => {
      plantPidFile({ pid: 4242, startedAt: '2026-01-01T00:00:00.000Z' });
      jest.spyOn(fsModule, 'readFileSync').mockImplementation(() => {
        throw errnoError('EACCES');
      });

      let caught: unknown;
      try {
        acquireSyncProcessLock(projectRoot);
      } catch (error) {
        caught = error;
      }

      expect((caught as NodeJS.ErrnoException | undefined)?.code).toBe(
        'EACCES'
      );
      expect(caught).not.toBeInstanceOf(ConfigError);
    });
  });

  describe('reclaiming a stale pidfile', () => {
    it('proceeds when another process unlinks the stale pidfile first', () => {
      plantPidFile('not json at all');
      jest.spyOn(fsModule, 'unlinkSync').mockImplementation((target) => {
        fs.rmSync(target, { force: true });
        throw errnoError('ENOENT');
      });

      const handle = acquireSyncProcessLock(projectRoot);

      expect(ownerPid()).toBe(process.pid);
      handle.release();
    });

    it('propagates an unlink failure that is not ENOENT', () => {
      plantPidFile('not json at all');
      jest.spyOn(fsModule, 'unlinkSync').mockImplementation(() => {
        throw errnoError('EACCES');
      });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow('EACCES');
    });

    /**
     * The reclaim is a check followed by a removal, so a sync that wins the
     * race writes a LIVE pidfile into the window between the two. Removing it
     * would leave both processes believing they hold the lock, writing the same
     * target files and the same lockfile.
     */
    it('leaves a live pidfile alone when a racing sync reclaims the lock first', () => {
      const winnerPid = 5555;
      plantPidFile({ pid: 4242, startedAt: '2026-01-01T00:00:00.000Z' });
      const realKill = process.kill.bind(process);
      jest
        .spyOn(process, 'kill')
        .mockImplementation((pid: number, signal?: string | number) => {
          if (pid === 4242) {
            // A racing sync takes the lock between this staleness verdict and
            // the reclaim it authorises. Unlink-then-create, as a real winner
            // does, so the replacement is a different inode.
            fs.rmSync(pidFilePath, { force: true });
            plantPidFile({
              pid: winnerPid,
              startedAt: '2026-06-01T00:00:00.000Z',
            });
            throw errnoError('ESRCH');
          }
          if (pid === winnerPid) return true;
          return realKill(pid, signal);
        });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
      expect(ownerPid()).toBe(winnerPid);
    });

    /**
     * The same race, on a filesystem that hands the freed inode straight back to
     * the winner's replacement file — ext4 does, APFS does not. Identity cannot
     * rest on the inode, so this forces the numbers to collide and leaves the
     * recorded payload as the only thing telling the two files apart.
     */
    it('leaves a live pidfile alone even when the replacement reuses the inode', () => {
      const winnerPid = 5555;
      plantPidFile({ pid: 4242, startedAt: '2026-01-01T00:00:00.000Z' });
      const staleIdentity = fs.statSync(pidFilePath);
      const realKill = process.kill.bind(process);

      jest
        .spyOn(process, 'kill')
        .mockImplementation((pid: number, signal?: string | number) => {
          if (pid === 4242) {
            fs.rmSync(pidFilePath, { force: true });
            plantPidFile({
              pid: winnerPid,
              startedAt: '2026-06-01T00:00:00.000Z',
            });
            throw errnoError('ESRCH');
          }
          if (pid === winnerPid) return true;
          return realKill(pid, signal);
        });

      // Report the stale file's inode for whatever the reclaim captures, so the
      // cheap identity check passes and the payload has to carry the verdict.
      const realFstat = fsModule.fstatSync.bind(fsModule);
      jest.spyOn(fsModule, 'fstatSync').mockImplementation((fd: number) => {
        const stats = realFstat(fd);
        stats.ino = staleIdentity.ino;
        stats.dev = staleIdentity.dev;
        return stats;
      });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
      expect(ownerPid()).toBe(winnerPid);
    });

    it('reports the running sync rather than a raw EEXIST when the freed slot is taken first', () => {
      const winnerPid = 5555;
      plantPidFile({ pid: 4242, startedAt: '2026-01-01T00:00:00.000Z' });
      jest.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (pid === 4242) throw errnoError('ESRCH');
        return true;
      });
      const realUnlink = fsModule.unlinkSync;
      let taken = false;
      jest.spyOn(fsModule, 'unlinkSync').mockImplementation((target) => {
        realUnlink(target);
        if (!taken) {
          taken = true;
          // The winner claims the now-vacant path before this process can.
          plantPidFile({
            pid: winnerPid,
            startedAt: '2026-06-01T00:00:00.000Z',
          });
        }
      });

      let caught: unknown;
      try {
        acquireSyncProcessLock(projectRoot);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as Error).message).toMatch(/PID=5555/);
      expect(ownerPid()).toBe(winnerPid);
    });

    it('gives up with a clear error when the pidfile keeps being replaced', () => {
      plantPidFile('not json at all');
      const realRename = fsModule.renameSync;
      jest.spyOn(fsModule, 'renameSync').mockImplementation((from, to) => {
        realRename(from, to);
        // A phantom process recreates a stale pidfile every time this one is
        // cleared, so the retry loop must terminate rather than spin.
        plantPidFile('not json at all');
      });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(
        /keeps being replaced/
      );
    });
  });

  describe('release', () => {
    it('leaves the pidfile alone once another process owns it', () => {
      const handle = acquireSyncProcessLock(projectRoot);
      const otherPid = process.pid + 1;
      plantPidFile({ pid: otherPid, startedAt: '2026-01-01T00:00:00.000Z' });

      handle.release();

      expect(fs.existsSync(pidFilePath)).toBe(true);
      expect(ownerPid()).toBe(otherPid);
    });

    it('stays quiet when the pidfile is already gone', () => {
      const handle = acquireSyncProcessLock(projectRoot);
      fs.rmSync(pidFilePath);

      expect(() => handle.release()).not.toThrow();
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('warns rather than throwing when the pidfile cannot be removed', () => {
      const handle = acquireSyncProcessLock(projectRoot);
      jest.spyOn(fsModule, 'unlinkSync').mockImplementation(() => {
        throw errnoError('EACCES');
      });

      expect(() => handle.release()).not.toThrow();
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(PROCESS_LOCK_FILE_NAME)
      );
    });

    it('removes the pidfile only once across repeated calls', () => {
      const handle = acquireSyncProcessLock(projectRoot);
      handle.release();
      const unlinkSpy = jest.spyOn(fsModule, 'unlinkSync');

      handle.release();

      expect(unlinkSpy).not.toHaveBeenCalled();
    });
  });
});
