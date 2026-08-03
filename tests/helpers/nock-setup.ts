import nock from 'nock';

export const DEEPL_FREE_API_URL = 'https://api-free.deepl.com';
export const DEEPL_PRO_API_URL = 'https://api.deepl.com';
export const TEST_API_KEY = 'test-api-key-123:fx';

export function setupDeepLNock(baseUrl: string = DEEPL_FREE_API_URL): nock.Scope {
  return nock(baseUrl);
}

export function mockTranslateResponse(
  scope: nock.Scope,
  response: { text: string; detected_source_language?: string }[],
  statusCode: number = 200,
): nock.Scope {
  return scope.post('/v2/translate').reply(statusCode, { translations: response });
}

export function mockTranslateError(
  scope: nock.Scope,
  statusCode: number,
  body: string | Record<string, unknown> = { message: 'Error' },
): nock.Scope {
  return scope.post('/v2/translate').reply(statusCode, body);
}

export function mockUsageResponse(
  scope: nock.Scope,
  response: { character_count: number; character_limit: number } = {
    character_count: 50000,
    character_limit: 500000,
  },
  statusCode: number = 200,
): nock.Scope {
  return scope.get('/v2/usage').reply(statusCode, response);
}

export function mockAuthError(scope: nock.Scope): nock.Scope {
  return scope.post('/v2/translate').reply(403, { message: 'Invalid API key' });
}

/**
 * The default carries a `features` matrix because the live response does: tiers
 * and formality support are both derived from it, so a fixture without one makes
 * every language read as extended with formality unreported -- the opposite of
 * what these four languages actually support.
 */
const STABLE = { status: 'stable' } as const;

export function mockLanguagesResponse(
  scope: nock.Scope,
  languages: Array<{
    lang: string;
    name: string;
    usable_as_source?: boolean;
    usable_as_target?: boolean;
    features?: Record<string, { status: string }>;
  }> = [
    {
      lang: 'de',
      name: 'German',
      usable_as_source: true,
      usable_as_target: true,
      features: { formality: STABLE, glossary: STABLE, tag_handling: STABLE },
    },
    {
      lang: 'en',
      name: 'English',
      usable_as_source: true,
      usable_as_target: true,
      features: { glossary: STABLE, tag_handling: STABLE },
    },
    {
      lang: 'es',
      name: 'Spanish',
      usable_as_source: true,
      usable_as_target: true,
      features: { formality: STABLE, glossary: STABLE, tag_handling: STABLE },
    },
    {
      lang: 'fr',
      name: 'French',
      usable_as_source: true,
      usable_as_target: true,
      features: { formality: STABLE, glossary: STABLE, tag_handling: STABLE },
    },
  ],
  resource: string = 'translate_text',
): nock.Scope {
  return scope
    .get('/v3/languages')
    .query({ resource })
    .reply(200, languages);
}

export function mockWriteResponse(
  scope: nock.Scope,
  improvements: Array<{ text: string; [key: string]: unknown }>,
  statusCode: number = 200,
): nock.Scope {
  return scope.post('/v2/write/rephrase').reply(statusCode, { improvements });
}
