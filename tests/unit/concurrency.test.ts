import { mapWithConcurrency, MULTI_TARGET_CONCURRENCY } from '../../src/utils/concurrency';

describe('mapWithConcurrency', () => {
  it('should preserve result ordering', async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrency(
      items,
      async (ms) => {
        await new Promise(r => setTimeout(r, ms));
        return `done-${ms}`;
      },
      3
    );
    expect(results).toEqual(['done-30', 'done-10', 'done-20']);
  });

  it('should limit concurrency to the specified value', async () => {
    let inflight = 0;
    let maxInflight = 0;
    const concurrency = 2;
    const items = [1, 2, 3, 4, 5];

    await mapWithConcurrency(
      items,
      async (item) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise(r => setTimeout(r, 10));
        inflight--;
        return item;
      },
      concurrency
    );

    expect(maxInflight).toBeLessThanOrEqual(concurrency);
    expect(maxInflight).toBe(concurrency);
  });

  it('should handle empty array', async () => {
    const results = await mapWithConcurrency(
      [],
      async () => 'never',
      5
    );
    expect(results).toEqual([]);
  });

  it('should propagate errors from the mapping function', async () => {
    await expect(
      mapWithConcurrency(
        [1, 2, 3],
        async (item) => {
          if (item === 2) throw new Error('boom');
          return item;
        },
        2
      )
    ).rejects.toThrow('boom');
  });

  it('should handle single item', async () => {
    const results = await mapWithConcurrency(
      ['only'],
      async (item) => item.toUpperCase(),
      5
    );
    expect(results).toEqual(['ONLY']);
  });

  it('should cap workers at items.length when concurrency exceeds item count', async () => {
    let maxInflight = 0;
    let inflight = 0;

    await mapWithConcurrency(
      [1, 2],
      async (item) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise(r => setTimeout(r, 10));
        inflight--;
        return item;
      },
      10
    );

    expect(maxInflight).toBe(2);
  });
});

describe('MULTI_TARGET_CONCURRENCY', () => {
  it('should be 5', () => {
    expect(MULTI_TARGET_CONCURRENCY).toBe(5);
  });
});
