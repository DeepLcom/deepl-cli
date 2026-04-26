import * as fs from 'fs';
import * as path from 'path';

/**
 * Terminology regression — keep the word "sync" from drifting back into prose
 * as a bare verb. Policy:
 *   - Noun: "a sync run", "the sync command" — OK.
 *   - Gerund: "syncing" — avoided in prose; acceptable in runtime log strings
 *     (which are in src/, not audited here).
 *   - Verb: spell it as `deepl sync` (inline code) — bare-verb patterns like
 *     "to sync X" or "sync your Y" are not allowed.
 *
 * Code blocks (fenced ```...```) and inline-code spans (`...`) are exempted
 * because they're literal CLI output or command strings.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const DOCS = [
  path.join(REPO_ROOT, 'docs', 'API.md'),
  path.join(REPO_ROOT, 'docs', 'SYNC.md'),
  path.join(REPO_ROOT, 'docs', 'TROUBLESHOOTING.md'),
  path.join(REPO_ROOT, 'README.md'),
];

// Bare-verb forms we want to stay out of prose. Keep patterns narrow: they
// match "sync" used as a verb, not "sync" used as a noun/attribute.
const BARE_VERB_PATTERNS: RegExp[] = [
  /\bto sync\b/i, // infinitive: "to sync your files"
  /\bsync your\b/i, // imperative with possessive: "sync your strings"
  /\bsync the (local|remote|content|files|strings|locales|project|glossar)/i,
];

/**
 * Known bare-verb uses that read more naturally than the canonical rewrite.
 * Each entry should point at a specific doc + snippet and explain why it's
 * grandfathered; the test allows up to 5 such exceptions to avoid rubber-stamp
 * growth.
 */
const TOLERATED: { doc: string; snippet: string; reason: string }[] = [];

function stripExemptRegions(source: string): string {
  // Blank out fenced code blocks while preserving line count so failure
  // messages cite the real line number in the source doc.
  let out = source.replace(/```[\s\S]*?```/g, (match) =>
    match.replace(/[^\n]/g, ''),
  );
  // Drop inline code spans (single-line, so line count is unaffected).
  out = out.replace(/`[^`\n]*`/g, '');
  return out;
}

describe('sync terminology regression', () => {
  it('keeps the TOLERATED exception list bounded', () => {
    expect(TOLERATED.length).toBeLessThanOrEqual(5);
  });

  for (const docPath of DOCS) {
    const rel = path.relative(REPO_ROOT, docPath);

    describe(`${rel}`, () => {
      const raw = fs.readFileSync(docPath, 'utf-8');
      const prose = stripExemptRegions(raw);
      const proseLines = prose.split('\n');

      for (const pattern of BARE_VERB_PATTERNS) {
        it(`has no bare-verb matches for ${String(pattern)}`, () => {
          const hits: string[] = [];
          proseLines.forEach((line, idx) => {
            if (pattern.test(line)) {
              const tolerated = TOLERATED.some(
                (t) => t.doc === rel && line.includes(t.snippet),
              );
              if (!tolerated) {
                hits.push(`  ${rel}:${idx + 1}: ${line.trim()}`);
              }
            }
          });
          expect(hits).toEqual([]);
        });
      }
    });
  }
});
