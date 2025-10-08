# DeepL CLI - Project TODO List

This file tracks pending tasks and future work for the DeepL CLI project.

## 📋 Current Status

- **Version**: 0.2.0 ✅ (Released October 8, 2025)
- **Phase**: 2 (Advanced Features) - ✅ 100% COMPLETE! 🎉
- **Tests**: 482 tests (482 passing, 0 skipped, 100% pass rate) ✅
- **Coverage**: 80.93% overall (improved from 74.15%)
  - Statements: 80.93%
  - Branches: 78.17%
  - Functions: 83.69%
  - Lines: 80.73%
- **Next**: Phase 3 (TUI & Collaboration)

---

## 🎯 Phase 1 (✅ COMPLETE)

All Phase 1 tasks completed and v0.1.0 released:

- [x] Manual testing with real API
- [x] Add integration tests for CLI commands (27 tests)
- [x] Add E2E tests for complete workflows (21 tests)
- [x] Add CHANGELOG.md and versioning guidelines
- [x] Create VERSION file and v0.1.0 tag
- [x] Update CLAUDE.md with versioning section
- [x] Update README with real usage examples
- [x] Add API documentation (docs/API.md)
- [x] Add usage examples (examples/ directory)

### ⏳ Deferred

- [ ] Setup CI/CD (GitLab CI for internal use)
  - Will be added when pushing to remote repository
  - Config will be tailored to project needs at that time

---

## 🚀 Phase 2: Advanced Features (✅ 100% COMPLETE!)

### ✅ Context-Aware Translation (COMPLETE)

- [x] Implement context detection (surrounding paragraphs)
- [x] Add context parameter to API calls
- [x] Add tests for context-aware translation (5 tests)
- [x] Document context usage
- [x] CLI integration with `--context` flag

### ✅ Batch Processing (COMPLETE)

- [x] Implement parallel file translation with p-limit
- [x] Add progress bars with ora
- [x] Add error recovery for batch operations
- [x] Add batch operation tests (16 unit tests)
- [x] CLI integration with directory support
- [x] Add `--recursive`, `--pattern`, `--concurrency` options
- [x] Document batch processing usage

### ✅ Watch Mode (COMPLETE)

- [x] Implement file watching with chokidar
- [x] Add debouncing for file changes (configurable, default 300ms)
- [x] Add auto-translation on file save
- [x] Add optional auto-commit feature
- [x] Add watch mode tests (19 unit tests for WatchService)
- [x] CLI integration with `deepl watch` command
- [x] Add glob pattern filtering support
- [x] Add multiple target languages support
- [x] Document watch mode usage with examples

### ✅ DeepL Write Integration (COMPLETE)

- [x] Add Write API client integration
- [x] Create WriteService for grammar/style enhancement
- [x] Create WriteCommand CLI (`deepl write`)
- [x] Add tone selection (enthusiastic, friendly, confident, diplomatic)
- [x] Add writing style selection (simple, business, academic, casual)
- [x] Add show alternatives feature (`--alternatives` flag)
- [x] Add tests for Write functionality (84 tests total)
  - [x] 28 WriteService unit tests
  - [x] 19 WriteCommand unit tests
  - [x] 37 DeepL client integration tests
- [x] Document Write API usage in README
- [x] Add examples for writing enhancement (examples/09-write-basic.sh)
- [x] Support for 8 languages (de, en-GB, en-US, es, fr, it, pt-BR, pt-PT)
- [x] Update CHANGELOG with Write API features

**Status**: Production-ready with full test coverage ✅

**Future Enhancements** (Phase 3+):

- [ ] Add interactive mode for suggestions (`--interactive`)
- [ ] Add file input/output support
- [ ] Add diff view (`--diff`)
- [ ] Add check mode (`--check`)
- [ ] Add auto-fix mode (`--fix`)

### ✅ Git Hooks Integration (COMPLETE)

- [x] Create GitHooksService for hook lifecycle management
- [x] Create pre-commit hook for translation validation
- [x] Create pre-push hook for translation checks
- [x] Document git hook setup in README
- [x] Add hook installation command (`deepl hooks install <type>`)
- [x] Add hook uninstallation command (`deepl hooks uninstall <type>`)
- [x] Add hook status command (`deepl hooks list`)
- [x] Add hook path command (`deepl hooks path <type>`)
- [x] Implement automatic backup of existing hooks
- [x] Implement safe installation without overwriting custom hooks
- [x] Add hook validation with DeepL marker
- [x] Add customizable shell scripts
- [x] Manual testing completed
- [x] Update CHANGELOG with Git Hooks features

**Status**: Production-ready, fully documented ✅

**Future Enhancements** (Phase 3+):

- [ ] Add unit tests for GitHooksService (currently manual tested)
- [ ] Add more hook types (post-merge, post-checkout, etc.)
- [ ] Add customizable validation logic via config
- [ ] Add `deepl install` command to consolidate all integrations

---

## 🎉 Ready for v0.2.0 Release

Phase 2 is complete! All major features are implemented, tested, and documented:

### Completed Features (Phase 2)

- ✅ Context-aware translation with `--context` flag
- ✅ Batch processing with parallel translation and progress bars
- ✅ Watch mode with real-time file monitoring and auto-translation
- ✅ DeepL Write integration for grammar/style enhancement
- ✅ Git hooks for translation workflow automation

### Release Checklist

v0.2.0 Released! ✅

- [x] All Phase 2 features complete
- [x] All tests passing (482/482, 100% pass rate)
- [x] Documentation updated (README, CHANGELOG, DESIGN, CONTEXT_SUMMARY)
- [x] Update VERSION file to 0.2.0
- [x] Update package.json version to 0.2.0
- [x] Create git tag v0.2.0
- [x] Update CHANGELOG with release date
- [x] Update docs/API.md to v0.2.0
- [x] Create TUI_PLAN.md for Phase 3
- [ ] Consider pushing to GitLab remote (deferred)

### Next Steps

**Phase 3 (TUI & Collaboration)** - Ready to start!

Detailed Phase 3 plan is integrated below. Historical planning document archived at `docs/archive/TUI_PLAN.md`.

---

## 🎨 Phase 3: TUI & Collaboration

**Status**: Planning complete, ready to implement!
**Timeline**: 7 weeks
**Target**: v0.3.0

### Phase 3.1: TUI Foundation (Week 1-2)

- [ ] Install Ink and TUI dependencies (~15 packages)
- [ ] Create TUI project structure (components, screens, hooks, store)
- [ ] Build App.tsx with routing logic
- [ ] Create MainLayout component
- [ ] Build HomeScreen with menu navigation
- [ ] Add basic keyboard shortcuts (up/down, enter, esc)
- [ ] Write tests for basic navigation
- [ ] Add color themes and styling

**Deliverable**: Working home screen with menu navigation

### Phase 3.2: Translation Interface (Week 3-4)

- [ ] Create TranslateScreen component
- [ ] Build SplitPane layout component
- [ ] Create TextEditor component (multi-line input)
- [ ] Add LanguageSelector dropdown
- [ ] Integrate TranslationService
- [ ] Implement real-time translation with debouncing
- [ ] Add translation options panel (formality, context, etc.)
- [ ] Show translation stats (chars, time, cached)
- [ ] Add copy/save functionality
- [ ] Write comprehensive tests for translation flow

**Deliverable**: Fully functional split-pane translation interface

### Phase 3.3: History & Glossary (Week 5)

- [ ] Create HistoryScreen component
- [ ] Build translation history browser
- [ ] Add search and filter functionality
- [ ] Create GlossaryScreen component
- [ ] Build glossary CRUD interface
- [ ] Add glossary import/export
- [ ] Integrate glossaries into translation
- [ ] Write tests for history and glossary screens

**Deliverable**: Working history and glossary management

### Phase 3.4: Settings & Polish (Week 6)

- [ ] Create SettingsScreen component
- [ ] Build settings editor with live preview
- [ ] Add theme switching
- [ ] Create HelpScreen with keyboard shortcuts
- [ ] Add loading animations and spinners
- [ ] Add error handling and error screens
- [ ] Implement status bar with real-time stats
- [ ] Add usage dashboard
- [ ] Polish animations and transitions
- [ ] Write E2E tests for complete workflows

**Deliverable**: Production-ready TUI

### Phase 3.5: Documentation & Release (Week 7)

- [ ] Update README with TUI documentation
- [ ] Add TUI examples and GIFs/videos
- [ ] Update CHANGELOG with TUI features
- [ ] Create TUI tutorial
- [ ] Update DESIGN.md with TUI architecture
- [ ] Tag v0.3.0 release
- [ ] Create release notes

**Deliverable**: v0.3.0 release with complete TUI

### Translation Memory (Phase 3.6+)

**Status**: Deferred to later in Phase 3 or Phase 4

- [ ] Design translation memory schema
- [ ] Implement TM storage (SQLite)
- [ ] Add TM search functionality
- [ ] Add TM import/export
- [ ] Add TM tests

### Team Features (Phase 4+)

**Status**: Future enhancement

- [ ] Implement shared glossary support
- [ ] Add team configuration sharing
- [ ] Add collaboration documentation

---

## 🏗️ Production-Grade Polish (Before Public Release)

### Critical (Do Before Push to Remote)

#### 1. CONTRIBUTING.md ⭐⭐⭐

- [ ] Create CONTRIBUTING.md
- [ ] Document development setup
- [ ] Document code style guidelines
- [ ] Document testing requirements
- [ ] Document PR process
- [ ] Document issue reporting guidelines

#### 2. GitHub Actions CI/CD ⭐⭐⭐

- [ ] Create `.github/workflows/ci.yml`
  - [ ] Run tests on PRs
  - [ ] Run lint checks
  - [ ] Run type checks
  - [ ] Run build
  - [ ] Upload coverage reports
- [ ] Create `.github/workflows/release.yml`
  - [ ] Automated version bumping
  - [ ] Automated changelog updates
  - [ ] Automated npm publishing
  - [ ] Automated GitHub releases
- [ ] Create `.github/dependabot.yml`
  - [ ] Automatic dependency updates
  - [ ] Security vulnerability alerts
- [ ] Add CI badges to README

#### 3. Security Policy ⭐⭐⭐

- [ ] Create `SECURITY.md`
  - [ ] Vulnerability reporting process
  - [ ] Supported versions table
  - [ ] Security update policy
- [ ] Create `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] Create `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] Create `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] Create `.github/ISSUE_TEMPLATE/config.yml`

#### 4. Code of Conduct ⭐⭐

- [ ] Create `CODE_OF_CONDUCT.md`
- [ ] Use Contributor Covenant standard
- [ ] Add contact method for violations

### Important

#### 5. package.json Metadata ⭐⭐

- [ ] Add `author` field (currently empty)
- [ ] Update `repository.url` with actual GitHub URL
- [ ] Add `bugs.url` field
- [ ] Add `homepage` field
- [ ] Verify `keywords` are comprehensive

#### 6. npm Publishing Preparation ⭐⭐

- [ ] Create `.npmignore` or use `files` field
  - [ ] Exclude tests/
  - [ ] Exclude .github/
  - [ ] Exclude development files
  - [ ] Include dist/, LICENSE, README, CHANGELOG
- [ ] Test `npm pack` to verify package contents
- [ ] Test installation from tarball
- [ ] Add npm badges to README

#### 7. Documentation ⭐⭐

- [x] Create `docs/` directory ✅
- [x] Create `docs/API.md` (API reference) ✅
  - [x] Document all CLI commands ✅
  - [x] Document all options/flags ✅
  - [x] Document configuration options ✅
  - [x] Document exit codes and environment variables ✅
- [x] Create `examples/` directory ✅
  - [x] Basic translation examples ✅
  - [x] File translation examples ✅
  - [x] Multi-language examples ✅
  - [x] Glossary usage examples ✅
  - [x] Cache management examples ✅
  - [x] CI/CD integration examples ✅
  - [x] Write API examples ✅
  - [x] Batch processing examples ✅
  - [x] Context-aware translation examples ✅
- [ ] Create `docs/QUICKSTART.md`
- [ ] Create `docs/TROUBLESHOOTING.md`
- [x] Create DESIGN.md (comprehensive architecture doc) ✅
- [x] Create TUI_PLAN.md (Phase 3 implementation plan) ✅

#### 8. Additional Git Configuration Files ⭐

- [ ] Create `.editorconfig`
  - [ ] Consistent indentation (2 spaces)
  - [ ] Charset UTF-8
  - [ ] End of line LF
  - [ ] Trim trailing whitespace
- [ ] Create `.nvmrc` or `.node-version`
  - [ ] Lock to Node 18.0.0 minimum
- [ ] Create `commitlint.config.js`
  - [ ] Enforce Conventional Commits
  - [ ] Add to git hooks

### Nice to Have

#### 9. Advanced CI Features

- [ ] Add Codecov or Coveralls integration
- [ ] Add coverage badge to README
- [ ] Add automated dependency update PRs
- [ ] Add release notes automation
- [ ] Add semantic-release for fully automated releases
- [ ] Add Snyk for security scanning
- [ ] Add CodeQL for code scanning

#### 10. Community Files

- [ ] Create `SUPPORT.md`
  - [ ] Where to ask questions
  - [ ] How to get help
  - [ ] Link to discussions/issues
- [ ] Create `CODEOWNERS` file
  - [ ] Auto-assign reviewers for PRs
- [ ] Enable GitHub Discussions
- [ ] Create discussion categories
- [ ] Pin welcome discussion

#### 11. Quality Badges for README

- [ ] npm version badge
- [ ] npm downloads badge
- [ ] Build status badge
- [ ] Coverage badge
- [ ] Dependencies status badge (David-DM or similar)
- [ ] Code quality badge (CodeClimate or similar)
- [ ] Security badge (Snyk or similar)
- [ ] License badge (already have ✓)
- [ ] TypeScript badge (already have ✓)
- [ ] Node version badge (already have ✓)

#### 12. Release Automation

- [ ] Set up semantic-release
- [ ] Configure release branches (main, next, beta)
- [ ] Configure automated changelog generation
- [ ] Configure automated npm publishing
- [ ] Configure automated GitHub releases
- [ ] Add release notification (Discord/Slack webhook)

---

## 🐛 Known Issues

### ESM Module Tests (8 skipped)

- [ ] Fix ESM module compatibility for 8 tests
  - Issue: Some tests skip due to ESM module import issues
  - Impact: Minimal - core functionality fully tested
  - Status: Non-blocking, functionality works in production

### Test Coverage Gaps

**Recent Improvements** (2025-10-08):

- Overall coverage improved from 74.15% → 80.93%
- Added 35 new unit tests
- Added HooksCommand tests: 0% → 100% (19 tests)
- Added WatchCommand tests: 0% → 42.85% (16 tests)

**Remaining Low Coverage Areas**:

1. **GitHooksService** (5.08% coverage)
   - Complex fs operations make mocking difficult
   - Manually tested and working in production
   - Future: Add integration tests with temp git repos

2. **WatchCommand** (42.85% coverage)
   - Infinite Promise pattern hard to test
   - Signal handlers (SIGINT, SIGTERM) difficult to mock
   - Auto-commit git logic partially covered
   - Future: Refactor for better testability

3. **TranslateCommand** (70.47% coverage)
   - Directory translation edge cases (failed/skipped files)
   - Ora spinner interactions complex to mock
   - Core functionality well-tested

4. **WatchService** (79.74% coverage)
   - Some edge cases around error handling
   - Statistics tracking partially covered

**Target for v1.0.0**: Achieve 85%+ overall coverage

---

## 🔮 Future Enhancements (Post-v1.0)

### Performance

- [ ] Add response streaming for large texts
- [ ] Implement connection pooling
- [ ] Add request batching
- [ ] Optimize cache queries with indexes

### Features

- [ ] Add support for more file formats (HTML, JSON, YAML, XML)
- [ ] Add DeepL document translation support
- [ ] Add translation quality scoring
- [ ] Add translation history and undo
- [ ] Add custom terminology support beyond glossaries
- [ ] Add translation suggestions (alternative translations)
- [ ] Add language detection command
- [ ] Add usage statistics and reporting

### Integration

- [ ] Add VS Code extension
- [ ] Add JetBrains plugin
- [ ] Add Slack bot
- [ ] Add Discord bot
- [ ] Add web API wrapper

### Developer Experience

- [ ] Add shell completion (bash, zsh, fish)
- [ ] Add interactive config wizard
- [ ] Add update checker
- [ ] Add plugin system for extensions

---

## 📝 Notes

### Version Planning

- **v0.1.0** - Phase 1 MVP (CURRENT) ✅
- **v0.2.0** - Phase 2 features (watch mode, DeepL Write, git hooks, batch)
- **v0.3.0** - Phase 3 features (TUI, translation memory, team)
- **v1.0.0** - Stable API, production-ready, all polish items complete

### Testing Strategy

- **Unit tests**: 344 tests, 90.1% coverage ✅
- **Integration tests**: 64 tests (all passing) ✅
- **E2E tests**: 21 tests (all passing) ✅
- **Manual tests**: Documented in MANUAL_TEST_REPORT.md ✅
- **Total**: 455 tests (447 passing, 8 skipped) - 98.2% pass rate ✅

**Test Breakdown by Feature**:

- Translation: 297 tests ✅
- Write API: 84 tests (28 service + 19 command + 37 client) ✅
- Watch Mode: 19 tests ✅
- Batch Processing: 16 tests ✅
- Context Translation: 5 tests ✅
- Other features: Included in totals ✅

---

## 🔧 Technical Debt & Coverage Improvements

### Test Coverage Status

**Current Coverage** (as of Phase 2 completion):
- **Overall**: 80.93% statements, 78.17% branches, 83.69% functions
- **Services Layer**: 96%+ (Excellent) ✅
- **Storage Layer**: 92%+ (Excellent) ✅
- **CLI Commands**: 68% (Needs improvement) 🟡

**Historical Coverage Improvement**:
- Phase 1 baseline: 74.15%
- After translate.ts tests: 89.91%
- After Phase 2 features: 80.93% (coverage diluted by new untested features)

### Priority Coverage Tasks

#### 1. translate.ts Command - Medium Priority 🟡
**Current**: 71.02% (improved from 44.76%)
**Target**: 85%+

**Remaining gaps**:
- [ ] Add tests for ora spinner integration (~7 tests skipped due to ESM mocking)
- [ ] Add tests for stdin edge cases
- [ ] Add tests for source language/formality in `translateToMultiple`

**Note**: Core functionality is well-tested via integration/E2E tests. Unit test gaps are primarily ESM mocking challenges, not lack of validation.

#### 2. write.ts Command - Low Priority ✅
**Current**: Recently enhanced with Phase 3 features
**Coverage**: 46 comprehensive unit tests

**Recent improvements**:
- ✅ File input/output support (7 tests)
- ✅ Diff view (6 tests)
- ✅ Check mode (6 tests)
- ✅ Auto-fix mode (4 tests)
- ✅ Interactive mode (4 tests)

**Future enhancements** (not coverage, but features):
- [ ] Batch file improvement (process multiple files)
- [ ] Integration with watch mode
- [ ] CI/CD integration examples

#### 3. auth.ts Command - Low Priority
**Current**: 77.27%
**Target**: 90%+

**Missing coverage**:
- [ ] API validation timeout handling
- [ ] Config write permission errors
- [ ] Environment variable fallback edge cases

**Effort**: ~30 minutes, +2% overall coverage

#### 4. DeepL Client Edge Cases - Low Priority
**Current**: 88.29%
**Target**: 95%+

**Missing coverage**:
- [ ] Malformed JSON response handling
- [ ] Specific timeout scenarios
- [ ] Unexpected error code handling

**Effort**: ~1 hour, +1-2% overall coverage

### Technical Debt Items

#### ESM Mocking Challenges ⚠️

**Issue**: `ora` spinner library is ESM-only, creating Jest mocking challenges.

**Impact**: ~7 tests skipped in translate.ts for directory translation with progress indicators.

**Options**:
1. **Accept current state** (Recommended) - Functionality is validated via integration/E2E tests
2. Refactor to extract spinner logic into testable wrapper
3. Upgrade test infrastructure for better ESM support
4. Use dynamic imports for ora

**Decision**: Accept current state. Cost/benefit doesn't justify effort given excellent integration test coverage.

#### Watch Mode chokidar Types

**Status**: ✅ Fixed in Phase 3 work
- Replaced deprecated `chokidar.WatchOptions` with inline type definition
- All tests passing

### Coverage Goals

#### Short Term (Optional)
- **Target**: 85%+ overall coverage
- **Focus**: Add missing auth.ts and deepl-client.ts edge case tests
- **Effort**: 2-3 hours
- **Priority**: Low (current coverage is acceptable)

#### Long Term (Before v1.0.0)
- **Target**: 90%+ statement coverage, 85%+ branch coverage
- **Focus**: Comprehensive error path testing
- **Note**: 100% coverage unrealistic due to defensive/unreachable paths

### Archived Documentation

Historical documentation has been moved to `docs/archive/`:
- `COVERAGE_ANALYSIS_SUMMARY.md` (Oct 7, 2025) - Historical coverage analysis
- `COVERAGE_IMPROVEMENT_PLAN.md` (Oct 7, 2025) - Original coverage improvement plan
- `COVERAGE_IMPROVEMENT_RESULTS.md` (Oct 7, 2025) - Phase 1 coverage improvement results
- `BATCH_PROCESSING_MANUAL_TEST.md` - Batch processing manual test report
- `MANUAL_TEST_REPORT.md` - Phase 1 manual test report
- `TUI_PLAN.md` - Detailed Phase 3 TUI planning document

These provide historical context but are superseded by current TODO.md tracking.

---

### Before v1.0.0 Release

Must complete ALL items in "Production-Grade Polish (Critical)" section before tagging v1.0.0 and publishing to npm.

---

**Last Updated**: 2025-10-08
**Maintained By**: Development team
**Review Frequency**: Every release or major milestone
