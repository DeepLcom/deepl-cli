import { FREE_API_URL, PRO_API_URL } from '../api/http-client.js';

export interface ResolveEndpointOptions {
  apiKey: string;
  configBaseUrl?: string;
  usePro?: boolean;
  apiUrlOverride?: string;
}

export function isFreeKey(apiKey: string): boolean {
  return apiKey.endsWith(':fx');
}

export function isStandardDeepLUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'api.deepl.com' ||
      parsed.hostname === 'api-free.deepl.com'
    );
  } catch {
    return false;
  }
}

function isLocalApiUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function resolveEndpoint(options: ResolveEndpointOptions): string {
  const { apiKey, configBaseUrl, usePro, apiUrlOverride } = options;

  if (apiUrlOverride) {
    return apiUrlOverride;
  }

  if (
    configBaseUrl &&
    (!isStandardDeepLUrl(configBaseUrl) || isLocalApiUrl(configBaseUrl))
  ) {
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
