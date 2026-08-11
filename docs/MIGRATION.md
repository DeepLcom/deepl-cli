# Migrating from 1.x to 2.0.0

This release removes deprecated flags, changes several exit codes, and moves
machine-readable output from stderr to stdout. Nothing here is a silent change of
meaning: every item below either fails loudly or changes a value you can see.

**If you only read one section, read [Exit codes that moved](#exit-codes-that-moved).**
It is the change most likely to alter what your CI pipeline decides, and unlike a
removed flag it does not announce itself.

## Contents

- [Requirements](#requirements)
- [Removed flags and config keys](#removed-flags-and-config-keys)
- [Exit codes that moved](#exit-codes-that-moved)
- [Machine-readable output moved to stdout](#machine-readable-output-moved-to-stdout)
- [Output that scripts parse](#output-that-scripts-parse)
- [Files written to disk](#files-written-to-disk)
- [Tagged translation output](#tagged-translation-output)
- [TypeScript consumers](#typescript-consumers)
- [Upgrade checklist](#upgrade-checklist)

## Requirements

**Node.js 24.15.0 or later** — up from 20. The cache now uses Node's built-in
`node:sqlite` instead of the `better-sqlite3` native addon, so there is no
compilation step and no `ERR_DLOPEN_FAILED` after a Node upgrade, but the runtime
floor is higher. 24.15.0 is the release where `node:sqlite` stopped emitting an
`ExperimentalWarning`, which would otherwise reach stderr on every cache-backed
command. Running under an older Node fails fast with a one-line error and exit 6
rather than crashing later.

**The package is published as `@deepl/cli`.** The command is still `deepl`.

```bash
# 1.x
npm install -g deepl-cli

# 2.0.0
npm install -g @deepl/cli
```

Your cache and config are untouched by the rename. The cache database is upgraded
in place on first open: rows whose keys can no longer be reached are dropped and
every other namespace is left alone, so the first translation after upgrading may
be a miss where it used to be a hit.

## Removed flags and config keys

All of these fail immediately, so nothing here can pass silently.

| Removed | Replacement | Symptom |
| --- | --- | --- |
| `translate --enable-beta-languages` | Delete it — beta languages are part of the regular language set | `error: unknown option`, exit 6 |
| `sync init --source-lang` | `--source-locale` | `error: unknown option`, exit 6 |
| `sync init --target-langs` | `--target-locales` | `error: unknown option`, exit 6 |
| `tms.auto_push` | Run `deepl sync push` after `deepl sync` | `ConfigError`, exit 7 |
| `tms.auto_pull` | Run `deepl sync pull` before `deepl sync` | `ConfigError`, exit 7 |
| `tms.require_review` | Preview with `deepl sync pull --dry-run` | `ConfigError`, exit 7 |

```bash
# 1.x
deepl sync init --source-lang en --target-langs es,fr

# 2.0.0
deepl sync init --source-locale en --target-locales es,fr
```

The three `tms:` keys were on the config allowlist and in the documentation but no
code ever read them, so a review gate you configured was doing nothing. They are
rejected by name — with the replacement in the error's suggestion — rather than as
unknown fields, so the message cannot be mistaken for a typo.

```yaml
# 1.x — accepted and ignored
tms:
  enabled: true
  server: https://tms.example.com
  auto_push: true
  auto_pull: true
  require_review: true

# 2.0.0 — remove all three; push explicitly instead
tms:
  enabled: true
  server: https://tms.example.com
```

Also gone: the `usage` command's "Speech-to-Text Usage" section and
`speechToTextMilliseconds*` fields, following the API's deprecation of
`speech_to_text_milliseconds_count`/`_limit`.

### `.deepl-sync.yaml` is validated more strictly

A config 1.x accepted can now be refused at load, which fails every `sync` subcommand
rather than one run. All of these exit 7 with the offending value named:

| Now refused | Fix |
| --- | --- |
| A `source_locale` or `target_locales` entry that is not a BCP-47 tag (1.x checked only three forbidden substrings) | Spell the locale as a language tag: `en`, `pt-BR`, `zh-Hans` |
| A `target_path_pattern` containing a `.git` or `.github` path segment | Move the target out of those directories |
| A target path that begins with `-` | Rename it, or prefix the pattern with `./` |
| A bucket `include` glob that resolves outside the project root | Keep globs inside the repository |
| `--locale <value>` not listed in `target_locales` | Add it to `target_locales`, or fix the spelling |

**`.deepl-sync.yaml` is discovered only up to the repository boundary.** 1.x walked to the
filesystem root, so a config in an ancestor directory outside the repo was adopted as
project root. If yours lived there, `sync` now reports no config at all — move it inside
the repository.

## Exit codes that moved

Most of these are conditions that used to exit 0 while losing or skipping work,
saying so only in a log line. A few move the other way, where 1.x failed on input it
should have accepted. In both directions the old code was the wrong answer.

| Command | Condition | 1.x | 2.0.0 |
| --- | --- | --- | --- |
| any command | Unknown subcommand, unknown option, invalid `--choice` value, missing argument | 1 | 6 |
| `sync` | Target file unreadable or unparseable | 0 | 12 |
| `sync` | Key could not be written into the target | 0 | 12 |
| `sync` | Validation error on a translation | 0 | 12 |
| `sync` | File containing an empty string value | 12, every run | 0 |
| `sync validate` | Target file cannot be read | 1 | 8 |
| `sync validate` | PO/XLIFF translation with a placeholder or ICU error the check previously could not see | 0 | 8 |
| `sync push` / `pull` | TMS unreachable | 1 | 5 |
| `sync --force` | Cannot prompt (piped stdin, cron, hook, `--no-input`) | 0 | 6 |
| `watch` | Session recorded any failure | 0 | 12 |
| `watch --auto-commit` | Output directory in no git repository | 0 | 6, at startup |
| `translate` | Translation lost one of your placeholders | 0, with output | 5 |
| `translate <file>` | File containing an empty string value | 1 | 0 |
| `translate <file>` | Rate limit part-way through a structured file | 1 | 3 |
| `write --check --format json` | Text needs no changes | 8, always | 0 |
| `translate <dir>` | Every file in the directory failed | 0 | 12 |
| `translate <dir>` | Stopped by one request-level rejection | 1 | That rejection's code (2, 4, 6) |
| `translate <file>` | Structured file above the new size ceiling | 0 | 6 |
| any command | Client-side timeout, or a response body cut off mid-send | 6 | 5 |
| `sync` | One locale failed completely while others succeeded | 0 | 12 |
| `sync` | `--concurrency` value is not a number | 0 | 6 |
| `sync` | `--locale` value not listed in `target_locales` | 0 | 7 |
| `voice` | Audio transcribed but a requested `--to` produced no translation | 0 | 9 |
| any command | Interrupted with Ctrl-C | 0 | 130 |

Four of these deserve a note:

- **Every parse error is now exit 6, not exit 1.** An unknown subcommand, an unknown
  option, an out-of-range `--choice` value and a missing argument all exited 1 in 1.x,
  indistinguishable from a crash. Anything branching on exit 1 to mean "the CLI itself
  failed" must now treat 6 as "I invoked it wrong" and keep 1 for genuinely unclassified
  failures. This is also the code the removed flags above report.

- **`sync --force` now needs `--yes` anywhere it cannot prompt**, not only under
  `CI=true`. Add `--yes` to any invocation from a git hook, cron job, `make`
  target or container entrypoint.
- **`write --check --format json` could never pass in 1.x** — the verdict was
  computed against a rendered JSON document. A gate built on it was either
  unconditionally red or green only because a later step ignored the code. It now
  returns the truthful answer, which means it will start passing.
- **`translate` with a lost placeholder now writes nothing and exits 5.** In 1.x
  it wrote output containing the CLI's own internal token, such as `__ Var_0 __`.

Exit 3 and 5 are retriable; 12 is a partial failure with some locales succeeded; 130 is
an interrupt, not a failure of the work. A client-side timeout used to report 6, which is
*not* retriable — so a pipeline that gave up on 6 will now retry it. The full table is in
[API.md](./API.md#exit-codes).

## Machine-readable output moved to stdout

**Under `--format json`, a failing command writes its error envelope to stdout.**
This applies to every command with a JSON mode — `translate`, `write`, `correct`,
`voice`, `usage`, `languages`, `detect`, `glossary`, `tm`, `cache`, `config`,
`hooks`, `admin`, `style-rules` — and to every `sync` subcommand.

```bash
# 1.x — reason on stderr, payload on stdout, two redirections
deepl translate "hi" --to es --format json > out.json 2> err.txt

# 2.0.0 — one stream carries both
deepl translate "hi" --to es --format json > out.json
```

The exit code is still the failure signal. Warnings stay on stderr, but 2.0.0 emits
warnings 1.x did not, so a check that treats *any* stderr output as failure will start
tripping. Three are new and unconditional:

- **A non-DeepL `--api-url` or `api_url` is announced** before the key is sent, loopback
  included — so local mocks and self-hosted proxies see it on every run.
- **A `--lang` shaped like a language tag but absent from the bundled Write list** notes
  that it is deferring to the API instead of rejecting it.
- **A `config.json` looser than `0600`** is repaired to `0600` with a note suggesting you
  rotate the key. The settings in it are still honoured.

Anything **parsing** stderr for a failure reason must switch to stdout. A human reading
`--format json` output will see the envelope's `message` and `suggestion` fields where a
prose sentence used to be.

`config get` and `config list` default to `json`, so their failures carry the
envelope with no flag passed.

Separately, the human-readable reports of `sync status`, `sync validate`,
`sync audit`, `sync init` and `auth show` now print to stdout, so `> report.txt`
captures them.

## Output that scripts parse

**Language codes are lowercase everywhere.** 1.x mixed three casings: `languages`
printed lowercase, `glossary show` and `tm list` uppercased at display time,
`translate --format table` uppercased the target, and `write`/`correct` used BCP-47
(`en-GB`, `zh-Hans`). Anything comparing codes scraped from output needs to fold
case or expect lowercase:

| Command | 1.x | 2.0.0 |
| --- | --- | --- |
| `glossary show` | `Source language: EN` | `Source language: en` |
| `glossary show` | `EN → ES: 5 entries` | `en → es: 5 entries` |
| `tm list` | `brand-terms (EN → DE, FR)` | `brand-terms (en → de, fr)` |
| `translate --format table` | row labelled `DE` | row labelled `de` |
| `write --format json` | `"language": "en-US"` | `"language": "en-us"` |

**No command line has to change** — input is case-insensitive everywhere. `voice`
previously demanded the exact mixed-case spelling of a regional code (`--to zh-HANS`)
and rejected the lowercase form the rest of the CLI prints; it now accepts both.

Wire parameters that are not display output are untouched: `translate` and the
glossary create endpoint still send uppercase `source_lang`/`target_lang`, as those
endpoints document.

`glossary create` also prints its success line to stdout and renders the creation
timestamp as a locale-independent ISO string rather than a locale-dependent date on
stderr.

**`hooks list --format json` reports a state string, not a boolean.** The values are
`installed`, `modified`, `unverified` and `not-installed`. A truthiness test now
passes for every state including `not-installed`, so it must be replaced:

```js
// 1.x
if (hook.installed) { /* ... */ }

// 2.0.0
if (hook.state === 'installed') { /* ... */ }
```

A hook you edited by hand reports `modified` from then on, since its body no longer
matches the hash recorded at install.

**`write --alternatives --format json --output <file>` writes JSON.** It wrote the
numbered prose list in 1.x. To keep prose in the file, drop `--format json`.

**Ten language display names changed** to match the API, a consequence of
generating the language list rather than hand-writing it.

**`sync` JSON shapes gained fields and skip reasons.** A consumer iterating
`skipped` will meet reasons it has not seen: `shared_target`, `plural_entry`,
`unusable_target`, `untranslated` and `needs_review`. Each locale in
`sync status --format json` gains a `needsReview` count, and pulled keys no longer
carry `review_status`.

**Coverage numbers drop for PO and XLIFF projects.** `sync status` now counts a
`#, fuzzy` PO entry and an XLIFF `needs-review-translation` target as needing
review rather than as complete — which is what `msgfmt` has reported all along. A
project reported at 100% will drop to the share actually shippable, and
`sync push` reports a correspondingly lower pushed count. Nothing is re-translated
or re-billed, and `sync --frozen` still passes.

`sync --dry-run` may also report a **larger** character estimate than 1.x, because
it now counts repair work — keys the lockfile calls translated that the target file
no longer holds — which a real run bills. If you tuned `sync.max_characters`
against the old under-count, raise it to the number `--dry-run` now reports.

## Files written to disk

**Backups are `<file>.deepl.bak`, not `<file>.bak`.** The stale-backup sweep only
considers the new suffix, so any `.bak` files left by 1.x stay on disk untouched —
delete them yourself once you no longer need them.

**`watch` writes a nested source file to a nested output path.** Watching `docs/`
with `--output out`, the file `docs/guide/intro.md` now lands at
`out/guide/intro.es.md` where it used to land at `out/intro.es.md`. This matches
what `deepl translate <dir> --output <dir>` has always produced. A file at the top
of the watched directory, and a watched path that is a single file, are unchanged.

**`sync` writes `state="translated"` on XLIFF targets** whose translation it
replaced, where it used to leave the old value. A target that carried no `state` is
written exactly as before.

**`sync resolve` now takes the newer translation, as documented.** 1.x kept the local side
of every conflict regardless of `translated_at`, so a teammate's newer translation was
discarded silently. The same conflict may now resolve the other way. If you have been
relying on resolve-keeps-mine, review the first few resolves after upgrading.

**A YAML source file built on anchors and aliases yields a different key set.** Aliases are
no longer expanded; aliased content is translated once, at its anchor. If your catalog uses
`<<:` merges or repeated aliases, re-check `sync status` counts after the first run.

**An Android XML translation containing `]]>` is refused rather than written.** It used to
land inside a CDATA section, where it closed the section early. The key is withheld and
counted as failed, so the run reports it.

## Tagged translation output

**`--tag-handling` now pins `tag_handling_version=v2`** instead of letting the API
choose. Tagged output may differ from 1.x. To restore the old behaviour:

```bash
deepl translate input.html --to es --tag-handling html --tag-handling-version v1
```

## TypeScript consumers

If you import this package's types, two published shapes changed. The `Language`
union grew from 121 to 125 members with nothing removed, so it needs no action —
but `WriteLanguage` did lose members.

**`WriteLanguage` members are lowercase.** Five regional codes were re-spelled:

| 1.x | 2.0.0 |
| --- | --- |
| `'en-GB'` | `'en-gb'` |
| `'en-US'` | `'en-us'` |
| `'pt-BR'` | `'pt-br'` |
| `'pt-PT'` | `'pt-pt'` |
| `'zh-Hans'` | `'zh-hans'` |

Code that passed a literal in the old casing no longer compiles:

```ts
// 1.x
const target: WriteLanguage = 'en-GB';

// 2.0.0
const target: WriteLanguage = 'en-gb';
```

**`WriteImprovement.targetLanguage` widened from `WriteLanguage` to `string`.** The
API echoes this field in its own casing (`en-GB`, `zh-Hans`), which the narrower
type claimed it would not. Assignments *from* the field still compile; code that
assigned it *to* a `WriteLanguage` variable needs a check or a cast.

## Upgrade checklist

1. Move to Node 24.15.0 or later and reinstall from `@deepl/cli` (or `brew install deepl/tap/deepl`).
2. Remove `--enable-beta-languages`; rename `sync init --source-lang`/`--target-langs`.
3. Delete `tms.auto_push`, `tms.auto_pull` and `tms.require_review` from `.deepl-sync.yaml`.
4. Add `--yes` to any non-interactive `deepl sync --force`.
5. Re-check every exit-code branch in CI against the table above — especially any
   step treating `sync` or `watch` exit 0 as "complete".
6. Point JSON error parsing at stdout instead of stderr.
7. Fold case when comparing language codes from output; replace
   `hook.installed` with `hook.state === 'installed'`.
8. Expect lower `sync status` coverage for PO and XLIFF projects, and re-tune
   `sync.max_characters` against the new `--dry-run` estimate.
9. Follow `watch --output` into its new nested layout, and clean up leftover
   `.bak` files.
10. If you import the types, lowercase your `WriteLanguage` literals.

The complete list of changes, including everything fixed that does not require
action, is in
[CHANGELOG.md](https://github.com/DeepL/deepl-cli/blob/main/CHANGELOG.md).
