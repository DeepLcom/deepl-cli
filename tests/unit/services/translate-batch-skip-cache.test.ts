/**
 * `--no-cache` was a silent no-op for all 11 structured i18n formats.
 *
 * In one function 30 lines apart, the plain-text branch of the translate
 * command passed `skipCache: !options.cache` and the structured branch passed
 * only `{ preserveCode }` — because `TranslationService.translateBatch()` had
 * no service-options parameter at all and read `cache.enabled` from persisted
 * config alone. So a corrupt translation was permanent: re-running the
 * identical command with `--no-cache` against a different endpoint sent zero
 * requests and reproduced the poisoned output byte for byte, defeating the one
 * remedy a user would reach for.
 */

import { TranslationService } from '../../../src/services/translation';
import type { DeepLClient } from '../../../src/api/deepl-client';
import type { ConfigService } from '../../../src/storage/config';
import type { CacheService } from '../../../src/storage/cache';

function makeService(): {
  service: TranslationService;
  clientCalls: string[][];
  cacheGets: string[];
  cacheSets: string[];
} {
  const clientCalls: string[][] = [];
  const cacheGets: string[] = [];
  const cacheSets: string[] = [];

  const client = {
    resolvedBaseUrl: 'https://api-free.deepl.com',
    translateBatch: (texts: string[]) => {
      clientCalls.push(texts);
      return Promise.resolve(
        texts.map((t) => ({ text: `FRESH(${t})`, detectedSourceLang: 'en' }))
      );
    },
  } as unknown as DeepLClient;

  const config = {
    get: () => ({ defaults: {} }),
    getValue: (key: string) => (key === 'cache.enabled' ? true : undefined),
  } as unknown as ConfigService;

  const cache = {
    get: (key: string) => {
      cacheGets.push(key);
      return { text: 'POISONED', detectedSourceLang: 'en' };
    },
    set: (key: string) => {
      cacheSets.push(key);
    },
  } as unknown as CacheService;

  return {
    service: new TranslationService(client, config, cache),
    clientCalls,
    cacheGets,
    cacheSets,
  };
}

describe('translateBatch honours skipCache', () => {
  it('serves the cached entry when skipCache is not set', async () => {
    const { service, clientCalls, cacheGets } = makeService();

    const results = await service.translateBatch(['hello'], {
      targetLang: 'de',
    });

    expect(results[0]?.text).toBe('POISONED');
    expect(cacheGets).toHaveLength(1);
    expect(clientCalls).toHaveLength(0);
  });

  it('bypasses the cached entry and calls the API when skipCache is set', async () => {
    const { service, clientCalls, cacheGets } = makeService();

    const results = await service.translateBatch(
      ['hello'],
      { targetLang: 'de' },
      { skipCache: true }
    );

    expect(results[0]?.text).toBe('FRESH(hello)');
    expect(cacheGets).toHaveLength(0);
    expect(clientCalls).toEqual([['hello']]);
  });

  it('does not write the fresh result back when skipCache is set', async () => {
    const { service, cacheSets } = makeService();

    await service.translateBatch(
      ['hello'],
      { targetLang: 'de' },
      { skipCache: true }
    );

    expect(cacheSets).toHaveLength(0);
  });

  it('writes the fresh result back when skipCache is not set', async () => {
    const { service, cacheSets } = makeService();
    const cache = (service as unknown as { cache: { get: () => unknown } })
      .cache;
    cache.get = () => null;

    await service.translateBatch(['hello'], { targetLang: 'de' });

    expect(cacheSets).toHaveLength(1);
  });

  it('bypasses the cache for every text in a multi-text batch', async () => {
    const { service, clientCalls, cacheGets } = makeService();

    const results = await service.translateBatch(
      ['one', 'two', 'three'],
      { targetLang: 'de' },
      { skipCache: true }
    );

    expect(results.map((r) => r?.text)).toEqual([
      'FRESH(one)',
      'FRESH(two)',
      'FRESH(three)',
    ]);
    expect(cacheGets).toHaveLength(0);
    expect(clientCalls).toEqual([['one', 'two', 'three']]);
  });
});
