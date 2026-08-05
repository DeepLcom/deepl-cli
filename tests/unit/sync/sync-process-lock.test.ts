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
      plantPidFile({ pid: 4242, startedAt: '2026-01-01T00:00:00.000Z' });
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw errnoError('EPERM');
      });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(ConfigError);
    });

    it('names the holding PID and its start time when refusing', () => {
      plantPidFile({ pid: 4242, startedAt: '2026-01-01T00:00:00.000Z' });
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw errnoError('EPERM');
      });

      expect(() => acquireSyncProcessLock(projectRoot)).toThrow(
        /PID=4242, started 2026-01-01T00:00:00\.000Z/
      );
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
