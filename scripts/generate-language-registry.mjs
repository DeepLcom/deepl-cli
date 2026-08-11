#!/usr/bin/env node
/**
 * Regenerates src/data/language-entries.ts from GET /v3/languages, keeping the
 * bundled snapshot a build artifact of the API rather than a hand-kept list.
 *
 * Tiers are derived, not judged: the derivation lives in
 * src/data/language-registry.ts and is imported from dist/ so the snapshot and
 * the runtime fallback cannot disagree.
 *
 * Usage:
 *   node scripts/generate-language-registry.mjs           # rewrite the file
 *   node scripts/generate-language-registry.mjs --check    # exit 1 on drift
 *
 * Needs DEEPL_API_KEY and a current build (npm run build).
 */
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGET = path.join(ROOT, 'src', 'data', 'language-entries.ts');
const DERIVATION = path.join(ROOT, 'dist', 'data', 'language-registry.js');

/**
 * A core count below this means the derivation is broken rather than that DeepL
 * dropped languages -- most likely the features matrix no longer reports
 * `glossary`, which would tier every language as extended and make --formality
 * and --glossary unusable. Cheap floor over the whole failure class.
 */
const MIN_CORE_LANGUAGES = 20;

const GROUPS = [
  ['core', 'Core languages (full feature support: formality, glossary, all model types)'],
  ['regional', 'Regional variants (target-only)'],
  ['extended', 'Extended languages (quality_optimized only, no formality/glossary)'],
];

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const byCode = (a, b) => a.code.localeCompare(b.code, 'en');

const LANGUAGE_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;
/** Letters, marks, digits and the punctuation DeepL's display names actually use. */
const DISPLAY_NAME = /^[\p{L}\p{M}\p{N} ()'’.,-]{1,60}$/u;

/**
 * Quote a value as a single-quoted TypeScript string literal, escaping what
 * would otherwise end the literal or the line.
 */
function quote(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `'${escaped}'`;
}

/**
 * Rejects a response field that has no business being in a language list.
 * The output of this script is TypeScript that the next build compiles and the
 * test suite imports, so a response field is untrusted input to a code
 * generator: it is validated, not merely escaped.
 */
export function assertRenderable(entry) {
  if (typeof entry.code !== 'string' || !LANGUAGE_CODE.test(entry.code)) {
    throw new Error(`refusing to write language code ${JSON.stringify(entry.code)}: not shaped like a language tag`);
  }
  if (typeof entry.name !== 'string' || !DISPLAY_NAME.test(entry.name)) {
    throw new Error(`refusing to write display name ${JSON.stringify(entry.name)} for ${entry.code}`);
  }
  if (!['core', 'regional', 'extended'].includes(entry.category)) {
    throw new Error(`unexpected category ${JSON.stringify(entry.category)} for ${entry.code}`);
  }
}

function renderEntry(entry) {
  const fields = [`code: ${quote(entry.code)}`, `name: ${quote(entry.name)}`];
  fields.push(`category: ${quote(entry.category)}`);
  if (entry.targetOnly) fields.push('targetOnly: true');
  return `  { ${fields.join(', ')} },`;
}

/**
 * Renders the whole file. Exported so the snapshot can also be re-rendered from
 * the data it already holds, without a live API call.
 */
export function renderRegistry(entries, writeTargets) {
  // Validated before grouping: grouping filters by category, so an entry with an
  // unrecognized one would be dropped from the output without ever being checked.
  entries.forEach(assertRenderable);

  const body = GROUPS.map(([category, heading]) => {
    const group = entries.filter(e => e.category === category).sort(byCode);
    return [`  // ${heading}`, ...group.map(renderEntry)].join('\n');
  }).join('\n\n');

  return `/**
 * Supported DeepL languages, generated from GET /v3/languages.
 *
 * DO NOT EDIT BY HAND. Run "npm run generate:languages" to refresh, and
 * "npm run check:languages" to detect drift. Tiers are derived by
 * deriveLanguageEntry in ./language-registry.ts, not chosen here.
 *
 * The API is the authority on which languages exist; this snapshot exists so
 * the CLI can list and validate languages without a network call or API key.
 * It may therefore lag the API, which is why callers accept well-formed codes
 * it does not contain rather than rejecting them.
 *
 * \`as const\` is load-bearing: the Language union in src/types/common.ts is
 * derived from these codes, so a language added upstream widens the type on
 * regenerate.
 */
import type { LanguageEntry } from './language-registry.js';

export const ENTRIES = [
${body}
] as const satisfies readonly LanguageEntry[];

/**
 * Target languages the Write API accepts, from resource=write.
 *
 * \`write\` and \`correct\` check a code against this list locally, because the
 * set is small enough for the error to name every option. A code shaped like a
 * language tag but absent from the list still goes to the API, with the list as
 * a warning, so a language added upstream is usable before a regenerate.
 *
 * \`as const\` is load-bearing -- the WriteLanguage union in src/types/api.ts is
 * derived from it, so a language added upstream widens the type on regenerate.
 */
export const WRITE_TARGET_LANGUAGES = [
${writeTargets.map(code => `  ${quote(code)},`).join('\n')}
] as const;
`;
}

async function main() {
  const checkOnly = process.argv.includes('--check');

  const apiKey = process.env['DEEPL_API_KEY'];
  if (!apiKey) {
    fail('DEEPL_API_KEY is not set; the snapshot can only be generated from the live API.');
  }
  if (!existsSync(DERIVATION)) {
    fail(`missing ${path.relative(ROOT, DERIVATION)}; run "npm run build" first.`);
  }

  const { deriveLanguageEntry } = await import(DERIVATION);

  const host = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

  async function fetchResource(resource) {
    const response = await fetch(`${host}/v3/languages?resource=${resource}`, {
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
    });
    if (!response.ok) {
      return {
        resource,
        error: `GET /v3/languages?resource=${resource} returned ${response.status} ${response.statusText}`,
      };
    }
    const languages = await response.json();
    if (!Array.isArray(languages) || languages.length === 0) {
      return { resource, error: `GET /v3/languages?resource=${resource} returned no languages` };
    }
    return { resource, languages };
  }

  // Fetched and reported together, so a key that cannot read one resource still
  // regenerates from the other and both failures surface at once.
  const [translateResult, writeResult] = await Promise.all([
    fetchResource('translate_text'),
    fetchResource('write'),
  ]);
  const errors = [translateResult, writeResult].filter(r => r.error).map(r => r.error);
  if (errors.length > 0) {
    fail(errors.join('\n       '));
  }

  const entries = translateResult.languages.map(deriveLanguageEntry);
  // The write endpoints take a target language only, so the list is filtered by
  // that role rather than run through deriveLanguageEntry -- write has no notion
  // of the core/regional/extended tiers.
  const writeTargets = writeResult.languages
    .filter(language => language.usable_as_target)
    .map(language => language.lang.toLowerCase())
    .sort((a, b) => a.localeCompare(b, 'en'));

  const coreCount = entries.filter(e => e.category === 'core').length;
  if (coreCount < MIN_CORE_LANGUAGES) {
    fail(
      `only ${coreCount} core languages derived (expected at least ${MIN_CORE_LANGUAGES}); ` +
        'the features matrix probably stopped reporting "glossary". Refusing to write a ' +
        'snapshot that would retier every language as extended.',
    );
  }
  // An empty write list collapses the WriteLanguage union to never, which would
  // reject every --lang while naming no valid option at all.
  if (writeTargets.length === 0) {
    fail('no write target languages reported (expected usable_as_target on resource=write)');
  }
  for (const code of writeTargets) {
    if (!LANGUAGE_CODE.test(code)) {
      fail(`refusing to write Write language code ${JSON.stringify(code)}: not shaped like a language tag`);
    }
  }

  let contents;
  try {
    contents = renderRegistry(entries, writeTargets);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (checkOnly) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
    if (current === contents) {
      console.log(
        `${entries.length} languages, ${writeTargets.length} write targets; snapshot is current.`,
      );
      process.exit(0);
    }
    // Name which list moved: the two come from different resources, so "N
    // languages upstream" is misleading when it is the write list that drifted.
    // Whole blocks are compared, not just the codes, so a renamed display name
    // is reported as real drift.
    const blockIn = (source, open, close) => {
      const start = source.indexOf(open);
      if (start === -1) return '';
      const from = start + open.length;
      const end = source.indexOf(close, from);
      return source.slice(from, end === -1 ? undefined : end);
    };
    const blocks = [
      ['translate_text', `${entries.length}`, 'export const ENTRIES', '\n] as const satisfies'],
      ['write', `${writeTargets.length}`, 'export const WRITE_TARGET_LANGUAGES', '] as const;'],
    ];
    const drifted = blocks
      .filter(([, , open, close]) => blockIn(current, open, close) !== blockIn(contents, open, close))
      .map(([name, count]) => `${name} (${count} upstream)`);
    const detail = drifted.length > 0 ? drifted.join(', ') : 'file header or formatting';
    console.error(
      `error: ${path.relative(ROOT, TARGET)} is out of date with the API -- ${detail}.\n` +
        'Run: npm run generate:languages',
    );
    process.exit(1);
  }

  writeFileSync(TARGET, contents);
  const counts = GROUPS.map(([c]) => `${c} ${entries.filter(e => e.category === c).length}`);
  console.log(
    `wrote ${path.relative(ROOT, TARGET)}: ${entries.length} languages (${counts.join(', ')}), ` +
      `${writeTargets.length} write targets`,
  );
}

// Importable for re-rendering without touching the network; only the CLI entry
// point fetches. argv[1] is compared through realpathSync because Node resolves
// the ESM entry to its real path, so a symlinked checkout (or an npm-linked
// package) would otherwise make both npm scripts silent no-ops.
const invokedPath = process.argv[1];
const invokedDirectly =
  invokedPath !== undefined &&
  (() => {
    try {
      return realpathSync(invokedPath) === import.meta.filename;
    } catch {
      return invokedPath === import.meta.filename;
    }
  })();

if (invokedDirectly) {
  // Caught so a thrown fetch, or an HTML error body that does not parse, reports
  // itself the way every other failure in this script does rather than as an
  // unhandled rejection with a stack trace.
  try {
    await main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
