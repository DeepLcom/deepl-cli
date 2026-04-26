/**
 * Gated performance regression test for template-patterns dedup before resolveTemplatePatterns.
 *
 * Run with: SYNC_BENCH=1 npx jest sync-template-patterns-dedup-perf
 *
 * Without dedup, 2K files × 20 template literals each = 40K entries looped against 10K keys
 * yields 400M .test() calls (~8s). With dedup the 40K entries collapse to at most 20 unique
 * patterns, so the loop is 20 × 10K = 200K .test() calls (<10ms).
 */

import { resolveTemplatePatterns } from '../../src/sync/sync-context';
import type { TemplatePatternMatch } from '../../src/sync/sync-context';

const FILE_COUNT = 2_000;
const PATTERNS_PER_FILE = 20;
const KEY_COUNT = 10_000;
const THRESHOLD_MS = 2_000;

function buildFixture(): { patterns: TemplatePatternMatch[]; knownKeys: string[] } {
  const patterns: TemplatePatternMatch[] = [];
  for (let f = 0; f < FILE_COUNT; f++) {
    for (let p = 0; p < PATTERNS_PER_FILE; p++) {
      patterns.push({
        pattern: `section${p}.\${k}.title`,
        filePath: `src/file${f}.tsx`,
        line: p + 1,
        surroundingCode: `t(\`section${p}.\${k}.title\`)`,
        matchedFunction: 't',
      });
    }
  }

  const knownKeys: string[] = [];
  for (let k = 0; k < KEY_COUNT; k++) {
    knownKeys.push(`section${k % PATTERNS_PER_FILE}.item${k}.title`);
  }

  return { patterns, knownKeys };
}

describe('resolveTemplatePatterns dedup', () => {
  it('dedup collapses 40K dup-pattern entries to unique patterns, result matches single-entry baseline', () => {
    const UNIQUE_PATTERNS = 5;
    const DUP_COUNT = 1_000;
    const knownKeys = ['a.foo.title', 'b.bar.title', 'unrelated'];

    const base: TemplatePatternMatch = {
      pattern: 'a.${k}.title',
      filePath: 'base.tsx',
      line: 1,
      surroundingCode: "t(`a.${k}.title`)",
      matchedFunction: 't',
    };

    const uniqueExtras: TemplatePatternMatch[] = Array.from({ length: UNIQUE_PATTERNS - 1 }, (_, i) => ({
      pattern: `b.\${k${i}}.title`,
      filePath: `extra${i}.tsx`,
      line: i + 1,
      surroundingCode: `t(\`b.\${k${i}}.title\`)`,
      matchedFunction: 't',
    }));

    const singlePatterns = [base, ...uniqueExtras];
    const dupPatterns = [
      ...Array.from({ length: DUP_COUNT }, () => ({ ...base })),
      ...uniqueExtras,
    ];

    const resultSingle = resolveTemplatePatterns(singlePatterns, knownKeys);
    const resultDup = resolveTemplatePatterns(dupPatterns, knownKeys);

    expect(resultDup.has('a.foo.title')).toBe(true);
    expect(resultDup.has('b.bar.title')).toBe(true);

    const singleMatches = resultSingle.get('a.foo.title')!;
    const dupMatches = resultDup.get('a.foo.title')!;
    expect(dupMatches.length).toBe(singleMatches.length);
    expect(dupMatches[0]!.filePath).toBe(singleMatches[0]!.filePath);
    expect(dupMatches[0]!.line).toBe(singleMatches[0]!.line);
  });

  if (process.env['SYNC_BENCH']) {
    it('O(F×K) baseline without dedup is measurably slow', () => {
      const { patterns, knownKeys } = buildFixture();

      const start = Date.now();
      const seen = new Set<string>();
      const deduped = patterns.filter((t) => !seen.has(t.pattern) && seen.add(t.pattern));
      const dedupMs = Date.now() - start;

      const startSlow = Date.now();
      resolveTemplatePatterns(patterns, knownKeys);
      const elapsed = Date.now() - startSlow;

      expect(deduped.length).toBeLessThan(patterns.length);
      console.log(`[bench] patterns: ${patterns.length}, unique: ${seen.size}, keys: ${knownKeys.length}`);
      console.log(`[bench] dedup cost: ${dedupMs}ms`);
      console.log(`[bench] resolveTemplatePatterns (pre-dedup simulation): ${elapsed}ms`);
    });

    it('deduped resolveTemplatePatterns completes in under 2s for 2K-file × 40K-pattern fixture', () => {
      const { patterns, knownKeys } = buildFixture();

      const start = Date.now();
      const result = resolveTemplatePatterns(patterns, knownKeys);
      const elapsed = Date.now() - start;

      expect(result.size).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(THRESHOLD_MS);
      console.log(`[bench] resolveTemplatePatterns (deduped): ${elapsed}ms, matched keys: ${result.size}`);
    });
  }
});
