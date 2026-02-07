/**
 * Tests for safeReadFile utility
 * Verifies symlink detection across all file-reading paths
 */

import { safeReadFileSync, safeReadFile, isSymlink } from '../../src/utils/safe-read-file.js';
import * as fs from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('safe-read-file', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `deepl-cli-safe-read-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('safeReadFileSync', () => {
    it('should read a regular file as utf-8 string', () => {
      const filePath = join(testDir, 'regular.txt');
      fs.writeFileSync(filePath, 'hello world', 'utf-8');

      const content = safeReadFileSync(filePath, 'utf-8');
      expect(content).toBe('hello world');
    });

    it('should read a regular file as Buffer', () => {
      const filePath = join(testDir, 'regular.bin');
      const data = Buffer.from([0x01, 0x02, 0x03]);
      fs.writeFileSync(filePath, data);

      const content = safeReadFileSync(filePath);
      expect(Buffer.isBuffer(content)).toBe(true);
      expect(content).toEqual(data);
    });

    it('should throw for a symbolic link', () => {
      const targetPath = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'link.txt');
      fs.writeFileSync(targetPath, 'secret data', 'utf-8');
      fs.symlinkSync(targetPath, linkPath);

      expect(() => safeReadFileSync(linkPath, 'utf-8')).toThrow(
        'Symlinks are not supported for security reasons'
      );
    });

    it('should include the file path in the error message', () => {
      const targetPath = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'symlink.txt');
      fs.writeFileSync(targetPath, 'data', 'utf-8');
      fs.symlinkSync(targetPath, linkPath);

      expect(() => safeReadFileSync(linkPath, 'utf-8')).toThrow(linkPath);
    });

    it('should throw ENOENT for non-existent file', () => {
      const filePath = join(testDir, 'nonexistent.txt');

      expect(() => safeReadFileSync(filePath, 'utf-8')).toThrow();
    });

    it('should throw for a symlink even when reading as Buffer', () => {
      const targetPath = join(testDir, 'target.bin');
      const linkPath = join(testDir, 'link.bin');
      fs.writeFileSync(targetPath, Buffer.from([0x01]));
      fs.symlinkSync(targetPath, linkPath);

      expect(() => safeReadFileSync(linkPath)).toThrow(
        'Symlinks are not supported for security reasons'
      );
    });
  });

  describe('safeReadFile (async)', () => {
    it('should read a regular file as utf-8 string', async () => {
      const filePath = join(testDir, 'regular.txt');
      fs.writeFileSync(filePath, 'async hello', 'utf-8');

      const content = await safeReadFile(filePath, 'utf-8');
      expect(content).toBe('async hello');
    });

    it('should read a regular file as Buffer', async () => {
      const filePath = join(testDir, 'regular.bin');
      const data = Buffer.from([0x04, 0x05]);
      fs.writeFileSync(filePath, data);

      const content = await safeReadFile(filePath);
      expect(Buffer.isBuffer(content)).toBe(true);
      expect(content).toEqual(data);
    });

    it('should throw for a symbolic link', async () => {
      const targetPath = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'link.txt');
      fs.writeFileSync(targetPath, 'secret', 'utf-8');
      fs.symlinkSync(targetPath, linkPath);

      await expect(safeReadFile(linkPath, 'utf-8')).rejects.toThrow(
        'Symlinks are not supported for security reasons'
      );
    });

    it('should include the file path in the error message', async () => {
      const targetPath = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'async-symlink.txt');
      fs.writeFileSync(targetPath, 'data', 'utf-8');
      fs.symlinkSync(targetPath, linkPath);

      await expect(safeReadFile(linkPath, 'utf-8')).rejects.toThrow(linkPath);
    });

    it('should reject for non-existent file', async () => {
      const filePath = join(testDir, 'nonexistent.txt');

      await expect(safeReadFile(filePath, 'utf-8')).rejects.toThrow();
    });
  });

  describe('isSymlink', () => {
    it('should return true for a symbolic link', () => {
      const targetPath = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'link.txt');
      fs.writeFileSync(targetPath, 'data', 'utf-8');
      fs.symlinkSync(targetPath, linkPath);

      expect(isSymlink(linkPath)).toBe(true);
    });

    it('should return false for a regular file', () => {
      const filePath = join(testDir, 'regular.txt');
      fs.writeFileSync(filePath, 'data', 'utf-8');

      expect(isSymlink(filePath)).toBe(false);
    });

    it('should return false for a non-existent path', () => {
      expect(isSymlink(join(testDir, 'nonexistent.txt'))).toBe(false);
    });

    it('should return false for a directory', () => {
      const dirPath = join(testDir, 'subdir');
      fs.mkdirSync(dirPath);

      expect(isSymlink(dirPath)).toBe(false);
    });
  });
});
