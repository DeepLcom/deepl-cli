/**
 * Tests for the private-mode enforcement helpers.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  repairPrivateFileMode,
  warnOnWritableDirectory,
  resetWritableDirectoryWarnings,
} from '../../src/utils/private-mode';

describe('private mode enforcement', () => {
  let dir: string;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-private-mode-'));
    fs.chmodSync(dir, 0o700);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    resetWritableDirectoryWarnings();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function warnings(): string {
    return consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  describe('repairPrivateFileMode()', () => {
    it('should tighten a group- and world-readable file to the required mode', () => {
      const file = path.join(dir, 'config.json');
      fs.writeFileSync(file, '{}');
      fs.chmodSync(file, 0o644);

      repairPrivateFileMode(file, 0o600);

      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    });

    it('should name the path and the mode it found', () => {
      const file = path.join(dir, 'config.json');
      fs.writeFileSync(file, '{}');
      fs.chmodSync(file, 0o644);

      repairPrivateFileMode(file, 0o600);

      expect(warnings()).toContain(file);
      expect(warnings()).toContain('0644');
      expect(warnings()).toContain('0600');
    });

    it('should append the caller advice to the warning', () => {
      const file = path.join(dir, 'config.json');
      fs.writeFileSync(file, '{}');
      fs.chmodSync(file, 0o604);

      repairPrivateFileMode(file, 0o600, 'Consider rotating the key.');

      expect(warnings()).toContain('Consider rotating the key.');
    });

    it('should leave an already private file alone and say nothing', () => {
      const file = path.join(dir, 'config.json');
      fs.writeFileSync(file, '{}');
      fs.chmodSync(file, 0o600);

      repairPrivateFileMode(file, 0o600);

      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should do nothing when the path does not exist', () => {
      repairPrivateFileMode(path.join(dir, 'absent.json'), 0o600);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('warnOnWritableDirectory()', () => {
    it('should warn about a world-writable directory', () => {
      fs.chmodSync(dir, 0o777);

      warnOnWritableDirectory(dir);

      expect(warnings()).toContain(dir);
      expect(warnings()).toContain('0777');
    });

    it('should warn about a group-writable directory', () => {
      fs.chmodSync(dir, 0o770);

      warnOnWritableDirectory(dir);

      expect(warnings()).toContain(dir);
    });

    it('should leave the mode alone rather than tightening it', () => {
      fs.chmodSync(dir, 0o777);

      warnOnWritableDirectory(dir);

      expect(fs.statSync(dir).mode & 0o777).toBe(0o777);
    });

    it('should say nothing about a world-writable directory with the sticky bit set', () => {
      fs.chmodSync(dir, 0o1777);

      warnOnWritableDirectory(dir);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should say nothing about a merely traversable directory', () => {
      fs.chmodSync(dir, 0o755);

      warnOnWritableDirectory(dir);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should say nothing about a private directory', () => {
      fs.chmodSync(dir, 0o700);

      warnOnWritableDirectory(dir);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should warn once per path however many callers check it', () => {
      fs.chmodSync(dir, 0o777);

      warnOnWritableDirectory(dir);
      warnOnWritableDirectory(dir);
      warnOnWritableDirectory(dir);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when the path does not exist', () => {
      warnOnWritableDirectory(path.join(dir, 'absent'));

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
