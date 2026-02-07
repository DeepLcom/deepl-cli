/**
 * Validates that an API URL uses HTTPS to prevent API keys from being
 * sent over insecure connections.
 *
 * Allows http:// only for localhost (127.0.0.1) for local development/testing.
 */
export function validateApiUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol === 'https:') {
    return;
  }

  if (parsed.protocol === 'http:') {
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return;
    }
    throw new Error(
      `Insecure HTTP URL rejected: ${url}\n` +
      'API keys must only be sent over HTTPS to prevent credential exposure.\n' +
      'Use https:// or http://localhost / http://127.0.0.1 for local testing.'
    );
  }

  throw new Error(
    `Unsupported protocol in URL: ${url}\n` +
    'Only https:// URLs are allowed (http://localhost and http://127.0.0.1 permitted for testing).'
  );
}
