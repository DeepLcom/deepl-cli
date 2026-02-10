import nock from 'nock';

export const DEEPL_FREE_API_URL = 'https://api-free.deepl.com';
export const DEEPL_PRO_API_URL = 'https://api.deepl.com';
export const TEST_API_KEY = 'test-api-key-123:fx';

export function setupDeepLNock(baseUrl: string = DEEPL_FREE_API_URL): nock.Scope {
  return nock(baseUrl);
}

export function cleanupNock(): void {
  nock.cleanAll();
  if (nock.isActive()) {
    nock.restore();
  }
  nock.activate();
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

export function mockLanguagesResponse(
  scope: nock.Scope,
  languages: Array<{ language: string; name: string; supports_formality?: boolean }> = [
    { language: 'DE', name: 'German', supports_formality: true },
    { language: 'EN', name: 'English', supports_formality: false },
    { language: 'ES', name: 'Spanish', supports_formality: true },
    { language: 'FR', name: 'French', supports_formality: true },
  ],
  type: 'source' | 'target' = 'target',
): nock.Scope {
  return scope
    .get('/v2/languages')
    .query({ type })
    .reply(200, languages);
}

export function mockWriteResponse(
  scope: nock.Scope,
  improvements: Array<{ text: string; [key: string]: unknown }>,
  statusCode: number = 200,
): nock.Scope {
  return scope.post('/v2/write/rephrase').reply(statusCode, { improvements });
}
