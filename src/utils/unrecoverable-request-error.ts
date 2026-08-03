import { errorMessage } from './error-message.js';

/**
 * Whether an error means the request itself is wrong, not that this particular
 * item failed.
 *
 * A rejected `target_lang` is the same rejection for every file and every target
 * in the run, so retrying it per batch buys nothing but another round trip.
 * Language validation defers to the API on codes the bundled snapshot does not
 * list, which is what makes this reachable from a plain typo.
 */
export function isUnrecoverableRequestError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("value for 'target_lang' not supported") ||
    message.includes("value for 'source_lang' not supported") ||
    message.includes('target_lang not supported') ||
    message.includes('source_lang not supported')
  );
}
