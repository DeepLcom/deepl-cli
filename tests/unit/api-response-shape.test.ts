/**
 * Tests for shape validation of untrusted /v2/translate and /v2/write response
 * bodies. A redirected or malfunctioning endpoint can return well-formed JSON of
 * the wrong shape; these assert it is refused rather than carried into output.
 */

import { TranslationClient } from '../../src/api/translation-client.js';
import { WriteClient } from '../../src/api/write-client.js';
import { NetworkError } from '../../src/utils/errors.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('untrusted response shape', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance = { request: jest.fn() };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false);
  });

  function reply(data: unknown): void {
    mockAxiosInstance.request.mockResolvedValue({
      data,
      status: 200,
      headers: {},
    });
  }

  describe('TranslationClient.translate()', () => {
    let client: TranslationClient;

    beforeEach(() => {
      client = new TranslationClient('test-api-key');
    });
    afterEach(() => client.destroy());

    // The worst case: a string has a truthy .length, so [0] yielded undefined
    // and the CLI printed the literal text "undefined" at exit 0.
    it('rejects translations as a string rather than printing undefined', async () => {
      reply({ translations: 'notarray' });
      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
    });

    it('rejects translations as an object with numeric keys', async () => {
      reply({ translations: { '0': { text: 'x' } } });
      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
    });

    it('rejects a null response body instead of crashing on a raw TypeError', async () => {
      reply(null);
      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
    });

    it('rejects a numeric text', async () => {
      reply({ translations: [{ text: 12345 }] });
      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
    });

    it('rejects an object text', async () => {
      reply({ translations: [{ text: { a: 1, b: [2, 3] } }] });
      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
    });

    it('names the offending type so the endpoint is diagnosable', async () => {
      expect.assertions(2);
      reply({ translations: [{ text: 12345 }] });
      try {
        await client.translate('Hello', { targetLang: 'es' });
      } catch (err) {
        expect(err).toBeInstanceOf(NetworkError);
        expect((err as Error).message).toMatch(/number/);
      }
    });

    it('ignores a non-numeric billed_characters rather than reporting it', async () => {
      reply({ translations: [{ text: 'Hola', billed_characters: 'lots' }] });
      const result = await client.translate('Hello', { targetLang: 'es' });
      expect(result.text).toBe('Hola');
      expect(result.billedCharacters).toBeUndefined();
    });

    it('ignores a non-string detected_source_language', async () => {
      reply({ translations: [{ text: 'Hola', detected_source_language: 7 }] });
      const result = await client.translate('Hello', { targetLang: 'es' });
      expect(result.text).toBe('Hola');
      expect(result.detectedSourceLang).toBeUndefined();
    });

    it('ignores a non-string model_type_used', async () => {
      reply({ translations: [{ text: 'Hola', model_type_used: { m: 1 } }] });
      const result = await client.translate('Hello', { targetLang: 'es' });
      expect(result.modelTypeUsed).toBeUndefined();
    });

    // An absent or null field means nothing came back, which the caller
    // describes better than a shape message can. Kept distinct from a field
    // that is present with the wrong type.
    it('reports an absent translations field as no translation returned', async () => {
      reply({});
      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('No translation returned from DeepL API');
    });

    it('reports a null translations field as no translation returned', async () => {
      reply({ translations: null });
      await expect(
        client.translate('Hello', { targetLang: 'es' })
      ).rejects.toThrow('No translation returned from DeepL API');
    });

    it('still accepts a well-formed response', async () => {
      reply({
        translations: [
          {
            text: 'Hola',
            detected_source_language: 'EN',
            billed_characters: 5,
            model_type_used: 'quality_optimized',
          },
        ],
      });
      const result = await client.translate('Hello', { targetLang: 'es' });
      expect(result.text).toBe('Hola');
      expect(result.detectedSourceLang).toBe('en');
      expect(result.billedCharacters).toBe(5);
      expect(result.modelTypeUsed).toBe('quality_optimized');
    });
  });

  describe('TranslationClient.translateBatch()', () => {
    let client: TranslationClient;

    beforeEach(() => {
      client = new TranslationClient('test-api-key');
    });
    afterEach(() => client.destroy());

    it('rejects translations as a string', async () => {
      reply({ translations: 'ab' });
      await expect(
        client.translateBatch(['a', 'b'], { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
    });

    it('rejects a non-string text among otherwise valid entries', async () => {
      reply({ translations: [{ text: 'Hola' }, { text: null }] });
      await expect(
        client.translateBatch(['Hello', 'World'], { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
    });

    it('rejects a null element', async () => {
      reply({ translations: [{ text: 'Hola' }, null] });
      await expect(
        client.translateBatch(['Hello', 'World'], { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
    });

    it('still accepts a well-formed batch response', async () => {
      reply({ translations: [{ text: 'Hola' }, { text: 'Mundo' }] });
      const results = await client.translateBatch(['Hello', 'World'], {
        targetLang: 'es',
      });
      expect(results.map((r) => r.text)).toEqual(['Hola', 'Mundo']);
    });
  });

  describe('WriteClient', () => {
    let client: WriteClient;

    beforeEach(() => {
      client = new WriteClient('test-api-key');
    });
    afterEach(() => client.destroy());

    it('rejects improvements as a string', async () => {
      reply({ improvements: 'notarray' });
      await expect(
        client.improveText('Hello', { targetLang: 'en-us' })
      ).rejects.toThrow(NetworkError);
    });

    it('rejects a null response body', async () => {
      reply(null);
      await expect(
        client.improveText('Hello', { targetLang: 'en-us' })
      ).rejects.toThrow(NetworkError);
    });

    it('rejects a numeric improvement text', async () => {
      reply({ improvements: [{ text: 999 }] });
      await expect(
        client.improveText('Hello', { targetLang: 'en-us' })
      ).rejects.toThrow(NetworkError);
    });

    it('still accepts a well-formed response', async () => {
      reply({
        improvements: [{ text: 'Hello there', target_language: 'en-US' }],
      });
      const results = await client.improveText('Hello', {
        targetLang: 'en-us',
      });
      expect(results[0]!.text).toBe('Hello there');
    });
  });
});
