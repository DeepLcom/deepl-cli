import { NetworkError } from '../utils/errors.js';

/**
 * Shape checks for DeepL response bodies.
 *
 * A response body is untrusted input: the endpoint can be redirected by
 * `--api-url`, an `api.baseUrl` in the config, or a proxy, and a redirected host
 * can return well-formed JSON of any shape. Declaring a TypeScript interface for
 * the body asserts nothing at runtime, so without these checks a wrong-shaped
 * value is carried all the way into terminal output, a written file, or an i18n
 * bucket.
 *
 * Follows the contract `sanitizePullKeysResponse` sets for the TMS: reject
 * rather than coerce, and name the offending type so the endpoint is
 * diagnosable.
 */

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Require `body` to be `{ [field]: Array<object> }` and return that array.
 *
 * The string case is the one that mattered most in practice: a string has a
 * truthy `.length`, so a `!body[field]` guard followed by a length comparison
 * passed, `[0]` yielded `undefined`, and `undefined` was printed as the
 * translation at exit 0.
 */
export function requireItemArray(
  body: unknown,
  field: string,
  context: string
): Record<string, unknown>[] {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new NetworkError(
      `Unexpected API response: expected a JSON object with "${field}", got ${describe(body)}. ${context}`
    );
  }

  const items = (body as Record<string, unknown>)[field];

  // A missing or null field means nothing was returned, which is not a type
  // error: callers already describe that case better than a shape message can
  // ("No translation returned from DeepL API"), so it becomes an empty array and
  // falls through to their own length check.
  if (items === undefined || items === null) return [];

  if (!Array.isArray(items)) {
    throw new NetworkError(
      `Unexpected API response: "${field}" must be an array, got ${describe(items)}. ${context}`
    );
  }

  return items as Record<string, unknown>[];
}

/**
 * Require `items[index]` to be an object whose `text` is a string, and return
 * that string.
 */
export function requireItemText(
  items: Record<string, unknown>[],
  index: number,
  field: string,
  context: string
): string {
  const item = items[index];
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new NetworkError(
      `Unexpected API response: "${field}[${index}]" must be an object, got ${describe(item)}. ${context}`
    );
  }
  const text = item['text'];
  if (typeof text !== 'string') {
    throw new NetworkError(
      `Unexpected API response: "${field}[${index}].text" must be a string, got ${describe(text)}. ${context}`
    );
  }
  return text;
}

/**
 * An optional response field, kept only when it is actually the expected type.
 *
 * Dropping a wrong-typed value rather than rejecting the whole response is
 * deliberate: these are metadata, not the translation. A bogus
 * `billed_characters` must not be summed into a cost report or land in a
 * lockfile, but it is no reason to discard a translation that is already billed.
 */
export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/** `optionalNumber` for a field of a body whose shape is not yet narrowed. */
export function optionalNumberField(
  body: unknown,
  name: string
): number | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  return optionalNumber((body as Record<string, unknown>)[name]);
}
