/**
 * The tag handling version the CLI pins when a tag-handling request does not
 * name one. v2 is the version the API will eventually default to; v1, today's
 * server-side default, is documented as heading for deprecation.
 */
export const DEFAULT_TAG_HANDLING_VERSION = 'v2';

export interface TagHandlingSelection {
  tagHandling?: 'xml' | 'html';
  tagHandlingVersion?: 'v1' | 'v2';
}

/**
 * Pick the `tag_handling_version` to send for a tag-handling request.
 *
 * The version is always sent explicitly once tag handling is on, rather than
 * left to the server default. That default is scheduled to move from v1 to v2,
 * which would change translation output on DeepL's timetable instead of ours —
 * and would silently invalidate cached entries, because a request that omits
 * the version hashes the same before and after the flip.
 *
 * A version the caller named always wins, including v1, so pinning stays an
 * escape hatch rather than a lock-in. Requests without tag handling carry no
 * version and keep the cache keys they had.
 */
export function resolveTagHandlingVersion(
  selection: TagHandlingSelection
): 'v1' | 'v2' | undefined {
  if (selection.tagHandlingVersion) {
    return selection.tagHandlingVersion;
  }

  if (selection.tagHandling) {
    return DEFAULT_TAG_HANDLING_VERSION;
  }

  return undefined;
}
