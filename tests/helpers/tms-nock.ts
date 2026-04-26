/**
 * Nock helpers for the TMS push/pull REST contract.
 *
 * The built-in TMS adapter in src/sync/tms-client.ts expects:
 *   PUT  {server}/api/projects/{projectId}/keys/{keyPath}           push a translation
 *   GET  {server}/api/projects/{projectId}/keys/export?format=json&locale={locale}   pull approved translations
 *   GET  {server}/api/projects/{projectId}                         project status
 *
 * These helpers arm nock scopes against a well-known test server URL so
 * sync-tms integration tests can assert wire behavior concisely.
 */

import nock from 'nock';

export const TMS_BASE = 'https://tms.test';
export const TMS_PROJECT = 'proj-42';
export const TMS_API_KEY = 'tms-test-api-key';
export const TMS_TOKEN = 'tms-test-token';

export type AuthExpectation =
  | { apiKey: string }
  | { token: string }
  | { none: true };

function authHeader(auth: AuthExpectation | undefined): string | undefined {
  if (!auth) return undefined;
  if ('apiKey' in auth) return `ApiKey ${auth.apiKey}`;
  if ('token' in auth) return `Bearer ${auth.token}`;
  return undefined;
}

export function expectTmsPush(
  key: string,
  locale: string,
  value: string,
  opts: { auth?: AuthExpectation; status?: number } = {},
): nock.Scope {
  const scope = nock(TMS_BASE);
  const expectedBody = { locale, value };
  const encoded = encodeURIComponent(key);
  let interceptor = scope.put(`/api/projects/${TMS_PROJECT}/keys/${encoded}`, expectedBody);
  const header = authHeader(opts.auth);
  if (header !== undefined) {
    interceptor = interceptor.matchHeader('authorization', header);
  }
  return interceptor.reply(opts.status ?? 200, {});
}

export function expectTmsPull(
  locale: string,
  response: Record<string, string>,
  opts: { auth?: AuthExpectation; status?: number } = {},
): nock.Scope {
  const scope = nock(TMS_BASE);
  let interceptor = scope
    .get(`/api/projects/${TMS_PROJECT}/keys/export`)
    .query({ format: 'json', locale });
  const header = authHeader(opts.auth);
  if (header !== undefined) {
    interceptor = interceptor.matchHeader('authorization', header);
  }
  return interceptor.reply(opts.status ?? 200, response);
}

export function expectTmsError(
  method: 'put' | 'get',
  pathSuffix: string,
  status: number,
  body: Record<string, unknown> = {},
): nock.Scope {
  const scope = nock(TMS_BASE);
  if (method === 'put') {
    return scope.put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`)).reply(status, body);
  }
  return scope.get(new RegExp(`/api/projects/${TMS_PROJECT}${pathSuffix}.*`)).reply(status, body);
}

/**
 * Standard `tms:` config block pointing at the nock-mocked TMS_BASE/TMS_PROJECT.
 * Spread extra overrides (e.g. token) into the second arg.
 */
export function tmsConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enabled: true,
    server: TMS_BASE,
    project_id: TMS_PROJECT,
    ...overrides,
  };
}
