# DeepL CLI - Development Context Summary

## Project Overview

**DeepL CLI** - A comprehensive command-line interface for DeepL translation API, developed internally at DeepL for potential GitLab deployment (not GitHub). Built with TypeScript following strict TDD approach.

## Current Status

### Version: 0.2.0-dev (Phase 2 In Progress)
- **Test Coverage**: 345 tests (340 passing, 98.6% pass rate)
  - Unit tests: 297 (88.5% coverage)
  - Integration tests: 27 (25 passing, 2 known issues documented)
  - E2E tests: 21 (all passing)
- **Git Status**: Local repository, not yet pushed to remote (GitLab)
- **CI/CD**: Deferred until push to GitLab (will use GitLab CI, not GitHub Actions)

### Phase 1 (✅ COMPLETE)
All MVP features implemented and tested:
- Basic translation command (`deepl translate`)
- Configuration management (`deepl config`)
- API key authentication (`deepl auth`)
- Local SQLite caching with LRU eviction
- Code block and variable preservation
- Multi-target language support
- Stdin support for piping
- File translation (.txt, .md) with format preservation
- Glossary management (create, list, show, delete)
- Cache management CLI commands
- Comprehensive documentation (README, API docs, 8 examples)
- Manual testing with real API completed
- Version 0.1.0 tagged with CHANGELOG

### Phase 2 (🚧 IN PROGRESS)
Currently implementing advanced features in this order:

1. **Context-Aware Translation** (✅ COMPLETE)
   - Added `--context` CLI parameter
   - Passes context to DeepL API for better disambiguation
   - 5 new tests added (all passing)
   - Fully documented with examples
   - Commits: 144dedc, 715bb0d

2. **Batch Processing** (✅ COMPLETE)
   - Implemented parallel file translation with p-limit
   - Added progress bars with ora package
   - Implemented error recovery for batch operations
   - Added 17 unit tests (16 passing, 1 skipped)
   - CLI integration with directory support
   - New options: --recursive, --pattern, --concurrency
   - Features:
     * Translate entire directories
     * Configurable concurrency (default: 5)
     * Glob pattern filtering
     * Recursive/non-recursive modes
     * Progress indicators
     * Error reporting and statistics

3. **Watch Mode** (📋 PLANNED)
   - File watching with chokidar
   - Auto-translation on save
   - Debouncing
   - Optional auto-commit

4. **Git Hooks** (📋 PLANNED)
   - Pre-commit translation validation
   - Pre-push translation checks

5. **DeepL Write Integration** (📋 PLANNED)
   - Grammar and style enhancement
   - New API integration

## Project Structure

```
deepl-cli/
├── src/
│   ├── cli/              # CLI interface and commands
│   ├── services/         # Business logic (translation, file, glossary)
│   ├── api/              # DeepL API client
│   ├── storage/          # Cache (SQLite) and config
│   ├── utils/            # Utilities (preservation, etc.)
│   └── types/            # TypeScript type definitions
├── tests/
│   ├── unit/             # 280 unit tests
│   ├── integration/      # 27 integration tests
│   └── e2e/              # 21 E2E tests
├── docs/
│   └── API.md            # Complete API reference
├── examples/             # 8 working example scripts
├── DESIGN.md             # Architecture and design decisions
├── CLAUDE.md             # Development guidelines for AI
├── TODO.md               # Project roadmap
├── CHANGELOG.md          # Version history
├── VERSION               # Current version (0.1.0)
└── MANUAL_TEST_REPORT.md # Manual testing results

## Key Technical Details

### Dependencies
- **Production**: axios, better-sqlite3, commander, chalk
- **Dev**: typescript, jest, ts-jest, @types/*
- **Node**: >=18.0.0

### Architecture
```
CLI Interface (Commands, Parsing, Help)
           ↓
Service Layer (Translation, File, Cache, Glossary)
           ↓
API Client (DeepL API integration)
           ↓
Storage (SQLite Cache, Config)
```

### Configuration
- Location: `~/.deepl-cli/config.json`
- Cache: `~/.deepl-cli/cache.db` (SQLite)
- Environment variable: `DEEPL_API_KEY`

### Testing Philosophy
- **TDD**: RED → GREEN → REFACTOR cycle
- All features developed test-first
- Mock external dependencies (DeepL API, file system)
- Real API manual testing documented

## Recent Accomplishments (Last Session)

1. **Completed Phase 1 Polish**
   - Added E2E tests (21 tests)
   - Updated README with real examples
   - Created comprehensive API documentation
   - Added 8 example scripts
   - Deferred CI/CD until GitLab push

2. **Started Phase 2**
   - Implemented context-aware translation feature
   - Added `--context` parameter to CLI
   - Full test coverage and documentation

## Current Task

**Batch Processing Feature Complete** (Phase 2, Feature #2)

✅ Completed:
1. ✓ Implemented parallel file translation with p-limit
2. ✓ Added ora package for progress indicators
3. ✓ Implemented error recovery (continues on individual failures)
4. ✓ Added comprehensive tests (17 tests)
5. ✓ Updated documentation with examples
6. ✓ CLI integration with new options

Next in Phase 2:
3. **Watch Mode** - File watching with chokidar
4. **Git Hooks** - Pre-commit translation validation
5. **DeepL Write Integration** - Grammar and style enhancement

## Important Notes

- **Internal to DeepL**: Project will use GitLab (not GitHub)
- **No npm publish yet**: Decision pending on open-source release
- **API Key Storage**: `~/.deepl-cli/config.json` (gitignored)
- **Known Issues**: 2 integration tests fail due to config isolation (documented in TODO.md)

## Files to Reference

- `TODO.md` - Complete Phase 2/3 roadmap
- `DESIGN.md` - Architecture details
- `CLAUDE.md` - Development guidelines
- `tests/` - Existing test patterns to follow
- `examples/` - Example scripts showing usage patterns

## Development Commands

```bash
npm test                    # Run all tests
npm run build              # Build TypeScript
npm run lint               # Lint code
npm run type-check         # TypeScript check
npm link                   # Link for global testing
deepl --help               # Test CLI
```
