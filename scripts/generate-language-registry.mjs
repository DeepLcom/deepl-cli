#!/usr/bin/env node
/**
 * Regenerates src/data/language-entries.ts from GET /v3/languages.
 *
 * The language list used to be hand-maintained, which meant it could silently
 * fall behind the API: four target languages DeepL had added (de-CH, de-DE,
 * fr-CA, fr-FR) were missing, so the CLI rejected them locally even though the
 * API accepted them. Generating the file keeps it an honest snapshot.
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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGET = path.join(ROOT, 'src', 'data', 'language-entries.ts');
const DERIVATION = path.join(ROOT, 'dist', 'data', 'language-registry.js');

/**
 * A tier count this far below the live shape means the derivation stopped
 * working rather than that DeepL dropped languages -- most likely the features
 * matrix stopped reporting `glossary`, which would silently retier all 125
 * languages as extended and make --formality and --glossary unusable
 * everywhere. Cheap floor, catches the whole failure class.
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

function renderEntry(entry) {
  const fields = [`code: '${entry.code}'`, `name: '${entry.name.replace(/'/g, "\\'")}'`];
  fields.push(`category: '${entry.category}'`);
  if (entry.targetOnly) fields.push('targetOnly: true');
  return `  { ${fields.join(', ')} },`;
}

/**
 * Renders the whole file. Exported so the snapshot can be re-rendered from the
 * data it already holds -- a formatting or type change to the template does not
 * need a live API call to apply.
 */
export function renderRegistry(entries, writeTargets) {
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
 * regenerate instead of needing a second hand-kept copy of the same list.
 */
import type { LanguageEntry } from './language-registry.js';

export const ENTRIES = [
${body}
] as const satisfies readonly LanguageEntry[];

/**
 * Target languages the Write API accepts, from resource=write.
 *
 * Unlike translation, \`write\` and \`correct\` reject a code outside this list
 * locally rather than deferring to the API: the supported set is small enough
 * to enumerate in the error, so naming the valid options beats a round trip.
 * That makes keeping this generated the thing that stops it going stale.
 *
 * \`as const\` is load-bearing -- the WriteLanguage union in src/types/api.ts is
 * derived from it, so adding a language upstream widens the type on regenerate
 * instead of needing a second hand edit.
 */
export const WRITE_TARGET_LANGUAGES = [
${writeTargets.map(code => `  '${code}',`).join('\n')}
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

  // Fetched together and reported together: failing fast on the first resource
  // meant a key that cannot read resource=write blocked regenerating the
  // translation list too, which it can read perfectly well.
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
  // An empty write list would collapse the WriteLanguage union to never, so
  // every --lang would be rejected while naming no valid option at all.
  if (writeTargets.length === 0) {
    fail('no write target languages reported (expected usable_as_target on resource=write)');
  }

  const contents = renderRegistry(entries, writeTargets);

  if (checkOnly) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
    if (current === contents) {
      console.log(
        `${entries.length} languages, ${writeTargets.length} write targets; snapshot is current.`,
      );
      process.exit(0);
    }
    // Name which list moved: the two are generated from different resources, and
    // "N languages upstream" is misleading when it is the write list that drifted.
    // Compared on the whole block rather than the codes alone, so a renamed
    // display name is not reported as "formatting only".
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
// point fetches.
if (process.argv[1] === import.meta.filename) {
  await main();
}
