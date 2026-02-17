# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - YYYY-MM-DD

### Added
- Text translation via DeepL's next-generation LLM (`deepl translate`)
- Document translation for PDF, DOCX, PPTX, XLSX, HTML, SRT, XLIFF, and images with formatting preservation
- Structured file translation for JSON and YAML i18n locale files (keys, nesting, comments preserved)
- Writing enhancement with grammar, style, and tone suggestions (`deepl write`) via the DeepL Write API
- Real-time speech translation via WebSocket streaming (`deepl voice`) with automatic reconnection
- Watch mode for real-time file monitoring with auto-translation (`deepl watch`)
- Batch directory translation with parallel processing, glob filtering, and concurrency control
- Glossary management with full v3 API support including multilingual glossaries (`deepl glossary`)
- Language detection (`deepl detect`)
- Git hooks for pre-commit, pre-push, commit-msg, and post-commit translation workflows (`deepl hooks`)
- Interactive setup wizard (`deepl init`)
- Admin API for key management and organization usage analytics (`deepl admin`)
- Shell completion for bash, zsh, and fish (`deepl completion`)
- SQLite-based translation cache with LRU eviction and configurable TTL
- Custom translation instructions (`--custom-instruction`) and style rules (`--style-id`)
- XDG Base Directory Specification support with legacy path migration
- JSON output format (`--format json`) across all commands for CI/CD scripting
- Table output format (`--format table`) for structured comparison views
- Semantic exit codes (0–9) for CI/CD integration and scripted error handling
- HTTP/HTTPS proxy support via standard environment variables
- Automatic retry with exponential backoff and `Retry-After` header support
- Dry-run mode (`--dry-run`) for previewing destructive and batch operations
- Cost transparency with `--show-billed-characters` flag
- Multi-target translation to multiple languages in a single command
- Context-aware translation (`--context`) for disambiguation
- Model type selection (`--model-type`) for quality vs. latency trade-offs
- Advanced XML/HTML tag handling with splitting, non-splitting, and ignore tags

### Security
- HTTPS enforcement for all API communication (localhost exempted for testing)
- Symlink rejection on all file-reading paths to prevent directory traversal
- API key masking in logs, config output, and error messages
- Config file permissions restricted to owner read/write (0o600)
- Path traversal defense for batch output patterns
- Atomic writes for translated output and config files to prevent corruption

### Changed
- Requires Node.js >= 20
