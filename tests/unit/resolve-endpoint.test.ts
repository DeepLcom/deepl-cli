import {
  resolveEndpoint,
  isStandardDeepLUrl,
  isFreeKey,
} from '../../src/utils/resolve-endpoint';

const FREE = 'https://api-free.deepl.com';
const PRO = 'https://api.deepl.com';

describe('isFreeKey', () => {
  it.each([
    [':fx suffix', 'abc-123:fx', true],
    ['no suffix', 'abc-123', false],
    [':fx in middle', 'key:fx-tail', false],
    ['empty', '', false],
  ])('%s → %s', (_label, key, expected) => {
    expect(isFreeKey(key)).toBe(expected);
  });
});

describe('isStandardDeepLUrl', () => {
  it.each([
    ['pro bare', 'https://api.deepl.com'],
    ['pro with path', 'https://api.deepl.com/v2/translate'],
    ['free bare', 'https://api-free.deepl.com'],
    ['free with path', 'https://api-free.deepl.com/v3/voice'],
    ['uppercase hostname (URL normalizes to lowercase)', 'https://API.DEEPL.COM/v2'],
    ['explicit port 443 (stripped by URL parser)', 'https://api.deepl.com:443'],
  ])('standard: %s → true', (_label, url) => {
    expect(isStandardDeepLUrl(url)).toBe(true);
  });

  it.each([
    ['regional', 'https://api-jp.deepl.com'],
    ['localhost', 'http://localhost:8080'],
    ['proxy', 'https://custom-proxy.example.com'],
    ['empty', ''],
    ['undefined', undefined],
    ['unparseable string', '://not-a-url'],
    ['subdomain spoof', 'https://api.deepl.com.evil.com'],
  ])('non-standard: %s → false', (_label, url) => {
    expect(isStandardDeepLUrl(url)).toBe(false);
  });
});

describe('resolveEndpoint', () => {
  it.each<[string, Parameters<typeof resolveEndpoint>[0], string]>([
    [
      'P1: apiUrlOverride wins over everything',
      { apiKey: 'k:fx', configBaseUrl: 'https://api-jp.deepl.com', usePro: true, apiUrlOverride: 'https://override.test' },
      'https://override.test',
    ],
    [
      'P2: custom config URL preserved (non-standard hostname)',
      { apiKey: 'k:fx', configBaseUrl: 'https://api-jp.deepl.com' },
      'https://api-jp.deepl.com',
    ],
    [
      'P3: :fx key → free when config is standard',
      { apiKey: 'k:fx', configBaseUrl: 'https://api.deepl.com', usePro: true },
      FREE,
    ],
    [
      'P3: :fx key → free when config is missing',
      { apiKey: 'k:fx' },
      FREE,
    ],
    [
      'P3: :fx key beats usePro: true',
      { apiKey: 'k:fx', usePro: true },
      FREE,
    ],
    [
      'P4: non-:fx key + usePro false → free',
      { apiKey: 'k-pro', usePro: false },
      FREE,
    ],
    [
      'P5: non-:fx key defaults to pro',
      { apiKey: 'k-pro' },
      PRO,
    ],
    [
      'P5: standard config URL is ignored (treated as default)',
      { apiKey: 'k-pro', configBaseUrl: 'https://api.deepl.com', usePro: true },
      PRO,
    ],
  ])('%s', (_label, options, expected) => {
    expect(resolveEndpoint(options)).toBe(expected);
  });
});
