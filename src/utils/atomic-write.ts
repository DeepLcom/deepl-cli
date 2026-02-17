import * as fs from 'fs';

/**
 * Write a file atomically by writing to a temp file then renaming.
 * Prevents partial writes from corrupting output files.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string | Buffer,
  encoding?: BufferEncoding,
): Promise<void> {
  const tmpPath = filePath + '.tmp';
  try {
    await fs.promises.writeFile(tmpPath, content, encoding ? { encoding } : undefined);
    await fs.promises.rename(tmpPath, filePath);
  } catch (error) {
    try { await fs.promises.unlink(tmpPath); } catch { /* ignore cleanup errors */ }
    throw error;
  }
}

/**
 * Synchronous variant of atomicWriteFile.
 */
export function atomicWriteFileSync(
  filePath: string,
  content: string | Buffer,
  encoding?: BufferEncoding,
): void {
  const tmpPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, content, encoding ? { encoding } : undefined);
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }
    throw error;
  }
}
