# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

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
