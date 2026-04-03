/**
 * Tests for endpoint resolution logic
 * These tests define the desired behavior for free key (:fx) support
 * and custom/regional endpoint handling.
 *
 * Resolution priority:
 *   1. apiUrlOverride (--api-url flag) — highest priority
 *   2. Custom api.baseUrl from config (non-standard hostname)
 *   3. API key suffix: :fx → api-free.deepl.com, else → api.deepl.com
 *   4. api.usePro === false with non-:fx key → api-free.deepl.com
 *   5. Default → api.deepl.com
 */

import {
  resolveEndpoint,
  isStandardDeepLUrl,
  isFreeKey,
} from '../../src/utils/resolve-endpoint';

const FREE_URL = 'https://api-free.deepl.com';
const PRO_URL = 'https://api.deepl.com';

describe('isFreeKey', () => {
  it('should return true for keys ending with :fx', () => {
    expect(isFreeKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx')).toBe(true);
  });

  it('should return true for short keys ending with :fx', () => {
    expect(isFreeKey('test-key:fx')).toBe(true);
  });

  it('should return false for keys without :fx suffix', () => {
    expect(isFreeKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });

  it('should return false for keys with :fx in the middle', () => {
    expect(isFreeKey('key:fx-not-at-end')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isFreeKey('')).toBe(false);
  });
});

describe('isStandardDeepLUrl', () => {
  describe('standard URLs (returns true)', () => {
    it('should recognize https://api.deepl.com as standard', () => {
      expect(isStandardDeepLUrl('https://api.deepl.com')).toBe(true);
    });

    it('should recognize https://api.deepl.com/v2 as standard', () => {
      expect(isStandardDeepLUrl('https://api.deepl.com/v2')).toBe(true);
    });

    it('should recognize https://api.deepl.com/v2/translate as standard', () => {
      expect(isStandardDeepLUrl('https://api.deepl.com/v2/translate')).toBe(
        true
      );
    });

    it('should recognize https://api-free.deepl.com as standard', () => {
      expect(isStandardDeepLUrl('https://api-free.deepl.com')).toBe(true);
    });

    it('should recognize https://api-free.deepl.com/v2 as standard', () => {
      expect(isStandardDeepLUrl('https://api-free.deepl.com/v2')).toBe(true);
    });

    it('should recognize https://api-free.deepl.com/v3/voice as standard', () => {
      expect(isStandardDeepLUrl('https://api-free.deepl.com/v3/voice')).toBe(
        true
      );
    });
  });

  describe('custom URLs (returns false)', () => {
    it('should recognize https://api-jp.deepl.com as custom', () => {
      expect(isStandardDeepLUrl('https://api-jp.deepl.com')).toBe(false);
    });

    it('should recognize https://api-jp.deepl.com/v2 as custom', () => {
      expect(isStandardDeepLUrl('https://api-jp.deepl.com/v2')).toBe(false);
    });

    it('should recognize https://custom-proxy.example.com as custom', () => {
      expect(isStandardDeepLUrl('https://custom-proxy.example.com')).toBe(
        false
      );
    });

    it('should recognize http://localhost:8080 as custom', () => {
      expect(isStandardDeepLUrl('http://localhost:8080')).toBe(false);
    });

    it('should recognize http://127.0.0.1:3000 as custom', () => {
      expect(isStandardDeepLUrl('http://127.0.0.1:3000')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for empty string', () => {
      expect(isStandardDeepLUrl('')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isStandardDeepLUrl(undefined)).toBe(false);
    });
  });
});

describe('resolveEndpoint', () => {
  describe('free key (:fx) with standard URLs', () => {
    it('should resolve to free endpoint when key is :fx and baseUrl is standard pro', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api.deepl.com',
          usePro: true,
        })
      ).toBe(FREE_URL);
    });

    it('should resolve to free endpoint when key is :fx and baseUrl is standard pro with path', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api.deepl.com/v2',
          usePro: true,
        })
      ).toBe(FREE_URL);
    });

    it('should resolve to free endpoint when key is :fx and baseUrl is already free', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api-free.deepl.com',
          usePro: false,
        })
      ).toBe(FREE_URL);
    });

    it('should resolve to free endpoint when key is :fx and baseUrl is free with path', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api-free.deepl.com/v2',
          usePro: false,
        })
      ).toBe(FREE_URL);
    });

    it('should resolve to free endpoint when key is :fx and no baseUrl', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: undefined,
          usePro: true,
        })
      ).toBe(FREE_URL);
    });

    it('should resolve to free endpoint when key is :fx and baseUrl is empty', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: '',
          usePro: true,
        })
      ).toBe(FREE_URL);
    });

    it('should resolve to free endpoint when key is :fx regardless of usePro', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api.deepl.com',
          usePro: true,
        })
      ).toBe(FREE_URL);

      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api.deepl.com',
          usePro: false,
        })
      ).toBe(FREE_URL);
    });
  });

  describe('free key (:fx) with custom URLs', () => {
    it('should use custom regional URL even for :fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api-jp.deepl.com',
          usePro: true,
        })
      ).toBe('https://api-jp.deepl.com');
    });

    it('should use custom regional URL with path even for :fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api-jp.deepl.com/v2',
          usePro: true,
        })
      ).toBe('https://api-jp.deepl.com/v2');
    });

    it('should use localhost URL even for :fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'http://localhost:8080',
          usePro: false,
        })
      ).toBe('http://localhost:8080');
    });

    it('should use 127.0.0.1 URL even for :fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'http://127.0.0.1:3000',
          usePro: false,
        })
      ).toBe('http://127.0.0.1:3000');
    });

    it('should use custom proxy URL even for :fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://custom-proxy.example.com/deepl',
          usePro: false,
        })
      ).toBe('https://custom-proxy.example.com/deepl');
    });
  });

  describe('non-free key with standard URLs', () => {
    it('should resolve to pro endpoint for non-:fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'https://api.deepl.com',
          usePro: true,
        })
      ).toBe(PRO_URL);
    });

    it('should resolve to pro endpoint for non-:fx key with no baseUrl', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: undefined,
          usePro: true,
        })
      ).toBe(PRO_URL);
    });

    it('should resolve to pro endpoint for non-:fx key with empty baseUrl', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: '',
          usePro: true,
        })
      ).toBe(PRO_URL);
    });

    it('should resolve to pro endpoint for non-:fx key with standard pro URL with path', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'https://api.deepl.com/v2',
          usePro: true,
        })
      ).toBe(PRO_URL);
    });
  });

  describe('non-free key with usePro: false', () => {
    it('should resolve to free endpoint when usePro is false and key is non-:fx', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'https://api.deepl.com',
          usePro: false,
        })
      ).toBe(FREE_URL);
    });

    it('should resolve to free endpoint when usePro is false and no baseUrl', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: undefined,
          usePro: false,
        })
      ).toBe(FREE_URL);
    });

    it('should resolve to free endpoint when usePro is false and standard free URL', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'https://api-free.deepl.com',
          usePro: false,
        })
      ).toBe(FREE_URL);
    });
  });

  describe('non-free key with custom URLs', () => {
    it('should use custom regional URL for non-:fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'https://api-jp.deepl.com',
          usePro: true,
        })
      ).toBe('https://api-jp.deepl.com');
    });

    it('should use custom URL regardless of usePro value', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'https://api-jp.deepl.com/v2',
          usePro: false,
        })
      ).toBe('https://api-jp.deepl.com/v2');
    });

    it('should use localhost URL for non-:fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'http://127.0.0.1:3000',
          usePro: true,
        })
      ).toBe('http://127.0.0.1:3000');
    });
  });

  describe('--api-url override (highest priority)', () => {
    it('should use apiUrlOverride over everything for :fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key:fx',
          configBaseUrl: 'https://api.deepl.com',
          usePro: true,
          apiUrlOverride: 'https://custom-override.example.com',
        })
      ).toBe('https://custom-override.example.com');
    });

    it('should use apiUrlOverride over everything for non-:fx key', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'https://api-jp.deepl.com',
          usePro: false,
          apiUrlOverride: 'https://override.example.com/v2',
        })
      ).toBe('https://override.example.com/v2');
    });

    it('should use apiUrlOverride even when it is a standard URL', () => {
      expect(
        resolveEndpoint({
          apiKey: 'test-key-pro',
          configBaseUrl: 'https://api-jp.deepl.com',
          usePro: true,
          apiUrlOverride: 'https://api-free.deepl.com/v2',
        })
      ).toBe('https://api-free.deepl.com/v2');
    });
  });
});
