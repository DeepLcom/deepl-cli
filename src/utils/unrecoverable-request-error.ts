import { AuthError, QuotaError, ValidationError } from './errors.js';
import { errorMessage } from './error-message.js';

/**
 * Rejections that describe the request rather than one item, and so will be
 * identical for everything still queued.
 */
const REJECTED_REQUEST_PATTERNS = [
  "value for 'target_lang' not supported",
  "value for 'source_lang' not supported",
  'target_lang not supported',
  'source_lang not supported',
];

/**
 * Whether an error means the request itself is wrong, not that this particular
 * item failed.
 *
 * A rejected `target_lang` is the same rejection for every file and every target
 * in the run, so retrying it per batch buys nothing but another round trip.
 * Language validation defers to the API on codes the bundled snapshot does not
 * list, which is what makes this reachable from a plain typo. A refused key or
 * an exhausted quota are the same for every item too.
 *
 * The error class is checked before the message: 4xx rejections arrive as
 * ValidationError, while a 5xx interpolates the upstream body into a
 * NetworkError -- so a transient gateway error quoting the same phrase must not
 * abort a run that would otherwise mostly succeed.
 */
export function isUnrecoverableRequestError(error: unknown): boolean {
  if (error instanceof AuthError || error instanceof QuotaError) {
    return true;
  }
  if (!(error instanceof ValidationError)) {
    return false;
  }
  const message = errorMessage(error).toLowerCase();
  return REJECTED_REQUEST_PATTERNS.some(pattern => message.includes(pattern));
}
