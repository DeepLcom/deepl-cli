/**
 * Tests for lazy sub-client construction in DeepLClient (Issue deepl-cli-4x9d)
 */

import nock from 'nock';

describe('DeepLClient lazy sub-client construction', () => {
  const apiKey = 'test-api-key';
  const baseUrl = 'https://api-free.deepl.com';

  beforeAll(() => {
    if (!nock.isActive()) { nock.activate(); }
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  it('should still validate API key eagerly', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeepLClient } = require('../../src/api/deepl-client') as typeof import('../../src/api/deepl-client');
    expect(() => new DeepLClient('')).toThrow('API key is required');
  });

  it('should construct sub-clients lazily on first method call', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeepLClient } = require('../../src/api/deepl-client') as typeof import('../../src/api/deepl-client');
    const client = new DeepLClient(apiKey);

    // At this point, only the validation HttpClient was constructed.
    // The actual sub-clients should not exist yet.
    // We test this by verifying the private fields are undefined.
    expect((client as any)._translationClient).toBeUndefined();
    expect((client as any)._glossaryClient).toBeUndefined();
    expect((client as any)._documentClient).toBeUndefined();
    expect((client as any)._writeClient).toBeUndefined();
    expect((client as any)._styleRulesClient).toBeUndefined();
    expect((client as any)._adminClient).toBeUndefined();

    // Now make a translate call - this should create TranslationClient
    nock(baseUrl).post('/v2/translate').reply(200, {
      translations: [{ text: 'Hola', detected_source_language: 'EN' }],
    });

    await client.translate('Hello', { targetLang: 'es' });

    expect((client as any)._translationClient).toBeDefined();
    // Other clients should still be undefined
    expect((client as any)._glossaryClient).toBeUndefined();
    expect((client as any)._documentClient).toBeUndefined();
    expect((client as any)._writeClient).toBeUndefined();
    expect((client as any)._styleRulesClient).toBeUndefined();
    expect((client as any)._adminClient).toBeUndefined();
  });

  it('should reuse sub-client on subsequent calls', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeepLClient } = require('../../src/api/deepl-client') as typeof import('../../src/api/deepl-client');
    const client = new DeepLClient(apiKey);

    nock(baseUrl).post('/v2/translate').reply(200, {
      translations: [{ text: 'Hola', detected_source_language: 'EN' }],
    });
    await client.translate('Hello', { targetLang: 'es' });
    const firstClient = (client as any)._translationClient;

    nock(baseUrl).post('/v2/translate').reply(200, {
      translations: [{ text: 'Bonjour', detected_source_language: 'EN' }],
    });
    await client.translate('Hello', { targetLang: 'fr' });
    const secondClient = (client as any)._translationClient;

    expect(firstClient).toBe(secondClient);
  });

  it('should construct GlossaryClient lazily on glossary method call', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeepLClient } = require('../../src/api/deepl-client') as typeof import('../../src/api/deepl-client');
    const client = new DeepLClient(apiKey);

    expect((client as any)._glossaryClient).toBeUndefined();

    nock(baseUrl).get('/v3/glossaries').reply(200, { glossaries: [] });
    await client.listGlossaries();

    expect((client as any)._glossaryClient).toBeDefined();
    expect((client as any)._translationClient).toBeUndefined();
  });

  it('should construct WriteClient lazily on improveText call', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeepLClient } = require('../../src/api/deepl-client') as typeof import('../../src/api/deepl-client');
    const client = new DeepLClient(apiKey);

    expect((client as any)._writeClient).toBeUndefined();

    nock(baseUrl).post('/v2/write/rephrase').reply(200, {
      improvements: [{ text: 'Improved.', target_language: 'en-US' }],
    });
    await client.improveText('Test.', { targetLang: 'en-US' });

    expect((client as any)._writeClient).toBeDefined();
    expect((client as any)._translationClient).toBeUndefined();
  });

  it('should construct AdminClient lazily on listApiKeys call', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeepLClient } = require('../../src/api/deepl-client') as typeof import('../../src/api/deepl-client');
    const client = new DeepLClient(apiKey);

    expect((client as any)._adminClient).toBeUndefined();

    nock(baseUrl).get('/v2/admin/developer-keys').reply(200, []);
    await client.listApiKeys();

    expect((client as any)._adminClient).toBeDefined();
    expect((client as any)._translationClient).toBeUndefined();
  });

  it('should construct StyleRulesClient lazily on getStyleRules call', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeepLClient } = require('../../src/api/deepl-client') as typeof import('../../src/api/deepl-client');
    const client = new DeepLClient(apiKey);

    expect((client as any)._styleRulesClient).toBeUndefined();

    nock(baseUrl).get('/v3/style_rules').reply(200, { style_rules: [] });
    await client.getStyleRules();

    expect((client as any)._styleRulesClient).toBeDefined();
    expect((client as any)._translationClient).toBeUndefined();
  });
});
