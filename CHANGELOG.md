# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Cache Key Determinism Documentation** - Documented intentional property ordering for cache keys
  - Added comprehensive test to verify cache keys are identical regardless of option order
  - Added detailed documentation explaining why property order matters in `generateCacheKey()`
  - Property order in cache data object is now explicitly documented as intentional
  - Prevents accidental cache key breakage from property reordering
  - **Impact**: Ensures future developers understand the importance of property order
  - Location: `src/services/translation.ts:386-417`, test added to `tests/unit/translation-service.test.ts`

- **Language Code Validation** - Upfront validation prevents late API errors (Issue #3)
  - Validates all language codes before making API calls
  - Applies to single language (`--to es`) and multiple languages (`--to es,fr,de`)
  - Validates across all translation workflows: text, file, directory, and document translation
  - Clear error messages list all 30 valid language codes
  - Empty language codes after trimming are detected and rejected
  - **Impact**: Users get immediate feedback about invalid language codes instead of cryptic API errors
  - **Example**: `deepl translate "Hello" --to invalid` now shows: "Invalid target language code: "invalid". Valid codes: ar, bg, cs, ..."
  - Added 6 comprehensive tests covering single/multi-language validation
  - Location: `src/cli/commands/translate.ts:81-92` (validation method), multiple call sites

### Changed
- **Defensive Programming: CacheService Singleton Pattern** - Improved code robustness (Issue #4)
  - Refactored getInstance() to set handlersRegistered flag before instance creation
  - Makes handler registration more atomic and easier to reason about
  - Calculates needsNewInstance and needsHandlerRegistration upfront
  - Sets handlersRegistered=true immediately after checking, before any side effects
  - Prevents theoretical race conditions in async scenarios (defensive programming)
  - Added comprehensive comments explaining the defensive pattern
  - Added 4 new tests verifying singleton behavior and handler registration
  - **Impact**: More maintainable code with clearer intent, prevents future bugs
  - **Note**: Node.js is single-threaded, so actual race conditions don't occur, but this makes code more robust
  - Location: `src/storage/cache.ts:58-102` (getInstance method)

- **Performance Optimization: Cache Eviction Atomicity** - Eliminated redundant database queries (Issue #5)
  - Maintains cache size in memory (`currentSize` field) instead of querying database on every eviction check
  - Changed evictIfNeeded() from O(n) database query to O(1) in-memory check
  - Eliminated stats() call (COUNT(*) + SUM(size)) on fast path when eviction not needed
  - Initialize currentSize from database on construction for accuracy
  - Updates currentSize atomically during set(), clear(), cleanupExpired(), and evictIfNeeded()
  - Uses SQL COUNT(*) for average size calculation (still efficient, single query)
  - Added 3 comprehensive tests verifying cache size tracking accuracy
  - **Impact**: Faster cache operations, especially for large caches; O(1) eviction check vs O(n) query
  - **Performance Benefit**: Avoids expensive database aggregation on every cache write
  - Location: `src/storage/cache.ts` (currentSize field, initialize, set, clear, cleanupExpired, evictIfNeeded)

- **Performance Optimization: HTTP Connection Pool Size** - Reduced resource consumption for CLI tool (Issue #9)
  - Reduced maxSockets from 50 to 10 for both HTTP and HTTPS agents
  - Conservative value prevents resource exhaustion on user machines
  - 50 concurrent sockets was excessive for a CLI tool's typical workload
  - Still allows reasonable parallelism for batch operations
  - Matches maxFreeSockets value for consistency
  - **Impact**: Lower memory footprint and reduced system resource usage
  - **Performance Trade-off**: Minimal impact on throughput; CLI rarely needs >10 concurrent connections
  - Location: `src/api/deepl-client.ts:133-147` (HTTP/HTTPS agent configuration)

### Fixed
- **Document Translation Cancellation Responsiveness** - Improved abort handling after sleep (Issue #10)
  - Added defensive check after sleep() completes to detect cancellation immediately
  - Previously, cancellation detection waited until next polling iteration
  - Now exits immediately if AbortSignal was triggered during sleep
  - sleep() method already had isSettled flag to prevent double settlement (correct)
  - This change adds explicit abort check after await completes for faster response
  - Avoids unnecessary poll interval calculation when operation is cancelled
  - **Impact**: More responsive cancellation behavior; exits faster when Ctrl+C pressed
  - **Technical Detail**: Defensive programming - catches edge case where abort happens just as sleep completes
  - Location: `src/services/document-translation.ts:182-186` (post-sleep abort check)

### Security
- **Symlink Path Validation** - Prevents directory traversal attacks (Issue #6)
  - Rejects symlinks at translate() entry point before processing files
  - Uses `fs.lstatSync()` to detect symlinks (doesn't follow symlinks)
  - Prevents attackers from using symlinks to access sensitive files outside intended scope
  - Clear error message: "Symlinks are not supported for security reasons: <path>"
  - Applies to both file and directory paths
  - Added 5 comprehensive tests covering symlink rejection and regular path acceptance
  - **Impact**: Closes security vulnerability allowing directory traversal via symlinks
  - **Example Attack Prevented**: User creating symlink to `/etc/passwd` and attempting to translate it
  - Location: `src/cli/commands/translate.ts:118-149` (translate method with lstatSync check)

### Refactoring
- **Dead Code Removal: Undefined Marker** - Cleaned up unreachable code (Issue #7)
  - Removed undefined marker check from CacheService.get() method
  - Check was dead code: undefined values are never cached (Issue #10 fix prevents caching undefined)
  - Removed lines checking `if (row.value === '__UNDEFINED__')`
  - Added clarifying comment explaining why check is unnecessary
  - **Impact**: Cleaner, more maintainable code; removes confusion about undefined handling
  - **Code Quality**: Eliminates unreachable code path that could never be executed
  - Location: `src/storage/cache.ts:150-152` (get method, removed dead code check)

### Fixed
- **Critical: Duplicate text handling in batch translation** - Fixed data loss bug for duplicate inputs
  - When input array contained duplicate texts (e.g., `["Hello", "Hello", "World"]`), only the last occurrence received translation
  - Fixed by tracking ALL indices for each unique text using `Map<string, number[]>`
  - Added automatic deduplication of API requests (sends each unique text only once)
  - All occurrences of duplicate texts now receive correct translations
  - Added comprehensive test demonstrating the fix
  - **Impact**: Previously, duplicate texts in batch translation would return incomplete results
  - **Example**: `translateBatch(["Hello", "Hello", "World"], {targetLang: "es"})` now returns 3 results instead of 2
  - Location: `src/services/translation.ts:160-265`

### Changed
- **Test Coverage Enhancement** - Comprehensive integration and E2E test expansion
  - Created 10 new test files covering critical workflows and CLI behavior
  - **Integration tests**: Added 158 tests for service interactions and API contract validation
    - cli-write.integration.test.ts (29 tests) - WriteService with all styles/tones
    - cli-watch.integration.test.ts (25 tests) - File watching workflows
    - cli-hooks.integration.test.ts (29 tests) - Git hooks management
    - cli-translate-workflow.integration.test.ts (52 tests) - Complete translation workflows
    - batch-translation.integration.test.ts (23 tests) - Parallel file translation
  - **E2E tests**: Added 104 tests for end-to-end CLI workflows
    - cli-languages.e2e.test.ts (15 tests) - Languages command behavior
    - cli-usage.e2e.test.ts (12 tests) - Usage command behavior
    - cli-document-translation.e2e.test.ts (26 tests) - Document translation features
    - cli-integration-scenarios.e2e.test.ts (30 tests) - Real-world workflows
    - cli-stdin-stdout.e2e.test.ts (21 tests) - Stdin/stdout and piping
  - **Test distribution**: Now ~27-30% integration/E2E tests, ~70-75% unit tests (meeting best practices)
  - **Total**: 1020 → 1433 tests (+413 tests, +40% increase)
  - **Test suites**: 40 → 50 suites (+10 suites)
  - **Pass rate**: 100% (1433/1433 passing)
  - **Impact**: Validates components work correctly in isolation, together, and in real-world scenarios
  - Addresses previous gap: High unit test coverage but insufficient integration/E2E coverage
  - All tests use proper mocking (nock for HTTP, jest.mock for modules, isolated config directories)

### Fixed
- **Critical: Batch translation index mismatch** - Fixed data corruption risk in partial batch failures
  - When batch translations partially failed, index mapping could break causing wrong text-translation pairing
  - Now uses Map-based tracking to correctly map results to source texts
  - Added 2 comprehensive tests for batch failure scenarios
  - **Impact**: Previously, partial batch failures could return translations for wrong source texts
  - Location: `src/services/translation.ts:204-249`

- **Critical: Windows path detection bug** - Fixed cross-platform compatibility issue
  - Path detection only checked for Unix `/` separator, breaking CLI for all Windows users
  - URLs like `"http://example.com/file.txt"` were incorrectly treated as file paths
  - Added cross-platform path separator detection (`/`, `\`) and URL exclusion
  - Added 7 comprehensive tests for Windows/Unix path detection
  - **Impact**: Previously, CLI was completely broken for Windows users
  - Location: `src/cli/commands/translate.ts:119-141`

- **Critical: Watch service race condition** - Fixed reliability issue in watch mode
  - File change events could trigger timers that execute after `stop()` was called
  - Added `isWatching` flag to prevent race conditions between events and stop command
  - Handles rapid start/stop cycles correctly without orphaned timers
  - Added 5 comprehensive tests for race condition scenarios
  - **Impact**: Previously, stopping watch mode could cause "Cannot read property of null" errors
  - Location: `src/services/watch.ts:136-191`

- **High Priority: Variable preservation performance** - Improved translation speed 10-20x
  - Using `crypto.randomBytes()` and SHA-256 hashing for every variable was ~10-20ms for 100 variables
  - Replaced with simple counter (`__VAR_0__`, `__VAR_1__`, etc.) for ephemeral placeholders
  - Collision risk negligible since variables are replaced immediately during translation
  - Added 3 comprehensive tests for variable preservation efficiency
  - **Impact**: 10-20x performance improvement for texts with many variables
  - Location: `src/services/translation.ts:361-384`

- **High Priority: CSV parsing bug in glossary service** - Fixed functionality for quoted commas
  - Simple `split(',')` broke on CSV with quoted commas (e.g., `"hello, world",hola`)
  - Implemented proper RFC 4180 CSV parser handling quoted fields and escaped quotes
  - Glossary import now works correctly for entries containing commas
  - Added 4 comprehensive tests for CSV parsing edge cases
  - **Impact**: Previously, glossary import failed for any entry with commas in terms
  - Location: `src/services/glossary.ts:327-407`

- **High Priority: Silent proxy configuration failure** - Fixed security/compliance risk
  - Invalid proxy URLs from environment variables logged warning and continued (dangerous)
  - Users might not notice warning and think they're using proxy when they're not
  - Now throws error immediately for invalid proxy URLs (fail-fast)
  - Added 4 comprehensive tests for proxy URL validation
  - **Impact**: Previously, could expose traffic users intended to hide (compliance violation)
  - Location: `src/api/deepl-client.ts:175-180`

- **Critical: Document translation infinite loop risk** - Added timeout and max attempts to prevent infinite polling
  - Added `MAX_POLL_ATTEMPTS` (180 attempts) and `TOTAL_TIMEOUT_MS` (90 minutes) constants
  - Polling now terminates after 180 attempts or 90 minutes total time
  - Prevents CLI from hanging indefinitely if DeepL API status doesn't update
  - Clear error messages indicate timeout exceeded and suggest document may still be processing
  - **Impact**: Previously, misbehaving API responses could cause infinite loops
  - Location: `src/services/document-translation.ts:136-191`

- **Critical: Cache service memory leak** - Fixed duplicate event handler registration
  - Added `handlersRegistered` flag to prevent registering exit handlers multiple times
  - Now uses `process.once()` instead of `process.on()` for cleanup handlers
  - Prevents memory leak when `getInstance()` called multiple times in tests or long-running processes
  - **Impact**: Previously, each `getInstance()` call added new event handlers to process
  - Location: `src/storage/cache.ts:62-89`

- **High Priority: Type safety violations** - Fixed 2 linter errors
  - Fixed unsafe array assignment in `translateBatch()` using explicit type constructor
  - Fixed Promise-in-setTimeout warning by properly wrapping async callback
  - **Impact**: Improved type safety and eliminated compiler warnings
  - Locations: `src/services/translation.ts:163`, `src/services/watch.ts:156-178`

- **Logging Consistency** - Replaced console.warn with Logger.warn in DeepL client
  - Replaced direct `console.warn()` with `Logger.warn()` for proxy URL warnings
  - Ensures all logging respects quiet mode (`--quiet` flag)
  - Maintains consistent logging patterns across entire codebase
  - **Impact**: Previously, proxy warnings would bypass quiet mode
  - Location: `src/api/deepl-client.ts:177`

### Added
- **XML Tag Validation** - Comprehensive validation for XML tag handling options
  - Validates `--splitting-tags`, `--non-splitting-tags`, and `--ignore-tags` parameters
  - Ensures tag names match XML specification (start with letter/underscore, valid characters only)
  - Prevents use of reserved "xml" prefix (case-insensitive)
  - Clear error messages guide users to correct invalid tag names
  - Example: `--splitting-tags="p,div,br"` is validated before sending to API
  - Improves user experience by catching errors early instead of API-side failures

### Changed
- **Performance Optimization: File Operations** - Eliminated duplicate filesystem syscalls
  - Replaced `existsSync() + statSync()` pattern with single `statSync()` call in directory detection
  - Cached file size to avoid calling `statSync()` twice on the same file path
  - Reduces filesystem operations in `translate` command file routing logic
  - **Performance Impact**: Saves 2 syscalls per file translation (1 for directory check, 1 for size warning)
  - No behavior changes, maintains exact same functionality

- **Refactoring: DeepL API Client** - Eliminated code duplication
  - Extracted 56 lines of duplicate parameter building code into shared `buildTranslationParams()` method
  - Both `translate()` and `translateBatch()` now use centralized parameter construction
  - Eliminates risk of divergence between single and batch translation options
  - Easier maintenance for future API parameter additions
  - No behavior changes, all 1140 tests pass

- **Logging Consistency** - Unified logging through Logger service
  - Replaced `console.warn()` with `Logger.warn()` in glossary TSV/CSV parsing (5 occurrences)
  - Replaced `console.error()` with `Logger.error()` in watch service (3 occurrences)
  - Ensures all logging respects quiet mode (`--quiet` flag)
  - Maintains consistent logging patterns across entire codebase
  - Exception: Config service intentionally uses `console.error()` during bootstrap (before Logger available)

### Fixed
- **Critical: Fire-and-forget async in watch service** - Fixed unhandled rejection risk
  - Watch service was using `void (async () => {...})()` pattern that could hide errors
  - Removed `void` operator and properly awaited async `translateFile()` in setTimeout callback
  - Prevents silent failures during file translation in watch mode
  - Error handling now properly increments error count and calls onError callback
  - **Impact**: Previously, translation errors in watch mode could be silently ignored
  - Location: `src/services/watch.ts:156-170`

- **Critical: Watch service race condition on stop** - Fixed race condition in file translation
  - Debounced translation timers could fire after watch service was stopped
  - Added guard check to prevent translations from running after `stop()` is called
  - Prevents "Cannot read property of null" errors when translations execute after cleanup
  - **Impact**: Previously, stopping watch mode could cause unhandled errors from pending translations
  - Location: `src/services/watch.ts` debounce timer callback

- **Critical: Race condition in document translation polling** - Fixed concurrent execution bug
  - AbortSignal cleanup and timeout completion could execute simultaneously
  - Added `isSettled` flag to ensure only one path (resolve or reject) executes
  - Prevents potential memory leaks and duplicate event handler cleanup
  - **Impact**: Previously, aborting a document translation could cause race condition
  - Race occurred when: timeout fires at same moment as abort signal
  - Location: `src/services/document-translation.ts:195-224`

- **Critical: Batch translation failure handling** - Improved error propagation and user feedback
  - Fixed batch translation to properly track failures and warn users about partial failures
  - When all batches fail, now throws error instead of returning empty array
  - When some batches fail, logs warning: "⚠️  Warning: N of M translations failed"
  - Helps users identify incomplete batch operations and propagates errors correctly
  - **Impact**: Previously, all-failure case returned empty array; partial failures were silent
  - Location: `src/services/translation.ts:199-260`

- **High Priority: Resource leaks in cache service** - Implemented proper disposal pattern
  - CacheService singleton now automatically closes database on process exit
  - Added handlers for `exit`, `SIGINT`, and `SIGTERM` signals
  - Prevents "database is locked" errors and ensures clean shutdowns
  - Added `isClosed` flag to prevent double-close errors
  - **Impact**: Previously, process termination could leave database connections open
  - Location: `src/storage/cache.ts` singleton getInstance()

- **High Priority: Non-cryptographic random in security context** - Replaced with crypto.randomBytes
  - Variable placeholder generation now uses `crypto.randomBytes()` instead of `Math.random()`
  - Uses cryptographically secure random bytes with SHA-256 hashing
  - Eliminates collision risk in high-volume translation scenarios
  - **Impact**: Previously, `Math.random()` could produce collisions in variable placeholders
  - Location: `src/services/translation.ts:369-381` preserveVariables()

- **High Priority: Silent proxy URL errors** - Added validation warnings
  - Invalid proxy URLs now log warning instead of silently failing
  - Helps users identify proxy configuration issues early
  - Warning: "⚠️  Warning: Invalid proxy URL: [url]. Proxy will not be used."
  - **Impact**: Previously, invalid proxy URLs caused silent failures in HTTP requests
  - Location: `src/api/deepl-client.ts:174-176`

- **Performance: Concurrency validation** - Added bounds checking
  - BatchTranslationService now validates concurrency is between 1-100
  - Prevents invalid concurrency values that could cause performance issues
  - Throws descriptive error for out-of-bounds values
  - **Impact**: Previously, invalid concurrency values could cause unexpected behavior
  - Location: `src/services/batch-translation.ts` constructor

- **Performance: Unnecessary array copy in getSupportedFileTypes** - Optimized to return readonly reference
  - Changed return type from copied array to `readonly string[]`
  - Eliminates unnecessary memory allocation on every call
  - TypeScript enforces immutability at compile time
  - **Impact**: Reduces memory allocations for frequently called method
  - Location: `src/services/file-translation.ts:35-37`

- **Logic Bug: File size null handling** - Fixed error handling for missing files
  - `getFileSize()` now correctly handles case when file doesn't exist
  - Returns `null` instead of throwing, allowing caller to handle gracefully
  - Improved error message: "File not found or cannot be accessed: [path]"
  - **Impact**: Previously, missing files could cause unclear errors
  - Location: `src/cli/commands/translate.ts:167-175`

- **Code Smell: Redundant null check in watch service** - Removed unnecessary check
  - Removed redundant null check after non-null assertion operator
  - Code already used `!` operator, making additional check unreachable
  - **Impact**: Cleaner code, no behavior change
  - Location: `src/services/watch.ts:208-210`

- **Code Smell: Deprecated _batchOptions parameter** - Removed unused parameter
  - Removed deprecated `_batchOptions` parameter from `translateBatch()` method signature
  - Parameter was never used and cluttered the API
  - **Impact**: Cleaner API surface, no behavior change
  - Location: `src/services/translation.ts:139-142`

- **UX: Poor API error messages** - Added context to error messages
  - API errors now include request details for easier debugging
  - Example: "Translation count mismatch: sent 2 texts but received 1 translations. Target language: es"
  - Example: "No translation returned from DeepL API. Request: translate text (150 chars) to de"
  - **Impact**: Users can now understand what went wrong without inspecting code
  - Location: `src/api/deepl-client.ts` translate() and translateBatch()

- **UX: Cache disabled logging** - Added informative logging
  - Now logs when cache is disabled globally: "ℹ️  Cache is disabled"
  - Now logs when cache is bypassed per-request: "ℹ️  Cache bypassed for this request (--no-cache)"
  - Helps users understand why translations aren't being cached
  - **Impact**: Users no longer confused about caching behavior
  - Location: `src/services/translation.ts:88-92`

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
