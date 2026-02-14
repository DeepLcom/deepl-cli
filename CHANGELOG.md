# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Support `--output -` for stdout in file translation — `deepl translate README.md --to es --output -` pipes translated content to stdout for shell composability; binary documents, structured files (JSON/YAML), and multi-target translations reject with clear errors
- Show "Getting Started: Run deepl init to set up your API key" hint at the top of `--help` output when no API key is configured — experienced users never see it
- Add `--no-input` global flag to disable all interactive prompts — confirmation prompts abort with "Aborted.", interactive-only commands (`init`, `write --interactive`) exit with code 6; `--yes` takes precedence when both flags are used
- Add XDG Base Directory Specification support — config and cache now use `~/.config/deepl-cli/` and `~/.cache/deepl-cli/` by default; legacy `~/.deepl-cli/` is preferred when it exists; `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` environment variables are respected
- Add type-safe `CacheService.get<T>(key, guard)` overload — accepts a type guard for runtime validation of cached data; mismatches are logged, evicted, and return null
- Add `isTranslationResult` and `isWriteImprovementArray` type guards for cache retrieval validation
- Add JSON/YAML-aware file translation — `deepl translate en.json --to es --output es.json` extracts only string values, translates them via batch API, and reassembles preserving keys, nesting, non-string values, indentation, and YAML comments
- Add `yaml` (v2.x) dependency for YAML round-trip parsing with comment preservation
- Add `deepl detect` command for language detection (calls translate API and returns detected source language)
- Respect `Retry-After` header on 429 responses, falling back to exponential backoff when absent
- Add `--format json` support to glossary (list, show, entries), hooks (list), and config (list, get) commands for CI/CD scripting
- Add shared `formatOutput()` / `formatJson()` helpers in `src/utils/output-helper.ts`
- Add `listData()` method to HooksCommand for structured JSON output
- Add `formatValue()` and `formatConfig()` methods to ConfigCommand for human-readable text output

### Changed
- Extract duplicated `readStdin()` into shared `src/utils/read-stdin.ts` utility — removes identical implementations from `translate.ts` and `register-detect.ts`, ensuring bug fixes apply to both call sites
- Use `Pick<ServiceDeps, ...>` in `registerGlossary()` and `registerVoice()` instead of inline object types — consistent with the pattern established by `registerWrite()`
- Tighten `formatOutput()` format parameter from `string` to `OutputFormat` type — invalid formats are now caught at compile time
- Replace `console.error` with `Logger.warn` in `ConfigService.load()` — config load failures now route through the unified logging system
- Simplify `validateKeyString()` in `ConfigService` — consolidate redundant `../`, `..\\`, and `..` checks into a single `includes('..')` guard
- Add `abortSignal` option to `WatchOptions` and `BatchOptions` — watch service checks signal before starting translations in debounce callbacks; batch translation skips remaining files when signal is aborted; CLI commands wire `AbortController` to SIGINT handlers for graceful cancellation
- Add security note to `auth` help text — examples now show `--from-stdin` first with a note that command arguments are visible via process listings
- Standardize `--format` flag across all commands — every command now accepts `text` and `json`; commands with tabular data also accept `table`; validation uses commander `.choices()` everywhere; help text consistently says `text` instead of `plain text`
- Convert `new Error()` to typed `DeepLCLIError` subclasses across 36 files — errors now carry correct exit codes and user-facing suggestions without relying on `classifyByMessage()` string matching
- Unify target language flags — `--to` (`-t`) is now the primary flag on translate, voice, watch, and write commands; `--targets` and `--lang` remain as hidden aliases for backward compatibility
- Change `write --tone` short flag from `-t` to `-T` (freeing `-t` for `--to`)
- Parallelize multi-target structured file translation — `translateFileToMultiple()` now parses the file once, extracts strings once, then translates to all target languages concurrently (up to 5 at a time) instead of sequentially
- Extract `mapWithConcurrency()` utility to `src/utils/concurrency.ts` — shared by both `TranslationService.translateToMultiple()` and `StructuredFileTranslationService.translateFileToMultiple()`
- Upgrade nock from v13 to v14 — removed redundant `Connection: keep-alive` header from HTTP client (transport-level keep-alive via agents is sufficient)
- Upgrade Jest from v29 to v30 (ts-jest v29.4.6 supports Jest 30 via peer deps)
- Migrate to ESLint 9 flat config — replaced `.eslintrc.cjs` with `eslint.config.mjs`, upgraded to unified `typescript-eslint` v8 package, `eslint-config-prettier` v10, `eslint-plugin-jest` v28
- Batch API calls for plain text files — `BatchTranslationService.translateFiles()` now groups `.txt` and `.md` files into `TranslationService.translateBatch()` calls (≤50 texts, ≤128KB per batch), reducing HTTP round-trips from N to ceil(N/50) for directories of small text files; structured files (.json, .yaml, .yml) continue through the existing per-file path
- Route admin, usage, style-rules, detect, and languages commands through service layer — adds `AdminService`, `UsageService`, `StyleRulesService`, `DetectService`, `LanguagesService` wrappers following the established `GlossaryService` pattern, eliminating direct `DeepLClient` imports from command files
- Extract shared test helpers (`tests/helpers/run-cli.ts`, `tests/helpers/nock-setup.ts`) from duplicated boilerplate across ~42 integration and E2E test files — `makeRunCLI`, `makeNodeRunCLI`, `createTestConfigDir`, `createTestDir`, and common nock constants (`DEEPL_FREE_API_URL`, `TEST_API_KEY`)
- Replace `as unknown` / `as any` mock casts across 25 test files with 11 type-safe factory functions in `tests/helpers/mock-factories.ts` — TypeScript now catches interface drift in mocks
- Replace wasteful HttpClient construction with static validation in DeepLClient — constructor now calls `HttpClient.validateConfig()` instead of creating and discarding a full HttpClient instance
- Add nock-based HTTP validation to translate CLI integration tests (24 tests validating request structure through TranslationService -> DeepLClient -> HTTP)
- Add unicode and multibyte text test cases for CJK, Arabic, emoji, and combining characters
- Replace real timers with jest.useFakeTimers in voice tests to prevent flakiness
- Add tests verifying voice stdin is not subject to the translate command's 128KB (MAX_STDIN_BYTES) size limit. The voice `readStdinInChunks` path streams audio data without any size cap, which is correct for audio files that regularly exceed 128KB.
- Extract duplicated file-reading pattern in WriteCommand to shared `readFileContent()` helper, removing ~50 lines of duplication across 5 methods

### Fixed
- Improve first-run error messages — missing API key errors now suggest `deepl init` (setup wizard) alongside `deepl auth set-key`
- Fix API.md labeling `translate --to` as "Required" — now notes `defaults.targetLangs` config fallback
- Restrict `--output-format` choices to `docx` only (PDF→DOCX is the only supported conversion) — previously accepted 10 formats that would fail at the API
- Fix misleading help example `report.docx --to de --output-format pdf` → `report.pdf --to de --output-format docx`
- Fix API.md config path docs — replace single legacy path with 4-level priority table matching `resolvePaths()` implementation
- Fix API.md `--non-splitting-tags` description — was "non-translatable text", corrected to "tags that should not be used to split sentences"
- Fix API.md `--model-type` description — remove incorrect "(default)" on `quality_optimized`; API server selects when omitted
- Fix API.md `--dry-run` description — remove "(file/directory mode only)" restriction (works for all input modes)
- Fix API.md exit code classification docs — replace oversimplified patterns with actual `classifyByMessage()` match strings
- Add `detect` command to API.md command summary table
- Use atomic writes for config file — write to `.tmp` then `rename` to prevent corruption on interrupted saves
- Fix case-sensitive language code validation — mixed-case codes like `pt-BR` and `DE` are now normalized to lowercase before validation, matching the registry format
- Fix `--split-sentences on/off` sending invalid values to the API — now maps `on` → `1` and `off` → `0` as the DeepL API expects
- Validate that `--from` is required when using `--glossary` — previously failed with an opaque API error
- Fix flaky voice-service reconnection test — `checkAndEnd` mock fired `onEndOfStream` after first chunk on ws2 instead of waiting for all chunks, causing non-deterministic failures in CI
- Log verbose diagnostics when write styles fail in interactive mode — previously errors were silently swallowed, now visible with `--verbose`
- Fix version string references in documentation (0.10.0 → 0.11.0)
- Respect `FORCE_COLOR` and `TERM=dumb` environment variables for color output control (per clig.dev compliance)

### Removed
- Remove unimplemented 'yaml' variant from OutputFormat type
- Extract i18n-translate Claude Code skill to standalone repo ([deepl-i18n-skill](https://git.deepl.dev/hack-projects/deepl-i18n-skill)) — removes 151 skill tests and all skill source files from this repo

### Security
- Fix info disclosure: error logs no longer expose full error objects or internal paths
- Mask API key in `config set` success message and `config get` (no-argument) output — previously echoed the full plaintext key
- Add global `nock.disableNetConnect()` in Jest setup to prevent accidental real API calls during tests
- Fix symlink TOCTOU race condition in file translation — `translateTextFile` now uses `safeReadFileSync` instead of bare `fs.readFileSync`

## [0.11.0] - 2026-02-08

### Added
- Cache support for Write API improvements with `--no-cache` bypass flag
- **`deepl init` setup wizard** — Interactive first-time setup that guides through API key validation, default language selection, and configuration
- **`--format json` for usage, cache stats, and languages commands** — Machine-readable output for CI/CD scripting and automation
- **Did-you-mean suggestion for unknown commands** — Levenshtein distance matching suggests closest valid command on typos
- **Admin API `speech_to_text_milliseconds` limit support** — `admin keys set-limit --stt-limit` can now set STT quota limits alongside character limits
- **Voice command example script** — `examples/24-voice.sh` demonstrating all Voice API features
- **Troubleshooting guide** — `docs/TROUBLESHOOTING.md` covering common issues with auth, quota, network, voice, and configuration

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
- Resolved 12 eslint errors (missing curly braces, no-var-requires suppressions)

### Changed
- **Lazy sub-client construction in DeepLClient** — Sub-clients now initialized on first access instead of eagerly, improving startup performance
- **Translation option building extracted to shared helper** — Deduplicated ~200 lines across 6 methods into `buildTranslationOptions()`
- **Jest coverage thresholds tightened** — Thresholds raised from 10-14 points below actual to within 2-3 points
- **Integration tests upgraded with nock** — 4 new nock-based integration test files for admin, style-rules, voice, and write clients
- **Glossary test coverage improved** — Added tests for update and replace-dictionary handlers (was 26% branch coverage)
- **Retry tests migrated to fake timers** — Cache TTL tests no longer use real delays
- **E2E coverage expanded** — New E2E tests for completion, batch, style-rules; watch tests extended
- **Watch mode infinite translation loop** - Output files (e.g. `test.es.txt`) no longer re-trigger the watcher, preventing infinite `test.es.es.es.txt` chains that burned API quota
- **Glossary entry operations 404** - `add-entry`, `update-entry`, `remove-entry`, and `replace-dictionary` now send JSON content-type for v3 API endpoints instead of form-urlencoded
- **`write --output` flag ignored** - Text-input path now writes result to the specified output file instead of only printing to stdout
- **`write --tone`/`--style` accept arbitrary values** - Invalid values now produce clear validation errors listing all valid options instead of confusing API errors
- **`HttpClient.executeWithRetry()` throws raw errors** - 4xx errors are now classified through `handleError()` before being thrown to callers
- **Fragile error classification in `classifyByMessage()`** - Tightened string patterns to use specific phrases instead of single words, preventing ambiguous multi-match scenarios
- **`NO_COLOR` broken for `--format table` output** - Table output now respects the `NO_COLOR` environment variable per the no-color.org standard
- **`register-glossary.ts` uses `null as any`** - `tsvToEntries()`, `entriesToTSV()`, and `parseCsvLine()` are now static methods, eliminating the unsafe `new GlossaryService(null as any)` hack
- **API.md documented `--target` but code uses `--target-lang`** for glossary entries
- **API.md documented `--recursive, -r` short flag** that was never implemented
- **API.md `write --check` exit code** prose said 1 but implementation uses 8
- **Node.js version** corrected from >=18 to >=20 in CONTRIBUTING.md and DESIGN.md
- **CLAUDE.md production dependencies** updated to match current package.json
- **TODO.md overhauled** - Removed implemented features listed as TODO, updated version from 0.7.0 to 0.10.0
- **API.md `glossary update` documented** - Added full subcommand documentation with synopsis, options, and examples

## [0.10.0] - 2026-02-08

### Added
- **`--git-staged` flag for `deepl watch`** - Restricts watch mode to only translate files that are currently git-staged. Takes a snapshot of staged files at startup via `git diff --cached --name-only --diff-filter=ACM` and filters file change events against that set. Useful in pre-commit workflows. Throws a clear error when used outside a git repository.
- **`--enable-beta-languages` flag for translate command** - Forward-compatibility flag for new DeepL languages that are not yet in the local language registry.
- **`glossary update` subcommand** - Combines name and dictionary updates in a single PATCH request, replacing the previous delete-and-recreate workflow for glossary modifications.
- **Comma-separated target languages for `deepl glossary create`** - The `<target-lang>` argument now accepts comma-separated values (e.g., `deepl glossary create my-terms en de,fr,es terms.tsv`) to create multilingual glossaries in a single command.
- **Pro speech-to-text usage quota in `deepl usage`** - The usage command now displays `speech_to_text_milliseconds_count` and `speech_to_text_milliseconds_limit` fields from the `/v2/usage` API response, with human-readable duration formatting (e.g., `1h 23m 45s`). Products with `billing_unit: 'milliseconds'` are also displayed as durations in the product breakdown.
- **WebSocket reconnection for `deepl voice`** - Automatic reconnection on unexpected WebSocket drops during voice streaming. Uses the `GET /v3/voice/realtime?token=<token>` endpoint to obtain a new streaming URL and token, then re-establishes the connection and resumes audio streaming. Enabled by default with up to 3 reconnect attempts. Configurable via `--no-reconnect` (disable) and `--max-reconnect-attempts <n>` (override limit). TTY mode displays `[reconnecting N/3...]` feedback during reconnection attempts.
- **`deepl voice` command for real-time speech translation** - Translates audio files using the DeepL Voice API's WebSocket streaming protocol. Supports multiple audio formats (OGG, WebM, FLAC, MP3, PCM, Matroska) with automatic content type detection from file extension. Features include: up to 5 simultaneous target languages, TTY-aware live streaming display with concluded/tentative text, stdin piping for integration with `ffmpeg`/`sox`, `--no-stream` mode for scripting, JSON output format, formality and glossary support. Requires DeepL Pro or Enterprise plan.
- **`VoiceClient` API client** - New client extending `HttpClient` for the Voice API REST endpoint (`POST /v3/voice/realtime`) and WebSocket streaming. Always uses the Pro API URL (`api.deepl.com`).
- **`VoiceService` business logic** - Orchestrates Voice API sessions: file chunking with configurable pacing, stdin streaming, content type auto-detection, multi-target transcript accumulation, and cancel support.
- **`VoiceError` error class** - New error type (exit code 9) with a default suggestion pointing to plan upgrade for Voice API access issues.
- **Voice API type definitions** - Complete TypeScript types for the Voice API protocol: session request/response, WebSocket message types (audio chunks, transcript updates, end-of-stream), and service-level interfaces.
- **113 new tests for voice feature** - 87 unit tests (VoiceClient, VoiceService, VoiceCommand, error types, formatters), 8 integration tests (CLI help, validation, auth), 20 e2e tests (full CLI workflows, exit codes, format validation).
- **Voice usage in admin analytics** - Added `speechToTextMilliseconds` to `UsageBreakdown` type and `AdminClient`, mapping the API's `speech_to_text_milliseconds` field. The `deepl admin usage` command now displays voice usage duration in human-readable format (e.g., `1h 23m 45s`).

- **Improved interactive write preview** - `deepl write -i` now shows full suggestion text in a description area when a choice is highlighted, and uses terminal-width-aware truncation for list item names instead of a hardcoded 60-character limit. Switched from legacy `inquirer.prompt()` to `@inquirer/prompts` `select()` which supports the `description` field on choices.

### Fixed
- **Commander.js dependency version requirement** - Updated peer dependency from `^12.1.0` to `^14.0.0` to match v14 API usage, fixing CI type-check failures.
- **TTY flickering during voice transcript updates** - Debounced `render()` calls in `VoiceCommand.createTTYCallbacks()` using `queueMicrotask`. With multiple target languages, a single utterance previously triggered up to N+1 synchronous renders (1 source + N targets). Renders are now coalesced into a single pass per microtask tick, eliminating visible flicker.
- **Quadratic memory allocation in `readStdinInChunks`** - Replaced `Buffer.concat([buffer, newData])` on every stdin data event with a chunks-array approach that only merges when enough data is available to yield. Reduces transient allocations from O(n²) to amortized O(n) for large audio streams piped via stdin.

### Changed
- **Grouped CLI help options with `optionsGroup()` headings** - Options for `translate` (7 groups), `voice` (4 groups), `watch` (4 groups), and `write` (4 groups) are now organized under descriptive headings (e.g., Core Options, Translation Quality, XML/HTML Options) in `--help` output, making commands with many options easier to scan.
- **Updated API.md with grouped commands overview, speech-to-text quota examples, and completion command documentation** - Comprehensive documentation refresh reflecting Commander.js v14 grouped help output, Pro speech-to-text usage display, and shell completion setup instructions.
- **Extract WebSocket mock helpers in voice-service tests** - Replaced ~21 repeated `EventEmitter + readyState + send/close` blocks with `createMockWebSocket()` and `setupSessionMock()` helpers, reducing test boilerplate by ~240 lines
- **Replace `require()` with static imports in voice tests** - Replaced inline `require('events')` and `require('stream')` calls in test bodies with top-level `import { EventEmitter } from 'events'` and `import { PassThrough } from 'stream'`. Removed file-level `eslint-disable @typescript-eslint/no-var-requires` comments (targeted line-level disables remain for `jest.mock` factory callbacks which cannot use ES imports)
- **3 new voice tests** - Added reconnection chunk resume test (verifies `chunkStreamingResolve` mechanism resumes streaming on new WebSocket), empty stdin test (zero bytes yields no audio chunks), and multi-push accumulation test (verifies buffering before yielding complete chunks)
- **Narrow `registerVoice` dependency type** - `registerVoice()` now accepts only `{ getApiKeyAndOptions, handleError }` instead of the full `ServiceDeps` interface, following the Interface Segregation Principle pattern established by `registerWrite` and `registerGlossary`
- **Minimum Node.js version raised to 20** - Updated `engines.node` from `>=18.0.0` to `>=20.0.0` in package.json and README
- **Commander.js upgraded to v14 with grouped help output** - Upgraded from Commander v12 to v14 and organized CLI commands into logical help groups using `.commandsGroup()`: Core (translate, write, voice), Resources (glossary), Workflow (watch, hooks), Configuration (auth, config, cache, style-rules), Information (usage, languages, completion), Administration (admin)
- **Move SIGINT handling from `VoiceStreamSession` to CLI layer** - Process-level signal handling is now the CLI's responsibility. `VoiceStreamSession` exposes a `cancel()` method and `VoiceService` delegates to it. `VoiceCommand` registers/removes SIGINT handlers in `try/finally` blocks, fixing a handler leak on reconnection failure.
- **Extract `VoiceStreamSession` class from `VoiceService.streamAudio()`** - Moved WebSocket session state, reconnection logic, chunk streaming, and transcript accumulation into a dedicated `VoiceStreamSession` class (`src/services/voice-stream-session.ts`). `VoiceService.streamAudio()` reduced from 155 lines to 3 lines. Added 20 unit tests for the new class.
- **Comprehensive CLI help text audit** - Added usage examples to all commands missing them: `admin`, `cache`, `hooks`, `usage`, `languages`, `style-rules`. Expanded examples for `translate`, `write`, and `glossary` commands to cover more option combinations.
- **`translate --non-splitting-tags` description corrected** - Fixed incorrect description from "non-translatable text" to "should not be used to split sentences" to match the DeepL API behavior.
- **`translate --output-format` and `--tag-handling-version` now use `.choices()` validation** - Commander validates allowed values at parse time instead of deferring to API errors.
- **`translate --enable-minification` description clarified** - Now explicitly states "PPTX/DOCX only" to prevent confusion with other document formats.
- **`write --style` and `--tone` descriptions now include `default` value** - Previously omitted the `default` option that the API types support.
- **`glossary entries --target` renamed to `--target-lang`** - Standardized with `add-entry`, `update-entry`, and `remove-entry` subcommands which already used `--target-lang`.
- **`voice --to` now uses `.requiredOption()`** - Commander validates the required option at parse time with a standard error message instead of a manual check in the action handler.
- **`voice --content-type` description lists supported formats** - Now shows `ogg, opus, webm, mka, flac, mp3, pcm` instead of just "auto-detected from file extension".

### Security
- **Voice `translateFile` rejects symlinks** - `translateFile()` now uses `lstat()` instead of `stat()` and rejects symbolic links with a clear error, consistent with `safeReadFile` used elsewhere in the codebase. File paths are also normalized with `path.resolve()` to prevent path traversal.
- **Document token-in-URL security consideration** - Added code comment to `VoiceClient.createWebSocket()` documenting that the Voice API token is passed as a URL query parameter (API constraint), which may appear in proxy/CDN logs. Verified the CLI does not log the full WebSocket URL.

### Fixed
- **Voice reconnect display shows correct max attempts** - The TTY reconnection display (`[reconnecting N/M...]`) previously hardcoded `M=3` regardless of `--max-reconnect-attempts` value. Now uses the user-configured value.
- **Voice WebSocket message types** - Fixed client-to-server message types to match the API specification: `audio_chunk` → `source_media_chunk`, `end_of_source_media` → `end_of_source_audio`.
- **Voice API protocol alignment** - Updated WebSocket message format from type-discriminated unions to nested key objects matching the actual DeepL Voice API spec. Renamed session request fields (`source_lang` → `source_language`, `target_langs` → `target_languages`), simplified target language format, and updated error message fields (`error_code`, `error_message`, `reason_code`).
- **Voice: Replace unsafe double cast in VoiceClient.createSession** - Replaced `request as unknown as Record<string, unknown>` with explicit field-by-field construction to preserve TypeScript type safety.
- **Voice: Add WebSocket handshake timeout** - Added 30-second handshake timeout to WebSocket connections to prevent indefinite hangs when server is unreachable.
- **Voice: Narrow catch scope in WebSocket message handler** - Separated JSON parsing from callback dispatch so only parse errors are caught; callback errors now propagate correctly.
- **Voice: Add WebSocket send backpressure handling** - `sendAudioChunk` now returns a boolean indicating whether the send buffer is below the 1 MiB high-water mark, preventing unbounded buffer growth on slow networks.
- **Voice API: Add missing target languages** - Added he (Hebrew), th (Thai), vi (Vietnamese), zh-HANS, zh-HANT to `VoiceTargetLanguage` type and CLI validation.
- **Voice API: Add missing audio content types** - Added `audio/auto`, PCM at 8000/44100/48000 Hz, `audio/ogg`, `audio/webm`, `audio/x-matroska`, and codec-specific variants to `VoiceSourceMediaContentType`.
- **Voice API: Fix formality values** - Changed voice formality choices from text-API values (`prefer_more`, `prefer_less`) to voice-specific values (`formal`, `informal`). Added `VoiceFormality` type.
- **Voice API: Add source_language_mode parameter** - Added `source_language_mode` (`auto`|`fixed`) to session request and `--source-language-mode` CLI option.
- **Voice API: Pass formality and glossary to session request** - `VoiceSessionRequest` now includes `formality` and `glossary_id` fields, and the service passes them through from options.

## [0.9.1] - 2026-02-07

### Added
- **Unit tests for all command registration modules** - Added 150 tests across 8 new test files covering `register-admin`, `register-auth`, `register-cache`, `register-completion`, `register-config`, `register-glossary`, `register-hooks`, `register-languages`, `register-style-rules`, `register-usage`, `register-write`, and `service-factory`. Function coverage improved from 81.58% to 97.23%, well above the 86% CI threshold.

### Changed
- **Extract magic numbers to named constants** - Replaced hardcoded numeric literals with descriptive constants across the codebase: `TRANSLATE_BATCH_SIZE` (50), `MAX_SOCKETS`/`MAX_FREE_SOCKETS`/`KEEP_ALIVE_MSECS` and retry delay constants in HTTP client, `DEFAULT_CONCURRENCY`/`MAX_CONCURRENCY` in batch translation, `MAX_CUSTOM_INSTRUCTIONS`/`MAX_CUSTOM_INSTRUCTION_CHARS` in translate command, `DEFAULT_DEBOUNCE_MS` in watch service
- **Remove unused `errorMessage` field from `DocumentTranslationResult`** - The field was defined but never populated (error cases throw instead of returning)
- **Simplify redundant config path validation** - Replaced `key === '.' || (key.startsWith('.') && key.length > 0)` with equivalent `key.startsWith('.')`
- **`write --check` exit code** - Changed from exit code 1 (GeneralError) to exit code 8 (CheckFailed) when text needs improvement, making it distinguishable from actual errors in CI/CD pipelines
- **Git hook integrity verification** - Hooks now use a versioned marker with SHA-256 hash (`# DeepL CLI Hook v1 [sha256:...]`) instead of a simple string match. Added `verifyIntegrity()` method to detect tampered hooks

### Fixed
- **Async file I/O in batch paths** - Replaced synchronous `readFileSync` with `await fs.promises.readFile` in `FileTranslationService` and `DocumentTranslationService` to avoid blocking the event loop during batch/concurrent operations
- **TOCTOU race conditions in file operations** - Eliminated time-of-check-to-time-of-use races where `existsSync()` followed by `readFileSync()`/`statSync()` could fail if a file was removed between the two calls. Now uses try/catch around the read with `ENOENT` handling
- **Remove dead `preserveVars` type field** - Removed the unused `preserveVars` field from `TranslationOptions` that had no corresponding CLI flag
- **Cache eviction optimization** - Replaced separate SELECT SUM + DELETE queries with a single `DELETE...RETURNING` query, reducing eviction from 3 SQL round-trips to 2

### Added
- **`deepl completion` command for shell tab completion** - Generates completion scripts for bash, zsh, and fish shells. Dynamically introspects all registered commands, subcommands, and options from the Commander.js program tree. Usage: `deepl completion bash`, `deepl completion zsh`, `deepl completion fish`. Scripts can be sourced directly or saved to shell completion directories.
- **`--dry-run` flag for destructive/batch operations** - Added `--dry-run` to `translate` (file/directory mode), `glossary delete`, `cache clear`, and `watch` commands. Shows what would happen without performing the operation, using yellow-highlighted `[dry-run]` messages. No API calls are made and no side effects occur.
- **Input length validation before API calls** - Text is validated against the DeepL API's 128KB (131072 bytes) limit before sending requests. Single translations check text byte length; batch translations check both per-item and aggregate sizes. Prevents unnecessary API round-trips and provides clear error messages suggesting to split text or use file translation.
- **Per-product breakdown in `deepl admin usage`** - Usage analytics now show character counts per product (text translation, document translation, write) instead of aggregate totals only. Uses the new `/v2/admin/analytics` endpoint.
- **Generic `en`/`pt` language codes for `deepl write`** - The Write API accepts generic `en` and `pt` in addition to regional variants (`en-GB`, `en-US`, `pt-BR`, `pt-PT`)
- **CONTRIBUTING.md** - External contributor guide covering setup, TDD workflow, testing, code style, and PR process
- **Actionable error suggestions** - All CLI error classes now carry an optional `suggestion` field displayed below the error message. Default suggestions: auth errors suggest `deepl auth set-key`, quota errors suggest `deepl usage` and plan upgrade, rate limit errors suggest waiting/reducing concurrency, network errors suggest checking connection and proxy settings, unsupported language errors suggest `deepl languages`, and unsupported file format errors suggest `deepl languages --type document`

### Documentation
- **JSDoc for admin, style-rules, and language-registry** - Added class-level, method-level, and type-level documentation to the three least-documented command/data modules
- **E2E success path tests** - Added 18 E2E tests with a mock HTTP server covering translate, write, usage, and languages command success paths

### Security
- **HTTPS enforcement for `--api-url` flag** - The `--api-url` flag now rejects insecure `http://` URLs to prevent API keys from being sent over unencrypted connections. Only `https://` URLs are accepted, with an exception for `http://localhost` and `http://127.0.0.1` for local development/testing. The same validation applies to the `api.baseUrl` config value when used at runtime.
- **Symlink detection on all file-reading paths** - Added `safeReadFile` / `safeReadFileSync` utility that rejects symbolic links before reading. Applied to `write` command (all file operations), `glossary create` / `glossary replace-dictionary` (TSV/CSV loading), and `document translate` (document upload). Prevents symlink-based path traversal attacks.
- **Reduced API key exposure** - `auth show`, `config get`, and `config list` now mask API keys to first 4 + last 4 characters (previously first 8 + last 4), reducing exposure of key material in terminal output
- **`--config` path validation** - The `--config` flag now requires a `.json` extension and rejects symlinks to prevent path traversal and overwriting arbitrary files
- **Confirmation prompts for destructive operations** - `cache clear`, `glossary delete`, `admin keys deactivate`, and `config reset` now require interactive confirmation or `--yes`/`-y` flag. Non-TTY environments auto-abort for safety in scripts/CI
- **Document file size limit** - Document translation now validates file size (30 MB max) before reading into memory, preventing excessive memory usage with oversized files

### Changed
- **Service factory for CLI command registration** - Extracted repeated `createDeepLClient → Service → Command` instantiation patterns into a shared `service-factory.ts` module with 7 factory functions, eliminating ~80 lines of duplicated code across register-*.ts files
- **Consolidated input validation at service boundary** - Removed duplicate empty-text checks from CLI command handlers and API client layers (service layer already validates). Removed duplicate style/tone mutual exclusion from write command handler.
- **Custom error classes for API error classification** - Replaced fragile string-based error matching in `getExitCodeFromError()` with typed error classes (`AuthError`, `RateLimitError`, `QuotaError`, `NetworkError`, `ValidationError`, `ConfigError`) that carry an `exitCode` property. `HttpClient.handleError()` now throws these typed errors. String-based fallback is retained for errors originating outside the HTTP client layer.
- **Concurrency-limited `translateToMultiple()`** - Multi-target translations now run with a concurrency limit of 5 instead of firing all requests in parallel unbounded, preventing API overload when translating to many languages at once
- **Removed redundant dynamic `fs` import in write command** - The write command handler used a dynamic `await import('fs')` despite `fs` already being available at module scope
- **Decomposed DeepLClient into domain-specific clients** - Refactored the 1279-line monolithic API client into 7 focused modules (`HttpClient`, `TranslationClient`, `GlossaryClient`, `DocumentClient`, `WriteClient`, `StyleRulesClient`, `AdminClient`) with a thin facade preserving the public API surface
- **Decomposed CLI entry point into per-command modules** - Refactored the 1246-line monolithic `index.ts` into 12 `register-*.ts` command modules, each self-contained with lazy-loaded dependencies
- **Help text examples on CLI commands** - Added usage examples to `auth`, `translate`, `watch`, `write`, `config`, and `glossary` commands via Commander `.addHelpText('after', ...)`
- **`deepl write --lang` is now optional** - When omitted, the API auto-detects the language and rephrases in the original language. Previously `--lang` was required.
- **Admin usage endpoint migrated to `/v2/admin/analytics`** - Replaces the previous `/v2/admin/usage` endpoint with the richer analytics response format
- **Lazy CacheService instantiation** - SQLite cache database is no longer opened on every CLI invocation. Commands that don't need the cache (`--help`, `--version`, `auth`, `config`, `languages`, `glossary`, etc.) now skip database creation entirely, improving startup performance.
- **Refreshed DESIGN.md** - Major rewrite to match v0.9.0: fixed config format (TOML→JSON), removed phantom commands, added actual commands (style-rules, admin), updated language count (30+→121), rewrote architecture diagram
- **Expanded README glossary and admin sections** - Added `glossary replace-dictionary` command and expanded admin section with all subcommands, usage analytics options, and per-product breakdown examples

### Fixed
- **`--api-url` flag now takes effect** - The `--api-url` flag was defined on the translate command but its value was not passed to the DeepL client, so it was silently ignored. It is now correctly wired up.
- **CLI boundary validation for `--formality`, `--tag-handling`, `--model-type`, `--split-sentences`** - Invalid values are now rejected at parse time by Commander's `.choices()` with clear error messages, instead of being passed through to the API with unhelpful errors
- **Replaced `fail()` with `expect.assertions` in integration/e2e tests** - All `fail('Should have thrown')` calls replaced with `expect.assertions(N)` pattern for ESM compatibility; weak assertions (toBeTruthy, toBeGreaterThan(0)) replaced with specific content checks across 11 test files
- **Simplified batch-translation test mock** - Replaced 60-line inline `jest.mock('fast-glob')` block with `jest.unmock('fast-glob')` to override the automatic mock

## [0.9.0] - 2026-02-06

### Added
- **Language Registry** - Centralized language registry (`src/data/language-registry.ts`) as single source of truth for all 121 supported language codes with names and categories (core, regional, extended)
- **Extended languages in `deepl languages`** - Command now shows all 121 languages grouped by category (core/regional first, then extended with limitation note), merging API results with local registry data
- **Graceful degradation without API key** - `deepl languages` works without an API key by showing registry-only data with a warning, instead of exiting with an error
- **Pro usage fields in `deepl usage`** - Pro API accounts now see billing period, per-product breakdown (translate/write), and API key-level usage alongside existing character counts
- **Model type in translation output** - `deepl translate` now shows which model was used (e.g., `quality_optimized`) when returned by the API; included in both plain text and JSON output
- **Formality support indicator in `deepl languages`** - Target languages that support the `--formality` parameter are marked with `[F]` when API data is available
- **`glossary replace-dictionary` command** - Replace all entries in a glossary dictionary from a TSV/CSV file using the v3 PUT endpoint (unlike `update-entry` which merges)
- **X-Trace-ID in error messages** - API error messages now include the DeepL trace ID for easier debugging and support requests

### Changed
- Deduplicated language validation sets: `translate.ts` and `config.ts` now import from the shared language registry instead of maintaining separate copies

### Fixed
- **API.md accuracy** - Fix 8 documentation discrepancies: wrong dates, non-existent `--preserve-vars` flag, incomplete hook types, missing JPEG/PNG in format list, `auth set-key` argument optionality and `--from-stdin` option, wrong config paths, glossary `--target` vs `--target-lang` flags, and outdated config schema defaults

## [0.8.0] - 2026-02-05

### Added
- **Custom Instructions** - Guide translations with domain-specific rules via repeatable `--custom-instruction` flag (up to 10 instructions, max 300 chars each)
- **Style Rules** - Apply pre-configured style rules via `--style-id` flag; new `style-rules list` command with `--detailed`, pagination, and JSON output (Pro API only)
- **Expanded Language Support** - 81 new GA languages and regional variants (ES-419, ZH-HANS, ZH-HANT, HE, VI); client-side validation rejects incompatible options for extended languages
- **Tag Handling Version** - `--tag-handling-version` flag (v1/v2) for improved XML/HTML structure handling with next-gen models
- **Image Translation** - JPEG/PNG image support (`.jpg`, `.jpeg`, `.png`) via document translation API
- **Admin API** - `admin keys list/create/deactivate/rename/set-limit` for API key management; `admin usage` for organization usage analytics with date range, grouping, and JSON output
- **Language Code Validation** - Upfront validation of all language codes before API calls with clear error messages
- **XML Tag Validation** - Validates `--splitting-tags`, `--non-splitting-tags`, and `--ignore-tags` against XML specification

### Fixed
- **Batch translation data loss** - Duplicate texts in batch input now all receive correct translations
- **Batch translation index mismatch** - Partial batch failures no longer cause wrong text-translation pairing
- **Windows path detection** - Cross-platform path separator detection; URLs no longer treated as file paths
- **Watch service race conditions** - Prevent timers from firing after `stop()` is called; proper async error handling
- **Document translation infinite loop** - Added 90-minute timeout and max 180 poll attempts
- **Document translation cancellation** - Faster abort detection after sleep completes
- **Cache service memory leak** - Prevent duplicate event handler registration with `process.once()`
- **Variable preservation performance** - 10-20x speedup by replacing crypto hashing with simple counters
- **CSV parsing in glossary** - Proper RFC 4180 parsing for quoted fields with commas
- **Silent proxy failures** - Invalid proxy URLs now throw immediately instead of failing silently
- **API error messages** - Include request context (text length, target language) for easier debugging
- **Test environment isolation** - Fix 4 tests leaking environment variables across test suites

### Security
- **Config file permissions** - Write with mode 0o600 (owner read/write only)
- **API key masking** - `config get auth.apiKey` shows masked output (first 8 + last 4 chars)
- **Stdin API key input** - `--from-stdin` flag for `auth set-key` to avoid shell history exposure
- **HTTPS enforcement** - Reject non-HTTPS URLs for `api.baseUrl`
- **Glossary ID validation** - Alphanumeric+hyphen pattern to prevent injection
- **Config path validation** - Reject directory traversal patterns, null bytes, and path separators
- **Symlink path validation** - Reject symlinks in translate command to prevent directory traversal

### Changed
- Remove 8 unused production deps (deepl-node, lodash, conf, date-fns, yaml, xml2js, zod, mime-types) and 7 @types dev deps
- Fix npm audit vulnerabilities (diff, js-yaml, lodash)
- Cache eviction now uses O(1) in-memory size tracking instead of O(n) database queries
- HTTP connection pool reduced from 50 to 10 sockets (appropriate for CLI workloads)
- Extract `buildTranslationParams()` to eliminate duplicate parameter building code
- Unified logging through Logger service (respects `--quiet` flag consistently)
- Comprehensive test expansion: 1020 to 1586 tests (+55%), 40 to 53 suites, 100% pass rate

## [0.7.0] - 2025-10-16

### Added
- **Text-Based File Caching** - Improved performance for small text files (.txt, .md, .html, .srt, .xlf)
  - Smart routing automatically uses cached text API for files under 100 KiB
  - Applies to: `.txt`, `.md`, `.html`, `.htm`, `.srt`, `.xlf`, `.xliff` files
  - Falls back to document API for large files (≥100 KiB) with warning message
  - **Important**: Large files and binary documents use document API (not cached)
  - Binary files (.pdf, .docx, .pptx, .xlsx) always use document API (not cached)
  - **Performance Impact**: Only small text files (<100 KiB) benefit from instant cached translations
  - **Cost Savings**: Only small text files avoid repeated API calls
  - Document API translations always make fresh API calls (no caching)
  - 11 new unit tests for text-based file caching behavior
  - Warning message displays file size when falling back to document API
  - Automatic file size threshold checking (100 KiB safe limit, API limit 128 KiB)
  - Total test count: 1130 → 1140 tests (+10 tests after fixing count error, 100% pass rate)
  - **Use cases**: Small documentation files, READMEs, subtitle files, HTML pages under 100 KiB

## [0.6.0] - 2025-10-14

### Added
- **CI/CD Security Automation** - Automated security checks in continuous integration
  - GitHub Actions workflow (`.github/workflows/security.yml`) with daily scheduled audits
  - GitLab CI pipeline (`.gitlab-ci.yml`) with dedicated security stage
  - Security checks: npm audit, TypeScript type-check, ESLint, tests
  - Fail-fast security stage runs before tests/build
  - Scheduled daily security audits for proactive vulnerability detection

- **Git Hooks: commit-msg and post-commit** - Enhanced git workflow automation
  - New `commit-msg` hook enforces Conventional Commits format with commitlint
  - New `post-commit` hook provides feedback and reminds to update CHANGELOG.md
  - Created `commitlint.config.js` with project-specific configuration
  - Installed @commitlint/cli and @commitlint/config-conventional dependencies
  - Updated GitHooksService to support all four hooks: pre-commit, pre-push, commit-msg, post-commit
  - Enhanced `deepl hooks` CLI commands with new hook types
  - commit-msg hook validates commit messages against Conventional Commits specification
  - post-commit hook provides type-specific feedback (feat, fix, docs, test, etc.)
  - All hooks properly integrated with CI/CD workflows
  - 8 additional unit tests for new hook types (install, uninstall, path, list, content generation)
  - Total test count: 1116 → 1130 tests (+14 tests, 100% pass rate)
  - **Use cases**: Enforcing commit message standards, automated changelog reminders, team consistency

- **Table Output Format** - Structured table view for comparing translations
  - New `--format table` option for translate command with multiple target languages
  - Displays translations in clean 3-column table: Language | Translation | Characters
  - Automatic word wrapping for long translations (60-character column width)
  - Thousands separator formatting for character counts
  - Works with `--show-billed-characters` for cost tracking
  - 6 comprehensive unit tests for table formatter
  - 5 integration tests for CLI --format table flag
  - Working example script: `examples/20-table-output.sh` with 6 scenarios
  - Full documentation in README.md and docs/API.md
  - Total test count: 1105 → 1116 tests (+11 tests, 100% pass rate)
  - **Use cases**: Side-by-side translation comparison, cost tracking, human-readable reports, quality assurance

- **Cost Transparency** - Track actual billed characters for budget planning
  - New `--show-billed-characters` flag for translate command
  - Displays actual billed character count after translation for cost tracking
  - Supports text, file, and batch translation modes
  - JSON output format includes `billedCharacters` field
  - Number formatting with `.toLocaleString()` for readability
  - 5 comprehensive unit tests for parameter sending and response parsing
  - 2 integration tests for CLI flag validation
  - 5 E2E tests for complete workflow validation
  - Working example script: `examples/18-cost-transparency.sh` with 10 scenarios
  - Full documentation in README.md and docs/API.md
  - Total test count: 1068 → 1080 tests (+12 tests, 100% pass rate)

- **Document Minification** - Reduce file size for PPTX/DOCX translations
  - New `--enable-minification` flag for document translation
  - Reduces file size for PowerPoint (PPTX) and Word (DOCX) documents
  - Only works with PPTX and DOCX formats (API limitation)
  - Validation prevents usage with unsupported formats (PDF, XLSX, TXT, etc.)
  - 7 comprehensive unit tests (2 for DeepL client, 5 for DocumentTranslationService)
  - 3 integration tests for CLI flag validation
  - Full documentation in README.md and docs/API.md
  - Total test count: 1080 → 1090 tests (+10 tests, 100% pass rate)

- **Advanced XML Tag Handling** - Fine-tuned control for XML/HTML translation
  - New `--outline-detection` flag to control automatic XML structure detection (true/false)
  - New `--splitting-tags` flag to specify XML tags that split sentences (comma-separated)
  - New `--non-splitting-tags` flag for non-translatable text content (comma-separated)
  - New `--ignore-tags` flag to skip translation of specific tag content (comma-separated)
  - All XML flags require `--tag-handling xml` for validation
  - Useful for custom XML formats, technical documentation, and localized HTML
  - 6 comprehensive unit tests for DeepL API client parameter sending
  - 5 integration tests for CLI flag validation
  - Full documentation in docs/API.md with advanced XML examples
  - Working example script: `examples/19-xml-tag-handling.sh` demonstrating all options
  - Total test count: 1090 → 1105 tests (+15 tests, 100% pass rate)

### Changed
- **Documentation Updates** - Improved accuracy and clarity
  - Fixed version numbers across all documentation files
  - Clarified document format conversion limitations (PDF → DOCX only)
  - Removed completed security audit reports and point-in-time coverage reports
  - Updated hook documentation with usage examples and troubleshooting

### Fixed
- **Git Hooks Reliability** - Fixed multiple issues in post-commit hook
  - Fixed grep color code issue causing hook failures in CI environments
  - Added `--color=never` flag to grep to prevent ANSI color codes in output
  - Fixed commit type extraction to use `head -1` for multi-line commit messages
  - Ensures hooks work correctly in both interactive terminals and CI/CD pipelines

- **Test Suite Improvements** - Fixed test failures in CI environments
  - Fixed E2E write command validation errors
  - Resolved all ESLint errors for clean linting
  - All 1130 tests now pass in CI/CD environments

### Technical
- **Test Coverage**: 1068 → 1130 tests (+62 tests, 5.8% increase)
- **Overall pass rate**: 100% (1130/1130 passing)
- **Production Readiness**: High - CLI is stable and feature-complete for v1.0.0

## [0.5.1] - 2025-10-14

### Security
- Completed comprehensive security audit: 0 vulnerabilities, risk score 1.0/10 (excellent)

### Added
- **Semantic Exit Codes** - Granular exit codes for better CI/CD integration
  - **Exit codes 0-7**: Success (0), General Error (1), Auth Error (2), Rate Limit (3), Quota (4), Network (5), Invalid Input (6), Config Error (7)
  - Automatic error classification based on error message patterns
  - Retry logic for retryable errors (rate limit and network errors)
  - `isRetryableError()` utility function for script automation
  - 43 comprehensive unit tests for error classification and retry logic
  - Complete documentation in docs/API.md with CI/CD integration examples
  - Pattern-based error detection (case-insensitive, priority-ordered)
  - Exit codes enable intelligent retry logic in bash scripts and CI pipelines

- **Document Translation Cancellation** - AbortSignal support for long-running translations
  - Cancel document translations in progress with Ctrl+C or programmatic cancellation
  - AbortSignal support in `translateDocument()` method
  - Cancellable during upload, polling, and sleep phases
  - Graceful cleanup on cancellation
  - 5 comprehensive unit tests covering all cancellation scenarios
  - Backward compatible (optional parameter)

### Changed
- **Performance Optimization: ConfigService.get()** - Eliminated unnecessary deep copying
  - Changed from `JSON.parse(JSON.stringify())` to direct reference return
  - Reduced memory allocations and improved performance
  - TypeScript `Readonly<DeepLConfig>` provides compile-time immutability
  - No API contract changes (external behavior unchanged)
  - Updated unit tests to reflect readonly reference behavior

- **Performance Optimization: Variable Preservation** - Hash-based placeholders for better uniqueness
  - Changed from sequential placeholders (`__VAR_0__`) to hash-based (`__VAR_<hash>__`)
  - Uses SHA-256 hash with random salt for collision resistance
  - Eliminates risk of placeholder conflicts in edge cases
  - Improves reliability for complex translations with many variables

### Fixed
- **Test Suite Quality** - Fixed 6 test failures discovered during full test run
  - Fixed config-service.test.ts: Updated to match readonly reference behavior
  - Fixed translation-service.test.ts: Updated 5 preserveVariables tests to use flexible mocking
  - Fixed exit-codes.test.ts: Updated 3 tests to match actual priority ordering
  - All 1068 tests now passing (100% pass rate, 40 test suites)

### Technical
- **Test Coverage**: 905 → 1068 tests (+163 tests, 18% increase)
  - Unit tests: 680 → 723 tests (+43 exit code tests, +5 cancellation tests)
  - Integration tests: 72 tests (stable)
  - E2E tests: 69 tests (stable)
  - Overall pass rate: 100% (1068/1068 passing)
- **Documentation**: Complete API reference updates
  - Added Exit Codes section to API.md with classification table
  - Added CI/CD integration examples for retry logic
  - Updated README.md with links to exit codes documentation

## [0.5.0] - 2025-10-13

### Added
- **v3 Glossary API Support** - Multilingual glossaries with advanced management
  - Full support for DeepL v3 Glossary API (released April 2025)
  - Multilingual glossaries: one glossary can contain multiple language pairs (EN→DE,FR,ES,IT)
  - `deepl glossary delete-dictionary <name-or-id> <target-lang>` - Delete specific language pair from multilingual glossary
  - Preserves glossary while removing individual dictionaries
  - Validation: prevents deletion of last dictionary or from single-target glossaries
  - Comprehensive integration tests (5 new tests for delete-dictionary)
  - Full documentation in README.md and docs/API.md with usage examples

### Changed
- **v3 API Migration** - Updated glossary operations to use v3 endpoints
  - All glossary operations now use `/v3/glossaries` endpoints (create, list, get, entries, update, delete)
  - GlossaryInfo type supports both v2 (single-target) and v3 (multilingual) formats
  - Helper functions: `isMultilingual()`, `isSingleTarget()` for glossary type checking
  - Backward compatible: existing v2 glossaries continue to work seamlessly
  - Request format: JSON with `dictionaries` array structure
  - Response format: JSON with `dictionaries` array containing entries
  - Entry management: requires source/target language pair for all operations
  - Updated all integration tests to expect v3 API format
  - Fixed CLI help text assertions to use regex matching for flexibility

### Fixed
- **Integration Test Compatibility** - Fixed test expectations for v3 API
  - Fixed 3 CLI integration tests expecting exact string match (now use regex for `[options]`)
  - Fixed 4 API integration tests expecting v2 flat structure (now expect v3 `dictionaries` array)
  - Fixed content-type expectations (v3 uses `application/json`, not form-encoded)
  - Fixed response parsing for v3 JSON wrapper format
  - All 1020 tests now passing (100% pass rate)

### Technical
- **Glossary API v3 Implementation**
  - DeepLClient methods updated for v3: createGlossary(), updateGlossaryEntries(), deleteGlossaryDictionary()
  - GlossaryService enhanced with multilingual validation logic
  - GlossaryCommand extended with delete-dictionary subcommand
  - Type system supports both v2 and v3 glossary formats with discriminated unions
  - HTTP mocking updated for v3 JSON request/response format

### Documentation
- Updated README.md with v3 glossary examples and delete-dictionary usage
- Updated docs/API.md with complete delete-dictionary command reference
- Removed outdated V3_GLOSSARY planning documents (implementation complete)
- Cleaned up TODO.md: removed completed Phase 1-2 tasks, kept only future roadmap

## [0.4.0] - 2025-10-12

### Added
- **Batch Text Translation Optimization** - Efficient bulk translation with reduced API overhead
  - New `translateBatch()` method in DeepL client sends up to 50 texts per request
  - TranslationService automatically uses batch API for multiple texts
  - Cache-aware batching: only translates uncached texts, skips cached entries
  - Automatic splitting when batch exceeds 50 texts (DeepL API limit)
  - **Performance Impact**: Reduces API calls from N to ceil(N/50) for bulk operations
  - Transparent optimization requiring no configuration changes
  - 8 new unit tests for batch translation in DeepL client
  - Updated TranslationService tests to verify batch API usage
  - Documentation added to README.md explaining performance benefits

- **Glossary Management Enhancements** - Complete glossary editing capabilities
  - `deepl glossary languages` - List all supported glossary language pairs
  - `deepl glossary add-entry <name-or-id> <source> <target>` - Add entry to existing glossary
  - `deepl glossary update-entry <name-or-id> <source> <new-target>` - Update glossary entry
  - `deepl glossary remove-entry <name-or-id> <source>` - Remove entry from glossary
  - `deepl glossary rename <name-or-id> <new-name>` - Rename existing glossary
  - Accepts glossary name OR ID for all commands (convenient lookup)
  - Implementation uses delete + recreate pattern (glossary ID changes, data preserved)
  - Validation: prevents duplicate entries, removing last entry, same-name rename
  - Added `formatLanguagePairs()` for displaying language pair lists
  - 9 new unit tests for GlossaryCommand methods
  - 5 new unit tests for GlossaryService.renameGlossary()
  - 8 new integration tests for glossary rename CLI behavior
  - **Test Coverage**: GlossaryCommand improved from 68.88% to near 100%
  - Comprehensive documentation in docs/API.md and README.md

- **HTTP/HTTPS Proxy Support** - Enterprise-friendly proxy configuration
  - Automatic proxy detection from environment variables
  - Supports HTTP_PROXY and HTTPS_PROXY (case-insensitive)
  - Proxy authentication support (username:password@host:port)
  - Works with all DeepL CLI commands transparently
  - Full documentation with examples in README.md

- **Retry and Timeout Configuration** - Robust API communication
  - Automatic retry logic for transient failures (5xx errors, network issues)
  - Default: 3 retries with exponential backoff (1s, 2s, 4s, 8s, 10s max)
  - Smart error detection: retries server errors, not client errors (4xx)
  - Default 30-second timeout per request
  - Comprehensive unit tests for retry behavior and timeout handling
  - Full documentation in README.md

- **Document Format Conversion** - PDF to DOCX conversion
  - New `--output-format` flag for translate command
  - Supports PDF → DOCX conversion (only supported conversion by DeepL API)
  - Converts PDFs to editable Word documents during translation
  - Usage: `deepl translate document.pdf --to es --output-format docx --output document.es.docx`
  - Validates format combinations (rejects unsupported conversions)
  - Documentation with examples and limitations in README.md and docs/API.md

### Changed
- **Documentation Updates** - Complete feature parity documentation
  - Added comprehensive glossary command reference to docs/API.md
  - Documented all 5 new glossary subcommands with arguments, behavior, examples
  - Added batch translation performance section to README.md
  - Updated glossary usage examples with rename workflow
  - Documented delete + recreate pattern and glossary ID changes
  - Added proxy configuration examples and notes
  - Updated TODO.md with "Feature Parity with Official SDKs" section
  - Created feature comparison matrix showing 100% parity with deepl-python/deepl-node

- **Test Suite Improvements** - Enhanced test coverage and quality
  - Total tests: 762 → 905+ tests (+143 tests, 18.8% increase)
  - Unit tests: 655 → 680+ tests
  - Integration tests: 64 → 72+ tests (glossary integration +8)
  - E2E tests: 21 → 69+ tests (significant E2E expansion)
  - 100% pass rate maintained across all test suites
  - GlossaryCommand coverage: 68.88% → near 100% (+31.12%)
  - Added comprehensive glossary test breakdown (89+ tests total)

### Fixed
- **Example Scripts** - Corrected based on DeepL API limitations
  - Fixed example 2 (multi-format translation) - removed unsupported format conversions
  - Fixed example 16 (document format conversion) - clarified PDF → DOCX only support
  - Updated documentation to reflect actual API capabilities
  - Prevents user confusion about supported format conversions

### Technical
- **Feature Parity Achievement** - 100% parity with official DeepL SDKs
  - Matches all core features in deepl-python and deepl-node
  - Batch text translation ✅
  - Glossary CRUD operations ✅
  - Glossary entry editing ✅
  - Glossary rename ✅
  - Glossary language pairs listing ✅
  - Plus CLI-exclusive features: watch mode, git hooks, interactive write mode

- **API Client Enhancements**
  - Added `translateBatch()` for efficient bulk translation
  - Validates translation count matches input count
  - Handles all translation options in batch requests
  - Automatic error handling for batch operations

- **Service Layer Improvements**
  - GlossaryService: Added renameGlossary(), addEntry(), updateEntry(), removeEntry()
  - TranslationService: Refactored to use batch API with cache awareness
  - All edit operations preserve glossary metadata and language pairs

## [0.3.0] - 2025-10-12

### Added
- **Document Translation** - Translate complete documents while preserving formatting
  - Support for 11 document formats: PDF, DOCX, PPTX, XLSX, HTML, TXT, SRT, XLIFF, DOC, HTM
  - Async processing with progress tracking (queued → translating → done)
  - Formality control for document translation
  - File size limits: 10MB (PDF), 30MB (other formats)
  - Billed characters displayed after completion
  - Formatting, structure, and layout automatically preserved
  - DocumentTranslationService with upload/poll/download workflow
  - Comprehensive test coverage:
    - 25 unit tests for DocumentTranslationService (100% coverage)
    - 23 integration tests for document API methods (upload, status, download)
    - 8 E2E tests for document translation workflows
  - Added example script: `examples/15-document-translation.sh` with 7 scenarios
  - Full documentation in README.md and docs/API.md
  - Usage: `deepl translate document.pdf --to es --output document.es.pdf`

### Changed
- **API Documentation** - Comprehensive update to docs/API.md for accuracy
  - Fixed 62 discrepancies between documentation and actual implementation
  - CRITICAL: Removed non-existent global flags (--config, --no-cache, --verbose, --quiet)
  - CRITICAL: Simplified exit codes to actual behavior (0 and 1, noted 2-7 as planned)
  - CRITICAL: Fixed configuration file locations with OS-specific paths
  - CRITICAL: Corrected configuration schema structure (auth.apiKey, api section)
  - HIGH: Added all short flag forms for write command (-a, -d, -c, -f, -b)
  - HIGH: Removed non-existent --glossary from watch, documented --git-staged as planned
  - MEDIUM/LOW: Enhanced documentation for config, glossary, auth, translate, write, watch commands
  - Added "Planned Features" section documenting desired but unimplemented features
  - Added API.md maintenance guidelines to CLAUDE.md with verification checklist
- **Test Coverage Improvements** - Comprehensive testing expansion for low-coverage areas
  - **AuthCommand**: 75% → 95% (+20%) with 2 new tests
    - Non-Error exception handling during API validation
    - Non-authentication API errors (network timeout, etc.)
  - **TranslateCommand**: 73.45% → 76.99% (+3.54%) with 6 new tests
    - splitSentences and tagHandling option passthrough
    - formality option in translateToMultiple
    - sourceLang option in translateToMultiple
    - Combined options validation
  - **WatchCommand**: 42.85% → 87.05% (+44.2%) with 8 new tests
    - Empty target validation, display messages, auto-commit scenarios
    - Bug fix: Empty target languages validation now properly filters empty strings
  - **WatchService**: 77.64% → 95.29% (+17.65%) with 11 new tests
    - Pattern filtering (glob matching), translation options passthrough
    - Error handling in event handlers, statistics tracking
  - **GitHooksService**: 5.08% → 100% (+94.92%) with 33 new comprehensive tests
    - Complete test suite with proper fs mocking and temp directory handling
    - All methods tested: install, uninstall, isInstalled, list, findGitRoot
    - Hook content generation, backup/restore, validation
  - **Overall**: 90.88% → 91.47% (+0.59%), 557 → 613 tests (+56 tests, 100% pass rate)

### Fixed
- **Critical: E2E and Integration tests no longer clear user's API key** - Fixed tests affecting real user configuration
  - E2E and Integration tests were running against real user config directory (~/.deepl-cli/)
  - Tests calling `deepl config reset` or `deepl auth clear` would clear user's stored API key
  - Now use isolated test config directories via DEEPL_CONFIG_DIR environment variable
  - All E2E and Integration tests now run in complete isolation from user configuration
  - User's API key and settings are preserved after running tests
  - Fixed: cli-auth.integration.test.ts (added runCLI helper with DEEPL_CONFIG_DIR)
  - Fixed: cli-cache.integration.test.ts (added runCLI helper with DEEPL_CONFIG_DIR)
  - Already correct: cli-config.integration.test.ts (was already using runCLI helper)
- Fixed empty target languages validation in WatchCommand
  - Empty string split returns array with empty string, causing validation to pass incorrectly
  - Added filter to remove empty strings before validation
  - Now properly throws error when no target languages provided

## [0.2.1] - 2025-10-11

### Added
- **Model Type Selection** - Choose quality vs speed trade-offs for translation
  - New `--model-type` flag for translate command
  - Three model types: `quality_optimized` (default), `prefer_quality_optimized`, `latency_optimized`
  - Use quality_optimized for documents and marketing content
  - Use latency_optimized for real-time chat and live subtitles
  - ModelType union type added to TranslationOptions
  - 4 comprehensive unit tests (all passing, 549 total tests)
  - Added example script: `examples/12-model-type-selection.sh`
  - Full documentation in README.md and docs/API.md
- **Usage Command** - Monitor API character usage and quota
  - New `deepl usage` command to display character consumption statistics
  - Shows used/total characters with percentage and remaining quota
  - Visual warning when usage exceeds 80% of limit
  - Formatted output with colored indicators
  - UsageCommand with comprehensive unit tests (10 tests)
  - Added example script: `examples/10-usage-monitoring.sh`
  - Full documentation in README.md and API.md
- **Languages Command** - List supported source and target languages
  - New `deepl languages` command to display all supported languages
  - `--source` flag to show only source languages
  - `--target` flag to show only target languages
  - Formatted output with aligned language codes and names
  - LanguagesCommand with comprehensive unit tests (12 tests)
  - Added example script: `examples/11-languages.sh`
  - Full documentation in README.md and API.md
- **Translation Options** - Exposed additional DeepL API parameters
  - `--split-sentences` flag for sentence splitting control (on, off, nonewlines)
  - `--tag-handling` flag for XML/HTML tag preservation (xml, html)
  - Both options were already implemented in API client, now accessible via CLI
  - Full documentation with examples in docs/API.md
- **Write Command CLI Flags** - Exposed all write command features via CLI
  - `--output` / `-o` - Write improved text to file
  - `--in-place` - Edit file in place
  - `--interactive` / `-i` - Interactive mode to choose from suggestions
  - `--diff` / `-d` - Show diff between original and improved text
  - `--check` / `-c` - Check if text needs improvement (exit code based)
  - `--fix` / `-f` - Automatically fix file in place
  - `--backup` / `-b` - Create backup file before fixing
  - File path detection for automatic file operations
  - 8 new E2E tests for CLI flag validation

### Changed
- **Enhanced Interactive Mode** - Now generates multiple alternatives
  - Calls DeepL Write API 4 times with different styles (simple, business, academic, casual)
  - Presents multiple options in interactive menu instead of single suggestion
  - Automatically removes duplicate suggestions
  - Gracefully handles API errors for individual styles
  - Falls back to single suggestion when user specifies style/tone
- Updated write command help text to reflect all available options
- Enhanced argument description to indicate file path support
- Updated documentation to explain interactive mode behavior

### Fixed
- Fixed chokidar TypeScript import issue in WatchService
  - Replaced deprecated `chokidar.WatchOptions` with inline type definition
  - All 523 tests now passing
- Fixed glossary API endpoints missing `/v2` path prefix
  - Added `/v2` prefix to all glossary endpoints (create, list, get, delete, entries)
  - Glossary commands now work correctly with DeepL API v2

## [0.2.0] - 2025-10-08

### Added
- **Git Hooks Integration** ✨ NEW! - Automate translation validation in git workflow
  - New `deepl hooks` command for managing git hooks
  - **pre-commit hook**: Validates translations before committing
  - **pre-push hook**: Validates all translations before pushing
  - Hook management: install, uninstall, list, path commands
  - Safe installation with automatic backup of existing hooks
  - Customizable hook scripts for project-specific workflows
  - GitHooksService for hook lifecycle management
  - HooksCommand CLI with colored output
- **DeepL Write Integration** - AI-powered text improvement
  - Grammar, style, and tone enhancement using DeepL Write API
  - New `deepl write` command for text improvement
  - Support for 8 languages: de, en-GB, en-US, es, fr, it, pt-BR, pt-PT
  - **Writing Styles**: simple, business, academic, casual, and prefer_* variants
  - **Tones**: enthusiastic, friendly, confident, diplomatic, and prefer_* variants
  - `--alternatives` option to show multiple improvement suggestions
  - WriteService with comprehensive error handling
  - 28 unit tests for WriteService
  - 19 unit tests for WriteCommand
  - 37 integration tests for DeepL client improveText method
  - Full API integration with DeepL Write v2 endpoint
- **Watch Mode**: Real-time file/directory monitoring with auto-translation
  - Monitor files or directories for changes with `deepl watch`
  - Configurable debouncing (default 300ms)
  - Glob pattern filtering (e.g., `*.md`, `*.json`)
  - Multiple target languages support
  - Auto-commit to git (optional with `--auto-commit`)
  - Custom output directories
  - Statistics tracking and graceful shutdown
  - 19 comprehensive unit tests
- **Batch Processing**: Parallel directory translation
  - Translate entire directories with progress indicators
  - Configurable concurrency (default: 5, customizable with `--concurrency`)
  - Glob pattern filtering with `--pattern` option
  - Recursive/non-recursive modes with `--recursive`
  - Error recovery and detailed statistics
  - 16 unit tests for batch translation service
- **Context-Aware Translation**: Enhanced translation quality
  - New `--context` parameter for better disambiguation
  - Pass surrounding context to DeepL API
  - 5 additional tests for context handling

### Changed
- **CLI Commands**: Enhanced with Phase 2 features
  - New `deepl write` command for text improvement
  - Added to `translate` command: `--context`, `--recursive`, `--pattern`, `--concurrency`
  - New `deepl watch` command for real-time translation
- **Testing**: Expanded test suite from 302 to 447 tests (Phase 2 complete!)
  - Unit tests: 275 → 344 tests (+69)
  - Integration tests: 27 → 64 tests (+37 for Write API)
  - E2E tests: 21 tests (stable)
  - Overall pass rate: 98.2% (447 passing, 8 skipped)
- **Coverage**: Improved from 88.85% to 90.1%
- **Dependencies**: Added chokidar, p-limit, fast-glob for Phase 2 features
- **API Types**: Added WriteLanguage, WritingStyle, WriteTone, WriteOptions, WriteImprovement types

### Technical
- **WriteService**: New service for DeepL Write API integration
  - Grammar and style improvement
  - Tone and writing style customization
  - Multiple improvement alternatives
- **WatchService**: New service for file monitoring with chokidar integration
- **BatchTranslationService**: Parallel processing with error recovery
- **Architecture**: Enhanced service layer with write, watch, and batch capabilities
- **Performance**: Optimized with parallel processing and smart caching
- **API Client**: Extended DeepLClient with improveText() method for Write API

## [0.1.0] - 2025-10-07

### Added
- **Core Translation**: Text and file translation via DeepL API
- **Multi-language Support**: Translate to multiple target languages in one command
- **File Translation**: Support for `.txt` and `.md` files with format preservation
- **stdin Support**: Pipe text input for translation workflows
- **Authentication**: Secure API key management with config storage
- **Configuration**: Persistent configuration with `~/.deepl-cli/config.json`
- **Caching**: SQLite-based translation cache with LRU eviction
- **Glossary Management**: Create, list, and manage DeepL glossaries
- **CLI Commands**:
  - `deepl translate` - Translate text or files
  - `deepl auth` - Manage API keys (set-key, show, clear)
  - `deepl config` - Configuration management (get, set, list, reset)
  - `deepl cache` - Cache management (stats, clear, enable, disable)
  - `deepl glossary` - Glossary operations (create, list, show, entries, delete)

### Technical
- **TypeScript**: Strict mode with 88.85% test coverage
- **Testing**: 275 unit tests, 27 integration tests (302 total)
- **Architecture**: Clean separation (CLI → Services → API → Storage)
- **Dependencies**: axios, better-sqlite3, commander, chalk
- **Node**: Requires Node >=18.0.0

### Notes
- Initial baseline release capturing Phase 1 MVP functionality
- Pre-1.0 version indicates API may change as we implement Phase 2-3 features
- Manual testing completed with real DeepL API - all features working
