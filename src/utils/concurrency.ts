export const MULTI_TARGET_CONCURRENCY = 5;
export const PUSH_CONCURRENCY = 10;

export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  let aborted = false;
  async function worker() {
    while (index < items.length && !aborted) {
      const i = index++;
      try {
        results[i] = await fn(items[i] as T);
      } catch (err) {
        aborted = true;
        throw err;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}
