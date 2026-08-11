/**
 * Permission enforcement for the files the CLI keeps private.
 *
 * The 0600 file mode and 0700 directory mode applied when the CLI creates them
 * are not enough on their own: a config file restored from a backup, copied by
 * another tool, or written by hand carries whatever mode it arrived with — and
 * `config.json` holds the API key in plaintext.
 */

import * as fs from 'fs';
import { Logger } from './logger.js';
import { errorMessage } from './error-message.js';

/** Any permission bit that lets a user other than the owner reach the path. */
const OTHER_USER_ACCESS = 0o077;

/** The bits that let another user add to or replace what is in a directory. */
const OTHER_USER_WRITE = 0o022;

/**
 * The restricted-deletion flag. On a sticky directory only the owner of a file
 * can rename or remove it, which is what makes a shared `/tmp` — mode 1777 by
 * design — a safe place to keep a private file after all.
 */
const STICKY = 0o1000;

const warnedDirectories = new Set<string>();

function modeOf(target: string): number | undefined {
  try {
    return fs.statSync(target).mode;
  } catch {
    return undefined;
  }
}

function octal(mode: number): string {
  return `0${mode.toString(8).padStart(3, '0')}`;
}

/**
 * Restore `mode` on a file the CLI owns and wrote itself, when any other user
 * can currently reach it. The warning fires once in practice, because the next
 * run finds the repaired mode — but it fires at all because a repair says
 * nothing about who read the file before it.
 */
export function repairPrivateFileMode(
  target: string,
  mode: number,
  advice?: string
): void {
  const stat = modeOf(target);
  if (stat === undefined) return;
  const found = stat & 0o777;
  if ((found & OTHER_USER_ACCESS) === 0) return;

  const suffix = advice === undefined ? '' : ` ${advice}`;
  try {
    fs.chmodSync(target, mode);
    Logger.warn(
      `Warning: ${target} was mode ${octal(found)}, which other users on this machine can read. Tightened to ${octal(mode)}.${suffix}`
    );
  } catch (error) {
    Logger.warn(
      `Warning: ${target} is mode ${octal(found)}, which other users on this machine can read, and it could not be tightened to ${octal(mode)}: ${errorMessage(error)}${suffix}`
    );
  }
}

/**
 * Report a directory another user can write to, naming the command that would
 * close it. The mode is deliberately left alone: unlike a file the CLI wrote, a
 * directory that already existed was created by someone else for reasons the
 * CLI cannot know — `path.dirname` of a `-c` override can be a home directory
 * or a scratch directory shared with other work — so locking other users out is
 * the user's call. Only the write bits are reported, because a merely
 * traversable directory does not let anyone replace the file inside it, and a
 * sticky one does not either.
 */
export function warnOnWritableDirectory(target: string): void {
  const stat = modeOf(target);
  if (stat === undefined || (stat & STICKY) !== 0) return;
  const found = stat & 0o777;
  if ((found & OTHER_USER_WRITE) === 0) return;
  if (warnedDirectories.has(target)) return;
  warnedDirectories.add(target);

  Logger.warn(
    `Warning: ${target} is mode ${octal(found)}, so other users on this machine can replace the files in it, including the one holding your API key. Run: chmod 700 ${target}`
  );
}

/**
 * Forget which directories have been reported, so a long-lived process — or a
 * test — sees the warning again rather than only once per process.
 */
export function resetWritableDirectoryWarnings(): void {
  warnedDirectories.clear();
}
