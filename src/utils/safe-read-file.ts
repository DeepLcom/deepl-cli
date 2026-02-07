import * as fs from 'fs';

/**
 * Read a file after verifying it is not a symlink.
 * Throws a clear error if the path is a symbolic link to prevent
 * symlink-based path traversal attacks.
 */
export function safeReadFileSync(filePath: string, encoding: 'utf-8'): string;
export function safeReadFileSync(filePath: string): Buffer;
export function safeReadFileSync(filePath: string, encoding?: 'utf-8'): string | Buffer {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symlinks are not supported for security reasons: ${filePath}`);
  }
  if (encoding) {
    return fs.readFileSync(filePath, encoding);
  }
  return fs.readFileSync(filePath);
}

/**
 * Async version: read a file after verifying it is not a symlink.
 */
export async function safeReadFile(filePath: string, encoding: 'utf-8'): Promise<string>;
export async function safeReadFile(filePath: string): Promise<Buffer>;
export async function safeReadFile(filePath: string, encoding?: 'utf-8'): Promise<string | Buffer> {
  const stat = await fs.promises.lstat(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symlinks are not supported for security reasons: ${filePath}`);
  }
  if (encoding) {
    return fs.promises.readFile(filePath, encoding);
  }
  return fs.promises.readFile(filePath);
}

/**
 * Check if a path is a symlink. Returns true if it is, false otherwise.
 * Returns false if the path does not exist.
 */
export function isSymlink(filePath: string): boolean {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}
