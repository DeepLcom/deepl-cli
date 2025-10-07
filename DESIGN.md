# DeepL CLI: Comprehensive Design Document

**Version:** 1.0
**Date:** October 2025
**Status:** Design Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vision & Goals](#vision--goals)
3. [Feature Overview](#feature-overview)
4. [Architecture](#architecture)
5. [CLI Commands & Interface](#cli-commands--interface)
6. [Technical Stack](#technical-stack)
7. [Implementation Details](#implementation-details)
8. [User Experience](#user-experience)
9. [Configuration & Extensibility](#configuration--extensibility)
10. [Security & Privacy](#security--privacy)
11. [Performance & Optimization](#performance--optimization)
12. [Roadmap & Milestones](#roadmap--milestones)

---

## Executive Summary

**DeepL CLI** is a next-generation command-line interface for the DeepL API that goes beyond basic translation. It integrates DeepL's latest Write API (2025), provides modern TUI experiences, and seamlessly fits into developer workflows with real-time watching, CI/CD integration, and team collaboration features.

### What Makes It Unique

- **First CLI to integrate DeepL Write API** - Grammar, style, and tone enhancement
- **Developer-first design** - Watch modes, Git hooks, CI/CD integration
- **Modern TUI experience** - Interactive, mouse-enabled interface with rich visuals
- **Intelligent workflows** - Context-aware translation, caching, batch processing
- **Team collaboration** - Shared glossaries, translation memory, review workflows

---

## Vision & Goals

### Primary Vision
Create the most comprehensive, developer-friendly translation CLI that becomes the standard tool for localization, documentation, and multilingual content workflows.

### Core Goals

1. **Productivity**: Reduce translation workflow time by 80% through automation
2. **Quality**: Leverage DeepL's next-gen LLM + Write API for superior output
3. **Developer Experience**: Seamless integration into existing dev workflows
4. **Collaboration**: Enable teams to work together on translations efficiently
5. **Extensibility**: Plugin architecture for custom workflows and integrations

### Success Metrics

- 10,000+ GitHub stars in first year
- Adopted by 100+ open source projects
- 90%+ user satisfaction rating
- Average 5x faster than manual translation workflows

---

## Feature Overview

### Phase 1: Core Features (MVP)

#### 1. Basic Translation
```bash
# Simple text translation
deepl translate "Hello world" --to ja

# From stdin
echo "Hello world" | deepl translate --to ja

# Interactive mode
deepl translate --interactive
```

#### 2. File Translation
```bash
# Single file
deepl translate README.md --to es --output README.es.md

# Multiple formats (preserves formatting)
deepl translate docs/*.md --to fr,de,ja

# Document translation (PDF, DOCX, etc.)
deepl translate document.pdf --to es --output documento.pdf
```

#### 3. Configuration Management
```bash
# Initialize project config
deepl init

# Set API key
deepl auth set-key YOUR_API_KEY

# Configure default languages
deepl config set source en target "es,fr,de,ja"
```

#### 4. Basic Glossaries
```bash
# Create glossary
deepl glossary create tech-terms en de glossary.csv

# List glossaries
deepl glossary list

# Use glossary in translation
deepl translate "Our API uses REST" --to de --glossary tech-terms
```

### Phase 2: Advanced Features

#### 5. DeepL Write Integration ✅ IMPLEMENTED
```bash
# Current features:
# Improve writing with grammar/style suggestions
deepl write "Your text here" --tone business --lang en-US

# With writing style
deepl write "Your text here" --style business --lang en-US

# Show alternative improvements
deepl write "Your text here" --lang en-US --alternatives

# Future enhancements (planned):
# Interactive writing assistant
deepl write --interactive --tone academic --lang en-US

# Fix grammar in files
deepl write fix README.md --style casual --lang en-US

# Preview suggestions
deepl write check document.txt --show-alternatives --lang en-US

# Available languages: de, en-GB, en-US, es, fr, it, pt-BR, pt-PT
# Writing styles: simple, business, academic, casual (+ prefer_* variants)
# Tones: enthusiastic, friendly, confident, diplomatic (+ prefer_* variants)
```

**Status**: Production-ready with full test coverage (84 tests)
**Current Features**:
- Grammar and style improvement
- Writing style customization (simple, business, academic, casual)
- Tone customization (enthusiastic, friendly, confident, diplomatic)
- Multiple improvement alternatives
- Support for 8 languages
- Full API integration with DeepL Write v2 endpoint

**Planned Enhancements**:
- File input/output support
- Interactive REPL mode for iterative improvement
- Diff view for before/after comparison
- Check mode (show suggestions without applying)
- Auto-fix mode for CI/CD integration

#### 6. Watch Mode & Auto-Translation ✅ IMPLEMENTED
```bash
# Watch i18n files and auto-translate
deepl watch src/locales/en.json --targets es,fr,de

# Watch markdown docs
deepl watch docs/ --pattern "*.md" --targets ja

# Git integration (translate on file changes and auto-commit)
deepl watch docs/ --targets es,fr --auto-commit

# Custom debounce and output directory
deepl watch src/ --targets de --debounce 500 --output translations/

# Watch with formality and code preservation
deepl watch docs/ --targets de --formality more --preserve-code
```

**Status**: Production-ready with full test coverage (19 tests)
**Features**:
- Real-time file/directory monitoring
- Configurable debouncing (default 300ms)
- Glob pattern filtering
- Multiple target languages
- Auto-commit to git (optional)
- Custom output directories
- Statistics tracking

#### 7. Git Hooks Integration ✅ IMPLEMENTED
```bash
# Install git hooks
deepl hooks install pre-commit
deepl hooks install pre-push

# Check hook status
deepl hooks list

# Show hook path
deepl hooks path pre-commit

# Uninstall hooks
deepl hooks uninstall pre-commit
```

**Status**: Production-ready, fully documented
**Features**:
- Pre-commit hook for translation validation
- Pre-push hook for full validation
- Automatic backup of existing hooks
- Safe installation/uninstallation
- Hook status checking
- Customizable shell scripts

#### 8. Developer Workflow Integration (Future)
```bash
# CI/CD integration (outputs JSON for scripts)
deepl translate-changed --since HEAD~1 --format json

# VS Code integration via language server
deepl lsp start
```

#### 9. Interactive TUI Mode (Phase 3)
```bash
# Launch full TUI application
deepl tui

# Features:
# - Split-pane editor (source | translation)
# - Live translation preview
# - Glossary builder with suggestions
# - Translation history browser
# - Batch job manager
# - Cost calculator dashboard
```

### Phase 3: Team & Enterprise Features

#### 10. Translation Memory & Caching
```bash
# Enable local translation cache
deepl cache enable --max-size 1GB

# Sync translation memory with team
deepl tm sync --remote git@github.com:org/translations.git

# Import existing translations
deepl tm import translations.json --format i18next

# Export translation memory
deepl tm export --format xliff
```

#### 11. Team Collaboration
```bash
# Initialize team workspace
deepl team init --org mycompany

# Share glossaries
deepl glossary push tech-terms --team

# Review mode (for human validation)
deepl review pending/ --assign @translator

# Diff mode (compare translations)
deepl diff en.json es.json --highlight-changes
```

#### 12. Batch Processing & Cost Management
```bash
# Estimate costs before translating
deepl estimate src/locales/ --targets es,fr,de,ja,zh

# Batch translate with progress
deepl batch translate docs/ --targets es,fr --parallel 5

# Usage tracking
deepl usage --month current --breakdown by-language

# Budget limits
deepl config set budget-limit 1000000 --period monthly
```

#### 13. Context-Aware Translation
```bash
# Preserve code blocks and variables
deepl translate README.md --preserve-code --preserve-vars

# Inject context for better quality
deepl translate app.json --context "E-commerce checkout flow"

# Domain-specific translation
deepl translate legal.txt --domain legal --formality formal

# Quality scoring
deepl translate text.txt --show-confidence --min-quality 0.85
```

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CLI Interface                        │
│  (Command Parser, Argument Validation, Help System)     │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│                  Core Application Layer                  │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐│
│  │   Command   │  │   TUI/UI     │  │   Interactive   ││
│  │   Handlers  │  │   Manager    │  │     Shell       ││
│  └─────────────┘  └──────────────┘  └─────────────────┘│
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│                   Service Layer                          │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Translation │  │    Write     │  │   Glossary    │ │
│  │   Service    │  │   Service    │  │   Service     │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │    Cache     │  │    Watch     │  │   GitHooks    │ │
│  │   Service    │  │   Service    │  │   Service     │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │     Team     │  │    Batch     │  │     File      │ │
│  │   Service    │  │   Service    │  │  Translation  │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│              DeepL API Client Layer                      │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Translate   │  │    Write     │  │   Glossary    │ │
│  │     API      │  │     API      │  │     API       │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  HTTP Client (Rate Limiting, Retry, Error)      │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│                  Storage Layer                           │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │    Cache     │  │   Config     │  │  Translation  │ │
│  │   Storage    │  │   Storage    │  │    Memory     │ │
│  │   (SQLite)   │  │   (TOML)     │  │   (SQLite)    │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### CLI Interface Layer
- **Command Parser**: Parse and validate CLI arguments
- **Help System**: Generate contextual help and documentation
- **Output Formatter**: Format output (text, JSON, table, etc.)

#### Core Application Layer
- **Command Handlers**: Business logic for each CLI command
- **TUI Manager**: Terminal UI state management and rendering
- **Interactive Shell**: REPL for interactive usage

#### Service Layer
- **Translation Service**: Core translation logic, format detection
- **Write Service**: Grammar checking, style suggestions ✅ IMPLEMENTED
- **Glossary Service**: Glossary CRUD and application ✅ IMPLEMENTED
- **Cache Service**: Translation caching and invalidation ✅ IMPLEMENTED
- **Watch Service**: File watching and auto-translation ✅ IMPLEMENTED
- **GitHooks Service**: Git hook lifecycle management ✅ IMPLEMENTED
- **Batch Service**: Parallel translation processing ✅ IMPLEMENTED
- **Team Service**: Collaboration features (Phase 3)

#### API Client Layer
- **DeepL Client**: Typed API wrappers for all DeepL endpoints
- **HTTP Client**: Request/response handling, error recovery
- **Rate Limiter**: Respect API rate limits
- **Retry Logic**: Exponential backoff for transient failures

#### Storage Layer
- **Cache Storage**: Local translation cache (SQLite)
- **Config Storage**: User preferences (TOML/YAML)
- **Translation Memory**: Historical translations (SQLite)

---

## CLI Commands & Interface

### Command Structure

```
deepl [GLOBAL_OPTIONS] <COMMAND> [COMMAND_OPTIONS] [ARGS]
```

### Global Options

```
--version, -v        Show version information
--help, -h           Show help message
--verbose            Enable verbose logging
--quiet, -q          Suppress non-error output
--config FILE        Use alternate config file
--no-cache           Disable translation cache
--format FORMAT      Output format (text|json|yaml|table)
```

### Command Hierarchy

```
deepl
├── translate [TEXT|FILE...] --to LANGS      # Translate text/files
├── write [TEXT] --lang LANG                 # Improve writing ✅ IMPLEMENTED
├── glossary                                  # Glossary management
│   ├── create NAME SRC TGT [FILE]
│   ├── list
│   ├── show NAME
│   ├── delete NAME
│   ├── push NAME --team
│   └── pull NAME
├── watch PATH --targets LANGS                # Watch and auto-translate ✅ IMPLEMENTED
├── hooks                                     # Git hooks management ✅ IMPLEMENTED
│   ├── install <hook-type>
│   ├── uninstall <hook-type>
│   ├── list
│   └── path <hook-type>
├── tui                                       # Launch interactive TUI
├── batch                                     # Batch operations
│   ├── translate PATH --targets LANGS
│   └── estimate PATH --targets LANGS
├── cache                                     # Cache management
│   ├── enable [--max-size SIZE]
│   ├── disable
│   ├── clear
│   └── stats
├── tm (translation-memory)                   # Translation memory
│   ├── import FILE --format FORMAT
│   ├── export --format FORMAT
│   ├── sync --remote URL
│   └── stats
├── team                                      # Team collaboration
│   ├── init --org ORG
│   ├── invite EMAIL
│   └── review [PATH]
├── auth                                      # Authentication
│   ├── login
│   ├── logout
│   ├── set-key KEY
│   └── status
├── config                                    # Configuration
│   ├── set KEY VALUE
│   ├── get KEY
│   ├── list
│   └── edit
├── init                                      # Initialize project
├── install                                   # Install integrations (Future)
│   ├── git-hooks [--pre-commit|--pre-push]  # Alternative to 'deepl hooks install'
│   └── lsp                                   # Language server protocol for editors
├── usage [--month MONTH]                     # Usage statistics
└── help [COMMAND]                            # Help system

NOTE: Git hooks currently use 'deepl hooks install <type>' syntax.
      The 'deepl install' command is a future enhancement for consolidating
      all integration installations (git-hooks, lsp, editor plugins, etc.)
```

### Detailed Command Specifications

#### `translate` - Core Translation Command

```bash
deepl translate [OPTIONS] [TEXT|FILE...]

OPTIONS:
  --to, -t LANGS              Target language(s) (comma-separated)
  --from, -f LANG             Source language (auto-detect if omitted)
  --output, -o PATH           Output file/directory
  --glossary NAME             Use glossary
  --formality LEVEL           Formality level (default|less|more|prefer_less|prefer_more)
  --preserve-formatting       Preserve line breaks and formatting
  --preserve-code             Preserve code blocks (markdown, etc.)
  --preserve-vars             Preserve variables like {name}, ${var}
  --context TEXT              Additional context for better translation
  --split-sentences LEVEL     Sentence splitting (on|off|nonewlines)
  --tag-handling MODE         XML tag handling (xml|html)
  --batch-size N              Batch size for multiple inputs
  --show-confidence           Show confidence scores
  --min-quality SCORE         Minimum quality score (0.0-1.0)
  --interactive, -i           Interactive mode

EXAMPLES:
  # Simple translation
  deepl translate "Hello world" --to ja

  # Multiple targets
  deepl translate README.md --to es,fr,de --output docs/

  # With glossary and context
  deepl translate api-docs.md --to de --glossary tech-terms --context "REST API documentation"

  # Preserve code blocks
  deepl translate tutorial.md --to ja --preserve-code --preserve-vars

  # Interactive mode
  deepl translate --interactive --to es
```

#### `write` - Writing Enhancement Command ✅ IMPLEMENTED

```bash
deepl write [OPTIONS] TEXT

CURRENT OPTIONS (✅ IMPLEMENTED):
  --lang, -l LANG            Language of text (required) - de, en-GB, en-US, es, fr, it, pt-BR, pt-PT
  --style, -s STYLE          Writing style (simple|business|academic|casual|prefer_*)
  --tone, -t TONE            Tone (enthusiastic|friendly|confident|diplomatic|prefer_*)
  --alternatives, -a         Show multiple improvement alternatives

FUTURE OPTIONS (Planned):
  --fix                      Auto-apply suggestions (apply best improvement automatically)
  --check                    Show suggestions without applying (analysis mode)
  --output, -o FILE          Output file for improved text
  --diff                     Show diff of changes (before/after comparison)
  --interactive, -i          Interactive writing assistant (REPL mode)

NOTES:
  - Cannot specify both --style and --tone in a single request
  - style and tone options support "prefer_*" variants for suggestions

EXAMPLES (Current):
  # Basic improvement
  deepl write "This is a sentence." --lang en-US

  # With business style
  deepl write "We want to tell you." --lang en-US --style business

  # With confident tone
  deepl write "I think this will work." --lang en-US --tone confident

  # Show alternatives
  deepl write "This is good." --lang en-US --alternatives

  # Prefer casual style (suggestions only)
  deepl write "Your text" --lang en-US --style prefer_casual

EXAMPLES (Future):
  # Auto-fix grammar in file
  deepl write document.txt --fix --output document-fixed.txt --lang en-US

  # Show diff of changes
  deepl write email.txt --diff --tone diplomatic --lang en-US

  # Interactive writing assistant
  deepl write --interactive --tone academic --lang en-US

  # Check writing without applying
  deepl write "Your text" --check --style business --lang en-US
```

#### `watch` - Watch Mode Command

```bash
deepl watch [OPTIONS] PATH

OPTIONS:
  --targets, -t LANGS        Target languages (comma-separated)
  --pattern GLOB             File pattern to watch (e.g., "*.md")
  --output DIR               Output directory structure
  --glossary NAME            Use glossary
  --debounce MS              Debounce delay in milliseconds (default: 500)
  --git-staged               Only watch git staged files
  --auto-commit              Auto-commit translations
  --dry-run                  Show what would be translated without doing it

EXAMPLES:
  # Watch i18n files
  deepl watch src/locales/en.json --targets es,fr,de

  # Watch markdown docs
  deepl watch docs/ --pattern "*.md" --targets ja --output docs-i18n/

  # Git integration
  deepl watch --git-staged --targets es --auto-commit
```

#### `hooks` - Git Hooks Management ✅ IMPLEMENTED

```bash
deepl hooks <SUBCOMMAND>

SUBCOMMANDS:
  install <hook-type>        Install a git hook (pre-commit|pre-push)
  uninstall <hook-type>      Uninstall a git hook
  list                       List all hooks and their status
  path <hook-type>           Show the path to a hook file

EXAMPLES:
  # Install pre-commit hook
  deepl hooks install pre-commit

  # Install pre-push hook
  deepl hooks install pre-push

  # Check hook status
  deepl hooks list

  # Show hook path
  deepl hooks path pre-commit

  # Uninstall hook
  deepl hooks uninstall pre-commit

FEATURES:
  - Automatic backup of existing hooks
  - Safe installation without overwriting custom hooks
  - Hook validation with DeepL marker
  - Customizable shell scripts for project workflows
```

#### `tui` - Interactive TUI

```bash
deepl tui [OPTIONS]

OPTIONS:
  --workspace PATH           Open workspace directory
  --theme THEME              UI theme (dark|light|custom)
  --mouse                    Enable mouse support (default: true)

FEATURES:
  - Split-pane editor with live preview
  - Glossary builder with autocomplete
  - Translation history browser
  - Batch job manager
  - Usage dashboard
  - File browser
  - Settings panel
```

#### `batch` - Batch Operations

```bash
deepl batch translate [OPTIONS] PATH
deepl batch estimate [OPTIONS] PATH

OPTIONS:
  --targets, -t LANGS        Target languages
  --parallel N               Number of parallel requests (default: 3)
  --pattern GLOB             File pattern
  --output DIR               Output directory
  --glossary NAME            Use glossary
  --progress                 Show progress bar (default: true)
  --summary                  Show summary report

EXAMPLES:
  # Estimate costs
  deepl batch estimate docs/ --targets es,fr,de,ja

  # Batch translate
  deepl batch translate src/locales/ --targets es,fr --parallel 5
```

---

## Technical Stack

### Language & Runtime

**Recommendation: TypeScript with Node.js**

**Rationale:**
- **Rapid development**: Rich ecosystem, excellent tooling
- **DeepL SDK**: Official Node.js SDK available
- **TUI library**: Ink (React for terminal) - mature and powerful
- **TypeScript**: Type safety, better DX, easier maintenance
- **Cross-platform**: Native support for Windows, macOS, Linux
- **Community**: Large user base for CLI tools

**Alternative Options:**
- **Rust**: Best performance, but slower development, steeper learning curve
- **Python**: Quick prototyping, but slower runtime, distribution challenges

### Core Dependencies

```json
{
  "runtime": {
    "node": ">=18.0.0",
    "typescript": "^5.0.0"
  },
  "cli": {
    "commander": "^11.0.0",
    "inquirer": "^9.0.0",
    "chalk": "^5.0.0",
    "ora": "^7.0.0",
    "cli-table3": "^0.6.0"
  },
  "tui": {
    "ink": "^4.0.0",
    "ink-text-input": "^5.0.0",
    "ink-select-input": "^5.0.0",
    "ink-spinner": "^5.0.0"
  },
  "api": {
    "deepl-node": "^1.11.0",
    "axios": "^1.6.0",
    "axios-retry": "^4.0.0"
  },
  "storage": {
    "better-sqlite3": "^9.0.0",
    "conf": "^12.0.0",
    "keytar": "^7.9.0"
  },
  "file": {
    "chokidar": "^3.5.0",
    "glob": "^10.0.0",
    "fast-glob": "^3.3.0",
    "mime-types": "^2.1.0"
  },
  "i18n": {
    "i18next": "^23.0.0",
    "yaml": "^2.3.0",
    "xml2js": "^0.6.0"
  },
  "utils": {
    "date-fns": "^2.30.0",
    "lodash": "^4.17.0",
    "p-limit": "^5.0.0",
    "zod": "^3.22.0"
  }
}
```

### Project Structure

```
deepl-cli/
├── src/
│   ├── cli/
│   │   ├── commands/              # Command implementations
│   │   │   ├── translate.ts       # ✅ IMPLEMENTED
│   │   │   ├── write.ts           # ✅ IMPLEMENTED
│   │   │   ├── watch.ts           # ✅ IMPLEMENTED
│   │   │   ├── hooks.ts           # ✅ IMPLEMENTED
│   │   │   ├── glossary.ts        # ✅ IMPLEMENTED
│   │   │   ├── cache.ts           # ✅ IMPLEMENTED
│   │   │   ├── auth.ts            # ✅ IMPLEMENTED
│   │   │   ├── config.ts          # ✅ IMPLEMENTED
│   │   │   └── tui.ts             # Phase 3
│   │   ├── parser.ts              # CLI argument parsing
│   │   ├── help.ts                # Help system
│   │   └── index.ts               # CLI entry point ✅ IMPLEMENTED
│   │
│   ├── tui/
│   │   ├── components/            # Ink components
│   │   │   ├── Editor.tsx
│   │   │   ├── Glossary.tsx
│   │   │   ├── History.tsx
│   │   │   └── ...
│   │   ├── screens/               # TUI screens
│   │   │   ├── Main.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── ...
│   │   └── index.tsx              # TUI entry point
│   │
│   ├── services/
│   │   ├── translation.ts         # Translation service ✅ IMPLEMENTED
│   │   ├── write.ts               # Write service ✅ IMPLEMENTED
│   │   ├── file-translation.ts    # File translation ✅ IMPLEMENTED
│   │   ├── batch-translation.ts   # Batch translation ✅ IMPLEMENTED
│   │   ├── glossary.ts            # Glossary service ✅ IMPLEMENTED
│   │   ├── cache.ts               # Cache service ✅ IMPLEMENTED
│   │   ├── watch.ts               # Watch service ✅ IMPLEMENTED
│   │   ├── git-hooks.ts           # Git hooks service ✅ IMPLEMENTED
│   │   ├── tm.ts                  # Translation memory (Phase 3)
│   │   └── team.ts                # Team service (Phase 3)
│   │
│   ├── api/
│   │   ├── client.ts              # DeepL API client
│   │   ├── translate.ts           # Translate API
│   │   ├── write.ts               # Write API
│   │   ├── glossary.ts            # Glossary API
│   │   ├── rate-limiter.ts        # Rate limiting
│   │   └── retry.ts               # Retry logic
│   │
│   ├── storage/
│   │   ├── cache.ts               # Cache storage
│   │   ├── config.ts              # Config storage
│   │   ├── tm.ts                  # Translation memory storage
│   │   └── migrations/            # Database migrations
│   │
│   ├── utils/
│   │   ├── file.ts                # File utilities
│   │   ├── format.ts              # Format detection
│   │   ├── preserve.ts            # Content preservation
│   │   ├── diff.ts                # Diff utilities
│   │   └── logger.ts              # Logging
│   │
│   ├── types/
│   │   ├── api.ts                 # API types
│   │   ├── config.ts              # Config types
│   │   └── common.ts              # Common types
│   │
│   └── index.ts                   # Main entry point
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── README.md
│   ├── INSTALLATION.md
│   ├── USAGE.md
│   ├── API.md
│   └── CONTRIBUTING.md
│
├── examples/
│   ├── basic-translation/
│   ├── watch-mode/
│   └── ci-cd-integration/
│
├── package.json
├── tsconfig.json
├── .eslintrc.js
└── .prettierrc
```

---

## Implementation Details

### 1. Translation Service

```typescript
// src/services/translation.ts

import { Translator } from 'deepl-node';
import { CacheService } from './cache';
import { PreservationService } from '../utils/preserve';

interface TranslationOptions {
  sourceLang?: string;
  targetLang: string;
  glossaryId?: string;
  formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
  preserveFormatting?: boolean;
  preserveCode?: boolean;
  preserveVars?: boolean;
  context?: string;
  splitSentences?: 'on' | 'off' | 'nonewlines';
  tagHandling?: 'xml' | 'html';
}

interface TranslationResult {
  text: string;
  detectedSourceLang?: string;
  confidence?: number;
  cached: boolean;
  usage?: {
    characterCount: number;
    billableCharacters: number;
  };
}

export class TranslationService {
  private translator: Translator;
  private cache: CacheService;
  private preservation: PreservationService;

  constructor(apiKey: string) {
    this.translator = new Translator(apiKey);
    this.cache = new CacheService();
    this.preservation = new PreservationService();
  }

  async translate(
    text: string,
    options: TranslationOptions
  ): Promise<TranslationResult> {
    // Check cache first
    const cacheKey = this.generateCacheKey(text, options);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    // Preserve special content if needed
    let processedText = text;
    let preservedContent: Map<string, string> | undefined;

    if (options.preserveCode || options.preserveVars) {
      const result = this.preservation.extract(text, {
        codeBlocks: options.preserveCode,
        variables: options.preserveVars,
      });
      processedText = result.text;
      preservedContent = result.preserved;
    }

    // Translate using DeepL API
    const result = await this.translator.translateText(
      processedText,
      options.sourceLang || null,
      options.targetLang,
      {
        glossaryId: options.glossaryId,
        formality: options.formality,
        preserveFormatting: options.preserveFormatting,
        context: options.context,
        splitSentences: options.splitSentences,
        tagHandling: options.tagHandling,
      }
    );

    // Restore preserved content
    let finalText = result.text;
    if (preservedContent) {
      finalText = this.preservation.restore(finalText, preservedContent);
    }

    const translationResult: TranslationResult = {
      text: finalText,
      detectedSourceLang: result.detectedSourceLang,
      cached: false,
      usage: {
        characterCount: text.length,
        billableCharacters: result.billableCharacters || text.length,
      },
    };

    // Cache result
    await this.cache.set(cacheKey, translationResult);

    return translationResult;
  }

  async translateBatch(
    texts: string[],
    options: TranslationOptions,
    concurrency: number = 3
  ): Promise<TranslationResult[]> {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(concurrency);

    const promises = texts.map((text) =>
      limit(() => this.translate(text, options))
    );

    return Promise.all(promises);
  }

  private generateCacheKey(text: string, options: TranslationOptions): string {
    const crypto = require('crypto');
    const data = JSON.stringify({ text, options });
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
```

### 2. Write Service ✅ IMPLEMENTED

**Actual implementation**: See `src/services/write.ts`

```typescript
// src/services/write.ts (simplified conceptual view)

import { DeepLClient } from '../api/deepl-client.js';
import { ConfigService } from '../storage/config.js';
import { WriteOptions, WriteImprovement } from '../types/index.js';

export class WriteService {
  private client: DeepLClient;

  constructor(client: DeepLClient, config: ConfigService) {
    this.client = client;
  }

  async improve(
    text: string,
    options: WriteOptions
  ): Promise<WriteImprovement[]> {
    // Validates text, targetLang, and style/tone exclusivity
    // Returns all improvements from DeepL Write API
    return await this.client.improveText(text, options);
  }

  async getBestImprovement(
    text: string,
    options: WriteOptions
  ): Promise<WriteImprovement> {
    // Returns the first (best) improvement
    const improvements = await this.improve(text, options);
    return improvements[0]!;
  }
}
```

**Key Features**:
- Support for 8 languages (de, en-GB, en-US, es, fr, it, pt-BR, pt-PT)
- Writing styles: simple, business, academic, casual (+ prefer_* variants)
- Tones: enthusiastic, friendly, confident, diplomatic (+ prefer_* variants)
- Cannot specify both style and tone in one request
- Returns multiple improvement alternatives
- Full test coverage: 84 tests (28 service + 19 command + 37 client)

**Future Enhancement Concepts**:

If DeepL Write API adds detailed suggestion capabilities or if we add post-processing:

```typescript
// Potential future interface for detailed suggestions
interface Suggestion {
  type: 'grammar' | 'spelling' | 'style' | 'punctuation';
  original: string;
  suggestion: string;
  start: number;      // Character position
  end: number;        // Character position
  confidence: number; // 0.0 - 1.0
  alternatives?: string[];
  explanation?: string;
}

interface WriteResult {
  originalText: string;
  improvedText: string;
  suggestions: Suggestion[];  // Detailed breakdown
  applied: boolean;
}

// Interactive mode for iterative improvement
async interactive(options: WriteOptions): Promise<void> {
  // REPL for writing assistance
  // - Enter text in editor
  // - Show suggestions
  // - Apply/reject interactively
  // - Iterate until satisfied
}
```

### 3. Watch Service

**Status**: ✅ **IMPLEMENTED** - See `src/services/watch.ts` for actual implementation

**Conceptual Design** (actual implementation may vary):

```typescript
// src/services/watch.ts (design concept)

import chokidar from 'chokidar';
import { TranslationService } from './translation';
import { debounce } from 'lodash';
import * as fs from 'fs/promises';
import * as path from 'path';

interface WatchOptions {
  targets: string[];
  pattern?: string;
  outputDir?: string;
  glossary?: string;
  debounceMs?: number;
  gitStaged?: boolean;
  autoCommit?: boolean;
  dryRun?: boolean;
}

export class WatchService {
  private translation: TranslationService;
  private watcher?: chokidar.FSWatcher;

  constructor(translationService: TranslationService) {
    this.translation = translationService;
  }

  async start(watchPath: string, options: WatchOptions): Promise<void> {
    console.log(`Watching ${watchPath} for changes...`);
    console.log(`Target languages: ${options.targets.join(', ')}`);

    const handleChange = debounce(
      async (filePath: string) => {
        await this.handleFileChange(filePath, options);
      },
      options.debounceMs || 500
    );

    this.watcher = chokidar.watch(watchPath, {
      ignored: /(^|[\/\\])\../, // ignore hidden files
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('add', handleChange)
      .on('change', handleChange)
      .on('error', (error) => console.error(`Watcher error: ${error}`));

    // Keep process alive
    return new Promise(() => {});
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    }
  }

  private async handleFileChange(
    filePath: string,
    options: WatchOptions
  ): Promise<void> {
    console.log(`\nFile changed: ${filePath}`);

    if (options.dryRun) {
      console.log('[DRY RUN] Would translate to:', options.targets);
      return;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Translate to each target language
      for (const targetLang of options.targets) {
        const result = await this.translation.translate(content, {
          targetLang,
          glossaryId: options.glossary,
          preserveFormatting: true,
        });

        // Determine output path
        const outputPath = this.getOutputPath(
          filePath,
          targetLang,
          options.outputDir
        );

        // Write translated file
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, result.text, 'utf-8');

        console.log(`✓ Translated to ${targetLang}: ${outputPath}`);
      }

      // Auto-commit if enabled
      if (options.autoCommit) {
        await this.gitCommit(filePath, options.targets);
      }
    } catch (error) {
      console.error(`Error translating ${filePath}:`, error);
    }
  }

  private getOutputPath(
    inputPath: string,
    targetLang: string,
    outputDir?: string
  ): string {
    const parsed = path.parse(inputPath);
    const filename = `${parsed.name}.${targetLang}${parsed.ext}`;

    if (outputDir) {
      return path.join(outputDir, filename);
    }

    return path.join(parsed.dir, filename);
  }

  private async gitCommit(filePath: string, targets: string[]): Promise<void> {
    const { execSync } = require('child_process');
    const message = `chore: auto-translate ${filePath} to ${targets.join(', ')}`;

    try {
      execSync('git add .');
      execSync(`git commit -m "${message}"`);
      console.log(`✓ Auto-committed changes`);
    } catch (error) {
      console.error('Failed to auto-commit:', error);
    }
  }
}
```

### 4. Git Hooks Service ✅ IMPLEMENTED

**Actual implementation**: See `src/services/git-hooks.ts`

```typescript
// src/services/git-hooks.ts (simplified conceptual view)

export type HookType = 'pre-commit' | 'pre-push';

export class GitHooksService {
  private hooksDir: string;

  constructor(gitDir: string) {
    // Validates git directory exists
    this.hooksDir = path.join(gitDir, 'hooks');
  }

  async install(hookType: HookType): Promise<void> {
    // 1. Validate hook type
    // 2. Create hooks directory if needed
    // 3. Backup existing hook if not a DeepL hook
    // 4. Write new hook script
    // 5. Make executable (chmod 755)
  }

  async uninstall(hookType: HookType): Promise<void> {
    // 1. Validate it's a DeepL hook
    // 2. Remove hook file
    // 3. Restore backup if exists
  }

  isInstalled(hookType: HookType): boolean {
    // Check if hook exists and is a DeepL hook
  }

  list(): HookStatus {
    // Return status of all supported hooks
  }

  getHookPath(hookType: HookType): string {
    // Return absolute path to hook file
  }

  static findGitRoot(startPath?: string): string | null {
    // Traverse up directory tree to find .git directory
  }

  private generateHookContent(hookType: HookType): string {
    // Generate shell script for the hook
    // Includes marker comment for identification
  }

  private isDeepLHook(content: string): boolean {
    // Check for DeepL CLI marker in hook content
  }
}
```

**Key Features**:
- Support for pre-commit and pre-push hooks
- Automatic backup of existing hooks
- Safe installation without overwriting custom hooks
- Hook validation with DeepL marker comment
- Customizable shell scripts (placeholder logic for project-specific workflows)
- Automatic .git directory detection
- Graceful error handling for non-git repositories

**Hook Scripts Generated**:
- **pre-commit**: Validates translation files before commit
- **pre-push**: Validates all translations before push
- Both include placeholders for customization

### 5. Cache Service

```typescript
// src/storage/cache.ts

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';

interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  size: number;
}

export class CacheService {
  private db: Database.Database;
  private maxSize: number; // in bytes
  private enabled: boolean = true;

  constructor(maxSize: number = 1024 * 1024 * 1024) { // 1GB default
    const dbPath = path.join(os.homedir(), '.deepl-cli', 'cache.db');
    this.db = new Database(dbPath);
    this.maxSize = maxSize;
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        size INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON cache(timestamp);
    `);
  }

  async get(key: string): Promise<any | null> {
    if (!this.enabled) return null;

    const stmt = this.db.prepare('SELECT value FROM cache WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;

    if (row) {
      return JSON.parse(row.value);
    }

    return null;
  }

  async set(key: string, value: any): Promise<void> {
    if (!this.enabled) return;

    const json = JSON.stringify(value);
    const size = Buffer.byteLength(json, 'utf8');
    const timestamp = Date.now();

    // Check if we need to evict old entries
    await this.evictIfNeeded(size);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, timestamp, size)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(key, json, timestamp, size);
  }

  async clear(): Promise<void> {
    this.db.exec('DELETE FROM cache');
  }

  async stats(): Promise<{
    entries: number;
    totalSize: number;
    maxSize: number;
  }> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count, SUM(size) as total FROM cache');
    const row = stmt.get() as { count: number; total: number | null };

    return {
      entries: row.count,
      totalSize: row.total || 0,
      maxSize: this.maxSize,
    };
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    const stats = await this.stats();

    if (stats.totalSize + newEntrySize > this.maxSize) {
      // Evict oldest entries until we have enough space
      const toFree = stats.totalSize + newEntrySize - this.maxSize;

      const stmt = this.db.prepare(`
        DELETE FROM cache
        WHERE key IN (
          SELECT key FROM cache
          ORDER BY timestamp ASC
          LIMIT (
            SELECT COUNT(*) FROM cache
            WHERE (
              SELECT SUM(size) FROM cache c2
              WHERE c2.timestamp <= cache.timestamp
            ) <= ?
          )
        )
      `);

      stmt.run(toFree);
    }
  }
}
```

### 6. Preservation Service

```typescript
// src/utils/preserve.ts

interface PreservationOptions {
  codeBlocks?: boolean;
  variables?: boolean;
  urls?: boolean;
  html?: boolean;
}

interface PreservationResult {
  text: string;
  preserved: Map<string, string>;
}

export class PreservationService {
  private placeholderPrefix = '__PRESERVED_';
  private placeholderCounter = 0;

  extract(text: string, options: PreservationOptions): PreservationResult {
    let processedText = text;
    const preserved = new Map<string, string>();
    this.placeholderCounter = 0;

    if (options.codeBlocks) {
      processedText = this.extractCodeBlocks(processedText, preserved);
    }

    if (options.variables) {
      processedText = this.extractVariables(processedText, preserved);
    }

    if (options.urls) {
      processedText = this.extractUrls(processedText, preserved);
    }

    if (options.html) {
      processedText = this.extractHtmlTags(processedText, preserved);
    }

    return { text: processedText, preserved };
  }

  restore(text: string, preserved: Map<string, string>): string {
    let restoredText = text;

    // Replace placeholders with original content
    for (const [placeholder, original] of preserved.entries()) {
      restoredText = restoredText.replace(placeholder, original);
    }

    return restoredText;
  }

  private extractCodeBlocks(text: string, preserved: Map<string, string>): string {
    // Extract fenced code blocks (```)
    const fencedPattern = /```[\s\S]*?```/g;
    text = this.extractPattern(text, fencedPattern, preserved);

    // Extract inline code (`)
    const inlinePattern = /`[^`]+`/g;
    text = this.extractPattern(text, inlinePattern, preserved);

    return text;
  }

  private extractVariables(text: string, preserved: Map<string, string>): string {
    // Extract {variable}, ${variable}, %s, %d, etc.
    const patterns = [
      /\{[^}]+\}/g,           // {variable}
      /\$\{[^}]+\}/g,         // ${variable}
      /%[sd]/g,               // %s, %d
      /\{\d+\}/g,             // {0}, {1}
    ];

    for (const pattern of patterns) {
      text = this.extractPattern(text, pattern, preserved);
    }

    return text;
  }

  private extractUrls(text: string, preserved: Map<string, string>): string {
    const urlPattern = /https?:\/\/[^\s]+/g;
    return this.extractPattern(text, urlPattern, preserved);
  }

  private extractHtmlTags(text: string, preserved: Map<string, string>): string {
    const tagPattern = /<[^>]+>/g;
    return this.extractPattern(text, tagPattern, preserved);
  }

  private extractPattern(
    text: string,
    pattern: RegExp,
    preserved: Map<string, string>
  ): string {
    return text.replace(pattern, (match) => {
      const placeholder = `${this.placeholderPrefix}${this.placeholderCounter++}__`;
      preserved.set(placeholder, match);
      return placeholder;
    });
  }
}
```

---

## User Experience

### Installation & Setup

#### Installation

```bash
# npm (recommended)
npm install -g deepl-cli

# yarn
yarn global add deepl-cli

# pnpm
pnpm add -g deepl-cli

# From source
git clone https://github.com/yourusername/deepl-cli.git
cd deepl-cli
npm install
npm run build
npm link
```

#### First-time Setup

```bash
# Interactive setup wizard
deepl init

# Output:
# ✓ Welcome to DeepL CLI!
# ? Enter your DeepL API key: ••••••••
# ? Default source language (auto-detect): en
# ? Default target languages (comma-separated): es,fr,de
# ? Enable translation cache? Yes
# ? Cache size limit: 1GB
# ✓ Configuration saved to ~/.deepl-cli/config.toml
#
# You're all set! Try: deepl translate "Hello world" --to ja
```

### Configuration File Format

```toml
# ~/.deepl-cli/config.toml

[auth]
api_key = "your-api-key-here"

[defaults]
source_lang = "en"
target_langs = ["es", "fr", "de"]
formality = "default"
preserve_formatting = true

[cache]
enabled = true
max_size = 1073741824  # 1GB in bytes
ttl = 2592000          # 30 days in seconds

[output]
format = "text"        # text|json|yaml|table
verbose = false
color = true

[watch]
debounce_ms = 500
auto_commit = false
pattern = "*.md"

[team]
org = ""
workspace = ""

[tui]
theme = "dark"         # dark|light|custom
mouse = true
```

### Project-level Configuration

```toml
# .deepl.toml (in project root)

[project]
name = "My Awesome Project"
version = "1.0.0"

[defaults]
source_lang = "en"
target_langs = ["es", "fr", "de", "ja"]
glossary = "tech-terms"

[paths]
source = "src/locales/en.json"
output = "src/locales/"

[watch]
enabled = true
pattern = "src/locales/en.json"
auto_commit = true

[batch]
parallel = 5
```

### Progress Indicators

```
# Translation in progress
Translating README.md to es, fr, de...
├─ es  ████████████████████████████░░  92% (4.2s)
├─ fr  ████████████████████████░░░░░░  75% (5.1s)
└─ de  ████████████░░░░░░░░░░░░░░░░░░  45% (3.8s)

# Batch translation
Batch translating 47 files...
█████████████████████████████░░░░░░░░  73% (34/47)
Estimated time remaining: 2m 15s

# Watch mode
[15:42:31] Watching src/locales/ for changes...
[15:43:02] ✓ en.json changed → translated to es, fr, de (1.2s)
[15:45:18] ✓ en.json changed → translated to es, fr, de (0.8s)
```

### Error Handling

```
# API errors
✗ Translation failed: Invalid API key
  → Run `deepl auth set-key YOUR_KEY` to configure authentication

# Rate limiting
⚠ Rate limit exceeded (429)
  → Retrying in 5 seconds... (attempt 2/3)

# File errors
✗ Cannot read file: docs/missing.md
  → File not found. Check the path and try again.

# Validation errors
✗ Invalid target language: xx
  → Supported languages: en, es, fr, de, ja, zh, ...
  → Run `deepl languages` to see all supported languages
```

### Output Formats

#### Text Format (default)

```bash
$ deepl translate "Hello world" --to ja

こんにちは世界
```

#### JSON Format

```bash
$ deepl translate "Hello world" --to ja --format json

{
  "text": "こんにちは世界",
  "detectedSourceLang": "en",
  "targetLang": "ja",
  "cached": false,
  "usage": {
    "characterCount": 11,
    "billableCharacters": 11
  }
}
```

#### Table Format

```bash
$ deepl translate "Hello world" --to es,fr,de --format table

┌────────┬─────────────────┬────────┬────────┐
│ Target │ Translation     │ Cached │ Chars  │
├────────┼─────────────────┼────────┼────────┤
│ es     │ Hola mundo      │ No     │ 11     │
│ fr     │ Bonjour le monde│ No     │ 11     │
│ de     │ Hallo Welt      │ Yes    │ 0      │
└────────┴─────────────────┴────────┴────────┘
```

---

## Configuration & Extensibility

### Plugin System (Future)

```typescript
// ~/.deepl-cli/plugins/my-plugin.js

module.exports = {
  name: 'my-plugin',
  version: '1.0.0',

  // Register custom commands
  commands: [
    {
      name: 'my-command',
      description: 'My custom command',
      options: [...],
      action: async (args, options) => {
        // Custom logic
      },
    },
  ],

  // Hook into lifecycle events
  hooks: {
    beforeTranslate: async (text, options) => {
      // Modify text before translation
      return text;
    },
    afterTranslate: async (result) => {
      // Post-process result
      return result;
    },
  },

  // Add custom formats
  formats: {
    'my-format': {
      parse: (content) => { /* ... */ },
      serialize: (content) => { /* ... */ },
    },
  },
};
```

### Git Hooks Integration ✅ IMPLEMENTED

```bash
# Install pre-commit hook
deepl hooks install pre-commit

# Install pre-push hook
deepl hooks install pre-push

# Check hook status
deepl hooks list

# Output:
# Git Hooks Status:
#
#   ✓ pre-commit      installed
#   ✗ pre-push        not installed

# Generated .git/hooks/pre-commit includes:
# - DeepL CLI marker for identification
# - Translation file validation logic
# - Customizable for project-specific workflows
# - Automatic backup of existing hooks
```

### CI/CD Integration

```yaml
# .github/workflows/translate.yml

name: Auto Translate

on:
  push:
    paths:
      - 'src/locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install DeepL CLI
        run: npm install -g deepl-cli

      - name: Translate
        env:
          DEEPL_API_KEY: ${{ secrets.DEEPL_API_KEY }}
        run: |
          deepl auth set-key $DEEPL_API_KEY
          deepl batch translate src/locales/en.json --targets es,fr,de

      - name: Commit translations
        run: |
          git config user.name "DeepL Bot"
          git config user.email "bot@deepl.com"
          git add src/locales/
          git commit -m "chore: update translations"
          git push
```

---

## Security & Privacy

### API Key Management

- **Secure storage**: Use system keychain (keytar) for API keys
- **Environment variables**: Support `DEEPL_API_KEY` env var
- **Never log**: Never log API keys or sensitive data
- **Encrypted config**: Encrypt sensitive config data at rest

### Data Privacy

- **No tracking**: Never send usage telemetry without explicit consent
- **Local caching**: All cached data stored locally, never sent to third parties
- **Clear warnings**: Warn users when data leaves their machine
- **GDPR compliant**: Follow DeepL's GDPR compliance guidelines

### Rate Limiting & Quotas

- **Respect limits**: Built-in rate limiting to respect DeepL API limits
- **Quota tracking**: Track and display remaining quota
- **Fail gracefully**: Handle quota exceeded errors gracefully
- **Cost warnings**: Warn before expensive operations

---

## Performance & Optimization

### Caching Strategy

1. **Translation cache**: Cache all translations locally (SQLite)
2. **TTL**: 30-day default TTL for cached entries
3. **Cache invalidation**: Smart invalidation based on content changes
4. **Size limits**: Configurable max cache size with LRU eviction

### Batch Processing

1. **Parallelization**: Configurable parallel request limit
2. **Request batching**: Batch multiple translations into single API calls
3. **Progress tracking**: Real-time progress indicators
4. **Error recovery**: Retry failed translations without restarting

### API Optimization

1. **Request deduplication**: Avoid duplicate API calls
2. **Connection pooling**: Reuse HTTP connections
3. **Compression**: Use gzip compression for API requests/responses
4. **Exponential backoff**: Smart retry logic with exponential backoff

---

## Roadmap & Milestones

### Phase 1: MVP (Month 1-2) - ✅ 100% Complete
- [x] Basic translation command
- [x] Configuration management
- [x] Local caching with LRU eviction
- [x] Error handling and validation
- [x] Preservation of code/variables
- [x] File translation with format preservation
- [x] Basic glossary support (create, list, show, delete, use)
- [x] Cache CLI commands (stats, clear, enable, disable)

### Phase 2: Advanced Features (Month 3-4) - ✅ 100% Complete
- [x] Context-aware translation
- [x] Batch processing with parallel translation
- [x] Watch mode with file watching
- [x] DeepL Write integration ✨ NEW
- [x] Git hooks integration ✨ NEW

### Phase 3: TUI & Collaboration (Month 5-6)
- [ ] Interactive TUI application
- [ ] Translation memory
- [ ] Team collaboration features
- [ ] Review workflows
- [ ] Shared glossaries

### Phase 4: Enterprise & Polish (Month 7-8)
- [ ] CI/CD integrations
- [ ] VS Code extension
- [ ] Plugin system
- [ ] Performance optimizations
- [ ] Comprehensive documentation
- [ ] Tutorial videos

### Future Ideas
- Desktop app (Electron)
- Browser extension
- Mobile app integration
- AI-powered quality scoring
- Automatic glossary building
- Translation analytics dashboard
- Multi-user real-time collaboration
- Integration with CMS platforms
- Localization workflow automation

---

## Success Criteria

### Technical Excellence
- ⚡ Fast: <100ms overhead per translation
- 🛡️ Reliable: 99.9% uptime, robust error handling
- 🎨 Beautiful: Modern, intuitive CLI/TUI experience
- 📦 Lightweight: <50MB installed size
- 🔧 Maintainable: Clean architecture, well-documented code

### User Adoption
- 🌟 10,000+ GitHub stars
- 📥 100,000+ downloads
- 👥 100+ contributors
- 💬 Active community (Discord/Forum)
- 📚 Comprehensive documentation

### Business Impact
- 💼 Adopted by major open source projects
- 🏢 Enterprise customers
- 🚀 Featured on Product Hunt, Hacker News
- 📰 Mentioned in tech blogs and newsletters

---

## Appendix

### Supported Languages

DeepL API supports 30+ languages:
- Arabic (ar)
- Bulgarian (bg)
- Chinese - Simplified (zh)
- Czech (cs)
- Danish (da)
- Dutch (nl)
- English (en)
- Estonian (et)
- Finnish (fi)
- French (fr)
- German (de)
- Greek (el)
- Hungarian (hu)
- Indonesian (id)
- Italian (it)
- Japanese (ja)
- Korean (ko)
- Latvian (lv)
- Lithuanian (lt)
- Norwegian (nb)
- Polish (pl)
- Portuguese (pt)
- Romanian (ro)
- Russian (ru)
- Slovak (sk)
- Slovenian (sl)
- Spanish (es)
- Swedish (sv)
- Turkish (tr)
- Ukrainian (uk)

### File Format Support

- **Text**: .txt, .md
- **Documents**: .pdf, .docx, .pptx
- **Web**: .html, .htm, .xml
- **i18n**: .json, .yaml, .yml, .po, .pot
- **Code**: Preserves code blocks in markdown

### API Rate Limits

| Plan | Requests/sec | Characters/month |
|------|-------------|------------------|
| Free | 5 | 500,000 |
| Pro (Starter) | 10 | 1,000,000 |
| Pro (Advanced) | 20 | 10,000,000 |
| Pro (Ultimate) | 50 | 100,000,000 |

### External Resources

- [DeepL API Documentation](https://www.deepl.com/docs-api)
- [DeepL API Node.js SDK](https://github.com/DeepLcom/deepl-node)
- [CLI Guidelines](https://clig.dev/)
- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [Commander.js](https://github.com/tj/commander.js)

---

**End of Design Document**

*This document is a living document and will be updated as the project evolves.*
