# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed
- **Test Coverage Improvements** - Comprehensive testing expansion for low-coverage areas
  - WatchCommand: 42.85% → 87.05% (+44.2%) with 8 new tests
    - Empty target validation, display messages, auto-commit scenarios
    - Bug fix: Empty target languages validation now properly filters empty strings
  - TranslateCommand: 70.79% → 73.45% (+2.66%) with 5 new tests
    - Stdin error handling (whitespace, errors, large input)
    - Multi-file translation options (sourceLang, formality)
  - WatchService: 77.64% → 95.29% (+17.65%) with 11 new tests
    - Pattern filtering (glob matching), translation options passthrough
    - Error handling in event handlers, statistics tracking
  - GitHooksService: 5.08% → 100% (+94.92%) with 33 new comprehensive tests
    - Complete test suite with proper fs mocking and temp directory handling
    - All methods tested: install, uninstall, isInstalled, list, findGitRoot
    - Hook content generation, backup/restore, validation
  - Total: +49 tests (557 → 606 tests, 100% pass rate)

### Fixed
- **Critical: E2E tests no longer clear user's API key** - Fixed E2E tests affecting real user configuration
  - E2E tests were running against real user config directory (~/.deepl-cli/)
  - Tests calling `deepl config reset` would clear user's stored API key
  - Now use isolated test config directory via DEEPL_CONFIG_DIR environment variable
  - All E2E tests now run in complete isolation from user configuration
  - User's API key and settings are preserved after running tests
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
