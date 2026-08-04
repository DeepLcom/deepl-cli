import { ValidationError } from './errors.js';

/** The API rejects requests naming more than five glossaries. */
export const MAX_GLOSSARIES_PER_REQUEST = 5;

export interface GlossarySelection {
  glossaryId?: string;
  glossaryIds?: string[];
}

/** A command's `--glossary`/`--from` pair, however that command spells them. */
export interface GlossarySourceLangSelection {
  glossary?: string | string[];
  from?: string;
}

/** Whether `--glossary` names anything; `[]` is truthy but selects nothing. */
export function hasGlossarySelection(selection: GlossarySourceLangSelection): boolean {
  const { glossary } = selection;
  return Array.isArray(glossary) ? glossary.length > 0 : !!glossary;
}

/**
 * Settle the source language a glossary request will carry, filling `from` from
 * the configured default when the flag is absent.
 *
 * The API rejects a glossary without `source_lang`, and `--from` is not the only
 * way one is supplied: `TranslationService` merges `defaults.sourceLang`.
 * Resolving the effective value onto `from` gives every path the same answer,
 * including the document path, which merges no defaults of its own, and the
 * glossary preflight, which needs the pair to check coverage.
 */
export function applyGlossarySourceLang(
  selection: GlossarySourceLangSelection,
  configuredSourceLang: string | undefined,
  example: string,
): void {
  if (!hasGlossarySelection(selection) || selection.from) {
    return;
  }
  if (configuredSourceLang) {
    selection.from = configuredSourceLang.toLowerCase();
    return;
  }
  throw new ValidationError('Source language (--from) is required when using a glossary', example);
}

export type GlossaryWireParams =
  | { glossary_id: string }
  | { glossary_ids: string[] };

/**
 * Pick the glossary parameter to send for a resolved glossary selection.
 *
 * A single glossary always goes out as `glossary_id`, even when it arrived via
 * `glossaryIds`, so single-glossary requests keep the wire shape — and the
 * cache keys — they had before `glossary_ids` existed. Two or more go out as
 * `glossary_ids`, which the API refuses to accept alongside `glossary_id`.
 *
 * The list order is preserved and never sorted: when several glossaries define
 * the same source term, the API applies the last one that names it.
 */
export function resolveGlossaryWireParams(
  selection: GlossarySelection,
): GlossaryWireParams | undefined {
  const ids = selection.glossaryIds;

  if (selection.glossaryId && ids && ids.length > 0) {
    throw new ValidationError(
      'Cannot combine glossaryId with glossaryIds',
      'Pass every glossary through glossaryIds; a single entry is sent as glossary_id automatically.',
    );
  }

  if (selection.glossaryId) {
    return { glossary_id: selection.glossaryId };
  }

  if (!ids || ids.length === 0) {
    return undefined;
  }

  if (ids.length > MAX_GLOSSARIES_PER_REQUEST) {
    throw new ValidationError(
      `A maximum of ${MAX_GLOSSARIES_PER_REQUEST} glossaries can be used per request, got ${ids.length}`,
      'Merge entries into fewer glossaries, or pass fewer --glossary flags.',
    );
  }

  const [only] = ids;
  if (ids.length === 1 && only) {
    return { glossary_id: only };
  }

  return { glossary_ids: ids };
}

/**
 * Encode `glossary_ids` for multipart requests. Unlike form-urlencoded bodies,
 * multipart uploads do not parse repeated `glossary_ids` fields as a list — the
 * API keeps only the first and silently applies that one glossary — so the IDs
 * travel as a single comma-joined value, which the API applies in full. Spaces
 * after the commas are tolerated, but nothing depends on that, so none are sent.
 */
export function encodeGlossaryIdsForMultipart(ids: string[]): string {
  return ids.join(',');
}
