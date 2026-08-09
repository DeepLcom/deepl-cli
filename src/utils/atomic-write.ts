import * as fs from 'fs';
import * as path from 'path';

/**
 * In-flight `.tmp` sibling files created by atomicWriteFile / atomicWriteFileSync.
 * A SIGINT / SIGTERM handler is registered on first use and detached when the
 * set drains, so `deepl sync` (and every other caller) leaves no orphans after
 * a crash between the write and the rename.
 */
const inFlightTmpPaths = new Set<string>();
let signalHandlersAttached = false;

function unlinkIgnoringMissing(tmpPath: string): void {
  try {
    fs.unlinkSync(tmpPath);
  } catch {
    /* ignore — file may have been renamed or already removed */
  }
}

function cleanupAllTmp(): void {
  if (inFlightTmpPaths.size === 0) return;
  for (const tmpPath of inFlightTmpPaths) {
    unlinkIgnoringMissing(tmpPath);
  }
  inFlightTmpPaths.clear();
}

function onSignalCleanup(): void {
  cleanupAllTmp();
  // Do not call process.exit here — other signal handlers (watch mode
  // shutdown, sync-process-lock release) still need to run.
}

function ensureSignalHandlers(): void {
  if (signalHandlersAttached) return;
  process.on('SIGINT', onSignalCleanup);
  process.on('SIGTERM', onSignalCleanup);
  signalHandlersAttached = true;
}

function maybeDetachSignalHandlers(): void {
  if (!signalHandlersAttached) return;
  if (inFlightTmpPaths.size > 0) return;
  process.off('SIGINT', onSignalCleanup);
  process.off('SIGTERM', onSignalCleanup);
  signalHandlersAttached = false;
}

function registerTmp(tmpPath: string): void {
  inFlightTmpPaths.add(path.resolve(tmpPath));
  ensureSignalHandlers();
}

function unregisterTmp(tmpPath: string): void {
  inFlightTmpPaths.delete(path.resolve(tmpPath));
  maybeDetachSignalHandlers();
}

/**
 * Public cleanup hook. Callers that own their own SIGINT handler (e.g. watch
 * mode) can invoke this defensively on shutdown to guarantee no orphan `.tmp`
 * sibling outlives the process.
 */
export function __cleanupInFlightTmpFiles(): void {
  cleanupAllTmp();
  maybeDetachSignalHandlers();
}

/**
 * Test-only introspection.
 */
export function __getInFlightTmpCount(): number {
  return inFlightTmpPaths.size;
}

/**
 * The `.tmp.<pid>.<random>` sibling `atomicWriteFile` renames from. It has to sit
 * beside its target, since a rename is only atomic within one filesystem, which
 * means anything watching the target's directory sees it appear and vanish.
 */
const TMP_SIBLING_PATTERN = /\.tmp\.\d+\.[a-z0-9]+$/;

/**
 * Whether `filePath` is a temp sibling of an in-flight atomic write.
 *
 * A watcher observing an output directory needs this: such a file is this
 * process mid-write, not a document, so it is neither something to translate nor
 * something to tell the user about.
 */
export function isAtomicWriteTempPath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  if (inFlightTmpPaths.has(resolved)) return true;
  // Not one of ours. The name pattern alone cannot be the whole test: it would
  // drop a real document named `*.tmp.<digits>.<lc-alnum>` from watch. It is
  // honoured only for a path that does not exist, which is what a temp sibling
  // looks like once its rename has completed but the watcher's event is only now
  // being delivered: there is nothing there to treat as a document.
  return TMP_SIBLING_PATTERN.test(resolved) && !fs.existsSync(resolved);
}

/**
 * Write a file atomically by writing to a temp file then renaming.
 * Prevents partial writes from corrupting output files. An existing
 * target's mode is preserved across the rename (chmod is not subject to
 * the umask, unlike the mode applied at file creation).
 */
export async function atomicWriteFile(
  filePath: string,
  content: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  const tmpPath =
    filePath +
    '.tmp.' +
    process.pid +
    '.' +
    Math.random().toString(36).slice(2, 8);
  let existingMode: number | undefined;
  try {
    existingMode = (await fs.promises.stat(filePath)).mode & 0o7777;
  } catch {
    /* target does not exist — keep default mode for new files */
  }
  registerTmp(tmpPath);
  try {
    await fs.promises.writeFile(
      tmpPath,
      content,
      encoding ? { encoding } : undefined
    );
    if (existingMode !== undefined) {
      await fs.promises.chmod(tmpPath, existingMode);
    }
    await fs.promises.rename(tmpPath, filePath);
  } catch (error) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }
    throw error;
  } finally {
    unregisterTmp(tmpPath);
  }
}

/**
 * Synchronous variant of atomicWriteFile.
 */
export function atomicWriteFileSync(
  filePath: string,
  content: string | Buffer,
  encoding?: BufferEncoding
): void {
  const tmpPath =
    filePath +
    '.tmp.' +
    process.pid +
    '.' +
    Math.random().toString(36).slice(2, 8);
  let existingMode: number | undefined;
  try {
    existingMode = fs.statSync(filePath).mode & 0o7777;
  } catch {
    /* target does not exist — keep default mode for new files */
  }
  registerTmp(tmpPath);
  try {
    fs.writeFileSync(tmpPath, content, encoding ? { encoding } : undefined);
    if (existingMode !== undefined) {
      fs.chmodSync(tmpPath, existingMode);
    }
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }
    throw error;
  } finally {
    unregisterTmp(tmpPath);
  }
}
