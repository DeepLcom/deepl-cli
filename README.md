# DeepL CLI

> A next-generation command-line interface for DeepL translation and writing enhancement

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

**DeepL CLI** is a comprehensive, developer-friendly command-line tool that integrates DeepL's powerful translation API and cutting-edge Write API for grammar and style enhancement. Built with TypeScript and designed for modern development workflows.

## 🌟 Key Features

- **🌍 Translation** - High-quality translation using DeepL's next-gen LLM
- **📄 Document Translation** - Translate PDF, DOCX, PPTX, XLSX with formatting preservation
- **👀 Watch Mode** - Real-time file watching with auto-translation
- **✍️ Writing Enhancement** - Grammar, style, and tone suggestions (DeepL Write API)
- **💾 Smart Caching** - Local SQLite cache with LRU eviction
- **🎯 Context-Aware** - Preserves code blocks, variables, and formatting
- **📦 Batch Processing** - Translate multiple files with parallel processing
- **💰 Cost Transparency** - Track actual billed characters for budget planning
- **🔧 Developer Workflows** - Git hooks, CI/CD integration
- **🔒 Privacy-First** - Local caching, no telemetry, secure key storage

## 📋 Table of Contents

- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Global Options](#-global-options)
  - [Quiet Mode](#quiet-mode)
  - [Custom Configuration Files](#custom-configuration-files)
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

## 📦 Installation

### From npm (Coming Soon)

```bash
npm install -g deepl-cli
```

### From Source

```bash
# Clone the repository
git clone https://git.deepl.dev/hack-projects/deepl-cli.git
cd deepl-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link for global usage
npm link

# Verify installation
deepl --version
# Output: 0.8.0
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

## 🔧 Global Options

DeepL CLI supports global flags that work with all commands:

### Quiet Mode

The `--quiet` (or `-q`) flag suppresses all non-essential output, showing only errors and essential results. Perfect for scripts, CI/CD pipelines, and automation.

```bash
# Normal mode - shows informational messages
$ deepl translate "Hello" --to es
Hello

# Quiet mode - cleaner output
$ deepl --quiet translate "Hello" --to es
Hola

# Suppress progress indicators in batch operations
$ deepl --quiet translate docs/ --to es --output docs-es/
# Shows only final statistics, no spinners or progress updates
```

**What's suppressed in quiet mode:**

- ❌ Informational messages (`API Key: ...`)
- ❌ Success confirmations (`✓ Cache enabled`)
- ❌ Progress spinners and status updates
- ❌ Decorative output

**What's always shown:**

- ✅ Errors and critical warnings
- ✅ Essential command output (translation results, JSON data, statistics)

**Use cases:**

- **CI/CD pipelines**: Clean output for log parsing
- **Scripting**: Extract just the translation result
- **Automation**: Reduce noise in automated workflows
- **Parsing**: Easier to parse machine-readable output

```bash
# Example: Use in scripts
TRANSLATION=$(deepl --quiet translate "Hello" --to es)
echo "Result: $TRANSLATION"  # Result: Hola

# Example: CI/CD pipeline
deepl --quiet translate docs/ --to es,fr,de --output i18n/
# Returns exit code 0 on success, shows only errors if they occur
```

See [docs/API.md#global-options](./docs/API.md#global-options) for complete documentation.

### Custom Configuration Files

The `--config` (or `-c`) flag allows you to use alternate configuration files for different projects, environments, or accounts:

```bash
# Use work configuration
$ deepl --config ~/.deepl-work.json translate "Hello" --to es

# Use project-specific configuration
$ deepl --config ./project/.deepl.json translate docs/ --to fr --output docs-fr/

# Use test environment configuration
$ deepl -c /path/to/test-config.json usage
```

**Use cases:**

- **Multiple API keys**: Switch between free and paid accounts
- **Project isolation**: Different settings per project (glossaries, formality defaults, etc.)
- **Team configurations**: Share standardized configs via version control
- **Environment separation**: Separate configs for dev/staging/production
- **Testing**: Use test configurations without affecting default settings

**Precedence**: `--config` overrides `DEEPL_CONFIG_DIR` environment variable. If neither is specified, uses default location (`~/.deepl-cli/config.json`).

See [docs/API.md#global-options](./docs/API.md#global-options) for more details.

## 📖 Usage

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

**Text Files:** `.txt`, `.md`, `.html`, `.htm`, `.srt`, `.xlf`, `.xliff`

**Smart Caching for Text Files:**

Small text-based files (under 100 KB) automatically use the cached text translation API for faster performance and reduced API calls. Larger files automatically fall back to the document translation API (not cached).

- **Cached formats:** `.txt`, `.md`, `.html`, `.htm`, `.srt`, `.xlf`, `.xliff` (files under 100 KB only)
- **Large file fallback:** Files ≥100 KB use document API (not cached, always makes API calls)
- **Binary formats:** `.pdf`, `.docx`, `.pptx`, `.xlsx` always use document API (not cached)
- **Performance:** Only small text files (<100 KB) benefit from instant cached translations
- **Cost savings:** Only small text files avoid repeated API calls

```bash
# Single file translation (uses cache for small text files)
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

# Large text file (over 100 KiB) - automatic fallback with warning
deepl translate large-document.txt --to es --output large-document.es.txt
# ⚠ File exceeds 100 KiB limit for cached translation (150.5 KiB), using document API instead
# Translated large-document.txt to 1 language(s):
#   [ES] large-document.es.txt
```

#### Document Translation

**Supported Document Formats:** `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.html`, `.htm`, `.txt`, `.srt`, `.xlf`, `.xliff`

Translate complete documents while preserving formatting, structure, and layout:

```bash
# Translate PDF document
deepl translate document.pdf --to es --output document.es.pdf
# Uploading document...
# Document queued for translation...
# Translating document (est. 5s remaining)...
# Downloading translated document...
# ✔ Document translated successfully!
# Translated document.pdf -> document.es.pdf
# Billed characters: 1,234

# Translate PowerPoint presentation
deepl translate presentation.pptx --to fr --output presentation.fr.pptx

# Translate Excel spreadsheet
deepl translate report.xlsx --to de --output report.de.xlsx

# Translate HTML file
deepl translate website.html --to ja --output website.ja.html

# With formality setting
deepl translate contract.pdf --to de --formality more --output contract.de.pdf

# Specify source language
deepl translate document.pdf --from en --to es --output document.es.pdf

# Convert PDF to DOCX during translation (ONLY supported conversion)
deepl translate document.pdf --to es --output-format docx --output document.es.docx
# Translates PDF to Spanish and converts to editable Word format

# Note: DeepL API only supports PDF → DOCX conversion
# All other format conversions (DOCX→PDF, HTML→TXT, etc.) are NOT supported
# See examples/16-document-format-conversion.sh for details
```

**Document Translation Features:**

- ✅ **Preserves Formatting** - Maintains fonts, styles, colors, and layout
- ✅ **Format Conversion** - PDF → DOCX conversion only (convert PDFs to editable Word documents)
- ✅ **Progress Tracking** - Real-time status updates during translation
- ✅ **Large Files** - Handles documents up to 10MB (PDF) or 30MB (other formats)
- ✅ **Cost Tracking** - Shows billed characters after translation
- ✅ **Async Processing** - Documents are translated on DeepL servers with polling

**Supported Formats:**

- `.pdf` - PDF documents
- `.docx`, `.doc` - Microsoft Word
- `.pptx` - Microsoft PowerPoint
- `.xlsx` - Microsoft Excel
- `.html`, `.htm` - HTML files
- `.txt` - Plain text files
- `.srt` - Subtitle files
- `.xlf`, `.xliff` - XLIFF localization files

**Note:** Document translation uses DeepL's async translation API. The CLI automatically handles upload, polling, and download. Translation time varies based on document size and complexity.

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

**Performance Optimization:**

The CLI automatically optimizes batch translations by grouping multiple texts into single API requests (up to 50 texts per batch). This significantly reduces API overhead and improves translation speed compared to translating texts individually.

- ✅ **Automatic batching** - Groups translations into efficient batches
- ✅ **Cache-aware** - Only translates uncached texts
- ✅ **Smart splitting** - Respects DeepL API batch size limits (50 texts/request)
- ✅ **Parallel processing** - Multiple batches processed concurrently

This optimization is automatic and transparent - no configuration needed.

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

# Choose model type for quality vs. speed trade-offs
deepl translate "Long document text..." --to ja --model-type quality_optimized
# Best translation quality (default)

deepl translate "Real-time chat message" --to es --model-type latency_optimized
# Faster response time, slightly lower quality

deepl translate "Important email" --to de --model-type prefer_quality_optimized
# Prefer quality, fall back to latency if unavailable

# Custom instructions for tailored translations (repeatable, max 10)
deepl translate "Click Save to confirm" --to de \
  --custom-instruction "This is a software UI string" \
  --custom-instruction "Keep it concise"

# Combine custom instructions with other options
deepl translate "Meeting at the bank" --to es \
  --custom-instruction "This is about financial institutions" \
  --formality more

# Apply a style rule (Pro API only - get IDs with: deepl style-rules list)
deepl translate "Hello" --to de --style-id "abc-123-def-456"

# Custom API endpoint (for DeepL Pro accounts or testing)
deepl translate "Hello" --to es --api-url https://api.deepl.com/v2

# Track actual billed characters for cost transparency
deepl translate "Hello, world!" --to es --show-billed-characters
# Output:
# Hola, mundo!
#
# Billed characters: 13

# Table output format - structured view for multiple languages
deepl translate "Hello, world!" --to es,fr,de --format table
# ┌──────────┬──────────────────────────────────────────────────────────────────────┐
# │ Language │ Translation                                                          │
# ├──────────┼──────────────────────────────────────────────────────────────────────┤
# │ ES       │ ¡Hola, mundo!                                                        │
# │ FR       │ Bonjour le monde!                                                    │
# │ DE       │ Hallo, Welt!                                                         │
# └──────────┴──────────────────────────────────────────────────────────────────────┘

# Table format with cost tracking (adds Characters column)
deepl translate "Cost analysis" --to es,fr,de --format table --show-billed-characters --no-cache
# ┌──────────┬────────────────────────────────────────────────────────────┬────────────┐
# │ Language │ Translation                                                │ Characters │
# ├──────────┼────────────────────────────────────────────────────────────┼────────────┤
# │ ES       │ Análisis de costes                                         │ 14         │
# │ FR       │ Analyse des coûts                                          │ 14         │
# │ DE       │ Kostenanalyse                                              │ 14         │
# └──────────┴────────────────────────────────────────────────────────────┴────────────┘

# Advanced XML/HTML tag handling (requires --tag-handling xml)
# Control automatic XML structure detection
deepl translate "<doc><p>Hello</p></doc>" --to es --tag-handling xml --outline-detection false

# Specify tags that split sentences (like <br/> and <hr/>)
deepl translate "<div>First sentence<br/>Second sentence</div>" --to es --tag-handling xml --splitting-tags "br,hr"

# Preserve non-translatable content (code blocks, preformatted text)
deepl translate "<doc><code>let x = 1;</code><p>Text</p></doc>" --to es --tag-handling xml --non-splitting-tags "code,pre"

# Ignore specific tags and their content (scripts, styles)
deepl translate page.html --to es --tag-handling xml --ignore-tags "script,style,noscript" --output page.es.html

# Combine multiple XML tag handling options for fine-tuned control
deepl translate complex.xml --to de --tag-handling xml \
  --outline-detection false \
  --splitting-tags "br,hr,div" \
  --non-splitting-tags "code,pre,kbd" \
  --ignore-tags "script,style" \
  --output complex.de.xml
```

**XML Tag Handling Use Cases:**

Advanced XML/HTML tag handling is perfect for:

- 🌐 Localizing HTML websites while preserving structure
- 📚 Translating technical documentation with code blocks
- 📄 Processing custom XML formats with specific content rules
- 🔒 Protecting non-translatable content (scripts, styles, code)
- ✂️ Fine-tuned control over sentence splitting for better context

See [examples/19-xml-tag-handling.sh](./examples/19-xml-tag-handling.sh) for comprehensive XML tag handling examples with real-world scenarios.

**Model Types:**

- `quality_optimized` (default) - Best translation quality, standard latency
- `prefer_quality_optimized` - Prefer quality, fallback to latency if unavailable
- `latency_optimized` - Faster responses, slightly lower quality (ideal for real-time use)

See [examples/12-model-type-selection.sh](./examples/12-model-type-selection.sh) for a complete example with different model types.

### Writing Enhancement

Improve your writing with AI-powered grammar, style, and tone suggestions using the **DeepL Write API**.

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

# Improve files and save to output
deepl write input.txt --lang en-US --output improved.txt

# Edit file in place
deepl write document.md --lang en-US --in-place

# Interactive mode - choose from multiple style alternatives
# Generates improvements with simple, business, academic, and casual styles
deepl write "Text to improve." --lang en-US --interactive

# Interactive mode with file
deepl write document.md --lang en-US --interactive --in-place

# Interactive mode with specific style (single option)
deepl write "Text to improve." --lang en-US --style business --interactive

# Check if text needs improvement (exit code 0 if no changes needed)
deepl write document.md --lang en-US --check

# Auto-fix files in place
deepl write document.md --lang en-US --fix

# Auto-fix with backup
deepl write document.md --lang en-US --fix --backup

# Show diff between original and improved
deepl write file.txt --lang en-US --diff

# Show diff for plain text
deepl write "This text could be better." --lang en-US --diff
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

**Interactive Mode:**

When using `--interactive` without specifying a style or tone, the CLI automatically generates **4 different alternatives** by calling the DeepL Write API with different writing styles (simple, business, academic, casual). You can then choose which version works best for your needs:

```
? Choose an improvement (4 alternatives):
❯ Keep original - "This text could be better improved with..."
  Simple - "This text needs improvement with better..."
  Business - "We recommend enhancing this text through..."
  Academic - "It is advisable to improve this text via..."
  Casual - "You should make this text better by..."
```

If you specify a style or tone with `--interactive`, you'll get a simple confirm/reject prompt for that single suggestion.

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

See [examples/13-watch-mode.sh](./examples/13-watch-mode.sh) for a complete watch mode example with multiple scenarios.

### Git Hooks

Automate translation validation in your git workflow with pre-commit and pre-push hooks.

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

```bash
$ deepl hooks list

Git Hooks Status:

  ✓ pre-commit      installed
  ✗ pre-push        not installed
```

**Note:** The hooks are generated with placeholder validation logic. You can customize them based on your project's translation workflow by editing the hook files directly at `.git/hooks/pre-commit` or `.git/hooks/pre-push`.

See [examples/14-git-hooks.sh](./examples/14-git-hooks.sh) for a complete git hooks example demonstrating installation, usage, and management.

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

#### API Usage Statistics

Check your API usage to monitor character consumption:

```bash
# Show API usage statistics
deepl usage
# Character Usage:
#   Used: 123,456 / 500,000 (24.7%)
#   Remaining: 376,544
```

**Note:** Usage statistics help you track your DeepL API character quota and avoid exceeding limits.

See [examples/10-usage-monitoring.sh](./examples/10-usage-monitoring.sh) for a complete usage monitoring example.

**Cost Transparency:**

For detailed cost tracking per translation, use the `--show-billed-characters` flag with the translate command (see Advanced Translation Options above). This displays the actual billed character count for each translation, helping with budget planning and cost analysis.

See [examples/18-cost-transparency.sh](./examples/18-cost-transparency.sh) for comprehensive cost tracking examples.

#### Supported Languages

List all source and target languages supported by DeepL:

```bash
# Show all supported languages (both source and target)
deepl languages
# Source Languages:
#   en      English
#   de      German
#   fr      French
#   ...
#
# Target Languages:
#   en-us   English (American)
#   en-gb   English (British)
#   de      German
#   ...

# Show only source languages
deepl languages --source
# Source Languages:
#   en      English
#   de      German
#   ...

# Show only target languages
deepl languages --target
# Target Languages:
#   en-us   English (American)
#   en-gb   English (British)
#   ...
```

**Note:** Source and target language lists may differ. Some languages are available only as target languages (e.g., `en-us`, `en-gb` for English variants).

See [examples/11-languages.sh](./examples/11-languages.sh) for a complete example.

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

#### Proxy Configuration

DeepL CLI automatically supports HTTP and HTTPS proxies through environment variables:

```bash
# Configure HTTP proxy
export HTTP_PROXY=http://proxy.example.com:8080
deepl translate "Hello" --to es

# Configure HTTPS proxy
export HTTPS_PROXY=https://proxy.example.com:8443
deepl translate "Hello" --to es

# Configure proxy with authentication
export HTTP_PROXY=http://username:password@proxy.example.com:8080
deepl translate "Hello" --to es

# Both HTTP_PROXY and HTTPS_PROXY are supported (case-insensitive)
export http_proxy=http://proxy.example.com:8080
export https_proxy=https://proxy.example.com:8443
```

**Features:**

- ✅ Automatic proxy detection from environment variables
- ✅ HTTP and HTTPS proxy support
- ✅ Proxy authentication support
- ✅ Follows standard proxy environment variable conventions
- ✅ Works with all DeepL CLI commands

**Note:** HTTPS_PROXY takes precedence over HTTP_PROXY when both are set. The CLI automatically parses proxy URLs including authentication credentials.

#### Retry and Timeout Configuration

DeepL CLI includes built-in retry logic and timeout handling for robust API communication:

**Automatic Retry Logic:**

- Automatically retries failed requests on transient errors (5xx, network failures)
- Default: 3 retries with exponential backoff
- Does not retry on client errors (4xx - bad request, auth failures, etc.)
- Exponential backoff delays: 1s, 2s, 4s, 8s, 10s (capped at 10s)

**Timeout Configuration:**

- Default timeout: 30 seconds per request
- Applies to all API requests (translate, usage, languages, etc.)

**Features:**

- ✅ Automatic retry on transient failures
- ✅ Exponential backoff to avoid overwhelming the API
- ✅ Smart error detection (retries 5xx, not 4xx)
- ✅ Configurable timeout and retry limits (programmatic API only)
- ✅ Works across all DeepL API endpoints

**Retry Behavior Examples:**

```bash
# Network failure - automatically retries up to 3 times
deepl translate "Hello" --to es
# If API returns 503 (service unavailable), retries automatically

# Authentication failure (403) - does not retry
deepl translate "Hello" --to es
# Fails immediately without retries on auth errors

# Rate limiting (429) - does not retry
# You may want to wait before retrying manually
```

**Note:** Retry and timeout settings use sensible defaults optimized for the DeepL API. These are internal features that work automatically - no configuration required.

### Glossaries

DeepL glossaries ensure consistent terminology across translations. The v3 Glossary API supports both single-target and multilingual glossaries (one glossary with multiple target languages).

```bash
# Create a single-target glossary from TSV file
# File format: source_term<TAB>target_term per line
echo -e "API\tAPI\nREST\tREST\nauthentication\tAuthentifizierung" > glossary.tsv
deepl glossary create tech-terms en de glossary.tsv
# ✓ Glossary created: tech-terms (ID: abc123...)
# Source language: EN
# Target languages: DE
# Type: Single target
# Total entries: 3

# List all glossaries
deepl glossary list
# 📖 tech-terms (en→de) - 3 entries
# 📚 multilingual-terms (en→3 targets) - 15 entries

# Show glossary details
deepl glossary show tech-terms
# Name: tech-terms
# ID: abc123...
# Source language: en
# Target languages: de
# Type: Single target
# Total entries: 3
# Created: 2024-10-07T12:34:56Z

# Show glossary entries (single-target glossary - no --target flag needed)
deepl glossary entries tech-terms
# API → API
# REST → REST
# authentication → Authentifizierung

# Show entries for multilingual glossary (--target flag required)
deepl glossary entries multilingual-terms --target es
# API → API
# cache → caché
# ...

# Delete glossary
deepl glossary delete tech-terms
# ✓ Glossary deleted: tech-terms

# List supported glossary language pairs
deepl glossary languages
# de → en
# de → fr
# de → it
# en → de
# en → es
# en → fr
# en → ja
# en → pt
# ...

# Add a new entry to an existing glossary
deepl glossary add-entry tech-terms "database" "Datenbank"
# ✓ Entry added successfully

# Add entry to multilingual glossary (requires --target flag)
deepl glossary add-entry multilingual-terms "cache" "caché" --target es

# Update an existing entry in a glossary
deepl glossary update-entry tech-terms "API" "API (Programmierschnittstelle)"
# ✓ Entry updated successfully

# Remove an entry from a glossary
deepl glossary remove-entry tech-terms "REST"
# ✓ Entry removed successfully

# Rename a glossary
deepl glossary rename tech-terms "Technical Terms v2"
# ✓ Glossary renamed successfully

# Delete a dictionary from a multilingual glossary (v3 API only)
# Removes a specific language pair from a multilingual glossary
deepl glossary delete-dictionary multilingual-terms es
# ✓ Dictionary deleted successfully (es)
# Note: This only works with multilingual glossaries (multiple target languages)
# For single-target glossaries, use 'glossary delete' to remove the entire glossary
```

**Glossary file format (TSV):**

```tsv
source_term	target_term
API	API
REST	REST
authentication	Authentifizierung
```

**Key Features:**

- **Single-target glossaries** - One source language → one target language (e.g., EN → DE)
- **Multilingual glossaries** - One source language → multiple target languages (e.g., EN → ES, FR, DE)
- **Direct updates** - v3 API uses PATCH endpoints for efficient updates (no delete+recreate)
- **Smart defaults** - `--target` flag only required for multilingual glossaries
- **Visual indicators** - 📖 for single-target, 📚 for multilingual glossaries
- **Translation integration** - Use `--glossary` flag in translate and watch commands to apply glossary terms

### Style Rules

Style rules are pre-configured translation rules created via the DeepL web UI and applied to translations using their ID (Pro API only).

```bash
# List available style rules
deepl style-rules list

# List with detailed information
deepl style-rules list --detailed

# JSON output
deepl style-rules list --format json

# Apply a style rule to a translation
deepl translate "Hello" --to de --style-id "abc-123-def-456"
```

### Admin API

Manage API keys and view organization usage analytics (requires admin-level API key).

```bash
# List all API keys in the organization
deepl admin keys list

# Create a new API key
deepl admin keys create --label "Production Key"

# Set character usage limit
deepl admin keys set-limit <key-id> 1000000

# View organization usage for a date range
deepl admin usage --start 2024-01-01 --end 2024-12-31

# Usage grouped by key
deepl admin usage --start 2024-01-01 --end 2024-12-31 --group-by key
```

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

## 💻 Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- DeepL API key

### Setup

```bash
# Clone repository
git clone https://git.deepl.dev/hack-projects/deepl-cli.git
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
- **Write Service** - Grammar and style enhancement
- **Cache Service** - SQLite-based cache with LRU eviction
- **Preservation Service** - Preserves code blocks, variables, formatting
- **Watch Service** - File watching with debouncing
- **Glossary Service** - Glossary management and application

See [DESIGN.md](./DESIGN.md) for detailed architecture documentation.

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test type
npm run test:unit
npm run test:integration
npm run test:e2e

# Run specific test file
npm test -- translation.test.ts

# Run with coverage report
npm run test:coverage

# Watch mode for TDD
npm test -- --watch

# Run all example scripts (validation)
npm run examples

# Run example scripts (fast mode, skips slow examples)
npm run examples:fast
```

## 📚 Documentation

- **[API.md](./docs/API.md)** - Complete API reference with all commands, flags, and options
- **[DESIGN.md](./DESIGN.md)** - Comprehensive design and architecture
- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines and TDD workflow
- **[DeepL API Docs](https://www.deepl.com/docs-api)** - Official API documentation
- **[CLI Guidelines](https://clig.dev/)** - Command-line best practices

## 🔒 Security & Privacy

- **Secure key storage** - API keys stored in `~/.deepl-cli/config.json` (gitignored)
- **Local caching** - All cached data stored locally in SQLite (`~/.deepl-cli/cache.db`), never shared
- **No telemetry** - Zero usage tracking or data collection
- **Environment variable support** - Use `DEEPL_API_KEY` environment variable for CI/CD
- **GDPR compliant** - Follows DeepL's GDPR compliance guidelines

## 📄 License

Internal DeepL project - not yet publicly released.

---

_Powered by DeepL's next-generation language model_
