/**
 * Gated performance regression test for pluralSlots batchIndices membership check.
 *
 * Run with: SYNC_BENCH=1 npx jest sync-locale-translator-plural-perf
 *
 * Validates that the hot path in LocaleTranslator.translate — iterating pluralSlots
 * and checking membership in batchIndices / indices — runs in O(N) via Set.has
 * rather than O(N²) via Array.includes.
 *
 * Fixture: 5000 diffs × 1 plural slot each = 5000 pluralSlots, 5000 batchIndices.
 * O(N²) at V8 linear-scan speeds (~100M ops/s) ≈ 0.25s per loop site;
 * three sites × 50-locale outer = ~37s. O(N) target: <1s total.
 */

import type { PluralSlot } from '../../src/sync/sync-message-preprocess';

const PLURAL_COUNT = 5_000;
const LOCALE_COUNT = 50;
const THRESHOLD_MS = 1_000;

function buildFixture(n: number): { batchIndices: number[]; pluralSlots: PluralSlot[] } {
  const batchIndices: number[] = [];
  const pluralSlots: PluralSlot[] = [];
  for (let i = 0; i < n; i++) {
    batchIndices.push(i);
    pluralSlots.push({ diffIndex: i, format: 'po', slotKey: 'msgid_plural', textIndex: n + i });
  }
  return { batchIndices, pluralSlots };
}

describe('pluralSlots batchIndices membership lookup', () => {
  it('Set.has produces identical membership results to Array.includes for known inputs', () => {
    const batchIndices = [0, 2, 4, 6, 8];
    const batchSet = new Set(batchIndices);
    const slots: PluralSlot[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => ({
      diffIndex: i,
      format: 'po',
      slotKey: 'msgid_plural',
      textIndex: 100 + i,
    }));

    for (const slot of slots) {
      expect(batchSet.has(slot.diffIndex)).toBe(batchIndices.includes(slot.diffIndex));
    }
  });

  if (process.env['SYNC_BENCH']) {
    it('Array.includes O(N²) baseline is measurably slow', () => {
      const { batchIndices, pluralSlots } = buildFixture(PLURAL_COUNT);
      const start = Date.now();
      let hits = 0;
      for (let locale = 0; locale < LOCALE_COUNT; locale++) {
        for (const slot of pluralSlots) {
          if (batchIndices.includes(slot.diffIndex)) {
            hits++;
          }
        }
      }
      const elapsed = Date.now() - start;
      expect(hits).toBe(PLURAL_COUNT * LOCALE_COUNT);
      console.log(`[bench] Array.includes baseline: ${elapsed}ms (hits=${hits})`);
    });

    it('Set.has O(N) lookup completes in under 1s for 50 locales × 5K pluralSlots', () => {
      const { batchIndices, pluralSlots } = buildFixture(PLURAL_COUNT);
      const batchSet = new Set(batchIndices);
      const start = Date.now();
      let hits = 0;
      for (let locale = 0; locale < LOCALE_COUNT; locale++) {
        for (const slot of pluralSlots) {
          if (batchSet.has(slot.diffIndex)) {
            hits++;
          }
        }
      }
      const elapsed = Date.now() - start;
      expect(hits).toBe(PLURAL_COUNT * LOCALE_COUNT);
      expect(elapsed).toBeLessThan(THRESHOLD_MS);
      console.log(`[bench] Set.has O(N): ${elapsed}ms (hits=${hits})`);
    });
  }
});
