import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { atomicWriteFile, atomicWriteFileSync } from '../../src/utils/atomic-write';

describe('atomicWriteFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write content and verify file exists', async () => {
    const filePath = path.join(tmpDir, 'output.txt');
    await atomicWriteFile(filePath, 'hello world', 'utf-8');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it('should not leave .tmp file after success', async () => {
    const filePath = path.join(tmpDir, 'output.txt');
    await atomicWriteFile(filePath, 'content', 'utf-8');
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });

  it('should clean up .tmp file after rename failure', async () => {
    const filePath = path.join(tmpDir, 'output.txt');
    const renameSpy = jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('rename failed'));

    await expect(atomicWriteFile(filePath, 'content', 'utf-8')).rejects.toThrow('rename failed');
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);

    renameSpy.mockRestore();
  });

  it('should support Buffer content', async () => {
    const filePath = path.join(tmpDir, 'output.bin');
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    await atomicWriteFile(filePath, buf);
    expect(Buffer.compare(fs.readFileSync(filePath), buf)).toBe(0);
  });

  it('should overwrite existing files', async () => {
    const filePath = path.join(tmpDir, 'output.txt');
    fs.writeFileSync(filePath, 'old content');
    await atomicWriteFile(filePath, 'new content', 'utf-8');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
  });
});

describe('atomicWriteFileSync', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-sync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write content and verify file exists', () => {
    const filePath = path.join(tmpDir, 'output.txt');
    atomicWriteFileSync(filePath, 'hello sync', 'utf-8');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello sync');
  });

  it('should not leave .tmp file after success', () => {
    const filePath = path.join(tmpDir, 'output.txt');
    atomicWriteFileSync(filePath, 'content', 'utf-8');
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });

  it('should clean up .tmp file after write failure to non-existent directory', () => {
    const filePath = path.join(tmpDir, 'nonexistent', 'deep', 'output.txt');

    expect(() => atomicWriteFileSync(filePath, 'content', 'utf-8')).toThrow();
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });

  it('should support Buffer content', () => {
    const filePath = path.join(tmpDir, 'output.bin');
    const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    atomicWriteFileSync(filePath, buf);
    expect(Buffer.compare(fs.readFileSync(filePath), buf)).toBe(0);
  });
});
