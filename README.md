# DeepL CLI

> A next-generation command-line interface for DeepL translation and writing enhancement

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

**DeepL CLI** is a comprehensive, developer-friendly command-line tool that integrates DeepL's powerful translation API and cutting-edge Write API for grammar and style enhancement. Built with TypeScript and designed for modern development workflows.

## 🌟 Key Features

- **🌍 Translation** - High-quality translation using DeepL's next-gen LLM
- **👀 Watch Mode** - Real-time file watching with auto-translation
- **✍️ Writing Enhancement** - Grammar, style, and tone suggestions (DeepL Write API ✅ NEW!)
- **💾 Smart Caching** - Local SQLite cache with LRU eviction
- **🎯 Context-Aware** - Preserves code blocks, variables, and formatting
- **📦 Batch Processing** - Translate multiple files with parallel processing
- **🎨 Modern TUI** - Interactive terminal UI (coming in Phase 3)
- **👥 Team Collaboration** - Shared glossaries and translation memory (coming in Phase 3)
- **🔧 Developer Workflows** - Git hooks, CI/CD integration
- **🔒 Privacy-First** - Local caching, no telemetry, secure key storage

## 📋 Table of Contents

- [Status](#-project-status)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Usage](#-usage)
  - [Translation](#translation)
  - [Writing Enhancement](#writing-enhancement)
  - [Watch Mode](#watch-mode)
  - [Configuration](#configuration)
  - [Glossaries](#glossaries)
  - [Cache Management](#cache-management)
- [Development](#-development)
- [Architecture](#-architecture)
- [Contributing](#-contributing)
- [License](#-license)

## 🚧 Project Status

**Current Version: 0.1.0** (Phase 1 MVP - Complete)

This project follows a phased development approach with strict Test-Driven Development (TDD):

### Phase 1: MVP (✅ Complete - v0.1.0)
- [x] Basic translation command (`deepl translate`)
- [x] Configuration management (`deepl config`)
- [x] API key authentication (`deepl auth`)
- [x] Local SQLite caching with LRU eviction
- [x] Code block and variable preservation
- [x] Multi-target language support
- [x] Stdin support for piping
- [x] Configurable API endpoints (free/pro/custom)
- [x] File translation with format preservation (.txt, .md)
- [x] Glossary management (create, list, show, delete)
- [x] Cache management CLI commands

**Test Coverage**: 345 tests (340 passing, 98.6% pass rate)
- Unit tests: 297 (88.5% coverage)
- Integration tests: 27
- E2E tests: 21

### Phase 2: Advanced Features (✅ COMPLETE!)
- [x] Context-aware translation
- [x] Batch processing with parallel translation
- [x] Watch mode with file watching
- [x] **DeepL Write integration**
- [x] **Git hooks integration** ✨ NEW!

### Phase 3: TUI & Collaboration (Future)
- [ ] Interactive TUI application
- [ ] Translation memory
- [ ] Team collaboration features

See [DESIGN.md](./DESIGN.md) for detailed architecture and feature specifications.

## 📦 Installation

### From npm (Coming Soon)

```bash
npm install -g deepl-cli
```

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/deepl-cli.git
cd deepl-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link for global usage
npm link

# Verify installation
deepl --version
# Output: 0.1.0
```

## 🚀 Quick Start

### 1. Get Your DeepL API Key

Sign up for a [DeepL API account](https://www.deepl.com/pro-api) and get your authentication key.

### 2. Set Your API Key

```bash
deepl auth set-key YOUR_API_KEY
```

Or use an environment variable:
```bash
export DEEPL_API_KEY=YOUR_API_KEY
```

### 3. Translate Your First Text

```bash
deepl translate "Hello, world!" --to es
# Output:
# Translation (ES):
# ¡Hola, mundo!
```

## 📖 Usage

All examples below are **working and tested** in v0.1.0. Features marked with 🚧 are planned for future releases.

### Translation

#### Basic Text Translation

```bash
# Simple translation
deepl translate "Hello world" --to ja
# Translation (JA):
# こんにちは世界

# Specify source language explicitly
deepl translate "Bonjour" --from fr --to en
# Translation (EN):
# Hello

# Multiple target languages
deepl translate "Good morning" --to es,fr,de
# Translation (ES):
# Buenos días
#
# Translation (FR):
# Bonjour
#
# Translation (DE):
# Guten Morgen

# Read from stdin
echo "Hello world" | deepl translate --to es
cat input.txt | deepl translate --to ja
```

#### File Translation

Supported formats: `.txt`, `.md`

```bash
# Single file translation
deepl translate README.md --to es --output README.es.md
# Translated README.md to 1 language(s):
#   [ES] README.es.md

# Multiple target languages (creates README.es.md, README.fr.md, etc.)
deepl translate docs.md --to es,fr,de --output ./translated/
# Translated docs.md to 3 language(s):
#   [ES] ./translated/docs.es.md
#   [FR] ./translated/docs.fr.md
#   [DE] ./translated/docs.de.md

# With code preservation (preserves code blocks in markdown)
deepl translate tutorial.md --to ja --output tutorial.ja.md --preserve-code
```

**Note:** Additional document formats (PDF, DOCX) planned for Phase 3.

#### Batch Translation (Directory Processing)

Translate multiple files in parallel with progress indicators:

```bash
# Translate all files in a directory
deepl translate ./docs --to es --output ./docs-es
# Scanning files...
# Translating files: 10/10
# ✔ Translation complete!
#
# Translation Statistics:
#   Total files: 10
#   ✓ Successful: 10

# Translate specific file types with glob pattern
deepl translate ./docs --to fr --output ./docs-fr --pattern "*.md"
# Only translates markdown files

# Non-recursive (current directory only)
deepl translate ./docs --to de --output ./docs-de --recursive false

# Custom concurrency (default: 5)
deepl translate ./large-docs --to ja --output ./large-docs-ja --concurrency 10
# Faster processing with more parallel translations
```

#### Advanced Translation Options

```bash
# Preserve code blocks and variables
deepl translate tutorial.md --preserve-code --to ja --output tutorial.ja.md

# Set formality level (default, more, less, prefer_more, prefer_less)
deepl translate "How are you?" --formality more --to de --output formal.txt
# More formal: Wie geht es Ihnen?

deepl translate "How are you?" --formality less --to de --output casual.txt
# Less formal: Wie geht's?

# Add context for better translation quality (helps with ambiguous terms)
deepl translate "bank" --context "This document is about financial institutions" --to es
# Translation considers financial context → "banco" (financial institution)

deepl translate "bank" --context "This document is about rivers and geography" --to es
# Translation considers geographical context → "orilla" (riverbank)

# Combine context with other options
deepl translate "How are you?" --context "Formal business email" --formality more --to de

# Custom API endpoint (for DeepL Pro accounts or testing)
deepl translate "Hello" --to es --api-url https://api.deepl.com/v2
```

#### Features Coming in Phase 2 🚧

```bash
# Automatic context detection for files
deepl translate api-docs.md --auto-context --to de

# Interactive mode
deepl translate --interactive --to es

# Confidence scores
deepl translate "Technical term" --show-confidence --to es
```

### Writing Enhancement

Improve your writing with AI-powered grammar, style, and tone suggestions using the **DeepL Write API** ✨ **NEW!**

```bash
# Basic text improvement
deepl write "This is a sentence." --lang en-US

# Apply business writing style
deepl write "We want to tell you about our new product." --lang en-US --style business

# Apply academic writing style
deepl write "This shows that the method works." --lang en-US --style academic

# Apply casual tone
deepl write "That is interesting." --lang en-US --style casual

# Use confident tone
deepl write "I think this will work." --lang en-US --tone confident

# Use diplomatic tone
deepl write "Try something else." --lang en-US --tone diplomatic

# Show all alternative improvements
deepl write "This is good." --lang en-US --tone enthusiastic --alternatives
```

**Supported Languages:**
- German (`de`)
- English - British (`en-GB`)
- English - American (`en-US`)
- Spanish (`es`)
- French (`fr`)
- Italian (`it`)
- Portuguese - Brazilian (`pt-BR`)
- Portuguese - European (`pt-PT`)

**Writing Styles:**
- `simple` - Easy-to-read, accessible language
- `business` - Professional, formal business tone
- `academic` - Scholarly, research-oriented style
- `casual` - Relaxed, conversational tone
- `prefer_*` prefix - Apply style only if language supports it

**Tones:**
- `enthusiastic` - Energetic and positive
- `friendly` - Warm and approachable
- `confident` - Assertive and certain
- `diplomatic` - Tactful and considerate
- `prefer_*` prefix - Apply tone only if language supports it

**Note:** You cannot combine `--style` and `--tone` in a single request. Choose one or the other.

### Watch Mode

Monitor files or directories for changes and automatically translate them in real-time. Perfect for keeping documentation and localization files in sync.

```bash
# Watch a single file
deepl watch README.md --targets es,fr,de

# Watch a directory (all supported files)
deepl watch docs/ --targets ja --output docs-i18n/

# Watch with pattern filtering
deepl watch src/locales/ --pattern "*.json" --targets es,fr,de

# Watch markdown files only
deepl watch docs/ --pattern "*.md" --targets ja

# Auto-commit translations to git
deepl watch docs/ --targets es --auto-commit

# Custom debounce delay (default: 300ms)
deepl watch src/ --targets es --debounce 1000

# With formality and code preservation
deepl watch docs/ --targets de --formality more --preserve-code
```

**Features:**
- 🔄 Real-time monitoring with debouncing
- 📁 Watch files or entire directories
- 🎯 Glob pattern filtering (e.g., `*.md`, `*.json`)
- 🔀 Multiple target languages
- 💾 Auto-commit to git (optional)
- ⚡ Smart debouncing to avoid redundant translations

**Example output:**
```
👀 Watching for changes...
Path: docs/
Targets: es, fr, ja
Output: docs/translations
Pattern: *.md

📝 Change detected: docs/README.md
✓ Translated docs/README.md to 3 languages
  → [es] docs/translations/README.es.md
  → [fr] docs/translations/README.fr.md
  → [ja] docs/translations/README.ja.md

Press Ctrl+C to stop
```

### Git Hooks

Automate translation validation in your git workflow with pre-commit and pre-push hooks ✨ **NEW!**

```bash
# Install pre-commit hook (validates translations before commit)
deepl hooks install pre-commit

# Install pre-push hook (validates all translations before push)
deepl hooks install pre-push

# List hook installation status
deepl hooks list

# Show path to hook file
deepl hooks path pre-commit

# Uninstall a hook
deepl hooks uninstall pre-commit
```

**What the hooks do:**

- **pre-commit**: Checks if staged files include translatable content (`.md`, `.txt` files) and validates translations are up-to-date
- **pre-push**: Validates all translations in the repository before pushing to remote

**Features:**
- 🔒 Safe installation with automatic backup of existing hooks
- 🎯 Only validates changed files (pre-commit)
- ⚡ Lightweight and fast
- 🔧 Customizable hook scripts
- 🗑️ Clean uninstallation with backup restoration

**Hook Status Example:**
```
$ deepl hooks list

Git Hooks Status:

  ✓ pre-commit      installed
  ✗ pre-push        not installed
```

**Note:** The hooks are generated with placeholder validation logic. You can customize them based on your project's translation workflow by editing the hook files directly at `.git/hooks/pre-commit` or `.git/hooks/pre-push`.

### Configuration

#### Authentication

```bash
# Set API key
deepl auth set-key YOUR_API_KEY
# ✓ API key configured successfully
# Account type: DeepL API Free

# Show current API key status
deepl auth show
# API Key: abc12***********:fx (masked)
# Status: Valid

# Clear API key
deepl auth clear
# ✓ API key cleared
```

Or use an environment variable:
```bash
export DEEPL_API_KEY=YOUR_API_KEY
```

#### Configure Defaults

Configuration is stored in `~/.deepl-cli/config.json`

```bash
# View all configuration
deepl config list
# {
#   "auth": { "apiKey": "..." },
#   "api": { "baseUrl": "https://api-free.deepl.com/v2", ... },
#   "cache": { "enabled": true, "maxSize": 1073741824, "ttl": 2592000 },
#   ...
# }

# Get specific value
deepl config get cache.enabled
# true

# Set a value
deepl config set defaults.targetLangs es,fr,de
# ✓ Configuration updated: defaults.targetLangs = ["es","fr","de"]

# Set cache size (in bytes)
deepl config set cache.maxSize 2147483648
# ✓ Configuration updated: cache.maxSize = 2147483648

# Disable caching
deepl config set cache.enabled false

# Reset to defaults
deepl config reset
# ✓ Configuration reset to defaults
```

#### Project-Level Configuration 🚧

**Coming in Phase 2**

Create a `.deepl.toml` file in your project root:

```toml
[project]
name = "My Project"

[defaults]
source_lang = "en"
target_langs = ["es", "fr", "de", "ja"]
glossary = "tech-terms"

[watch]
pattern = "src/locales/en.json"
auto_commit = true
```

### Glossaries

DeepL glossaries ensure consistent terminology across translations.

```bash
# Create a glossary from TSV file
# File format: source_term<TAB>target_term per line
echo -e "API\tAPI\nREST\tREST\nauthentication\tAuthentifizierung" > glossary.tsv
deepl glossary create tech-terms en de glossary.tsv
# ✓ Glossary created: tech-terms (ID: abc123...)
# Language pair: EN → DE
# Entries: 3

# List all glossaries
deepl glossary list
# Glossaries:
#
# Name: tech-terms
# ID: abc123...
# Languages: EN → DE
# Entries: 3
# Created: 2024-10-07

# Show glossary details
deepl glossary show tech-terms
# Glossary: tech-terms
# ID: abc123...
# Language Pair: EN → DE
# Entry Count: 3
# Created: 2024-10-07T12:34:56Z

# Show glossary entries
deepl glossary entries tech-terms
# Entries for glossary 'tech-terms':
#
# API → API
# REST → REST
# authentication → Authentifizierung

# Delete glossary
deepl glossary delete tech-terms
# ✓ Glossary deleted: tech-terms
```

**Glossary file format (TSV):**
```tsv
source_term	target_term
API	API
REST	REST
authentication	Authentifizierung
```

**Note:** Using glossaries in translation (`--glossary` flag) is supported by the API client but CLI integration is planned for Phase 2.

### Cache Management

The CLI uses a local SQLite database to cache translations and reduce API calls.

```bash
# View cache statistics
deepl cache stats
# Cache Status: enabled
# Entries: 42
# Size: 1.23 MB / 1024.00 MB (0.1% used)

# Clear all cached translations
deepl cache clear
# ✓ Cache cleared (removed 42 entries)

# Enable caching
deepl cache enable
# ✓ Cache enabled

# Disable caching
deepl cache disable
# ✓ Cache disabled
```

Cache location: `~/.deepl-cli/cache.db`

### Batch Operations 🚧

**Note:** Batch processing coming in Phase 2.

```bash
# Estimate translation costs
deepl batch estimate docs/ --targets es,fr,de,ja

# Batch translate with progress
deepl batch translate docs/ --targets es,fr --parallel 5

# View usage statistics
deepl usage --month current --breakdown by-language
```

## 💻 Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- DeepL API key

### Setup

```bash
# Clone repository
git clone https://github.com/yourusername/deepl-cli.git
cd deepl-cli

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Type check
npm run type-check

# Build
npm run build
```

### Development Workflow

This project follows **Test-Driven Development (TDD)**:

1. 🔴 **RED** - Write a failing test
2. 🟢 **GREEN** - Write minimal code to pass
3. 🔵 **REFACTOR** - Improve the code
4. ✅ **COMMIT** - Save your progress
5. 🔁 **REPEAT**

See [CLAUDE.md](./CLAUDE.md) for comprehensive development guidelines.

### Project Structure

```
deepl-cli/
├── src/
│   ├── cli/              # CLI interface and commands
│   ├── services/         # Business logic
│   ├── api/              # DeepL API client
│   ├── storage/          # Data persistence (cache, config)
│   ├── utils/            # Utility functions
│   ├── types/            # Type definitions
│   └── tui/              # Terminal UI components (Phase 3)
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── docs/                 # Documentation
├── examples/             # Usage examples
├── DESIGN.md             # Architecture & design document
├── CLAUDE.md             # Development guidelines
└── README.md             # This file
```

### Running Locally

```bash
# Run CLI without building
npm run dev -- translate "Hello" --to es

# Or link for global usage
npm link
deepl translate "Hello" --to es
```

## 🏗️ Architecture

DeepL CLI follows a layered architecture:

```
CLI Interface (Commands, Parsing, Help)
           ↓
Core Application (Command Handlers, Interactive Shell)
           ↓
Service Layer (Translation, Write, Cache, Watch, Glossary)
           ↓
API Client (DeepL Translate, Write, Glossary APIs)
           ↓
Storage (SQLite Cache, Config, Translation Memory)
```

### Key Components

- **Translation Service** - Core translation logic with caching and preservation
- **Write Service** - Grammar and style enhancement (Phase 2)
- **Cache Service** - SQLite-based cache with LRU eviction
- **Preservation Service** - Preserves code blocks, variables, formatting
- **Watch Service** - File watching with debouncing (Phase 2)
- **Glossary Service** - Glossary management and application

See [DESIGN.md](./DESIGN.md) for detailed architecture documentation.

## 🧪 Testing

### Test Coverage

Current coverage: **88.85%** (323 tests, 321 passing)

```bash
# Run all tests
npm test

# Run specific test type
npm test -- tests/unit
npm test -- tests/integration
npm test -- tests/e2e

# Run specific test file
npm test -- translation.test.ts

# Run with coverage report
npm run test:coverage

# Watch mode for TDD
npm test -- --watch
```

### Test Statistics (v0.1.0)

- **Unit Tests**: 275 tests (88.85% coverage)
  - Services, API clients, utilities
  - Isolated component testing
- **Integration Tests**: 27 tests (25 passing)
  - Multi-component interactions
  - CLI command execution
- **E2E Tests**: 21 tests (all passing)
  - Complete user workflows
  - Real CLI command scenarios

### Testing Approach

- **TDD**: All features developed using Test-Driven Development
- **Mocking**: DeepL API calls mocked for deterministic tests
- **Real API Testing**: Manual testing documented in `MANUAL_TEST_REPORT.md`

## 📚 Documentation

- **[DESIGN.md](./DESIGN.md)** - Comprehensive design and architecture
- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines and TDD workflow
- **[DeepL API Docs](https://www.deepl.com/docs-api)** - Official API documentation
- **[CLI Guidelines](https://clig.dev/)** - Command-line best practices

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Follow TDD** - Write tests before implementation
2. **Follow the style guide** - See [CLAUDE.md](./CLAUDE.md)
3. **Write good commit messages** - Use conventional commits format
4. **Update documentation** - Keep docs in sync with code changes
5. **Test thoroughly** - Ensure all tests pass

### Contribution Process

```bash
# Fork and clone
git clone https://github.com/yourusername/deepl-cli.git

# Create a feature branch
git checkout -b feat/my-feature

# Write tests (RED)
npm test -- --watch

# Implement feature (GREEN)
# ... write code ...

# Refactor (REFACTOR)
# ... improve code ...

# Run all checks
npm test && npm run lint && npm run type-check && npm run build

# Commit with descriptive message
git commit -m "feat(scope): description"

# Push and create PR
git push origin feat/my-feature
```

See [CLAUDE.md](./CLAUDE.md) for detailed PR guidelines.

## 🔒 Security & Privacy

- **Secure key storage** - API keys stored in `~/.deepl-cli/config.json` (gitignored)
- **Local caching** - All cached data stored locally in SQLite (`~/.deepl-cli/cache.db`), never shared
- **No telemetry** - Zero usage tracking or data collection
- **Environment variable support** - Use `DEEPL_API_KEY` environment variable for CI/CD
- **GDPR compliant** - Follows DeepL's GDPR compliance guidelines

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [DeepL](https://www.deepl.com/) - Excellent translation API
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Ink](https://github.com/vadimdemedes/ink) - React for terminal
- [Jest](https://jestjs.io/) - Testing framework

## 📞 Support

- **Issues** - [GitHub Issues](https://github.com/yourusername/deepl-cli/issues)
- **Discussions** - [GitHub Discussions](https://github.com/yourusername/deepl-cli/discussions)
- **Documentation** - See [docs/](./docs/) folder

## 🗺️ Roadmap

See [DESIGN.md](./DESIGN.md) for the complete development roadmap.

**Phase 1 (Current)** - MVP with basic translation, config, caching
**Phase 2 (Next)** - Write API, watch mode, batch processing
**Phase 3 (Future)** - TUI, translation memory, team collaboration

---

**Built with ❤️ using Test-Driven Development**

*Powered by DeepL's next-generation language model*
