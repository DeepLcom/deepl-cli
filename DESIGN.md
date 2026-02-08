# DeepL CLI: Comprehensive Design Document

**Version:** 2.4
**Date:** February 2026
**Status:** Phase 2 Complete - v0.10.0 Released

---

## Current Implementation Status

**Version**: v0.10.0 (February 2026)
**Phase**: 2 (Advanced Features) - **COMPLETE**
**Test Suite**: 2578 tests, 100% pass rate
**Code Coverage**: ~91% overall (excellent integration/e2e coverage)
**Production Readiness**: High - CLI is stable and feature-complete for v1.0.0

### What's Implemented (v0.1.0 - v0.10.0)

- **Core Translation** - Text, file, directory, and document translation with 121 languages
- **DeepL Write API** - Grammar and style enhancement with 10 language codes (de, en, en-GB, en-US, es, fr, it, pt, pt-BR, pt-PT)
- **Watch Mode** - Real-time file monitoring with auto-translation
- **Git Hooks** - pre-commit, pre-push, commit-msg, and post-commit hook management
- **Glossary Management** - v3 API with multilingual glossary support
- **Document Translation** - PDF, DOCX, PPTX, XLSX, HTML, JPEG, PNG with format conversion
- **Batch Processing** - Parallel translation with automatic request optimization
- **Caching** - SQLite-based cache with LRU eviction and lazy instantiation
- **XML/HTML Tag Handling** - Advanced control over tag translation with v1/v2 versioning
- **Table Output Format** - Structured output for multi-language comparisons
- **Cost Transparency** - Track billed characters for budget planning
- **Semantic Exit Codes** - Intelligent exit codes (0-7) for CI/CD integration
- **Global Options** - `--quiet`, `--config` for flexible CLI usage
- **Custom Instructions** - Domain-specific translation guidance
- **Style Rules** - Pre-configured style rule application (Pro API)
- **Admin API** - API key management and organization usage analytics
- **Language Registry** - Centralized registry of 121 language codes (32 core + 7 regional + 82 extended)

### What's Deferred

- **TUI (Terminal UI)** - Deferred indefinitely (not required for v1.0.0)
- **Translation Memory** - Future enhancement
- **Team Collaboration** - Future enhancement
- **Plugin System** - Future enhancement

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

**DeepL CLI** is a next-generation command-line interface for the DeepL API that goes beyond basic translation. It integrates DeepL's Write API, and seamlessly fits into developer workflows with real-time watching, CI/CD integration, and git hooks.

### What Makes It Unique

- **First CLI to integrate DeepL Write API** - Grammar, style, and tone enhancement
- **Developer-first design** - Watch modes, Git hooks, CI/CD integration
- **121 languages** - Core, regional, and extended language support
- **Intelligent workflows** - Context-aware translation, caching, batch processing
- **Admin capabilities** - API key management and organization usage analytics

---

## Vision & Goals

### Primary Vision

Create the most comprehensive, developer-friendly translation CLI that becomes the standard tool for localization, documentation, and multilingual content workflows.

### Core Goals

1. **Productivity**: Reduce translation workflow time by 80% through automation
2. **Quality**: Leverage DeepL's next-gen LLM + Write API for superior output
3. **Developer Experience**: Seamless integration into existing dev workflows
4. **CI/CD Ready**: Semantic exit codes, JSON output, and scripting support

---

## Feature Overview

### Phase 1: Core Features (MVP)

#### 1. Basic Translation

```bash
# Simple text translation
deepl translate "Hello world" --to ja

# From stdin
echo "Hello world" | deepl translate --to ja
```

#### 2. File Translation

```bash
# Single file
deepl translate README.md --to es --output README.es.md

# Multiple formats (preserves formatting)
deepl translate docs/*.md --to fr,de,ja

# Document translation (PDF, DOCX, PPTX, XLSX, HTML, JPEG, PNG)
deepl translate document.pdf --to es --output documento.pdf
deepl translate presentation.pptx --to de --output presentation.de.pptx
deepl translate report.xlsx --to fr --output report.fr.xlsx

# Document format conversion
deepl translate document.docx --to es --output document.es.pdf --output-format pdf
```

#### 3. Configuration Management

```bash
# Set API key
deepl auth set-key YOUR_API_KEY

# Configure defaults
deepl config set defaults.formality more
deepl config set output.format json

# List configuration
deepl config list
```

#### 4. Glossary Management

```bash
# Create glossary (v3 API)
deepl glossary create tech-terms en de glossary.csv

# List glossaries with multilingual support
deepl glossary list

# Show glossary details
deepl glossary show tech-terms

# Get entries
deepl glossary entries tech-terms
deepl glossary entries multilingual-terms --target es

# CRUD operations
deepl glossary add-entry tech-terms "API" "API"
deepl glossary update-entry tech-terms "API" "REST-API"
deepl glossary remove-entry tech-terms "obsolete"
deepl glossary rename tech-terms "technical-terms"

# Update name and/or dictionary in a single request
deepl glossary update my-terms --name "Updated Terms" --target-lang de --file updated.tsv

# Replace all entries in a dictionary from file
deepl glossary replace-dictionary multilingual-terms es entries.tsv

# Delete language pair from multilingual glossary
deepl glossary delete-dictionary multilingual-terms es

# Delete entire glossary
deepl glossary delete tech-terms

# List supported language pairs
deepl glossary languages

# Use glossary in translation
deepl translate "Our API uses REST" --to de --glossary tech-terms
```

### Phase 2: Advanced Features

#### 5. DeepL Write Integration

```bash
# Improve writing with grammar/style suggestions
deepl write "Your text here" --tone business --lang en-US

# With writing style
deepl write "Your text here" --style business --lang en-US

# Auto-detect language (--lang is optional)
deepl write "Your text here"

# Show alternative improvements
deepl write "Your text here" --lang en-US --alternatives

# Interactive mode - choose from multiple suggestions
deepl write "Your text here" --interactive --lang en-US

# Fix grammar in files
deepl write report.txt --fix --backup --lang en-US

# Preview suggestions with diff
deepl write document.txt --diff --tone diplomatic --lang en-US

# Check if text needs improvement (exit code 0 if no changes)
deepl write "Your text" --check --style business --lang en-US

# File input with output
deepl write essay.md --output essay-improved.md --lang en-US

# Edit file in place
deepl write essay.md --in-place --lang en-US

# Available languages: de, en, en-GB, en-US, es, fr, it, pt, pt-BR, pt-PT
# Writing styles: simple, business, academic, casual (+ prefer_* variants)
# Tones: enthusiastic, friendly, confident, diplomatic (+ prefer_* variants)
```

**Features**:

- Grammar and style improvement
- Writing style customization (simple, business, academic, casual)
- Tone customization (enthusiastic, friendly, confident, diplomatic)
- Multiple improvement alternatives
- Support for 10 language codes (de, en, en-GB, en-US, es, fr, it, pt, pt-BR, pt-PT)
- Language auto-detection when `--lang` is omitted
- Full API integration with DeepL Write v2 endpoint
- File input/output support (--output, --in-place)
- Diff view (--diff)
- Check mode (--check)
- Auto-fix mode (--fix, --backup)
- Interactive mode (--interactive)

#### 6. Watch Mode & Auto-Translation

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

**Features**:

- Real-time file/directory monitoring
- Configurable debouncing (default 300ms)
- Glob pattern filtering
- Multiple target languages
- Auto-commit to git (optional)
- Custom output directories
- Statistics tracking

#### 7. Git Hooks Integration

```bash
# Install git hooks
deepl hooks install pre-commit
deepl hooks install pre-push
deepl hooks install commit-msg
deepl hooks install post-commit

# Check hook status
deepl hooks list

# Show hook path
deepl hooks path pre-commit

# Uninstall hooks
deepl hooks uninstall pre-commit
```

**Features**:

- Four hook types: pre-commit, pre-push, commit-msg, post-commit
- Pre-commit hook for translation file validation
- Pre-push hook for full validation before push
- Commit-msg hook for commit message format validation (Conventional Commits via commitlint)
- Post-commit hook for feedback and CHANGELOG reminders
- Automatic backup of existing hooks
- Safe installation/uninstallation
- Hook status checking
- Customizable shell scripts

#### 8. Context-Aware Translation (v0.2.0)

```bash
# Preserve code blocks and variables
deepl translate README.md --preserve-code

# Inject context for better quality
deepl translate app.json --context "E-commerce checkout flow" --to es

# Formality levels
deepl translate "How are you?" --to de --formality more

# Sentence splitting control
deepl translate "Line 1\nLine 2" --to es --split-sentences nonewlines

# Tag handling for XML/HTML
deepl translate "<p>Hello</p>" --to es --tag-handling xml

# Custom instructions for domain-specific translation
deepl translate "text" --to de --custom-instruction "Use formal German"

# Style rules (Pro API)
deepl translate "text" --to de --style-id <uuid>
```

#### 9. Batch Processing (v0.2.0, optimized v0.4.0)

```bash
# Translate entire directories with progress
deepl translate docs/ --to es,fr,de --output translations/

# With pattern filtering
deepl translate docs/ --to es --pattern "*.md" --concurrency 10

# Parallel translation with configurable concurrency
deepl translate src/ --to ja --recursive --concurrency 5
```

#### 10. Developer Workflow Integration

```bash
# JSON output for CI/CD
deepl translate "Hello" --to es --format json

# Table output for multi-language comparison
deepl translate "Hello" --to es,fr,de --format table

# Cost transparency
deepl translate "Hello" --to es --show-billed-characters

# Model type selection
deepl translate "Hello" --to es --model-type quality_optimized

# Custom API endpoint
deepl translate "Hello" --to es --api-url https://api-free.deepl.com

# Proxy configuration (automatic via environment)
# HTTP_PROXY, HTTPS_PROXY, NO_PROXY
```

#### 11. Style Rules (v0.8.0, Pro API)

```bash
# List style rules
deepl style-rules list

# Detailed view with configured rules and custom instructions
deepl style-rules list --detailed

# Paginated output
deepl style-rules list --page 1 --page-size 10

# JSON output
deepl style-rules list --format json

# Apply style rule to translation
deepl translate "text" --to de --style-id <uuid>
```

#### 12. Admin API (v0.8.0)

```bash
# List all API keys
deepl admin keys list

# Create a new API key
deepl admin keys create --label "CI/CD Key"

# Deactivate an API key (permanent)
deepl admin keys deactivate <key-id>

# Rename an API key
deepl admin keys rename <key-id> "New Label"

# Set character usage limit
deepl admin keys set-limit <key-id> 1000000
deepl admin keys set-limit <key-id> unlimited

# View organization usage analytics
deepl admin usage --start 2026-01-01 --end 2026-01-31
deepl admin usage --start 2026-01-01 --end 2026-01-31 --group-by key_and_day

# JSON output
deepl admin keys list --format json
deepl admin usage --start 2026-01-01 --end 2026-01-31 --format json
```

---

## Architecture

### High-Level Architecture

```
+-------------------------------------------------------------+
|                     CLI Interface                            |
|  (Commander.js, Argument Validation, Help System)            |
|  src/cli/index.ts + 12 register-*.ts command modules         |
+-----------------------------+-------------------------------+
                              |
+-----------------------------+-------------------------------+
|                  Command Handler Layer                        |
|                                                              |
|  translate.ts  write.ts  glossary.ts  hooks.ts  watch.ts     |
|  auth.ts  config.ts  cache.ts  usage.ts  languages.ts       |
|  style-rules.ts  admin.ts                                    |
+-----------------------------+-------------------------------+
                              |
+-----------------------------+-------------------------------+
|                   Service Layer                              |
|                                                              |
|  TranslationService    WriteService       GlossaryService    |
|  DocumentTranslation   FileTranslation    BatchTranslation   |
|  WatchService          GitHooksService    CacheService       |
+-----------------------------+-------------------------------+
                              |
+-----------------------------+-------------------------------+
|              DeepL API Client Layer (Facade Pattern)         |
|                                                              |
|  DeepLClient (facade)                                        |
|    +-- TranslationClient   +-- WriteClient                   |
|    +-- GlossaryClient      +-- DocumentClient                |
|    +-- StyleRulesClient    +-- AdminClient                   |
|                                                              |
|  HttpClient (Axios, Retry, Error Classification)             |
+-----------------------------+-------------------------------+
                              |
+-----------------------------+-------------------------------+
|                  Storage Layer                                |
|                                                              |
|  CacheService (SQLite)     ConfigService (JSON)              |
|  ~/.deepl-cli/cache.db     ~/.deepl-cli/config.json          |
+-------------------------------------------------------------+
```

### Component Responsibilities

#### CLI Interface Layer

- **Command Parser**: Commander.js-based CLI argument parsing with `.choices()` validation
- **Help System**: Auto-generated help with usage examples via `.addHelpText()`
- **Output Formatter**: Format output (text, JSON, table)
- **Modular Registration**: 12 `register-*.ts` modules with lazy-loaded dependencies

#### Command Handler Layer

- **Command Handlers**: Business logic for each CLI command
- **Lazy Loading**: Dependencies imported dynamically to minimize startup time

#### Service Layer

- **TranslationService**: Core translation logic with caching and preservation
- **WriteService**: Grammar/style/tone improvement via Write API with caching
- **GlossaryService**: Glossary CRUD and multilingual glossary operations (v3 API)
- **DocumentTranslationService**: PDF, DOCX, PPTX, XLSX, HTML, JPEG, PNG translation
- **FileTranslationService**: Text file translation with smart routing (text API vs document API)
- **BatchTranslationService**: Parallel translation processing with concurrency control
- **CacheService**: Translation and write caching with LRU eviction (SQLite, lazy instantiation)
- **WatchService**: File watching and auto-translation with debouncing
- **GitHooksService**: Git hook lifecycle management (4 hook types)
- **VoiceService**: Real-time speech translation via Voice API WebSocket streaming

#### API Client Layer

- **DeepLClient**: Facade over domain-specific clients, preserving a unified public API
- **TranslationClient**: `/v2/translate`, `/v2/usage`, `/v2/languages` endpoints
- **GlossaryClient**: `/v3/glossaries` endpoints (multilingual)
- **DocumentClient**: `/v2/document` endpoints (upload, status, download)
- **WriteClient**: `/v2/write` endpoint
- **StyleRulesClient**: `/v2/style-rules` endpoint (Pro)
- **AdminClient**: `/v2/admin/keys`, `/v2/admin/analytics` endpoints
- **VoiceClient**: `/v3/voice/realtime` REST endpoint + WebSocket streaming (always uses Pro URL)
- **HttpClient**: Axios-based HTTP with retry, exponential backoff, connection pooling, and typed error classification

#### Storage Layer

- **CacheService**: Local translation and write cache (`~/.deepl-cli/cache.db`, SQLite)
- **ConfigService**: User configuration (`~/.deepl-cli/config.json`, JSON with 0o600 permissions)

---

## CLI Commands & Interface

### Command Structure

```
deepl [GLOBAL_OPTIONS] <COMMAND> [COMMAND_OPTIONS] [ARGS]
```

### Global Options

```
--version, -V        Show version information
--help, -h           Show help message
--quiet, -q          Suppress all non-essential output (errors and results only)
--config, -c FILE    Use alternate configuration file (must be .json, no symlinks)
```

### Command Hierarchy

```
deepl
+-- translate [TEXT|FILE...] --to LANGS      # Translate text/files
+-- write <TEXT|FILE> [--lang LANG]          # Improve writing
+-- glossary                                 # Glossary management (v3 API)
|   +-- create NAME SRC TGT FILE            # Create glossary from TSV/CSV
|   +-- list                                # List all glossaries
|   +-- show NAME-OR-ID                     # Show glossary details
|   +-- entries NAME-OR-ID [--target LANG]  # Get glossary entries
|   +-- delete NAME-OR-ID [-y]              # Delete glossary
|   +-- languages                           # List supported language pairs
|   +-- add-entry NAME-OR-ID SRC TGT       # Add entry
|   +-- update-entry NAME-OR-ID SRC TGT    # Update entry
|   +-- remove-entry NAME-OR-ID SRC        # Remove entry
|   +-- rename NAME-OR-ID NEW_NAME         # Rename glossary
|   +-- update NAME-OR-ID [opts]           # Update name and/or dictionary in one request
|   +-- replace-dictionary NAME-OR-ID LANG FILE  # Replace dictionary entries from file
|   +-- delete-dictionary NAME-OR-ID LANG  # Delete language pair
+-- watch PATH --targets LANGS              # Watch and auto-translate
+-- hooks                                   # Git hooks management
|   +-- install <hook-type>                 # pre-commit|pre-push|commit-msg|post-commit
|   +-- uninstall <hook-type>
|   +-- list
|   +-- path <hook-type>
+-- style-rules                             # Style rules (Pro API)
|   +-- list [--detailed] [--format json]
+-- admin                                   # Admin API (requires admin key)
|   +-- keys
|   |   +-- list [--format json]
|   |   +-- create [--label LABEL]
|   |   +-- deactivate <key-id> [-y]
|   |   +-- rename <key-id> <label>
|   |   +-- set-limit <key-id> <chars>
|   +-- usage --start DATE --end DATE
+-- cache                                   # Cache management
|   +-- stats
|   +-- clear [-y]
|   +-- enable [--max-size SIZE]
|   +-- disable
+-- auth                                    # Authentication
|   +-- set-key [KEY] [--from-stdin]
|   +-- show
|   +-- clear
+-- config                                  # Configuration
|   +-- set KEY VALUE
|   +-- get [KEY]
|   +-- list
|   +-- reset [-y]
+-- usage                                   # API usage statistics
+-- languages [-s|--source] [-t|--target]   # List supported languages (121 total)
```

### Detailed Command Specifications

#### `translate` - Core Translation Command

```bash
deepl translate [OPTIONS] [TEXT|FILE...]

OPTIONS:
  --to, -t LANGS              Target language(s) (comma-separated) [required]
  --from, -f LANG             Source language (auto-detect if omitted)
  --output, -o PATH           Output file path or directory
  --glossary NAME-OR-ID       Use glossary by name or ID
  --formality LEVEL           Formality level (default|more|less|prefer_more|prefer_less)
  --preserve-formatting       Preserve line breaks and whitespace formatting
  --preserve-code             Preserve code blocks and variables during translation
  --context TEXT              Additional context to improve translation quality
  --split-sentences MODE      Sentence splitting (on|off|nonewlines)
  --tag-handling MODE         Tag handling for XML/HTML (xml|html)
  --tag-handling-version VER  Tag handling version (v1|v2)
  --model-type TYPE           Model type (quality_optimized|prefer_quality_optimized|latency_optimized)
  --show-billed-characters    Display actual billed character count
  --enable-minification       Enable PPTX/DOCX minification
  --outline-detection BOOL    Control automatic XML structure detection (true/false)
  --splitting-tags TAGS       Comma-separated XML tags that split sentences
  --non-splitting-tags TAGS   Comma-separated XML tags for non-translatable text
  --ignore-tags TAGS          Comma-separated XML tags with content to ignore
  --output-format FORMAT      Convert document format (pdf|docx|pptx|xlsx|html)
  --recursive                 Process subdirectories recursively (default: true)
  --pattern PATTERN           Glob pattern for file filtering (e.g., "*.md")
  --concurrency N             Number of parallel translations (default: 5)
  --custom-instruction TEXT   Custom instruction (repeatable, max 10, max 300 chars each)
  --style-id UUID             Style rule ID (Pro API only)
  --no-cache                  Bypass cache for this translation
  --format FORMAT             Output format (json|table, default: plain text)
  --api-url URL               Custom API endpoint

EXAMPLES:
  deepl translate "Hello world" --to ja
  deepl translate README.md --to fr --output README.fr.md
  deepl translate ./docs --to de,es,fr --pattern "*.md"
  echo "Hello" | deepl translate --to ja
```

#### `write` - Writing Enhancement Command

```bash
deepl write [OPTIONS] <TEXT|FILE>

OPTIONS:
  --lang, -l LANG            Target language (de, en, en-GB, en-US, es, fr, it, pt, pt-BR, pt-PT)
                              Omit to auto-detect language.
  --style, -s STYLE          Writing style (simple|business|academic|casual|prefer_*)
  --tone, -t TONE            Tone (enthusiastic|friendly|confident|diplomatic|prefer_*)
  --alternatives, -a         Show all alternative improvements
  --output, -o FILE          Write improved text to file
  --in-place                 Edit file in place (use with file input)
  --interactive, -i          Interactive mode - choose from multiple suggestions
  --diff, -d                 Show diff between original and improved text
  --check, -c                Check if text needs improvement (exit code 0 if no changes)
  --fix, -f                  Automatically fix file in place
  --backup, -b               Create backup file before fixing (use with --fix)
  --format FORMAT            Output format (json|table, default: plain text)
  --no-cache                 Bypass cache for this request

NOTES:
  - Cannot specify both --style and --tone in a single request
  - style and tone options support "prefer_*" variants for suggestions

EXAMPLES:
  deepl write "Their going to the store" --lang en-US
  deepl write report.txt --check
  deepl write essay.md --fix --backup
  deepl write "Make this formal" --style business --lang en
```

#### `watch` - Watch Mode Command

```bash
deepl watch [OPTIONS] <PATH>

OPTIONS:
  --targets, -t LANGS        Target languages (comma-separated) [required]
  --from, -f LANG            Source language (auto-detect if not specified)
  --output, -o DIR            Output directory
  --formality LEVEL          Formality level (default|more|less|prefer_more|prefer_less)
  --preserve-code            Preserve code blocks and variables
  --preserve-formatting      Preserve line breaks and whitespace
  --pattern GLOB             File pattern to watch (e.g., "*.md")
  --debounce MS              Debounce delay in milliseconds (default: 300)
  --glossary NAME-OR-ID      Use glossary by name or ID
  --auto-commit              Auto-commit translations to git

EXAMPLES:
  deepl watch ./docs --targets es,fr
  deepl watch ./src/i18n --targets de --pattern "*.json" --auto-commit
  deepl watch README.md --targets ja --debounce 500
```

#### `hooks` - Git Hooks Management

```bash
deepl hooks <SUBCOMMAND>

SUBCOMMANDS:
  install <hook-type>        Install a git hook
  uninstall <hook-type>      Uninstall a git hook
  list                       List all hooks and their status
  path <hook-type>           Show the path to a hook file

HOOK TYPES:
  pre-commit                 Validates translation files before commit
  pre-push                   Validates all translations before push
  commit-msg                 Validates commit message format (Conventional Commits)
  post-commit                Post-commit feedback and CHANGELOG reminders

EXAMPLES:
  deepl hooks install pre-commit
  deepl hooks install commit-msg
  deepl hooks list
  deepl hooks path pre-commit
  deepl hooks uninstall pre-commit

FEATURES:
  - Automatic backup of existing hooks
  - Safe installation without overwriting custom hooks
  - Hook validation with DeepL marker
  - Customizable shell scripts for project workflows
```

---

## Technical Stack

### Language & Runtime

**TypeScript with Node.js**

**Rationale:**

- **Rapid development**: Rich ecosystem, excellent tooling
- **TypeScript**: Type safety, better DX, easier maintenance
- **Cross-platform**: Native support for Windows, macOS, Linux
- **ESM**: Full ES module support (`"type": "module"`)

### Core Dependencies

```json
{
  "runtime": {
    "node": ">=20.0.0",
    "typescript": "^5.3.0"
  },
  "cli": {
    "commander": "^12.1.0",
    "inquirer": "^12.2.0",
    "chalk": "^5.3.0",
    "ora": "^8.1.1",
    "cli-table3": "^0.6.5"
  },
  "api": {
    "axios": "^1.7.9",
    "form-data": "^4.0.4"
  },
  "storage": {
    "better-sqlite3": "^11.7.0"
  },
  "file": {
    "chokidar": "^4.0.3",
    "fast-glob": "^3.3.3",
    "minimatch": "^9.0.5"
  },
  "utils": {
    "p-limit": "^6.1.0"
  }
}
```

### Project Structure

```
deepl-cli/
+-- src/
|   +-- cli/
|   |   +-- commands/              # Command handlers + registration modules
|   |   |   +-- register-translate.ts
|   |   |   +-- register-write.ts
|   |   |   +-- register-watch.ts
|   |   |   +-- register-hooks.ts
|   |   |   +-- register-glossary.ts
|   |   |   +-- register-cache.ts
|   |   |   +-- register-auth.ts
|   |   |   +-- register-config.ts
|   |   |   +-- register-usage.ts
|   |   |   +-- register-languages.ts
|   |   |   +-- register-style-rules.ts
|   |   |   +-- register-admin.ts
|   |   |   +-- translate.ts       # TranslateCommand
|   |   |   +-- write.ts           # WriteCommand
|   |   |   +-- watch.ts           # WatchCommand
|   |   |   +-- hooks.ts           # HooksCommand
|   |   |   +-- glossary.ts        # GlossaryCommand
|   |   |   +-- cache.ts           # CacheCommand
|   |   |   +-- auth.ts            # AuthCommand
|   |   |   +-- config.ts          # ConfigCommand
|   |   |   +-- usage.ts           # UsageCommand
|   |   |   +-- languages.ts       # LanguagesCommand
|   |   |   +-- style-rules.ts     # StyleRulesCommand
|   |   |   +-- admin.ts           # AdminCommand
|   |   +-- index.ts               # CLI entry point
|   |
|   +-- services/
|   |   +-- translation.ts         # TranslationService
|   |   +-- write.ts               # WriteService
|   |   +-- file-translation.ts    # FileTranslationService
|   |   +-- document-translation.ts # DocumentTranslationService
|   |   +-- batch-translation.ts   # BatchTranslationService
|   |   +-- glossary.ts            # GlossaryService
|   |   +-- watch.ts               # WatchService
|   |   +-- git-hooks.ts           # GitHooksService
|   |
|   +-- api/
|   |   +-- deepl-client.ts        # DeepLClient (facade)
|   |   +-- http-client.ts         # HttpClient (Axios, retry, errors)
|   |   +-- translation-client.ts  # TranslationClient
|   |   +-- write-client.ts        # WriteClient
|   |   +-- glossary-client.ts     # GlossaryClient
|   |   +-- document-client.ts     # DocumentClient
|   |   +-- style-rules-client.ts  # StyleRulesClient
|   |   +-- admin-client.ts        # AdminClient
|   |
|   +-- storage/
|   |   +-- cache.ts               # CacheService (SQLite)
|   |   +-- config.ts              # ConfigService (JSON)
|   |
|   +-- data/
|   |   +-- language-registry.ts   # Centralized language registry (121 languages)
|   |
|   +-- utils/
|   |   +-- logger.ts              # Logger (respects --quiet)
|   |   +-- exit-codes.ts          # ExitCode enum + classification
|   |   +-- errors.ts              # Typed error classes (AuthError, RateLimitError, etc.)
|   |   +-- formatters.ts          # Output formatting utilities
|   |   +-- safe-read-file.ts      # Symlink-safe file reading
|   |   +-- validate-url.ts        # URL validation (HTTPS enforcement)
|   |   +-- parse-size.ts          # Size string parsing (1G, 500MB)
|   |   +-- confirm.ts             # Interactive confirmation prompts
|   |
|   +-- types/
|   |   +-- api.ts                 # API types (TranslationOptions, WriteOptions, etc.)
|   |   +-- config.ts              # DeepLConfig type
|   |   +-- common.ts              # Language, Formality, OutputFormat types
|   |   +-- glossary.ts            # Glossary types
|   |   +-- index.ts               # Re-exports
|   |
|   +-- index.ts                   # Main entry point
|
+-- tests/
|   +-- unit/
|   +-- integration/
|   +-- e2e/
|
+-- docs/
|   +-- API.md                     # Complete API reference
|
+-- examples/
|   +-- 01-basic-translation.sh
|   +-- 02-file-translation.sh
|   +-- ...
|   +-- 23-admin.sh
|   +-- run-all.sh
|
+-- package.json
+-- tsconfig.json
```

---

## Implementation Details

### 1. Translation Service

**Actual implementation**: See `src/services/translation.ts`

The TranslationService takes a `DeepLClient`, `ConfigService`, and `CacheService` as constructor arguments. It provides:

- Single text translation with caching
- Multi-target translation with concurrency limiting (5 concurrent)
- Preservation of code blocks and variables via placeholder substitution
- Input validation (128 KiB byte limit)
- Cache key generation from text + options hash

### 2. Write Service

**Actual implementation**: See `src/services/write.ts`

```typescript
export class WriteService {
  constructor(client: DeepLClient, config: ConfigService, cache?: CacheService) { ... }

  async improve(text: string, options: WriteOptions, serviceOptions?: WriteServiceOptions): Promise<WriteImprovement[]>
  async getBestImprovement(text: string, options: WriteOptions, serviceOptions?: WriteServiceOptions): Promise<WriteImprovement>
}
```

**Key Features**:

- Support for 10 language codes (de, en, en-GB, en-US, es, fr, it, pt, pt-BR, pt-PT)
- Language auto-detection when lang is omitted
- Writing styles: simple, business, academic, casual (+ prefer\_\* variants)
- Tones: enthusiastic, friendly, confident, diplomatic (+ prefer\_\* variants)
- Cannot specify both style and tone in one request
- Returns multiple improvement alternatives
- SHA-256 keyed caching with `write:` prefix (shared SQLite DB with translations)
- Cache bypass via `--no-cache` flag or `skipCache` service option

### 3. Watch Service

**Actual implementation**: See `src/services/watch.ts`

The WatchService uses `chokidar` for file system monitoring with debouncing, glob pattern filtering, and optional git auto-commit on changes.

### 4. Git Hooks Service

**Actual implementation**: See `src/services/git-hooks.ts`

```typescript
export type HookType = 'pre-commit' | 'pre-push' | 'commit-msg' | 'post-commit';

export class GitHooksService {
  constructor(gitDir: string)
  install(hookType: HookType): void
  uninstall(hookType: HookType): void
  isInstalled(hookType: HookType): boolean
  list(): HookStatus
  getHookPath(hookType: HookType): string
  static findGitRoot(startPath?: string): string | null
}
```

**Key Features**:

- Support for four hook types: pre-commit, pre-push, commit-msg, post-commit
- Automatic backup of existing hooks
- Safe installation without overwriting custom hooks
- Hook validation with DeepL marker comment (`# DeepL CLI Hook`)
- Automatic .git directory detection
- Graceful error handling for non-git repositories

**Hook Scripts Generated**:

- **pre-commit**: Validates translation files before commit
- **pre-push**: Validates all translations before push
- **commit-msg**: Validates commit message format via commitlint
- **post-commit**: Provides commit-type-specific feedback and CHANGELOG reminders

### 5. Cache Service

**Actual implementation**: See `src/storage/cache.ts`

SQLite-based cache for translations and write improvements with:

- LRU eviction when cache exceeds max size (default 1 GB)
- O(1) in-memory size tracking
- Lazy instantiation (database not opened until first cache-using command)
- Singleton pattern via `CacheService.getInstance()`
- 30-day default TTL
- CLI commands: `cache stats`, `cache clear`, `cache enable`, `cache disable`

### 6. API Client Architecture

**Actual implementation**: See `src/api/`

The API client uses a **facade pattern**. `DeepLClient` provides a unified interface, delegating to 6 domain-specific clients:

- `TranslationClient` - text translation, usage, languages
- `GlossaryClient` - glossary CRUD (v3 multilingual API)
- `DocumentClient` - document upload, status polling, download
- `WriteClient` - text improvement
- `StyleRulesClient` - style rule listing (Pro)
- `AdminClient` - API key management, usage analytics

All clients share `HttpClient` for Axios-based HTTP with:

- Exponential backoff retry
- Typed error classification (AuthError, RateLimitError, QuotaError, NetworkError)
- X-Trace-ID tracking for debugging
- Connection pooling (10 sockets)
- HTTPS enforcement

---

## User Experience

### Installation & Setup

#### Installation

```bash
# npm (recommended)
npm install -g deepl-cli

# From source
git clone https://git.deepl.dev/hack-projects/deepl-cli.git
cd deepl-cli
npm install
npm run build
npm link
```

#### First-time Setup

```bash
# Set your API key
deepl auth set-key YOUR_API_KEY

# Or pipe from stdin (avoids shell history)
echo "YOUR_API_KEY" | deepl auth set-key --from-stdin

# Verify
deepl auth show
# API Key: YOUR...KEY

# Test it
deepl translate "Hello world" --to ja
```

### Configuration File Format

```json
// ~/.deepl-cli/config.json
{
  "auth": {
    "apiKey": "your-api-key-here"
  },
  "api": {
    "baseUrl": "https://api.deepl.com",
    "usePro": true
  },
  "defaults": {
    "sourceLang": null,
    "targetLangs": [],
    "formality": "default",
    "preserveFormatting": true
  },
  "cache": {
    "enabled": true,
    "maxSize": 1073741824,
    "ttl": 2592000
  },
  "output": {
    "format": "text",
    "verbose": false,
    "color": true
  },
  "watch": {
    "debounceMs": 500,
    "autoCommit": false,
    "pattern": "*.md"
  },
  "team": {
    "org": null,
    "workspace": null
  }
}
```

Configuration is managed via `deepl config` commands:

```bash
deepl config set api.usePro true
deepl config set defaults.formality more
deepl config get auth.apiKey
deepl config list
deepl config reset
```

### Error Handling

```
# API errors
Error: Authentication failed (403)
  Run: deepl auth set-key <your-api-key>

# Rate limiting
Error: Rate limit exceeded (429)
  Retrying in 5 seconds... (attempt 2/3)

# File errors
Error: File not found: docs/missing.md

# Validation errors
Error: Invalid target language: xx
  Run: deepl languages to see all supported languages
```

### Exit Codes

| Code | Name         | Description                               | Retryable |
| ---- | ------------ | ----------------------------------------- | --------- |
| 0    | Success      | Operation completed successfully          | -         |
| 1    | GeneralError | Unclassified error                        | No        |
| 2    | AuthError    | Invalid API key                           | No        |
| 3    | RateLimit    | Rate limit exceeded (429)                 | Yes       |
| 4    | QuotaError   | Character quota exceeded                  | No        |
| 5    | NetworkError | Timeout, connection refused, 503          | Yes       |
| 6    | InvalidInput | Missing arguments, unsupported format     | No        |
| 7    | ConfigError  | Invalid configuration file                | No        |

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

+--------+-----------------+--------+--------+
| Target | Translation     | Cached | Chars  |
+--------+-----------------+--------+--------+
| es     | Hola mundo      | No     | 11     |
| fr     | Bonjour le monde| No     | 11     |
| de     | Hallo Welt      | Yes    | 0      |
+--------+-----------------+--------+--------+
```

---

## Configuration & Extensibility

### Git Hooks Integration

```bash
# Install hooks
deepl hooks install pre-commit
deepl hooks install commit-msg

# Check hook status
deepl hooks list

# Output:
# Git Hooks Status:
#
#   pre-commit      installed
#   pre-push        not installed
#   commit-msg      installed
#   post-commit     not installed

# Generated hooks include:
# - DeepL CLI marker for identification
# - Hook-specific logic (translation validation, commit msg check, etc.)
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
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Install DeepL CLI
        run: npm install -g deepl-cli

      - name: Translate
        env:
          DEEPL_API_KEY: ${{ secrets.DEEPL_API_KEY }}
        run: |
          deepl auth set-key $DEEPL_API_KEY
          deepl translate src/locales/en.json --to es,fr,de --output src/locales/

      - name: Commit translations
        run: |
          git config user.name "DeepL Bot"
          git config user.email "bot@deepl.com"
          git add src/locales/
          git commit -m "chore: update translations" || echo "No changes"
          git push
```

---

## Security & Privacy

### API Key Management

- **JSON config with restricted permissions**: Config file written with mode 0o600 (owner read/write only)
- **Environment variables**: Support `DEEPL_API_KEY` env var
- **Stdin input**: `--from-stdin` flag for `auth set-key` to avoid shell history exposure
- **Masked output**: `auth show` and `config get/list` mask API keys (first 4 + last 4 chars)
- **No keychain dependency**: API key stored directly in config.json (no external keychain libs)

### Input Validation & Hardening

- **HTTPS enforcement**: `--api-url` and `api.baseUrl` reject non-HTTPS URLs (exception: localhost/127.0.0.1)
- **Symlink detection**: All file-reading paths reject symlinks to prevent path traversal
- **Config path validation**: `--config` requires `.json` extension, rejects symlinks and traversal patterns
- **XML tag validation**: `--splitting-tags`, `--non-splitting-tags`, `--ignore-tags` validated against XML spec
- **Glossary ID validation**: Alphanumeric + hyphen pattern to prevent injection
- **Document file size limit**: 30 MB max before reading into memory
- **Text size limit**: 128 KiB validated before API calls

### Data Privacy

- **No tracking**: No usage telemetry sent
- **Local caching**: All cached data stored locally
- **Confirmation prompts**: Destructive operations require `--yes` or interactive confirmation

### Rate Limiting & Quotas

- **Typed errors**: RateLimitError (429) and QuotaError (456) are distinct exit codes
- **Exponential backoff**: Automatic retry for transient failures
- **Concurrency limits**: Multi-target translations limited to 5 concurrent requests
- **Cost transparency**: `--show-billed-characters` flag for budget planning

---

## Performance & Optimization

### Caching Strategy

1. **Translation and write cache**: Cache text API translations and write improvements locally (SQLite)
2. **TTL**: 30-day default TTL for cached entries
3. **Size limits**: Configurable max cache size with LRU eviction (O(1) size tracking)
4. **Lazy instantiation**: SQLite database not opened until a cache-using command runs
5. **Smart text file routing**: Small text-based files automatically use cached text API
   - **Cached formats**: `.txt`, `.md`, `.html`, `.htm`, `.srt`, `.xlf`, `.xliff` (under 100 KiB only)
   - **Threshold**: 100 KiB safe limit (DeepL API text endpoint supports up to 128 KiB)
   - **Automatic fallback**: Files >= 100 KiB use document translation API (not cached)
   - **Binary formats**: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.jpg`, `.jpeg`, `.png` always use document API (not cached)

### Batch Processing

1. **Parallelization**: Configurable parallel request limit (default: 5)
2. **Concurrency control**: p-limit for bounded parallel execution
3. **Error recovery**: Partial batch failures do not affect other translations

### API Optimization

1. **Connection pooling**: Reuse HTTP connections (10 sockets)
2. **Exponential backoff**: Smart retry logic with configurable max retries
3. **Lazy dependency loading**: Command modules loaded only when needed
4. **Typed error classification**: Fast error routing without string matching

---

## Roadmap & Milestones

### Phase 1: MVP - 100% Complete (v0.1.0)

- [x] Basic translation command
- [x] Configuration management
- [x] Local caching with LRU eviction
- [x] Error handling and validation
- [x] Preservation of code/variables
- [x] File translation with format preservation
- [x] Basic glossary support (create, list, show, delete, use)
- [x] Cache CLI commands (stats, clear, enable, disable)

### Phase 2: Advanced Features - 100% Complete (v0.2.0 - v0.10.0)

**v0.2.0 (October 2025)**:

- [x] Context-aware translation (--context)
- [x] Batch processing with parallel translation
- [x] Watch mode with file watching (debouncing, auto-commit)
- [x] DeepL Write integration (grammar/style/tone)
- [x] Git hooks integration (pre-commit, pre-push)

**v0.3.0 (October 2025)**:

- [x] Document translation (PDF, DOCX, PPTX, XLSX, HTML)
- [x] Write enhancements (--diff, --check, --fix, --interactive, --in-place, --backup)

**v0.4.0 (October 2025)**:

- [x] Document format conversion (--output-format)
- [x] Proxy configuration (automatic via environment)
- [x] Retry/timeout configuration (exponential backoff)
- [x] Batch optimization (improved parallelization)
- [x] Glossary CRUD operations (add-entry, update-entry, remove-entry, rename)

**v0.5.0 (October 2025)**:

- [x] v3 Glossary API support (multilingual glossaries)
- [x] Delete-dictionary command (remove specific language pairs)

**v0.5.1 (October 2025)**:

- [x] Semantic exit codes (0-7) for intelligent CI/CD integration
- [x] XML tag handling enhancements (--outline-detection, --splitting-tags, --non-splitting-tags, --ignore-tags)
- [x] Table output format (--format table) for multi-language comparisons
- [x] Cost transparency (--show-billed-characters) for budget planning
- [x] Global options (--quiet, --config) for flexible CLI usage

**v0.8.0 (February 2026)**:

- [x] Custom instructions (--custom-instruction, repeatable)
- [x] Style rules command and --style-id flag (Pro API)
- [x] Expanded language support (121 languages: 82 extended + regional variants)
- [x] Tag handling version (--tag-handling-version v1/v2)
- [x] Image translation (JPEG, PNG)
- [x] Admin API (keys management, usage analytics)
- [x] Security hardening (HTTPS enforcement, symlink detection, config permissions)
- [x] Decomposed API client into domain-specific modules (facade pattern)
- [x] Decomposed CLI entry point into 12 register-*.ts modules

**v0.9.0 (February 2026)**:

- [x] Centralized language registry (121 languages, single source of truth)
- [x] Extended languages in `deepl languages` with category grouping
- [x] Graceful degradation without API key for `deepl languages`
- [x] Glossary replace-dictionary command
- [x] Write `--lang` made optional (auto-detection)
- [x] Generic `en`/`pt` language codes for Write API
- [x] Admin usage migrated to `/v2/admin/analytics` with per-product breakdown
- [x] Lazy CacheService instantiation
- [x] Input length validation (128 KiB limit)

### Deferred

**Status**: Not prioritized for v1.0.0. Focus is on CLI stability and production readiness.

- [ ] Interactive TUI application
- [ ] Translation memory
- [ ] Team collaboration features
- [ ] Plugin system

---

## Appendix

### Supported Languages

DeepL CLI supports 121 languages organized into three categories:

**Core Languages (32)** - Full feature support: formality, glossaries, all model types

Arabic (ar), Bulgarian (bg), Chinese (zh), Czech (cs), Danish (da), Dutch (nl), English (en), Estonian (et), Finnish (fi), French (fr), German (de), Greek (el), Hebrew (he), Hungarian (hu), Indonesian (id), Italian (it), Japanese (ja), Korean (ko), Latvian (lv), Lithuanian (lt), Norwegian Bokmal (nb), Polish (pl), Portuguese (pt), Romanian (ro), Russian (ru), Slovak (sk), Slovenian (sl), Spanish (es), Swedish (sv), Turkish (tr), Ukrainian (uk), Vietnamese (vi)

**Regional Variants (7)** - Target-only

English British (en-gb), English American (en-us), Spanish Latin America (es-419), Portuguese Brazilian (pt-br), Portuguese European (pt-pt), Chinese Simplified (zh-hans), Chinese Traditional (zh-hant)

**Extended Languages (82)** - quality_optimized model only, no formality/glossary support

Acehnese (ace), Afrikaans (af), Albanian (sq), Aragonese (an), Armenian (hy), Assamese (as), Aymara (ay), Azerbaijani (az), Bashkir (ba), Basque (eu), Belarusian (be), Bengali (bn), Bhojpuri (bho), Bosnian (bs), Breton (br), Cantonese (yue), Catalan (ca), Cebuano (ceb), Central Kurdish (ckb), Croatian (hr), Dari (prs), Esperanto (eo), Galician (gl), Georgian (ka), Goan Konkani (gom), Guarani (gn), Gujarati (gu), Haitian Creole (ht), Hausa (ha), Hindi (hi), Icelandic (is), Igbo (ig), Irish (ga), Javanese (jv), Kazakh (kk), Kyrgyz (ky), Latin (la), Lingala (ln), Lombard (lmo), Luxembourgish (lb), Macedonian (mk), Maithili (mai), Malagasy (mg), Malay (ms), Malayalam (ml), Maltese (mt), Maori (mi), Marathi (mr), Mongolian (mn), Myanmar/Burmese (my), Nepali (ne), Northern Kurdish (kmr), Occitan (oc), Oromo (om), Pampanga (pam), Pangasinan (pag), Pashto (ps), Persian (fa), Punjabi (pa), Quechua (qu), Sanskrit (sa), Serbian (sr), Sicilian (scn), Southern Sotho (st), Sundanese (su), Swahili (sw), Tagalog (tl), Tajik (tg), Tamil (ta), Tatar (tt), Telugu (te), Thai (th), Tsonga (ts), Tswana (tn), Turkmen (tk), Urdu (ur), Uzbek (uz), Welsh (cy), Wolof (wo), Xhosa (xh), Yiddish (yi), Zulu (zu)

### File Format Support

- **Text**: .txt, .md, .srt, .xlf, .xliff
- **Documents**: .pdf, .docx, .pptx, .xlsx
- **Images**: .jpg, .jpeg, .png
- **Web**: .html, .htm

### Exit Code Reference

| Code | Name         | Description                               |
| ---- | ------------ | ----------------------------------------- |
| 0    | Success      | Operation completed successfully          |
| 1    | GeneralError | Unclassified error                        |
| 2    | AuthError    | Authentication error (invalid API key)    |
| 3    | RateLimit    | Rate limit exceeded                       |
| 4    | QuotaError   | Character quota exceeded                  |
| 5    | NetworkError | Network error (timeout, connection)       |
| 6    | InvalidInput | Invalid input (missing args, bad format)  |
| 7    | ConfigError  | Invalid configuration file                |

### External Resources

- [DeepL API Documentation](https://www.deepl.com/docs-api)
- [CLI Guidelines](https://clig.dev/)
- [Commander.js](https://github.com/tj/commander.js)

---

**End of Design Document**

_This document is a living document and will be updated as the project evolves._
