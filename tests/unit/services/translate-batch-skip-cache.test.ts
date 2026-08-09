/**
 * `TranslationService.translateBatch()` takes its cache decision from the
 * caller's `skipCache`, not from `cache.enabled` in persisted config alone.
 *
 * Every structured i18n format translates through this method, so without that
 * parameter `--no-cache` is a silent no-op for all 11 of them — and a corrupt
 * translation then becomes permanent: re-running the identical command with
 * `--no-cache` against a different endpoint sends zero requests and reproduces
 * the poisoned output byte for byte, defeating the one remedy a user would
 * reach for.
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
