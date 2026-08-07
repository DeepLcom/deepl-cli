import { FREE_API_URL, PRO_API_URL } from '../api/endpoints.js';
import { sanitizeForTerminal } from './control-chars.js';

export interface ResolveEndpointOptions {
  apiKey: string;
  configBaseUrl?: string;
  usePro?: boolean;
  apiUrlOverride?: string;
}

export function isFreeKey(apiKey: string): boolean {
  return apiKey.endsWith(':fx');
}

/**
 * Returns true only for the two standard DeepL API hostnames
 * (api.deepl.com and api-free.deepl.com). Any other URL —
 * including localhost, 127.0.0.1, regional endpoints like
 * api-jp.deepl.com, or custom proxies — returns false.
 */
export function isStandardDeepLUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'api.deepl.com' || hostname === 'api-free.deepl.com';
  } catch {
    return false;
  }
}

/** Where a non-standard base URL came from, so the notice can say so. */
export type EndpointSource =
  { kind: 'flag' } | { kind: 'config'; path: string };

/**
 * The notice to show before sending the API key to something other than the two
 * standard DeepL hosts, or undefined when the endpoint is standard.
 *
 * Only the ORIGIN is rendered: a base URL may carry a path or query chosen by
 * whatever redirected the request, and echoing those would put attacker-picked
 * text in front of the user. The origin is also what identifies the recipient of
 * the key, which is the whole point of the notice.
 *
 * Loopback is not exempt, matching the TMS destination-trust gate: a co-tenant
 * process listening on 127.0.0.1 receives the key just as a remote host does.
 */
export function nonStandardEndpointWarning(
  baseUrl: string,
  source: EndpointSource
): string | undefined {
  if (isStandardDeepLUrl(baseUrl)) return undefined;

  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    // validateApiUrl rejects an unparseable URL before this runs, so this is a
    // fallback rather than a path the CLI reaches.
    origin = baseUrl;
  }

  const attribution =
    source.kind === 'flag'
      ? 'set by --api-url'
      : `set by api.baseUrl in ${sanitizeForTerminal(source.path)}`;

  return (
    `Warning: sending your DeepL API key to ${sanitizeForTerminal(origin)}, ` +
    `which is not a DeepL API endpoint (${attribution}). ` +
    `That host receives the key and every text you translate.`
  );
}

/**
 * Resolves the effective API base URL.
 *
 * Priority:
 *   1. --api-url CLI flag (apiUrlOverride)
 *   2. Custom config baseUrl (any non-standard hostname)
 *   3. Key suffix: :fx → free endpoint
 *   4. usePro === false → free endpoint
 *   5. Default → pro endpoint
 */
export function resolveEndpoint(options: ResolveEndpointOptions): string {
  const { apiKey, configBaseUrl, usePro, apiUrlOverride } = options;

  if (apiUrlOverride) {
    return apiUrlOverride;
  }

  if (configBaseUrl && !isStandardDeepLUrl(configBaseUrl)) {
    return configBaseUrl;
  }

  if (isFreeKey(apiKey)) {
    return FREE_API_URL;
  }

  if (usePro === false) {
    return FREE_API_URL;
  }

  return PRO_API_URL;
}
