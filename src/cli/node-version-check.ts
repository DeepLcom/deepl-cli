/**
 * Startup engine check. Runs before anything that can load node:sqlite so
 * unsupported runtimes get one clear line instead of an ExperimentalWarning
 * or a native-module crash.
 *
 * The floor is a minor version, not just a major: node:sqlite stopped emitting
 * `ExperimentalWarning: SQLite is an experimental feature` only in 24.15.0, and
 * that warning goes to stderr on every cache-backed command — which breaks
 * callers that merge stderr into stdout and parse `--format json`.
 */

import { ExitCode } from '../utils/exit-codes.js';

export const MIN_NODE_MAJOR = 24;
export const MIN_NODE_MINOR = 15;
export const MIN_NODE_VERSION = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0`;

/**
 * Return the error line for an unsupported Node.js version, or null when the
 * version is supported. Unparseable versions fail open.
 */
export function unsupportedNodeVersionMessage(
  version: string = process.versions.node
): string | null {
  const parts = version.split('.');
  const major = Number(parts[0]);
  if (!Number.isInteger(major)) {
    return null;
  }
  if (major !== MIN_NODE_MAJOR) {
    return major > MIN_NODE_MAJOR ? null : unsupportedMessage(version);
  }
  const minor = Number(parts[1]);
  if (!Number.isInteger(minor) || minor >= MIN_NODE_MINOR) {
    return null;
  }
  return unsupportedMessage(version);
}

function unsupportedMessage(version: string): string {
  return `deepl requires Node.js >= ${MIN_NODE_VERSION}, you are running v${version}. Upgrade Node.js to use the DeepL CLI.`;
}

export function assertSupportedNodeVersion(
  version: string = process.versions.node
): void {
  const message = unsupportedNodeVersionMessage(version);
  if (message) {
    console.error(message);
    process.exit(ExitCode.InvalidInput);
  }
}
