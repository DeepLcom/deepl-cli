# DeepL CLI

> A next-generation command-line interface for DeepL translation and writing enhancement

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

**DeepL CLI** is a comprehensive, developer-friendly command-line tool that integrates DeepL's powerful translation API and cutting-edge Write API for grammar and style enhancement. Built with TypeScript and designed for modern development workflows.

## 🌟 Key Features

- **🌍 Translation** - High-quality translation using DeepL's next-gen LLM
- **✍️ Writing Enhancement** - Grammar, style, and tone suggestions (DeepL Write API)
- **👀 Watch Mode** - Real-time file watching with auto-translation
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

**Current Phase: Phase 1 - MVP Development** (In Progress)

This project follows a phased development approach with strict Test-Driven Development (TDD):

### Phase 1: MVP (Current - 60% Complete)
- [x] Basic translation command (`deepl translate`)
- [x] Configuration management (`deepl config`)
- [x] API key authentication (`deepl auth`)
- [x] Local SQLite caching with LRU eviction
- [x] Code block and variable preservation
- [x] Multi-target language support
- [x] Stdin support for piping
- [x] Configurable API endpoints (free/pro/custom)
- [ ] File translation with format preservation
- [ ] Basic glossary support
- [ ] Cache management CLI commands

### Phase 2: Advanced Features (Planned)
- [ ] DeepL Write integration
- [ ] Watch mode with file watching
- [ ] Git hooks integration
- [ ] Batch processing
- [ ] Context-aware translation

### Phase 3: TUI & Collaboration (Future)
- [ ] Interactive TUI application
- [ ] Translation memory
- [ ] Team collaboration features

See [DESIGN.md](./DESIGN.md) for detailed architecture and feature specifications.

## 📦 Installation

**Note:** This project is under active development. Installation instructions will be finalized once Phase 1 MVP is complete.

### From npm (Coming Soon)

```bash
npm install -g deepl-cli
```

### From Source (Development)

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
# Output: ¡Hola, mundo!
```

## 📖 Usage

**Note:** Features marked with 🚧 are planned but not yet implemented.

### Translation

#### Basic Text Translation

```bash
# Simple translation
deepl translate "Hello world" --to ja

# Auto-detect source language
deepl translate "Bonjour" --to en

# Multiple target languages
deepl translate "Good morning" --to es,fr,de,ja

# From stdin
echo "Hello world" | deepl translate --to es
```

#### File Translation 🚧

**Coming Soon** - File translation is planned for Phase 1 completion.

```bash
# Single file (planned)
deepl translate README.md --to es --output README.es.md

# Multiple files (planned)
deepl translate docs/*.md --to fr,de,ja --output docs/i18n/

# Document translation (planned - Phase 2)
deepl translate document.pdf --to es --output documento.pdf
```

#### Advanced Translation Options

```bash
# Preserve code blocks and variables (implemented)
deepl translate tutorial.md --preserve-code --to ja

# Set formality level (implemented)
deepl translate "Hello" --formality more --to de

# Add context for better quality (planned)
deepl translate api-docs.md --context "REST API documentation" --to de

# Use glossary for consistent terminology (planned)
deepl translate "Our API uses REST" --glossary tech-terms --to de

# Show confidence scores (planned)
deepl translate "Technical term" --show-confidence --to es
```

#### Interactive Mode 🚧

**Coming in Phase 2**

```bash
# Interactive translation (planned)
deepl translate --interactive --to es
```

### Writing Enhancement

**Note:** DeepL Write API integration coming in Phase 2.

```bash
# Check writing and get suggestions
deepl write "Your text here" --check --tone business --lang en

# Auto-fix grammar and style
deepl write document.txt --fix --output fixed.txt

# Interactive writing assistant
deepl write --interactive --tone academic --lang en

# Show alternative phrasings
deepl write email.txt --show-alternatives --tone diplomatic
```

### Watch Mode

**Note:** Watch mode coming in Phase 2.

```bash
# Watch i18n files and auto-translate
deepl watch src/locales/en.json --targets es,fr,de

# Watch markdown documentation
deepl watch docs/ --pattern "*.md" --targets ja --output docs-i18n/

# Git integration with auto-commit
deepl watch --git-staged --targets es,fr --auto-commit

# Dry run (preview without translating)
deepl watch docs/ --targets es --dry-run
```

### Configuration

#### Set API Key

```bash
# Interactive setup
deepl auth set-key

# Or directly
deepl auth set-key YOUR_API_KEY

# Check authentication status
deepl auth status
```

#### Configure Defaults

```bash
# Set default target languages
deepl config set target_langs "es,fr,de"

# Set default source language
deepl config set source_lang "en"

# Enable/disable cache
deepl config set cache.enabled true

# View all configuration
deepl config list

# Edit config file directly
deepl config edit
```

#### Project-Level Configuration

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

**Note:** Glossary support planned for Phase 1 completion.

```bash
# Create glossary from CSV (planned)
deepl glossary create tech-terms en de glossary.csv

# List all glossaries (planned)
deepl glossary list

# Show glossary details (planned)
deepl glossary show tech-terms

# Delete glossary (planned)
deepl glossary delete tech-terms

# Use glossary in translation (planned)
deepl translate "Our API" --glossary tech-terms --to de
```

### Cache Management

**Note:** Cache CLI commands coming soon. Cache is currently enabled by default.

```bash
# Enable cache (planned)
deepl cache enable --max-size 1GB

# Disable cache (planned)
deepl cache disable

# Clear cache (planned)
deepl cache clear

# View cache statistics (planned)
deepl cache stats
```

### Batch Operations

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

We aim for >80% test coverage, 100% for critical paths.

```bash
# Run all tests
npm test

# Run specific test file
npm test -- translation.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm test -- --watch
```

### Test Types

- **Unit Tests** - Individual functions/classes in isolation
- **Integration Tests** - Component interactions
- **E2E Tests** - Complete CLI workflows

### Mocking

- DeepL API calls mocked with `nock`
- File system mocked with `memfs`
- Module boundaries mocked with Jest

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

- **Secure key storage** - API keys stored in system keychain
- **Local caching** - All cached data stored locally, never shared
- **No telemetry** - Zero usage tracking or data collection
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
