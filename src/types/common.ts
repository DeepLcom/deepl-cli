/**
 * Common types used throughout the application
 */

import { ENTRIES } from '../data/language-entries.js';

/**
 * Every language code in the bundled snapshot, which is generated from
 * GET /v3/languages. Derived from the snapshot so the two cannot disagree:
 * regenerating it widens this union.
 *
 * The API is the authority on which languages exist, and runtime validation
 * accepts well-formed codes the snapshot does not list, so this is the set the
 * CLI can name offline rather than the set that works.
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
