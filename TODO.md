# DeepL CLI - Project TODO List

This file tracks pending tasks and future work for the DeepL CLI project.

## 📋 Current Status

- **Version**: 0.5.0 (Current)
- **Phase**: 2 (Advanced Features) - ✅ COMPLETE
- **Tests**: 1020+ tests (100% pass rate) ✅
- **Coverage**: ~91% overall (with excellent integration/e2e coverage)
- **Next**: Phase 3 (TUI & Collaboration)

---

## 🚀 Deferred Enhancements

These features were identified but deferred for future implementation:

### Debugging & Visibility Features

- [ ] **--dry-run flag** - Preview commands without making API calls
  - Shows validation results
  - Displays request that would be sent (curl format)
  - Checks cache status
  - Works across all commands (translate, write, glossary)
  - Saves API quota during testing

- [ ] **--verbose flag** - Detailed request/response logging
  - Shows HTTP request details (method, URL, headers, body)
  - Shows HTTP response details (status, headers, body preview)
  - Formats output with color coding
  - Masks sensitive data (API keys)
  - Useful for debugging and learning the API

**Estimated effort**: 3-4 hours implementation + 2 hours testing
**Priority**: Medium (nice-to-have for debugging)

### Exit Codes Enhancement

- [ ] **Granular exit codes** - More specific error codes for better error handling in scripts/CI
  - **0** - Success
  - **1** - General error
  - **2** - Authentication error (invalid API key)
  - **3** - API rate limit exceeded
  - **4** - Quota exceeded
  - **5** - Network error
  - **6** - Invalid input (file not found, unsupported format)
  - **7** - Configuration error

**Estimated effort**: 2-3 hours implementation + 1 hour testing
**Priority**: Medium (improves CI/CD integration)

---

## 🎨 Phase 3: TUI & Collaboration

**Status**: Planning complete, ready to implement!
**Timeline**: 7 weeks
**Target**: v0.6.0

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
- [ ] Tag v0.6.0 release
- [ ] Create release notes

**Deliverable**: v0.6.0 release with complete TUI

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

### 🚀 GitHub Publication Preparation

**Status**: Not yet published to GitHub
**Target**: Before v1.0.0 or when ready for public release

#### Pre-Publication Cleanup

- [ ] **Scan for secrets in commit history** 🔴 CRITICAL
- [ ] **Remove internal development artifacts**
- [ ] **Clean up or rename CLAUDE.md** (consider renaming to `DEVELOPMENT.md`)
- [ ] **Update repository URLs everywhere** (package.json, README, etc.)

### Critical (Do Before Push to Remote)

#### 1. CONTRIBUTING.md

- [ ] Create CONTRIBUTING.md
- [ ] Document development setup
- [ ] Document code style guidelines
- [ ] Document testing requirements
- [ ] Document PR process
- [ ] Document issue reporting guidelines

#### 2. GitHub Actions CI/CD

- [ ] Create `.github/workflows/ci.yml`
- [ ] Create `.github/workflows/release.yml`
- [ ] Create `.github/dependabot.yml`
- [ ] Add CI badges to README

#### 3. Security Policy

- [ ] Create `SECURITY.md`
- [ ] Create `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] Create `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] Create `.github/PULL_REQUEST_TEMPLATE.md`

#### 4. Code of Conduct

- [ ] Create `CODE_OF_CONDUCT.md`
- [ ] Use Contributor Covenant standard
- [ ] Add contact method for violations

### Important

#### 5. package.json Metadata

- [ ] Add `author` field
- [ ] Update `repository.url` with actual GitHub URL
- [ ] Add `bugs.url` field
- [ ] Add `homepage` field
- [ ] Verify `keywords` are comprehensive

#### 6. npm Publishing Preparation

- [ ] Create `.npmignore` or use `files` field
- [ ] Test `npm pack` to verify package contents
- [ ] Test installation from tarball
- [ ] Add npm badges to README

#### 7. Documentation

- [ ] Create `docs/QUICKSTART.md`
- [ ] Create `docs/TROUBLESHOOTING.md`

#### 8. Additional Git Configuration Files

- [ ] Create `.editorconfig`
- [ ] Create `.nvmrc` or `.node-version`
- [ ] Create `commitlint.config.js`

### Nice to Have

#### 9. Advanced CI Features

- [ ] Add Codecov or Coveralls integration
- [ ] Add automated dependency update PRs
- [ ] Add release notes automation
- [ ] Add semantic-release
- [ ] Add Snyk for security scanning
- [ ] Add CodeQL for code scanning

#### 10. Community Files

- [ ] Create `SUPPORT.md`
- [ ] Create `CODEOWNERS` file
- [ ] Enable GitHub Discussions

#### 11. Quality Badges for README

- [ ] npm version badge
- [ ] npm downloads badge
- [ ] Build status badge
- [ ] Coverage badge
- [ ] Dependencies status badge
- [ ] Code quality badge
- [ ] Security badge

#### 12. Release Automation

- [ ] Set up semantic-release
- [ ] Configure release branches
- [ ] Configure automated changelog generation
- [ ] Configure automated npm publishing

---

## 🔮 Future Enhancements (Post-v1.0)

### Performance

- [ ] Add response streaming for large texts
- [ ] Implement connection pooling
- [ ] Add request batching
- [ ] Optimize cache queries with indexes

### Features

- [ ] Add support for more file formats (JSON, YAML, XML)
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

- **v0.1.0** - Phase 1 MVP ✅
- **v0.2.0** - Phase 2 features ✅
- **v0.3.0** - Write Enhancements + Document Translation ✅
- **v0.4.0** - Feature Parity (batch optimization, glossary management) ✅
- **v0.5.0** - v3 Glossary API (multilingual glossaries) ✅ (CURRENT)
- **v0.6.0** - Phase 3 features (TUI, translation memory, team) (NEXT)
- **v1.0.0** - Stable API, production-ready, all polish items complete

---

**Last Updated**: 2025-10-13
**Maintained By**: Development team
**Review Frequency**: Every release or major milestone
