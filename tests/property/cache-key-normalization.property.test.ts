/**
 * Directed demonstration (not a property).
 *
 * TranslationService.generateCacheKey hashes the raw text without Unicode
 * normalization, so NFC and NFD encodings of the same visible string produce
 * two cache entries — and therefore two billable API calls.
 *
 * generateCacheKey reads only `this.client.resolvedBaseUrl`, so it is invoked
 * via the prototype against a stub receiver rather than a constructed service.
 */
import { TranslationService } from '../../src/services/translation';

type KeyFn = (text: string, options: { targetLang: string }) => string;

const generateCacheKey = (
  TranslationService.prototype as unknown as { generateCacheKey: KeyFn }
).generateCacheKey;

const receiver = { client: { resolvedBaseUrl: 'https://api.deepl.com' } };

describe('translation cache key normalization', () => {
  it('documents that NFC and NFD of the same visible string produce distinct keys', () => {
    const nfc = 'café'.normalize('NFC');
    const nfd = 'café'.normalize('NFD');
    expect(nfc).not.toBe(nfd); // different code points
    expect(nfc.normalize('NFC')).toBe(nfd.normalize('NFC')); // same visible string

    const keyNfc = generateCacheKey.call(receiver, nfc, { targetLang: 'de' });
    const keyNfd = generateCacheKey.call(receiver, nfd, { targetLang: 'de' });

    // Current behavior: two entries for one visible string. Whether this is
    // a bug or intentional exact-input keying is a policy decision.
    expect(keyNfc).not.toBe(keyNfd);
  });
});
