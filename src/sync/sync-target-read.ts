import * as fs from 'fs';

import type { FormatParser } from '../formats/format.js';
import { extractExistingTranslations } from './sync-bucket-walker.js';

/**
 * What reading a locale's target file turned out to yield.
 *
 * `absent` and `unusable` are deliberately separate states. A locale that has
 * never been synced holds nothing, so a run may write its file from scratch. A
 * file that is on disk but cannot be read or cannot be parsed holds the only
 * copy of that locale's translations — the lockfile records hashes, not
 * translated text — so treating it as empty re-translates every key and then
 * overwrites the file with the result.
 */
export type TargetFileRead =
  | { state: 'absent' }
  | { state: 'usable'; content: string; translations: Map<string, string> }
  | { state: 'unusable'; reason: string; error: unknown };

/**
 * Read a target file and extract the translations it holds.
 *
 * `locale` is only consulted for a multi-locale format; a bilingual or
 * monolingual parser reads the file's own translation side.
 */
export async function readTargetFile(
  parser: FormatParser,
  absPath: string,
  locale?: string
): Promise<TargetFileRead> {
  let content: string;
  try {
    content = await fs.promises.readFile(absPath, 'utf-8');
  } catch (err) {
    // Only "no such file" means the locale has nothing yet. Every other errno —
    // EACCES, EISDIR, EIO — says something is at that path that this run failed
    // to open, which is not the same as nothing being there.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: 'absent' };
    }
    return { state: 'unusable', reason: describe(err), error: err };
  }
  try {
    return {
      state: 'usable',
      content,
      translations: extractExistingTranslations(parser, content, locale),
    };
  } catch (err) {
    return { state: 'unusable', reason: describe(err), error: err };
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Why a run left a target file alone, phrased for a user who has to fix it.
 */
export function unusableTargetMessage(relPath: string, reason: string): string {
  return (
    `target file ${relPath} is on disk but could not be read (${reason}) — ` +
    "it holds the only copy of this locale's translations, so it was left as it " +
    'stands rather than rebuilt from the source. Fix it, then run `deepl sync` again.'
  );
}
