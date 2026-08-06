/**
 * The translation and write cache keys hash the request parameters, but the
 * resolved API endpoint is not a request parameter — and one cache DB is shared
 * by every endpoint a config dir has ever talked to. A single run against
 * `--api-url http://127.0.0.1:18111` therefore served its answers back for
 * api.deepl.com for the full 30-day TTL, with no network reachable at all.
 * Custom endpoints are a supported feature (proxies, regional endpoints), so
 * this needed no misuse to reach.
 */

import { TranslationService } from '../../../src/services/translation';
import { WriteService } from '../../../src/services/write';
import { DeepLClient } from '../../../src/api/deepl-client';
import type { ConfigService } from '../../../src/storage/config';

interface KeyedService {
  generateCacheKey: (...args: unknown[]) => string;
}

// generateCacheKey reads only `this.client`, so a bare config stub suffices.
const configStub = {} as ConfigService;

function clientFor(baseUrl: string | undefined, usePro = false): DeepLClient {
  return new DeepLClient('test-key:fx', {
    ...(baseUrl !== undefined && { baseUrl }),
    usePro,
  });
}

function translationKeyFor(
  baseUrl: string | undefined,
  usePro = false
): string {
  const service = new TranslationService(
    clientFor(baseUrl, usePro),
    configStub
  );
  return (service as unknown as KeyedService).generateCacheKey('hello world', {
    targetLang: 'DE',
  });
}

function writeKeyFor(baseUrl: string | undefined): string {
  const service = new WriteService(clientFor(baseUrl), configStub);
  return (service as unknown as KeyedService).generateCacheKey(
    'hello world',
    { targetLang: 'en-US' },
    'write'
  );
}

describe('translation cache key includes the resolved endpoint', () => {
  it('should differ between two custom endpoints', () => {
    expect(translationKeyFor('http://127.0.0.1:18111', false)).not.toBe(
      translationKeyFor('http://127.0.0.1:18112', false)
    );
  });

  it('should differ between a custom endpoint and the default', () => {
    expect(translationKeyFor('http://127.0.0.1:18111', false)).not.toBe(
      translationKeyFor(undefined, false)
    );
  });

  it('should differ between the free and pro endpoints', () => {
    expect(translationKeyFor(undefined, false)).not.toBe(
      translationKeyFor(undefined, true)
    );
  });

  it('should stay stable for the same endpoint', () => {
    expect(translationKeyFor('http://127.0.0.1:18111', false)).toBe(
      translationKeyFor('http://127.0.0.1:18111', false)
    );
  });

  it('should keep the translation: namespace prefix', () => {
    expect(translationKeyFor(undefined, false)).toMatch(
      /^translation:[0-9a-f]{64}$/
    );
  });
});

describe('write cache key includes the resolved endpoint', () => {
  it('should differ between two custom endpoints', () => {
    expect(writeKeyFor('http://127.0.0.1:18111')).not.toBe(
      writeKeyFor('http://127.0.0.1:18112')
    );
  });

  it('should differ between a custom endpoint and the default', () => {
    expect(writeKeyFor('http://127.0.0.1:18111')).not.toBe(
      writeKeyFor(undefined)
    );
  });

  it('should stay stable for the same endpoint', () => {
    expect(writeKeyFor('http://127.0.0.1:18111')).toBe(
      writeKeyFor('http://127.0.0.1:18111')
    );
  });

  it('should keep the write: namespace prefix', () => {
    expect(writeKeyFor(undefined)).toMatch(/^write:[0-9a-f]{64}$/);
  });
});
