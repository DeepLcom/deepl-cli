# laravel_php pipe-plural fixtures

Minimal Laravel PHP bucket with two locales and two pipe-pluralization keys
(`apples` with `|{n}` markers, `days` with `|[n,m]` markers). Used by
`tests/integration/sync-tms-push.integration.test.ts` to exercise the
walker-skip-partition invariant at every TMS push/pull extract site:

- Push from the non-multi-locale target file (`de.php`) — pipe-plural keys
  must not reach `TmsClient.pushKey(...)`.
- Pull merge against an existing target — pipe-plural keys must not appear in
  the translated-entry list handed to `parser.reconstruct(...)`.

The `|{n}` / `|[n,m]` markers match the gate in `src/formats/php-arrays.ts`
`PIPE_PLURALIZATION_REGEX`; plain pipe-delimited values (e.g., `apples|apple`)
are intentionally NOT flagged and are not exercised here.
