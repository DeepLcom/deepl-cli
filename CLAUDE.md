# Claude Code Project Configuration

This file contains project-specific configuration and guidelines for Claude Code working on the DeepL CLI project.

## Project Overview

DeepL CLI is a next-generation command-line interface for the DeepL API that integrates translation, writing enhancement (DeepL Write API), and developer workflow automation.

**Key Features:**
- Translation with context-aware preservation
- Writing enhancement with grammar/style suggestions
- Watch mode for real-time translation
- Modern TUI (Terminal User Interface)
- Team collaboration features
- CI/CD integration

**Project Files Reference:**
- **TODO.md** - Comprehensive project roadmap and task list (read this when resuming work!)
- **CHANGELOG.md** - Release history and version notes
- **DESIGN.md** - Architecture and technical design decisions
- **MANUAL_TEST_REPORT.md** - Results of manual CLI testing

## Development Philosophy

### Package Management

**IMPORTANT: Always use the latest versions of packages.**

- Never downgrade packages to avoid ESM/CommonJS issues
- Embrace modern JavaScript features and ESM
- If a package is ESM-only, refactor code to use dynamic imports or ESM
- Use `"type": "module"` in package.json when necessary
- Keep dependencies up-to-date with latest stable versions

### Test-Driven Development (TDD)

**IMPORTANT: This project follows a strict TDD approach.**

#### TDD Workflow

1. **Red Phase** - Write failing tests first
   - Before implementing any new feature, write tests that define the expected behavior
   - Tests should fail initially since the feature doesn't exist yet
   - Focus on the interface and expected outcomes, not implementation details

2. **Green Phase** - Make tests pass
   - Write the minimal code necessary to make the tests pass
   - Focus on functionality, not perfection
   - Avoid over-engineering at this stage

3. **Refactor Phase** - Improve the code
   - Once tests pass, refactor for clarity, performance, and maintainability
   - Ensure tests continue to pass after refactoring
   - Extract common patterns, improve naming, add documentation

#### TDD Guidelines

- **Always write tests before implementation code**
- **One test at a time** - Write one failing test, make it pass, then move to the next
- **Test behavior, not implementation** - Focus on what the code does, not how it does it
- **Keep tests isolated** - Each test should be independent and not rely on others
- **Use descriptive test names** - Test names should clearly describe what they're testing
- **Mock external dependencies** - Use mocks/stubs for DeepL API, file system, etc.
- **Test edge cases** - Include tests for error conditions, empty inputs, boundary values

#### Example TDD Cycle

```typescript
// 1. RED: Write failing test
describe('TranslationService', () => {
  it('should translate text using DeepL API', async () => {
    const service = new TranslationService('fake-api-key');
    const result = await service.translate('Hello', { targetLang: 'es' });
    expect(result.text).toBe('Hola');
  });
});

// Run test → It fails (TranslationService doesn't exist)

// 2. GREEN: Write minimal implementation
export class TranslationService {
  constructor(apiKey: string) {}
  async translate(text: string, options: any) {
    return { text: 'Hola' }; // Hardcoded to make test pass
  }
}

// Run test → It passes

// 3. REFACTOR: Add more tests and improve implementation
// Add tests for different languages, error handling, caching, etc.
// Implement actual DeepL API integration
```

## Versioning and Changelog

### Principles

**IMPORTANT: This project uses Semantic Versioning (SemVer) and maintains a CHANGELOG.**

- Use **Semantic Versioning (SemVer)**: MAJOR.MINOR.PATCH
  - **MAJOR**: incompatible or breaking changes
  - **MINOR**: backwards-compatible features
  - **PATCH**: backwards-compatible bug fixes
- Maintain a human-readable **CHANGELOG.md** following "Keep a Changelog" style with an **Unreleased** section.
- Every **production/public release** must be **tagged** (`vX.Y.Z`) and documented in the changelog.

### Commit & PR Conventions

Prefer **Conventional Commits** to infer version bumps:
- `feat:` → MINOR
- `fix:` → PATCH
- `perf:` (no breaking) → PATCH
- `docs:, chore:, refactor:` → no bump unless behavior changes
- Any commit with `BREAKING CHANGE:` or `!` → MAJOR

**Example**: `feat(search): add fuzzy matching` → MINOR bump

### What YOU Must Do on Every Change

1. **Edit `CHANGELOG.md`**
   - Add entries under **Unreleased** with subsections as needed:
     - Added / Changed / Fixed / Deprecated / Removed / Security
   - Keep concise, user-facing notes.

2. **Select version bump**
   - Determine MAJOR/MINOR/PATCH from the change scope (rules above).
   - If no release is intended, keep changes in **Unreleased** (no tag yet).

3. **When cutting a release**
   - Move items from **Unreleased** to a new section `## [X.Y.Z] - YYYY-MM-DD`.
   - Update **Unreleased** back to empty scaffolding.
   - Update `VERSION` file to `X.Y.Z`.
   - Update `package.json` version to match.
   - Create an **annotated tag** at the release commit:
     ```bash
     git tag -a vX.Y.Z -m "Release vX.Y.Z: <one-line summary>"
     ```
   - Push commits and the tag:
     ```bash
     git push && git push --tags
     ```

4. **Never tag** for WIP or internal drafts; only tag **released** versions.

### Tagging Rules

- Tag every **production/public** release.
- Do **not** tag for feature branches or internal snapshots.
- Use `vX.Y.Z`, optionally with pre-releases (`v1.2.0-alpha.1`) when needed.
- Always use **annotated tags** (with `-a` flag), not lightweight tags.

### Changelog Format (Keep a Changelog)

```markdown
# Changelog

## [Unreleased]
### Added
### Changed
### Fixed
### Deprecated
### Removed
### Security

## [X.Y.Z] - YYYY-MM-DD
### Added
- New feature description
### Fixed
- Bug fix description
```

Keep entries imperative and short. Focus on user-facing changes.

### Assistant Checklist (Run This on EVERY PR or Commit)

- [ ] Updated **Unreleased** in `CHANGELOG.md` with accurate notes.
- [ ] Chose correct SemVer bump or marked as "no release".
- [ ] If releasing: moved notes to dated section, updated `VERSION` and `package.json`, created annotated tag.
- [ ] Commit messages follow Conventional Commits format.
- [ ] All tests pass before tagging a release.

### Current Version Status

- **Current Version**: 0.1.0 (Initial baseline release - Phase 1 MVP)
- **Status**: Pre-1.0 indicates API may change as Phase 2-3 features are implemented
- **Next Milestone**: 0.2.0 (Phase 2 features) or 1.0.0 (stable public API)

---

### Incremental Development

Follow the phased approach outlined in DESIGN.md:

**Phase 1: MVP (✅ COMPLETE - v0.1.0)**
- Basic translation command
- File translation with format preservation
- Configuration management
- Basic glossary support
- Local caching
- Error handling and validation

**Phase 2: Advanced Features**
- DeepL Write integration
- Watch mode
- Git hooks
- Batch processing
- Context-aware translation

**Phase 3: TUI & Collaboration**
- Interactive TUI
- Translation memory
- Team features

#### Development Process for Each Feature

1. **Review Design** - Reference DESIGN.md for feature specifications
2. **Write Tests** - Create comprehensive test suite (RED)
3. **Implement Feature** - Write code to pass tests (GREEN)
4. **Refactor** - Improve code quality while keeping tests green (REFACTOR)
5. **Manual Testing** - Test the CLI manually to ensure good UX
6. **Documentation** - Update relevant docs
7. **Commit** - Create logical, atomic commits
8. **Repeat** - Move to next feature

## Code Style Guidelines

### General Principles

- **Comment sparingly** - Code should be self-documenting; only add comments when behavior is unclear
- **Follow existing patterns** - Maintain consistency with the codebase
- **Prefer explicit over implicit** - Clear, verbose code is better than clever, terse code
- **Type everything** - Use TypeScript types extensively; avoid `any`

### TypeScript Best Practices

- Use strict mode (`strict: true` in tsconfig.json)
- Prefer interfaces for public APIs, types for internal use
- Use async/await over raw promises
- Leverage discriminated unions for complex types
- Use Zod for runtime validation where needed

### File Organization

```
src/
├── cli/              # CLI interface and commands
├── services/         # Business logic
├── api/              # DeepL API client
├── storage/          # Data persistence
├── utils/            # Utility functions
├── types/            # Type definitions
└── tui/              # Terminal UI components
```

### Naming Conventions

- **Files**: kebab-case (e.g., `translation-service.ts`)
- **Classes**: PascalCase (e.g., `TranslationService`)
- **Functions/variables**: camelCase (e.g., `translateText`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_CACHE_SIZE`)
- **Types/Interfaces**: PascalCase (e.g., `TranslationOptions`)

## Testing Guidelines

### Testing Stack

**Phase-based approach to testing tools:**

#### Phase 1-2: Core Testing (Current)
- **Jest** - Test runner, assertion library, mocking framework
  - Unit tests for services, API clients, utilities
  - Integration tests for component interactions
  - E2E tests for CLI commands
- **ts-jest** - TypeScript support for Jest
- **nock** - HTTP request mocking for API tests
- **memfs** - File system mocking

#### Phase 3: TUI Testing (Future)
- **React Testing Library** - Testing utilities for Ink/React components
  - Only needed when building TUI features
  - Used with Jest as the test runner
  - Tests user interactions in terminal UI

**Important:** Jest is the foundation. React Testing Library is an add-on for testing React components (Ink TUI) and requires Jest to run.

### Test Structure

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange - Set up test data and mocks
      // Act - Execute the code under test
      // Assert - Verify the expected outcome
    });

    it('should handle error case', () => {
      // Test error scenarios
    });

    it('should handle edge case', () => {
      // Test boundary conditions
    });
  });
});
```

### Test Coverage

- **Unit tests** - Test individual functions/classes in isolation
- **Integration tests** - Test how components work together
- **E2E tests** - Test complete user workflows (CLI commands)

### Mocking Strategy

- Mock external APIs (DeepL) in unit tests using Jest mocks or nock
- Use real implementations for integration tests with test doubles
- Use `nock` for HTTP mocking (DeepL API calls)
- Use `memfs` or similar for file system mocking
- Mock dependencies at module boundaries for isolation

## Git Commit Guidelines

### Commit Message Format

Follow the existing commit patterns in the repository. Use conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **refactor**: Code refactoring without changing behavior
- **test**: Adding or updating tests
- **docs**: Documentation changes
- **chore**: Maintenance tasks (dependencies, config, etc.)
- **perf**: Performance improvements
- **style**: Code style changes (formatting, etc.)

### Examples

```bash
feat(translate): add basic translation command

Implement core translation functionality using DeepL API.
Includes support for single text translation and auto-detection
of source language.

feat(cache): implement SQLite-based translation cache

Add CacheService with LRU eviction strategy. Configurable
max size with automatic cleanup of old entries.

test(translation): add tests for error handling

Add comprehensive test coverage for API errors, rate limiting,
and network failures.

refactor(preserve): extract code block preservation logic

Move preservation logic into dedicated service for better
separation of concerns and testability.
```

### Commit Structure

- **Make separate commits per logical change** - Each commit should represent a single, cohesive change
- **Group tests with the logic they test** - Include tests in the same commit as the feature/change they validate
- **Use informative commit messages** - Follow the format above with clear descriptions

### Commit Frequency

- Commit after each TDD cycle (Red → Green → Refactor)
- Commit when a feature is complete and tested
- Don't commit broken code or failing tests
- Don't wait too long between commits

## Pull Request Guidelines

### PR Structure

When creating pull requests, follow these standards:

### PR Description Requirements

```markdown
## Summary

Brief overview of what was changed and why (1-2 sentences).

## Changes Made

- **Added TranslationService** - Core translation logic with caching support
- **Added CacheService** - SQLite-based cache with LRU eviction
- **Added PreservationService** - Preserves code blocks and variables during translation
- **Updated CLI** - Added `translate` command with comprehensive options

## Test Coverage

- ✅ Unit tests for TranslationService (15 tests)
- ✅ Unit tests for CacheService (8 tests)
- ✅ Integration tests for translation workflow (5 tests)
- ✅ E2E tests for CLI commands (3 tests)

Total: 31 tests, 100% coverage for new code

## Backward Compatibility

✅ **Maintained**: This is new functionality, no breaking changes
✅ **Configuration**: Uses existing config format

## Technical Details

**Translation Flow:**
```typescript
User Input → PreservationService → DeepL API → Cache → Output
```

**Caching Strategy:**
- SHA-256 hash of (text + options) as cache key
- LRU eviction when cache exceeds max size
- 30-day TTL for cached entries

**Preservation:**
- Code blocks: ``` and `
- Variables: {var}, ${var}, %s, %d, {0}
- Placeholders replaced before translation, restored after

## Manual Testing

Tested the following scenarios:
- [x] Basic translation: `deepl translate "Hello" --to es`
- [x] File translation: `deepl translate README.md --to fr`
- [x] Multiple targets: `deepl translate "Test" --to es,fr,de`
- [x] Code preservation: `deepl translate tutorial.md --preserve-code`
- [x] Cache hit/miss behavior
- [x] Error handling (invalid API key, network errors)

## Benefits

- **Quality**: Leverages DeepL's next-gen LLM for superior translations
- **Performance**: Caching reduces API calls and improves response time
- **Reliability**: Comprehensive error handling and retry logic
- **Maintainability**: Clean separation of concerns, fully tested

## Size: Small ✓

Small PR focusing on core translation functionality. ~500 LOC including tests.

🤖 Generated with [Claude Code](https://claude.ai/code)
```

### PR Checklist

Before submitting a PR:

- [ ] All tests pass (`npm test`)
- [ ] Code follows style guidelines (`npm run lint`)
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] New features have comprehensive tests
- [ ] Documentation is updated if needed
- [ ] Manual testing completed
- [ ] Commit messages follow guidelines
- [ ] PR description is complete and clear

## Code Quality Standards

### Before Making Changes

- **Research existing patterns** - Look for similar implementations before creating new code
- **Check for duplication** - Search for similar functionality that could be reused
- **Understand architecture** - Follow the layered architecture (CLI → Services → API → Storage)

### Testing Requirements

- **Comprehensive coverage** - Aim for >80% test coverage, 100% for critical paths
- **Test all scenarios** - Success cases, error cases, edge cases
- **Integration testing** - Test how components interact
- **Regression prevention** - Verify existing tests pass after changes

### Refactoring Guidelines

- **Preserve behavior** - Maintain backward compatibility unless explicitly changing behavior
- **Extract common code** - Move reusable logic to utils or shared services
- **Incremental approach** - Make small, reviewable changes
- **Keep tests green** - Tests should pass after each refactor step

### Build and Validation

Run these commands before committing:

```bash
# Run tests
npm test

# Run linter
npm run lint

# Type check
npm run type-check

# Build
npm run build

# Test CLI locally
npm link
deepl --help
```

## Development Commands

```bash
# Install dependencies
npm install

# Run tests (watch mode)
npm test -- --watch

# Run tests (single run)
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix

# Type check
npm run type-check

# Build project
npm run build

# Run CLI locally
npm run dev

# Link for global testing
npm link
```

## Dependencies

### Production Dependencies

- `deepl-node` - Official DeepL API SDK
- `commander` - CLI framework
- `inquirer` - Interactive prompts
- `chalk` - Terminal colors
- `ora` - Spinners
- `better-sqlite3` - SQLite for caching
- `conf` - Configuration management
- `chokidar` - File watching
- `ink` - TUI framework (React for terminal)

### Development Dependencies

#### Phase 1-2 (Current)
- `typescript` - Type system
- `jest` - Testing framework (test runner + assertions)
- `ts-jest` - TypeScript support for Jest
- `@types/jest` - Jest type definitions
- `@types/node` - Node.js type definitions
- `eslint` - Linting
- `prettier` - Code formatting
- `ts-node` - TypeScript execution
- `nock` - HTTP mocking for API tests
- `memfs` - File system mocking

#### Phase 3 (TUI)
- `@testing-library/react` - Testing utilities for Ink components
- `@testing-library/jest-dom` - Additional Jest matchers for DOM

## Project Structure

See DESIGN.md for detailed architecture. Key directories:

```
deepl-cli/
├── src/              # Source code
├── tests/            # Test files
├── docs/             # Documentation
├── examples/         # Usage examples
├── DESIGN.md         # Design document
├── CLAUDE.md         # This file
└── package.json      # Project metadata
```

## Resources

- [DESIGN.md](./DESIGN.md) - Comprehensive design document
- [DeepL API Docs](https://www.deepl.com/docs-api) - API reference
- [CLI Guidelines](https://clig.dev/) - CLI best practices
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - TypeScript guide

---

## Quick Reference: TDD Cycle

```
1. 🔴 RED: Write a failing test
2. 🟢 GREEN: Write minimal code to pass
3. 🔵 REFACTOR: Improve the code
4. ✅ COMMIT: Save your progress
5. 🔁 REPEAT: Next feature/test
```

**Remember: No code without tests first!**

---

## Documentation Maintenance

### When to Update Documentation

**IMPORTANT: Documentation must be kept in sync with code changes.**

Update the following files when making related changes:

#### README.md
Update when:
- Adding new CLI commands or features
- Changing installation process
- Modifying usage examples
- Adding new configuration options
- Changing supported languages or formats

#### DESIGN.md
Update when:
- Changing system architecture
- Modifying component responsibilities
- Adding new services or layers
- Changing API interfaces
- Updating technical stack decisions

#### CLAUDE.md (this file)
Update when:
- Adding new development guidelines
- Modifying testing strategies
- Changing code style conventions
- Adding new dependencies
- Updating TDD workflow

#### Other Documentation
- **API.md** - When changing API interfaces (create when needed)
- **CONTRIBUTING.md** - When modifying contribution process (create when needed)
- **CHANGELOG.md** - For every release with user-facing changes (create when needed)

### Documentation Update Guidelines

- Include documentation updates in the same commit as the related code changes
- Use `docs(scope): description` commit type for documentation-only changes
- Keep examples up-to-date with actual behavior
- Remove outdated information immediately
- Update version numbers and dates when applicable

**IMPORTANT: Always add working examples when adding new features:**

Every new feature or command MUST include a working example script following these requirements:

#### Example Script Requirements

1. **Create the script**:
   - Add to `examples/` directory with sequential numbering (e.g., `examples/13-new-feature.sh`)
   - Make executable: `chmod +x examples/13-new-feature.sh`

2. **Follow the standard format**:
   ```bash
   #!/bin/bash
   # Example X: Feature Name
   # Brief description of what this example demonstrates

   set -e  # Exit on error

   echo "=== DeepL CLI Example X: Feature Name ==="
   echo

   # Check if API key is configured
   if ! deepl auth show &>/dev/null; then
     echo "❌ Error: API key not configured"
     echo "Run: deepl auth set-key YOUR_API_KEY"
     exit 1
   fi

   echo "✓ API key configured"
   echo

   # Example demonstrations...
   echo "1. First example scenario"
   # Commands here
   echo

   # More examples...

   # Cleanup (if files were created)
   echo "Cleaning up temporary files..."
   rm -rf /tmp/deepl-example-XX
   echo "✓ Cleanup complete"

   echo "=== All examples completed successfully! ==="
   ```

3. **Key format requirements**:
   - **Consistent header**: `=== DeepL CLI Example X: Feature Name ===`
   - **API key check**: Always validate API key is configured before running commands
   - **Use /tmp for files**: Create all temporary files in `/tmp/deepl-example-XX/`
   - **Complete cleanup**: Remove ALL temporary files/directories at the end
   - **Consistent footer**: `=== All examples completed successfully! ===`
   - **Numbered examples**: Use "1. Description", "2. Description" format
   - **Educational content**: Include tips, use cases, or feature explanations

4. **Documentation updates**:
   - Update `examples/README.md` with a link to the new example
   - Reference the example in the main `README.md` where the feature is documented
   - Examples should demonstrate real-world usage patterns, not just basic syntax
   - Include helpful comments explaining what each section does

**Example commit:**
```bash
feat(watch): add watch mode with auto-translation

Implement file watching with debouncing and auto-commit support.
Updates README.md with watch mode examples and configuration.
Updates DESIGN.md with WatchService architecture details.
Adds examples/13-watch-mode.sh demonstrating watch mode usage.
Updates examples/README.md with link to new example.
```

**Quality checklist for examples:**
- [ ] Script is executable (`chmod +x`)
- [ ] Follows standard format (header, API check, cleanup, footer)
- [ ] Uses /tmp for temporary files
- [ ] Cleans up all temporary files
- [ ] Includes multiple usage scenarios
- [ ] Has educational content (tips, use cases)
- [ ] Script runs without errors
- [ ] Referenced in README.md and examples/README.md

---

*This file helps Claude Code maintain consistent, high-quality development practices specific to the DeepL CLI project.*
