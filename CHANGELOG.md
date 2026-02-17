# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `User-Agent` header (`deepl-cli/{version} node/{version}`) on all HTTP requests and WebSocket handshakes for API request tracking
- Write API troubleshooting guide covering unsupported language pairs, style/tone issues, empty output, and rate limiting
- Resource cleanup methods on `HttpClient` and `DeepLClient` to tear down keepAlive HTTP agents and prevent socket leaks
- Voice `--glossary` now accepts a glossary name or ID (matching translate/watch behavior)
- Stdin support for `write` command — reads from stdin when no text argument provided, matching translate/detect pattern
- `types` and `exports` fields in package.json for TypeScript consumers
- `.npmignore` to exclude build artifacts from npm package — ~50% package size reduction
- Schema validation on config load — invalid values fall back to defaults with warning
- Path traversal defense for `--output-pattern` in batch translation
- Verbose warning when untyped errors reach the fallback exit code classifier (`--verbose` flag)
- Watch mode `--concurrency` flag to limit parallel API calls (default: 5), preventing API flooding on bulk file changes
- Expanded E2E test coverage for glossary, detect, auth, config, and cache commands
- Expanded unit test coverage for API clients (document, glossary, translation, write, style-rules)
- Expanded directory translation test coverage (multi-target, concurrency, error paths)
- Expanded file translation integration and E2E test coverage
- Batch-mismatch test for structured file translation
- Expanded glossary resolution test coverage (ID passthrough, name lookup, not-found)
- Expanded watch service test coverage (autoCommit errors, cleanup)
- Expanded write command test coverage (interactive mode fallback)
- Strengthened assertions across test suite with specific value checks
- `expect.assertions(N)` guards on try/catch tests to prevent silent passes
- Multi-target languages in directory translation (`deepl translate ./docs --to es,fr,de --output ./out/`)
- Audit and expand all 27 example scripts to cover missing CLI flags and commands:
  - Renumber examples to match `deepl --help` group ordering (Core Commands → Resources → Workflow → Configuration → Information → Administration)
  - Add detect example for language detection (text, stdin, file, JSON output, detect-then-translate scripting)
  - Add completion example for shell completions (bash/zsh/fish preview, sourcing, permanent install paths)
  - Expand write example with file operations, check/fix/backup, diff, in-place, format, interactive mode
  - Expand glossaries example with entry management, multilingual glossaries, JSON format output
  - Expand watch mode example with dry-run, git-staged, combined advanced flags
  - Expand git hooks example with commit-msg/post-commit hooks, JSON format output
  - Add auth section to configuration example
  - Add max-size, dry-run, format JSON to cache example
  - Add conditional style-id demo to style-rules example
  - Add format options to usage monitoring and languages examples
  - Add source-language-mode to voice example
  - Add split-sentences and formality options to basic translation example
  - Add preserve-formatting to file translation example
  - Add dry-run, concurrency, no-recursive to batch processing example
  - Add enable-minification to document translation example
  - Add tag-handling HTML to XML tag handling example
  - Add style-id section to custom instructions example
  - Add stt-limit and deactivate key to admin example
  - Update examples README with grouped quick links matching commander help categories
  - Update run-all script with new filenames and grouping
- Integration tests for watch `--auto-commit` git operations covering happy path, multi-file, not-a-git-repo, no output files, and commit failure
- E2E tests for `deepl hooks install/uninstall/list/path` commands
- `--output -` for stdout in file translation — pipes translated content to stdout for shell composability; binary documents, structured files, and multi-target translations reject with clear errors
- "Getting Started: Run deepl init" hint in `--help` output when no API key is configured — experienced users never see it
- `--no-input` global flag to disable all interactive prompts — confirmation prompts abort with "Aborted.", interactive-only commands exit with code 6; `--yes` takes precedence when both flags are used
- XDG Base Directory Specification support — config and cache now use `~/.config/deepl-cli/` and `~/.cache/deepl-cli/` by default; legacy `~/.deepl-cli/` preferred when it exists; `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` respected
- Type-safe `CacheService.get<T>(key, guard)` overload — accepts a type guard for runtime validation; mismatches are logged, evicted, and return null
- `isTranslationResult` and `isWriteImprovementArray` type guards for cache retrieval validation
- JSON/YAML-aware file translation — extracts string values, translates via batch API, reassembles preserving keys, nesting, non-string values, indentation, and YAML comments
- `yaml` (v2.x) dependency for YAML round-trip parsing with comment preservation
- `deepl detect` command for language detection (calls translate API and returns detected source language)
- Respect `Retry-After` header on 429 responses, falling back to exponential backoff when absent
- `--format json` support for glossary (list, show, entries), hooks (list), and config (list, get) commands for CI/CD scripting
- Shared output formatting helpers for consistent JSON and text output
- Structured JSON output for hooks list command
- Human-readable text formatting for config get/list commands

### Changed
- `cache stats` now defaults to `text` format instead of `table`, consistent with all other commands
- Formality help text now clarifies that `formal`/`informal` are aliases for `more`/`less` in translate and voice commands
- Standardized all types imports to barrel pattern across source files
- `languages` and `usage` commands now default to `text` format instead of `table`, consistent with all other commands
- Generic `makeJsonRequest` eliminating double-cast workarounds in API clients
- Removed redundant try/catch blocks from API client subclasses
- Replaced `any` types in ConfigService with `Record<string, unknown>` and `unknown`
- Deduplicated `GetApiKeyAndOptions` type to single definition
- Removed unused `WriteResult` type export
- Rename `write` command flag from `--to, -t` to `--lang, -l` — better reflects that write improves text within a language rather than translating between languages
- Cleaned up test suite by removing duplicate tests and consolidating with `it.each` patterns while maintaining coverage
- Decomposed translate command into focused handler classes (text, file, document, directory, stdin) — each translation mode is independently testable
- Typed `buildTranslationOptions()` return value with `TranslationParams` interface, eliminating unsafe casts in handler code
- Extracted duplicated stdin reading into shared utility, ensuring bug fixes apply to both call sites
- Narrowed dependency types in command registration with `Pick<ServiceDeps, ...>` pattern
- Tightened `formatOutput()` format parameter to `OutputFormat` type — invalid formats caught at compile time
- Config load failures now route through unified logging system instead of raw `console.error`
- Simplified config key validation by consolidating redundant path traversal checks
- Added `abortSignal` support for watch and batch operations — watch checks signal before starting translations; batch skips remaining files when aborted; CLI wires `AbortController` to SIGINT
- Security note added to `auth` help text — examples show `--from-stdin` first with note about process listing visibility
- Standardize `--format` flag across all commands — every command now accepts `text` and `json`; commands with tabular data also accept `table`; validation uses commander `.choices()` everywhere
- Converted raw `Error` throws to typed `DeepLCLIError` subclasses — errors now carry correct exit codes and user-facing suggestions
- Unify target language flags — `--to` (`-t`) is now the primary flag on translate, voice, watch, and write commands; `--targets` and `--lang` remain as hidden aliases
- Change `write --tone` short flag from `-t` to `-T` (freeing `-t` for `--to`)
- Parallelize multi-target structured file translation — parses file once, translates to all target languages concurrently instead of sequentially
- Extracted shared concurrency utility for translation services
- Upgrade nock from v13 to v14 — removed redundant `Connection: keep-alive` header from HTTP client
- Upgrade Jest from v29 to v30
- Migrate to ESLint 9 flat config
- Batch API calls for plain text files — groups small text files into batch calls, reducing HTTP round-trips for directories; structured files continue through per-file path
- Route all commands through service layer, eliminating direct API client imports from command files
- Extracted shared test helpers for CLI runner, HTTP mocking, and test config isolation
- Replaced type-unsafe mock casts with type-safe factory functions — TypeScript now catches interface drift in mocks
- Replaced wasteful client construction with static validation in API client
- Added HTTP request structure validation to translate integration tests
- Added unicode and multibyte text test cases for CJK, Arabic, emoji, and combining characters
- Replaced real timers with fake timers in voice tests to prevent flakiness
- Added tests verifying voice stdin has no size cap (correct for audio files)
- Extracted duplicated file-reading pattern in write command to shared helper

### Fixed
- Remove `-t` short flag from `languages` command to avoid conflict with `-t, --to` in translate/voice/watch
- Set WebSocket `maxPayload` limit (1 MiB) for voice client to prevent unbounded memory allocation
- Deprecation warning when passing API key as positional argument to `auth set-key` (visible in `ps`) — use `--from-stdin` instead
- Documented `baseUrl` auto-detection from API key tier in API.md
- Extracted `errorMessage()` utility replacing duplicated error-to-string patterns
- Removed dead static pass-through methods from translation service
- Centralized HTTP mock lifecycle in test setup — eliminates Jest hangs and flaky test failures
- `config set api.baseUrl` now accepts `http://localhost` for local testing
- `watch --to` documented as optional in API.md, matching actual behavior of falling back to config defaults
- Documented `watch --concurrency` flag in API.md
- Documented `better-sqlite3` native build requirements in README.md
- Documented `FORCE_COLOR` and `TERM=dumb` environment variables in API.md
- All Logger methods now sanitize output to redact API keys, matching existing `verbose()` behavior
- `getApiKeyAndOptions()` now validates API base URL, preventing insecure HTTP URLs for voice commands
- Replace "Internal DeepL project" README disclaimer with MIT license reference
- Fixed broken example script links in README
- Remove stale `--targets` alias from watch command in API.md
- Remove stale `team` config section from API.md
- Fix debounce default documented as 300ms → 500ms in API.md, README, and help text
- Document all formality values for voice command in API.md
- Fixed voice reconnection test CI timeout
- HTTP keepAlive agents now destroyed in test teardown, preventing flaky integration tests
- Tightened error classification fallback patterns to prevent false-positive misclassification
- Converted remaining raw error throws to typed subclasses with correct exit codes
- Cache database corruption no longer crashes the CLI — corrupt DB is automatically deleted and recreated
- Formality vocabulary is now consistent across translate, watch, and voice commands (`formal`/`informal` accepted everywhere alongside `more`/`less`/`prefer_more`/`prefer_less`)
- Added `"files"` field to package.json — npm package reduced from 7.1 MB to 237 KB
- Remove unused `team.org` and `team.workspace` config fields
- Watch command `--to` now falls back to `defaults.targetLangs` from config, matching translate behavior
- Use atomic writes (write-to-tmp + rename) for all translated/improved output files to prevent partial writes on crash
- Fix `deepl auth verify` → `deepl auth show` in TROUBLESHOOTING.md
- Fix `deepl languages --type source/target` → `--source`/`--target` in TROUBLESHOOTING.md
- Fix API key precedence docs: stored config key takes precedence over `DEEPL_API_KEY` env var
- Remove dead `--targets` alias from watch command (use `--to` instead)
- Fix `--target de` → `--target-lang de` in glossary example
- Fix `.language` → `.detected_language` in detect example
- Fix `(default)` incorrectly shown for `quality_optimized` voice model
- Fix `--page 0` → `--page 1` in style-rules example (1-indexed pagination)
- Add API.md reference for complete format list in TROUBLESHOOTING.md
- Fixed test helper stdin piping to avoid shell interpretation
- Fixed test helper fallback operator in catch blocks
- Added missing mock factory exports to test helpers
- Fixed retry exhaustion throwing raw errors instead of typed errors (NetworkError, AuthError, etc.)
- Fixed unhandled 5xx status codes falling through to generic error — now correctly mapped to `NetworkError`
- Fixed duplicated proxy URL parsing by extracting shared helper
- Fixed cache service ignoring TTL and max size from config
- Fixed inconsistent logging in cache service — replaced `console.warn` with `Logger.warn`
- Fixed stale cache option type in translate command to match Commander.js behavior
- Fixed `--backup` silently ignored without `--fix` in write command — now warns user
- Fixed watch service stop race condition — watching flag cleared before async close
- Fixed glossary normalization silently falling back to 'en' for empty dictionaries — now logs warning
- Fixed formality value documentation for voice vs translate API
- Fixed translation cache key to include all relevant options — previously changing model type, split sentences, tag handling, or custom instructions could return stale results
- Fixed structured file translation batch misalignment — partial failures could silently assign wrong translations to wrong keys
- Fixed `--recursive` flag documentation — the CLI uses `--no-recursive` (recursion is default)
- Fixed glossary entries endpoint using wrong request method for GET requests
- Fixed glossary example script timing issue after rename
- Fixed HTTP mock error leaking across integration tests
- Fixed style-rules example: correct pagination, step numbering, and language extraction
- Fixed `--no-recursive` flag not recognized in directory translation
- Fixed nock v14 async socket errors leaking across tests
- Fixed XDG empty string handling — empty env vars now treated as unset per XDG spec
- Fixed hooks E2E test output capture when stderr is redirected
- Fixed voice E2E format validation test output capture
- Fixed config and auth error-path test mocks to match real sync signatures
- Documented 6 previously undocumented flags and values in API.md
- Improved first-run error messages — missing API key errors now suggest `deepl init` alongside `deepl auth set-key`
- Fix API.md labeling `translate --to` as "Required" — now notes `defaults.targetLangs` config fallback
- Restrict `--output-format` choices to `docx` only (PDF→DOCX is the only supported conversion)
- Fix misleading help example `report.docx --to de --output-format pdf` → `report.pdf --to de --output-format docx`
- Fix API.md config path docs — replace single legacy path with 4-level priority table matching implementation
- Fix API.md `--non-splitting-tags` description — was "non-translatable text", corrected to "tags that should not be used to split sentences"
- Fix API.md `--model-type` description — remove incorrect "(default)" on `quality_optimized`
- Fix API.md `--dry-run` description — remove incorrect mode restriction
- Fix API.md exit code classification docs
- Add `detect` command to API.md command summary table
- Use atomic writes for config file to prevent corruption on interrupted saves
- Fix case-sensitive language code validation — mixed-case codes now normalized before validation
- Fix `--split-sentences on/off` sending invalid values to the API — now maps `on` → `1` and `off` → `0`
- Validate that `--from` is required when using `--glossary`
- Fixed flaky voice reconnection test
- Log verbose diagnostics when write styles fail in interactive mode
- Fix version string references in documentation (0.10.0 → 0.11.0)
- Respect `FORCE_COLOR` and `TERM=dumb` environment variables for color output control

### Removed
- Remove `-s` short flag from `write --style` (conflicted with `languages -s/--source`)
- Remove `-T` short flag from `write --tone` (uppercase short flag, easily confused with `-t/--to`)
- Remove `-c` short flag from `write --check` (shadowed global `-c/--config`)
- Remove `-f` short flag from `write --fix` (conflicted with `-f/--from` convention)
- Remove unimplemented 'yaml' variant from OutputFormat type
- Extract i18n-translate Claude Code skill to [standalone repo](https://git.deepl.dev/hack-projects/deepl-i18n-skill)

### Security
- Harden `.gitignore` — broader `.env.*` coverage, safety-net patterns for private keys (`*.pem`, `*.key`, `*.p12`), SQLite WAL/SHM files
- Fix info disclosure: error logs no longer expose full error objects or internal paths
- Mask API key in `config set` success message and `config get` output
- Global network disconnect in test setup to prevent accidental real API calls
- Fix symlink TOCTOU race condition in file translation

## [0.11.0] - 2026-02-08

### Added
- Cache support for Write API improvements with `--no-cache` bypass flag
- **`deepl init` setup wizard** — Interactive first-time setup that guides through API key validation, default language selection, and configuration
- **`--format json` for usage, cache stats, and languages commands** — Machine-readable output for CI/CD scripting and automation
- **Did-you-mean suggestion for unknown commands** — Levenshtein distance matching suggests closest valid command on typos
- **Admin API `speech_to_text_milliseconds` limit support** — `admin keys set-limit --stt-limit` can now set STT quota limits alongside character limits
- **Voice command example script** demonstrating all Voice API features
- **Troubleshooting guide** covering common issues with auth, quota, network, voice, and configuration

### Changed
- **Lazy sub-client construction in DeepLClient** — Sub-clients now initialized on first access instead of eagerly, improving startup performance
- **Translation option building extracted to shared helper** — Deduplicated option building across methods
- **Jest coverage thresholds tightened** to within 2-3 points of actual
- **Upgraded integration tests with nock** for admin, style-rules, voice, and write clients
- **Improved glossary test coverage** for update and replace-dictionary handlers
- **Migrated retry and cache tests to fake timers**
- **Expanded E2E test coverage** for completion, batch, style-rules, and watch
- **CLAUDE.md production dependencies** updated to match current package.json
- **TODO.md overhauled** — Removed implemented features, updated version references
- **API.md `glossary update` documented** — Added full subcommand documentation with synopsis, options, and examples

### Fixed
- **[P1] VoiceClient bypasses validateApiUrl()** — API key could leak over HTTP if config hand-edited with http:// URL; now validates URL before passing to VoiceClient
- **[P1] Stdin reading has no size limit** — Unbounded memory allocation from piped input; now enforces 128KB limit matching DeepL API text limit
- **Empty string input hangs waiting for stdin** — Passing `''` as text now errors immediately instead of blocking
- **Style Rules customInstructions type mismatch** — Fixed type from `string[]` to `Array<{label, prompt, sourceLanguage?}>` to match actual API response
- **Usage API uses deprecated character_count fields** — Added support for new `unit_count` fields alongside deprecated character counts
- **Missing enable_beta_languages on document upload** — Parameter now passed through for document translation
- **Bare `deepl` with no args exits code 1** — Now exits 0 when showing help, matching CLI conventions
- **FileTranslationService.translateFile() skips safeReadFile** — Now uses safeReadFile wrapper for symlink protection
- **Config directory created without mode 0o700** — Directory now restricts access like the config file (0o600)
- Resolved eslint errors (missing curly braces, no-var-requires suppressions)
- **Watch mode infinite translation loop** — Output files no longer re-trigger the watcher, preventing infinite chains that burned API quota
- **Glossary entry operations 404** — Entry management commands now send JSON content-type for v3 API endpoints instead of form-urlencoded
- **`write --output` flag ignored** — Text-input path now writes result to the specified output file instead of only printing to stdout
- **`write --tone`/`--style` accept arbitrary values** — Invalid values now produce clear validation errors listing all valid options
- **`HttpClient.executeWithRetry()` throws raw errors** — 4xx errors are now classified through `handleError()` before being thrown
- **Fragile error classification** — Tightened string patterns to use specific phrases instead of single words, preventing ambiguous multi-match scenarios
- **`NO_COLOR` broken for `--format table` output** — Table output now respects the `NO_COLOR` environment variable
- **`register-glossary.ts` uses `null as any`** — Entry parsing methods are now static, eliminating the unsafe hack
- **API.md documented `--target` but code uses `--target-lang`** for glossary entries
- **API.md documented `--recursive, -r` short flag** that was never implemented
- **API.md `write --check` exit code** — Prose said 1 but implementation uses 8
- **Node.js version** corrected from >=18 to >=20 in CONTRIBUTING.md and DESIGN.md

## [0.10.0] - 2026-02-08

### Added
- **`--git-staged` flag for `deepl watch`** — Restricts watch mode to only translate files that are currently git-staged. Takes a snapshot of staged files at startup and filters file change events against that set. Useful in pre-commit workflows. Throws a clear error when used outside a git repository.
- **`--enable-beta-languages` flag for translate command** — Forward-compatibility flag for new DeepL languages that are not yet in the local language registry.
- **`glossary update` subcommand** — Combines name and dictionary updates in a single PATCH request, replacing the previous delete-and-recreate workflow for glossary modifications.
- **Comma-separated target languages for `deepl glossary create`** — The `<target-lang>` argument now accepts comma-separated values (e.g., `deepl glossary create my-terms en de,fr,es terms.tsv`) to create multilingual glossaries in a single command.
- **Pro speech-to-text usage quota in `deepl usage`** — The usage command now displays speech-to-text milliseconds count and limit, with human-readable duration formatting (e.g., `1h 23m 45s`). Products with millisecond billing are also displayed as durations in the product breakdown.
- **WebSocket reconnection for `deepl voice`** — Automatic reconnection on unexpected WebSocket drops during voice streaming. Enabled by default with up to 3 reconnect attempts. Configurable via `--no-reconnect` and `--max-reconnect-attempts <n>`. TTY mode displays `[reconnecting N/3...]` feedback.
- **`deepl voice` command for real-time speech translation** — Translates audio files using the DeepL Voice API's WebSocket streaming protocol. Supports multiple audio formats (OGG, WebM, FLAC, MP3, PCM, Matroska) with automatic content type detection. Features include: up to 5 simultaneous target languages, TTY-aware live streaming display, stdin piping for integration with `ffmpeg`/`sox`, `--no-stream` mode for scripting, JSON output format, formality and glossary support. Requires DeepL Pro or Enterprise plan.
- **`VoiceClient` API client** for the Voice API REST endpoint and WebSocket streaming (always uses Pro API URL)
- **`VoiceService` business logic** — Orchestrates Voice API sessions: file chunking, stdin streaming, content type auto-detection, multi-target transcript accumulation, and cancel support.
- **`VoiceError` error class** (exit code 9) with default suggestion pointing to plan upgrade for Voice API access issues
- **Voice API type definitions** — Complete TypeScript types for the Voice API protocol: session request/response, WebSocket message types, and service-level interfaces
- **Comprehensive voice test coverage** — Unit tests for VoiceClient, VoiceService, VoiceCommand, error types, and formatters; integration tests for CLI help, validation, and auth; E2E tests for full CLI workflows, exit codes, and format validation
- **Voice usage in admin analytics** — `deepl admin usage` now displays voice usage duration in human-readable format
- **Improved interactive write preview** — `deepl write -i` now shows full suggestion text in a description area when a choice is highlighted, and uses terminal-width-aware truncation for list item names

### Fixed
- **Commander.js dependency version requirement** — Updated peer dependency from `^12.1.0` to `^14.0.0` to match v14 API usage
- **TTY flickering during voice transcript updates** — Renders are now coalesced into a single pass per microtask tick, eliminating visible flicker with multiple target languages
- **Quadratic memory allocation in stdin chunk reading** — Replaced `Buffer.concat()` on every data event with a chunks-array approach. Reduces transient allocations from O(n²) to amortized O(n) for large audio streams.

### Changed
- **Grouped CLI help options with descriptive headings** — Options for `translate`, `voice`, `watch`, and `write` are now organized under headings (e.g., Core Options, Translation Quality, XML/HTML Options)
- **Updated API.md with grouped commands overview, speech-to-text quota examples, and completion command documentation**
- **Extracted WebSocket mock helpers in voice tests**, reducing test boilerplate
- **Replaced `require()` with static imports in voice tests**
- **Added reconnection, empty stdin, and multi-push accumulation voice tests**
- **Narrowed `registerVoice` dependency type** following the Interface Segregation Principle
- **Minimum Node.js version raised to 20** — Updated `engines.node` from `>=18.0.0` to `>=20.0.0`
- **Commander.js upgraded to v14 with grouped help output** — Commands organized into logical help groups: Core, Resources, Workflow, Configuration, Information, Administration
- **Move SIGINT handling from VoiceStreamSession to CLI layer** — Process-level signal handling is now the CLI's responsibility, fixing a handler leak on reconnection failure
- **Extracted `VoiceStreamSession` class from `VoiceService`** — Moved WebSocket session state, reconnection logic, chunk streaming, and transcript accumulation into a dedicated class
- **Comprehensive CLI help text audit** — Added usage examples to all commands missing them
- **`translate --non-splitting-tags` description corrected** to "should not be used to split sentences"
- **`translate --output-format` and `--tag-handling-version` now use `.choices()` validation**
- **`translate --enable-minification` description clarified** — Now explicitly states "PPTX/DOCX only"
- **`write --style` and `--tone` descriptions now include `default` value**
- **`glossary entries --target` renamed to `--target-lang`** — Standardized with other glossary subcommands
- **`voice --to` now uses `.requiredOption()`** — Commander validates at parse time instead of manual check
- **`voice --content-type` description lists supported formats** — Now shows `ogg, opus, webm, mka, flac, mp3, pcm`

### Security
- **Voice `translateFile` rejects symlinks** — Uses `lstat()` instead of `stat()` and rejects symbolic links, consistent with `safeReadFile` used elsewhere
- **Document token-in-URL security consideration** — Code comment documenting that the Voice API token is passed as a URL query parameter (API constraint)

### Fixed
- **Voice reconnect display shows correct max attempts** — TTY reconnection display previously hardcoded limit regardless of `--max-reconnect-attempts` value
- **Voice WebSocket message types** — Fixed client-to-server message types to match the API specification
- **Voice API protocol alignment** — Updated WebSocket message format to match actual DeepL Voice API spec: renamed session fields, simplified target language format, updated error message fields
- **Voice: Replace unsafe double cast in VoiceClient.createSession** — Replaced with explicit field-by-field construction
- **Voice: Add WebSocket handshake timeout** — Added 30-second timeout to prevent indefinite hangs
- **Voice: Narrow catch scope in WebSocket message handler** — Separated JSON parsing from callback dispatch so only parse errors are caught
- **Voice: Add WebSocket send backpressure handling** — Prevents unbounded buffer growth on slow networks
- **Voice API: Add missing target languages** — Added he, th, vi, zh-HANS, zh-HANT
- **Voice API: Add missing audio content types** — Added auto, PCM at multiple sample rates, OGG, WebM, Matroska, and codec-specific variants
- **Voice API: Fix formality values** — Changed from text-API values to voice-specific `formal`/`informal`
- **Voice API: Add source_language_mode parameter** — Added `auto`|`fixed` mode to session request and CLI option
- **Voice API: Pass formality and glossary to session request**

## [0.9.1] - 2026-02-07

### Added
- **Unit tests for all command registration modules** — Comprehensive coverage for register-admin, register-auth, register-cache, register-completion, register-config, register-glossary, register-hooks, register-languages, register-style-rules, register-usage, register-write, and service-factory
- **`deepl completion` command for shell tab completion** — Generates completion scripts for bash, zsh, and fish shells. Dynamically introspects all registered commands, subcommands, and options. Usage: `deepl completion bash`, `deepl completion zsh`, `deepl completion fish`.

### Changed
- **Extracted magic numbers to named constants** — Replaced hardcoded numeric literals with descriptive constants across the codebase (batch size, socket limits, retry delays, concurrency limits, debounce intervals)
- **Removed unused `errorMessage` field from `DocumentTranslationResult`**
- **Simplified config path validation** — Consolidated redundant checks
- **`write --check` exit code** — Changed from exit code 1 (GeneralError) to exit code 8 (CheckFailed) for distinguishable CI/CD results
- **Git hook integrity verification** — Hooks now use a versioned marker with SHA-256 hash instead of a simple string match
- **Service factory for CLI command registration** — Extracted repeated instantiation patterns into shared factory functions, eliminating duplicated code
- **Consolidated input validation at service boundary** — Removed duplicate checks from CLI and API client layers
- **Custom error classes for API error classification** — Replaced fragile string-based error matching with typed error classes that carry exit codes. String-based fallback retained for errors outside the HTTP client layer.
- **Concurrency-limited `translateToMultiple()`** — Multi-target translations now capped at 5 concurrent requests
- **Removed redundant dynamic `fs` import in write command**
- **Decomposed DeepLClient into domain-specific clients** — Refactored monolithic API client into focused modules with a thin facade preserving the public API surface
- **Decomposed CLI entry point into per-command modules** — Self-contained command modules with lazy-loaded dependencies
- **Help text examples on CLI commands** — Added usage examples to auth, translate, watch, write, config, and glossary commands
- **`deepl write --lang` is now optional** — When omitted, the API auto-detects the language
- **Admin usage endpoint migrated to `/v2/admin/analytics`** — Richer analytics response format
- **Lazy CacheService instantiation** — Commands that don't need the cache skip database creation entirely
- **Refreshed DESIGN.md** — Major rewrite to match current version
- **Expanded README glossary and admin sections**
- **JSDoc documentation** for admin, style-rules, and language-registry modules
- **E2E success path tests** for translate, write, usage, and languages commands

### Fixed
- **Async file I/O in batch paths** — Replaced synchronous reads with async to avoid blocking the event loop during concurrent operations
- **TOCTOU race conditions in file operations** — Eliminated time-of-check-to-time-of-use races with try/catch and `ENOENT` handling
- **Removed dead `preserveVars` type field** from TranslationOptions
- **Cache eviction optimization** — Reduced SQL round-trips with `DELETE...RETURNING` query
- **`--dry-run` flag for destructive/batch operations** — Added to translate, glossary delete, cache clear, and watch commands with clear `[dry-run]` messages
- **Input length validation before API calls** — Text validated against 128KB API limit before sending requests
- **Per-product breakdown in `deepl admin usage`** — Now shows character counts per product instead of aggregate totals
- **Generic `en`/`pt` language codes for `deepl write`** — Write API accepts generic codes in addition to regional variants
- **CONTRIBUTING.md** — External contributor guide covering setup, TDD workflow, testing, code style, and PR process
- **Actionable error suggestions** — All CLI error classes now carry user-facing suggestions (auth errors suggest `deepl auth set-key`, quota errors suggest plan upgrade, etc.)

### Security
- **HTTPS enforcement for `--api-url` flag** — Rejects insecure `http://` URLs with exceptions for `localhost` and `127.0.0.1`
- **Symlink detection on all file-reading paths** — `safeReadFile`/`safeReadFileSync` rejects symbolic links before reading
- **Reduced API key exposure** — Masking now shows first 4 + last 4 characters instead of first 8 + last 4
- **`--config` path validation** — Requires `.json` extension and rejects symlinks
- **Confirmation prompts for destructive operations** — `cache clear`, `glossary delete`, `admin keys deactivate`, and `config reset` now require confirmation or `--yes`
- **Document file size limit** — Validates file size (30 MB max) before reading into memory

## [0.9.0] - 2026-02-06

### Added
- **Language Registry** — Centralized registry as single source of truth for all 121 supported language codes with names and categories (core, regional, extended)
- **Extended languages in `deepl languages`** — Shows all 121 languages grouped by category, merging API results with local registry data
- **Graceful degradation without API key** — `deepl languages` works without an API key by showing registry-only data with a warning
- **Pro usage fields in `deepl usage`** — Pro API accounts now see billing period, per-product breakdown, and API key-level usage
- **Model type in translation output** — Shows which model was used (e.g., `quality_optimized`) in both plain text and JSON output
- **Formality support indicator in `deepl languages`** — Target languages that support `--formality` are marked with `[F]`
- **`glossary replace-dictionary` command** — Replace all entries in a glossary dictionary from a TSV/CSV file using the v3 PUT endpoint
- **X-Trace-ID in error messages** — API error messages now include the DeepL trace ID for easier debugging

### Changed
- Deduplicated language validation: translate and config now import from the shared language registry

### Fixed
- **API.md accuracy** — Fixed 8 documentation discrepancies: wrong dates, non-existent flags, incomplete hook types, missing formats, argument optionality, wrong config paths, flag naming, and outdated defaults

## [0.8.0] - 2026-02-05

### Added
- **Custom Instructions** — Guide translations with domain-specific rules via repeatable `--custom-instruction` flag (up to 10 instructions, max 300 chars each)
- **Style Rules** — Apply pre-configured style rules via `--style-id` flag; new `style-rules list` command with `--detailed`, pagination, and JSON output (Pro API only)
- **Expanded Language Support** — 81 new GA languages and regional variants (ES-419, ZH-HANS, ZH-HANT, HE, VI); client-side validation rejects incompatible options for extended languages
- **Tag Handling Version** — `--tag-handling-version` flag (v1/v2) for improved XML/HTML structure handling with next-gen models
- **Image Translation** — JPEG/PNG image support via document translation API
- **Admin API** — `admin keys list/create/deactivate/rename/set-limit` for API key management; `admin usage` for organization analytics with date range, grouping, and JSON output
- **Language Code Validation** — Upfront validation of all language codes before API calls
- **XML Tag Validation** — Validates splitting, non-splitting, and ignore tags against XML specification

### Fixed
- **Batch translation data loss** — Duplicate texts in batch input now all receive correct translations
- **Batch translation index mismatch** — Partial batch failures no longer cause wrong text-translation pairing
- **Windows path detection** — Cross-platform path separator detection; URLs no longer treated as file paths
- **Watch service race conditions** — Prevent timers from firing after `stop()` is called; proper async error handling
- **Document translation infinite loop** — Added 90-minute timeout and max 180 poll attempts
- **Document translation cancellation** — Faster abort detection after sleep completes
- **Cache service memory leak** — Prevent duplicate event handler registration with `process.once()`
- **Variable preservation performance** — 10-20x speedup by replacing crypto hashing with simple counters
- **CSV parsing in glossary** — Proper RFC 4180 parsing for quoted fields with commas
- **Silent proxy failures** — Invalid proxy URLs now throw immediately instead of failing silently
- **API error messages** — Include request context (text length, target language) for easier debugging
- **Test environment isolation** — Fixed tests leaking environment variables across test suites

### Security
- **Config file permissions** — Write with mode 0o600 (owner read/write only)
- **API key masking** — `config get auth.apiKey` shows masked output
- **Stdin API key input** — `--from-stdin` flag for `auth set-key` to avoid shell history exposure
- **HTTPS enforcement** — Reject non-HTTPS URLs for `api.baseUrl`
- **Glossary ID validation** — Alphanumeric+hyphen pattern to prevent injection
- **Config path validation** — Reject directory traversal patterns, null bytes, and path separators
- **Symlink path validation** — Reject symlinks in translate command to prevent directory traversal

### Changed
- Removed 8 unused production dependencies and 7 @types dev dependencies
- Fixed npm audit vulnerabilities
- Cache eviction now uses O(1) in-memory size tracking instead of O(n) database queries
- HTTP connection pool reduced from 50 to 10 sockets (appropriate for CLI workloads)
- Extracted `buildTranslationParams()` to eliminate duplicate parameter building code
- Unified logging through Logger service (respects `--quiet` flag consistently)
- Expanded test suite with comprehensive coverage increase and 100% pass rate

## [0.7.0] - 2025-10-16

### Added
- **Text-Based File Caching** — Smart routing for small text files (.txt, .md, .html, .srt, .xlf) under 100 KiB uses cached text API; larger files and binary documents fall back to document API with a warning
  - Automatic file size threshold checking (100 KiB safe limit, API limit 128 KiB)
  - Binary files (.pdf, .docx, .pptx, .xlsx) always use document API (not cached)

## [0.6.0] - 2025-10-14

### Added
- **CI/CD Security Automation** — Automated security checks in continuous integration
  - GitHub Actions workflow with daily scheduled audits
  - GitLab CI pipeline with dedicated security stage
  - Security checks: npm audit, TypeScript type-check, ESLint, tests
  - Fail-fast security stage runs before tests/build

- **Git Hooks: commit-msg and post-commit** — Enhanced git workflow automation
  - New `commit-msg` hook enforces Conventional Commits format with commitlint
  - New `post-commit` hook provides feedback and reminds to update CHANGELOG.md
  - Updated GitHooksService to support all four hooks: pre-commit, pre-push, commit-msg, post-commit
  - Enhanced `deepl hooks` CLI commands with new hook types

- **Table Output Format** — Structured table view for comparing translations
  - New `--format table` option for translate command with multiple target languages
  - Displays translations in clean 3-column table: Language | Translation | Characters
  - Automatic word wrapping for long translations
  - Thousands separator formatting for character counts
  - Works with `--show-billed-characters` for cost tracking

- **Cost Transparency** — Track actual billed characters for budget planning
  - New `--show-billed-characters` flag for translate command
  - Displays actual billed character count after translation
  - Supports text, file, and batch translation modes
  - JSON output format includes `billedCharacters` field

- **Document Minification** — Reduce file size for PPTX/DOCX translations
  - New `--enable-minification` flag for document translation
  - Only works with PPTX and DOCX formats (API limitation)
  - Validation prevents usage with unsupported formats

- **Advanced XML Tag Handling** — Fine-tuned control for XML/HTML translation
  - New `--outline-detection` flag to control automatic XML structure detection (true/false)
  - New `--splitting-tags` flag to specify XML tags that split sentences (comma-separated)
  - New `--non-splitting-tags` flag for non-translatable text content (comma-separated)
  - New `--ignore-tags` flag to skip translation of specific tag content (comma-separated)
  - All XML flags require `--tag-handling xml` for validation

### Changed
- Fixed version numbers across all documentation files
- Clarified document format conversion limitations (PDF → DOCX only)
- Removed completed security audit reports and point-in-time coverage reports
- Updated hook documentation with usage examples and troubleshooting

### Fixed
- **Git Hooks Reliability** — Fixed grep color code issue causing hook failures in CI environments; added `--color=never` flag and fixed commit type extraction for multi-line messages
- **Test Suite** — Fixed E2E write command validation errors; resolved all ESLint errors; all tests pass in CI/CD environments

## [0.5.1] - 2025-10-14

### Security
- Completed comprehensive security audit: 0 vulnerabilities, risk score 1.0/10 (excellent)

### Added
- **Semantic Exit Codes** — Granular exit codes for better CI/CD integration
  - **Exit codes 0-7**: Success (0), General Error (1), Auth Error (2), Rate Limit (3), Quota (4), Network (5), Invalid Input (6), Config Error (7)
  - Automatic error classification based on error message patterns
  - Retry logic for retryable errors (rate limit and network errors)
  - `isRetryableError()` utility function for script automation
  - Pattern-based error detection (case-insensitive, priority-ordered)
  - Exit codes enable intelligent retry logic in bash scripts and CI pipelines

- **Document Translation Cancellation** — AbortSignal support for long-running translations
  - Cancel document translations in progress with Ctrl+C or programmatic cancellation
  - Cancellable during upload, polling, and sleep phases
  - Graceful cleanup on cancellation
  - Backward compatible (optional parameter)

### Changed
- **ConfigService.get() performance** — Eliminated unnecessary deep copying; direct reference return with `Readonly<DeepLConfig>` for compile-time immutability
- **Variable preservation** — Changed from sequential placeholders to hash-based with SHA-256 and random salt for collision resistance
- Expanded test suite with comprehensive exit code and cancellation coverage

### Fixed
- Fixed config service, translation service, and exit code tests to match updated behavior
- All tests passing with 100% pass rate

## [0.5.0] - 2025-10-13

### Added
- **v3 Glossary API Support** — Multilingual glossaries with advanced management
  - Full support for DeepL v3 Glossary API (released April 2025)
  - Multilingual glossaries: one glossary can contain multiple language pairs (EN→DE,FR,ES,IT)
  - `deepl glossary delete-dictionary <name-or-id> <target-lang>` — Delete specific language pair from multilingual glossary
  - Preserves glossary while removing individual dictionaries
  - Validation: prevents deletion of last dictionary or from single-target glossaries

### Changed
- **v3 API Migration** — Updated glossary operations to use v3 endpoints
  - All glossary operations now use `/v3/glossaries` endpoints
  - GlossaryInfo type supports both v2 (single-target) and v3 (multilingual) formats
  - Helper functions: `isMultilingual()`, `isSingleTarget()` for glossary type checking
  - Request format: JSON with `dictionaries` array structure
  - Entry management: requires source/target language pair for all operations
- Updated README.md with v3 glossary examples and delete-dictionary usage
- Updated API.md with complete delete-dictionary command reference
- Removed outdated v3 glossary planning documents (implementation complete)

### Fixed
- **Integration test compatibility** — Fixed test expectations for v3 API format (regex matching for CLI help, v3 dictionaries array structure, JSON content-type, v3 response parsing)
- All tests passing with 100% pass rate

## [0.4.0] - 2025-10-12

### Added
- **Batch Text Translation Optimization** — Efficient bulk translation with reduced API overhead
  - New `translateBatch()` method sends up to 50 texts per request
  - Cache-aware batching: only translates uncached texts, skips cached entries
  - Automatic splitting when batch exceeds 50 texts (DeepL API limit)
  - **Performance Impact**: Reduces API calls from N to ceil(N/50) for bulk operations

- **Glossary Management Enhancements** — Complete glossary editing capabilities
  - `deepl glossary languages` — List all supported glossary language pairs
  - `deepl glossary add-entry <name-or-id> <source> <target>` — Add entry to existing glossary
  - `deepl glossary update-entry <name-or-id> <source> <new-target>` — Update glossary entry
  - `deepl glossary remove-entry <name-or-id> <source>` — Remove entry from glossary
  - `deepl glossary rename <name-or-id> <new-name>` — Rename existing glossary
  - Accepts glossary name OR ID for all commands
  - Implementation uses delete + recreate pattern (glossary ID changes, data preserved)
  - Validation: prevents duplicate entries, removing last entry, same-name rename

- **HTTP/HTTPS Proxy Support** — Enterprise-friendly proxy configuration
  - Automatic proxy detection from environment variables
  - Supports HTTP_PROXY and HTTPS_PROXY (case-insensitive)
  - Proxy authentication support (username:password@host:port)
  - Works with all DeepL CLI commands transparently

- **Retry and Timeout Configuration** — Robust API communication
  - Automatic retry logic for transient failures (5xx errors, network issues)
  - Default: 3 retries with exponential backoff (1s, 2s, 4s, 8s, 10s max)
  - Smart error detection: retries server errors, not client errors (4xx)
  - Default 30-second timeout per request

- **Document Format Conversion** — PDF to DOCX conversion
  - New `--output-format` flag for translate command
  - Supports PDF → DOCX conversion (only supported conversion by DeepL API)
  - Validates format combinations (rejects unsupported conversions)

### Changed
- Added comprehensive glossary command reference to API.md
- Added batch translation performance section to README.md
- Updated glossary usage examples with rename workflow
- Documented proxy configuration examples
- Expanded test suite with glossary, batch, and E2E coverage

### Fixed
- **Example Scripts** — Corrected based on DeepL API limitations
  - Fixed multi-format translation examples — removed unsupported format conversions
  - Fixed document format conversion example — clarified PDF → DOCX only support

## [0.3.0] - 2025-10-12

### Added
- **Document Translation** — Translate complete documents while preserving formatting
  - Support for 11 document formats: PDF, DOCX, PPTX, XLSX, HTML, TXT, SRT, XLIFF, DOC, HTM
  - Async processing with progress tracking (queued → translating → done)
  - Formality control for document translation
  - File size limits: 10MB (PDF), 30MB (other formats)
  - Billed characters displayed after completion
  - Formatting, structure, and layout automatically preserved
  - Usage: `deepl translate document.pdf --to es --output document.es.pdf`

### Changed
- **API Documentation** — Comprehensive update to API.md for accuracy
  - Fixed 62 discrepancies between documentation and actual implementation
  - Removed non-existent global flags, simplified exit codes, fixed config paths
  - Added short flag forms for write command
  - Removed non-existent flags from watch command
  - Enhanced documentation for config, glossary, auth, translate, write, watch commands
  - Added "Planned Features" section
  - Added API.md maintenance guidelines to CLAUDE.md
- **Test Coverage Improvements** — Comprehensive expansion for low-coverage areas
  - AuthCommand, TranslateCommand, WatchCommand, WatchService, GitHooksService all significantly improved
  - Overall coverage maintained above 91%

### Fixed
- **Critical: E2E and Integration tests no longer clear user's API key** — Tests now use isolated config directories via DEEPL_CONFIG_DIR environment variable
- Fixed empty target languages validation in WatchCommand — empty strings now properly filtered before validation

## [0.2.1] - 2025-10-11

### Added
- **Model Type Selection** — Choose quality vs speed trade-offs for translation
  - New `--model-type` flag: `quality_optimized` (default), `prefer_quality_optimized`, `latency_optimized`
- **Usage Command** — Monitor API character usage and quota
  - New `deepl usage` command with visual warnings when usage exceeds 80%
- **Languages Command** — List supported source and target languages
  - New `deepl languages` command with `--source` and `--target` filters
- **Translation Options** — Exposed additional DeepL API parameters
  - `--split-sentences` flag for sentence splitting control (on, off, nonewlines)
  - `--tag-handling` flag for XML/HTML tag preservation (xml, html)
- **Write Command CLI Flags** — Exposed all write command features via CLI
  - `--output`, `--in-place`, `--interactive`, `--diff`, `--check`, `--fix`, `--backup`
  - File path detection for automatic file operations

### Changed
- **Enhanced Interactive Mode** — Now generates multiple alternatives
  - Calls DeepL Write API with different styles (simple, business, academic, casual)
  - Presents multiple options in interactive menu instead of single suggestion
  - Automatically removes duplicate suggestions
  - Falls back to single suggestion when user specifies style/tone

### Fixed
- Fixed chokidar TypeScript import issue in WatchService
- Fixed glossary API endpoints missing `/v2` path prefix — commands now work correctly with DeepL API v2

## [0.2.0] - 2025-10-08

### Added
- **Git Hooks Integration** — Automate translation validation in git workflow
  - New `deepl hooks` command for managing git hooks
  - **pre-commit hook**: Validates translations before committing
  - **pre-push hook**: Validates all translations before pushing
  - Hook management: install, uninstall, list, path commands
  - Safe installation with automatic backup of existing hooks
- **DeepL Write Integration** — AI-powered text improvement
  - Grammar, style, and tone enhancement using DeepL Write API
  - New `deepl write` command for text improvement
  - Support for 8 languages: de, en-GB, en-US, es, fr, it, pt-BR, pt-PT
  - **Writing Styles**: simple, business, academic, casual, and prefer_* variants
  - **Tones**: enthusiastic, friendly, confident, diplomatic, and prefer_* variants
  - `--alternatives` option to show multiple improvement suggestions
- **Watch Mode** — Real-time file/directory monitoring with auto-translation
  - Monitor files or directories for changes with `deepl watch`
  - Configurable debouncing, glob pattern filtering, multiple target languages
  - Auto-commit to git (optional with `--auto-commit`)
  - Custom output directories, statistics tracking, and graceful shutdown
- **Batch Processing** — Parallel directory translation
  - Configurable concurrency (default: 5, customizable with `--concurrency`)
  - Glob pattern filtering with `--pattern` option
  - Recursive/non-recursive modes, error recovery, and detailed statistics
- **Context-Aware Translation** — New `--context` parameter for better disambiguation

### Changed
- New `deepl write` and `deepl watch` commands; added `--context`, `--recursive`, `--pattern`, `--concurrency` to translate
- Expanded test suite from 302 to 447 tests with improved coverage
- Added chokidar, p-limit, fast-glob dependencies
- WriteService, WatchService, and BatchTranslationService for enhanced service layer
- Extended DeepLClient with `improveText()` for Write API

### Fixed
- Fixed chokidar TypeScript import issue in WatchService

## [0.1.0] - 2025-10-07

### Added
- **Core Translation** — Text and file translation via DeepL API
- **Multi-language Support** — Translate to multiple target languages in one command
- **File Translation** — Support for `.txt` and `.md` files with format preservation
- **stdin Support** — Pipe text input for translation workflows
- **Authentication** — Secure API key management with config storage
- **Configuration** — Persistent configuration with `~/.deepl-cli/config.json`
- **Caching** — SQLite-based translation cache with LRU eviction
- **Glossary Management** — Create, list, and manage DeepL glossaries
- **CLI Commands**:
  - `deepl translate` — Translate text or files
  - `deepl auth` — Manage API keys (set-key, show, clear)
  - `deepl config` — Configuration management (get, set, list, reset)
  - `deepl cache` — Cache management (stats, clear, enable, disable)
  - `deepl glossary` — Glossary operations (create, list, show, entries, delete)

### Changed
- TypeScript strict mode with comprehensive test coverage
- Clean architecture: CLI → Services → API → Storage
- Dependencies: axios, better-sqlite3, commander, chalk
- Requires Node >=18.0.0

[Unreleased]: https://github.com/DeepLcom/deepl-cli/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/DeepLcom/deepl-cli/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/DeepLcom/deepl-cli/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/DeepLcom/deepl-cli/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/DeepLcom/deepl-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/DeepLcom/deepl-cli/releases/tag/v0.1.0
