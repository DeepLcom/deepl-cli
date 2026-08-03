/**
 * Common types used throughout the application
 */

import { ENTRIES } from '../data/language-entries.js';

/**
 * Every language code the bundled snapshot lists, which is generated from
 * GET /v3/languages.
 *
 * Derived rather than hand-maintained: as a written-out union this was a fourth
 * copy of the same list and had already fallen four codes behind the snapshot
 * (de-ch, de-de, fr-ca, fr-fr), so the published typings could not describe a
 * config the CLI itself accepts. Regenerating the snapshot now widens this too.
 *
 * The API remains the authority on which languages exist -- runtime validation
 * accepts well-formed codes the snapshot predates, so this union is the set the
 * CLI can name offline, not the set that works.
 */
export type Language = (typeof ENTRIES)[number]['code'];

export type Formality =
  | 'default'
  | 'more'
  | 'less'
  | 'prefer_more'
  | 'prefer_less'
  | 'formal'
  | 'informal';

export type OutputFormat = 'text' | 'json' | 'table';
