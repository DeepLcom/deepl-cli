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
  locale?: string,
  maxBytes?: number
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
  // `max_file_bytes` was enforced on SOURCE files only, so a target — the file a
  // hostile or corrupt checkout actually controls — was parsed and rebuilt at any
  // size. Reported as `unusable` rather than skipped, so the locale is refused
  // instead of being treated as empty, re-translated in full and overwritten.
  //
  // Checked on the content rather than through a separate `stat`: the cap's
  // purpose is to bound the parse, the reconstruct and the comparison work that
  // follow, which is where the cost was (a target with one long comment block
  // took 47 seconds). Node's own string-length ceiling bounds the read itself,
  // and it surfaces as a catchable error above.
  if (maxBytes !== undefined && Buffer.byteLength(content, 'utf8') > maxBytes) {
    return {
      state: 'unusable',
      reason: `file size ${Buffer.byteLength(content, 'utf8')} bytes exceeds sync.limits.max_file_bytes (${maxBytes})`,
      error: undefined,
    };
  }

  // A file holding only whitespace has no translations to lose, so `unusable` —
  // whose whole point is that the file holds the only copy of this locale's work
  // — does not describe it. Parsing it would fail for most formats
  // (`JSON.parse('  ')` throws), which would refuse the locale over an empty
  // file; the callers treat a blank template as "use the source's structure".
  if (content.trim() === '') {
    return { state: 'usable', content, translations: new Map() };
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

/**
 * The same condition for `deepl sync validate`, which only reads: nothing was
 * left unwritten, but nothing was checked either, and a pass that stayed
 * silent about that would let CI go green over a file it never looked at.
 */
export function unvalidatedTargetMessage(
  relPath: string,
  reason: string
): string {
  return (
    `target file ${relPath} is on disk but could not be read (${reason}) — ` +
    'its translations were not validated. Fix the file, then run ' +
    '`deepl sync validate` again.'
  );
}

/**
 * The same condition as `unusableTargetMessage`, in the voice a preview needs:
 * `--dry-run` has not left the file anywhere yet, and saying that it had would
 * contradict the report it appears in.
 */
export function unusableTargetPreviewMessage(
  locale: string,
  relPath: string,
  reason: string
): string {
  return (
    `${locale}: target file ${relPath} is on disk but could not be read ` +
    `(${reason}) — it holds the only copy of this locale's translations, so a ` +
    'real run would leave it as it stands, translate nothing for this locale ' +
    'and exit 12. It is left out of the estimate below. Fix it before running ' +
    '`deepl sync`.'
  );
}
