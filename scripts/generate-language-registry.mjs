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

const checkOnly = process.argv.includes('--check');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const apiKey = process.env['DEEPL_API_KEY'];
if (!apiKey) {
  fail('DEEPL_API_KEY is not set; the snapshot can only be generated from the live API.');
}
if (!existsSync(DERIVATION)) {
  fail(`missing ${path.relative(ROOT, DERIVATION)}; run "npm run build" first.`);
}

const { deriveLanguageEntry } = await import(DERIVATION);

const host = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
const response = await fetch(`${host}/v3/languages?resource=translate_text`, {
  headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
});
if (!response.ok) {
  fail(`GET /v3/languages returned ${response.status} ${response.statusText}`);
}

const languages = await response.json();
if (!Array.isArray(languages) || languages.length === 0) {
  fail('GET /v3/languages returned no languages');
}

const entries = languages.map(deriveLanguageEntry);
const byCode = (a, b) => a.code.localeCompare(b.code, 'en');
const groups = [
  ['core', 'Core languages (full feature support: formality, glossary, all model types)'],
  ['regional', 'Regional variants (target-only)'],
  ['extended', 'Extended languages (quality_optimized only, no formality/glossary)'],
];

function render(entry) {
  const fields = [`code: '${entry.code}'`, `name: '${entry.name.replace(/'/g, "\\'")}'`];
  fields.push(`category: '${entry.category}'`);
  if (entry.targetOnly) fields.push('targetOnly: true');
  return `  { ${fields.join(', ')} },`;
}

const body = groups
  .map(([category, heading]) => {
    const group = entries.filter(e => e.category === category).sort(byCode);
    return [`  // ${heading}`, ...group.map(render)].join('\n');
  })
  .join('\n\n');

const contents = `/**
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
 */
import type { LanguageEntry } from './language-registry.js';

export const ENTRIES: LanguageEntry[] = [
${body}
];
`;

if (checkOnly) {
  const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
  if (current === contents) {
    console.log(`${entries.length} languages; snapshot is current.`);
    process.exit(0);
  }
  console.error(
    `error: ${path.relative(ROOT, TARGET)} is out of date with the API (${entries.length} languages upstream).\n` +
      'Run: npm run generate:languages',
  );
  process.exit(1);
}

writeFileSync(TARGET, contents);
const counts = groups.map(([c]) => `${c} ${entries.filter(e => e.category === c).length}`);
console.log(`wrote ${path.relative(ROOT, TARGET)}: ${entries.length} languages (${counts.join(', ')})`);
