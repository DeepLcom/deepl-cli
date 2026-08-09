import { ConfigError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';
import { UUID_RE } from '../utils/uuid.js';
import type { Language, TranslationMemory } from '../types/index.js';
import type { TmCacheLike } from '../sync/tm-cache.js';

// Narrow structural dependency: the resolver only needs the list method, so
// callers can supply any transport without coupling to the full DeepLClient.
export type TranslationMemoryLister = {
  listTranslationMemories(): Promise<TranslationMemory[]>;
};

export function sanitizeForError(input: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars before interpolating untrusted input into errors
  return input.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80);
}

// Keeps an API-returned TM whose name carries ASCII control or zero-width
// characters out of the name-matching candidate pool. Skipped in silence,
// because a TM created through the DeepL dashboard cannot contain these.
function hasSuspiciousChars(name: string): boolean {
  // eslint-disable-next-line no-control-regex -- intentional: checking for control chars in untrusted API-returned strings
  return /[\x00-\x1f\x7f\u200B-\u200D\uFEFF]/.test(name);
}

// Language-pair validation lives here rather than in the callers, so the text
// and file handlers cannot drift. The UUID path trusts the caller and skips the
// check.
export async function resolveTranslationMemoryId(
  client: TranslationMemoryLister,
  nameOrId: string,
  cache: TmCacheLike,
  expected?: { from: Language; targets: Language[] }
): Promise<string> {
  if (UUID_RE.test(nameOrId)) return nameOrId;

  const cacheKey = expected
    ? `${nameOrId}|${expected.from.toLowerCase()}|${expected.targets.map((t) => t.toLowerCase()).join(',')}`
    : nameOrId;
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    Logger.verbose(
      `[verbose] Translation memory cache hit: "${nameOrId}" -> ${cached}`
    );
    return cached;
  }

  const list = await client.listTranslationMemories();
  const candidates = list.filter((tm) => !hasSuspiciousChars(tm.name));
  const matches = candidates.filter((tm) => tm.name === nameOrId);
  if (matches.length > 1) {
    throw new ConfigError(
      `Multiple translation memories share the name "${sanitizeForError(nameOrId)}"`,
      'Pass the UUID directly to disambiguate.'
    );
  }
  const match = matches[0];
  if (!match) {
    throw new ConfigError(
      `Translation memory "${sanitizeForError(nameOrId)}" not found`,
      'Pass the UUID directly, or check your translation memories on the DeepL dashboard.'
    );
  }

  if (expected) {
    const tmFrom = match.source_language.toLowerCase();
    const tmTargets = match.target_languages.map((t) => t.toLowerCase());
    const expectedFrom = expected.from.toLowerCase();
    const mismatch =
      tmFrom !== expectedFrom ||
      expected.targets.some((t) => !tmTargets.includes(t.toLowerCase()));
    if (mismatch) {
      throw new ConfigError(
        `Translation memory "${sanitizeForError(nameOrId)}" does not support the requested language pair`,
        `TM is ${match.source_language}\u2192${match.target_languages.join(',')}; requested ${expected.from}\u2192${expected.targets.join(',')}.`
      );
    }
  }

  cache.set(cacheKey, match.translation_memory_id);
  Logger.verbose(
    `[verbose] Resolved translation memory "${nameOrId}" -> ${match.translation_memory_id}`
  );
  return match.translation_memory_id;
}
