# DeepL CLI - API Reference

**Version**: 0.4.0
**Last Updated**: October 12, 2025

Complete reference for all DeepL CLI commands, options, and configuration.

---

## Table of Contents

- [Global Options](#global-options)
- [Commands](#commands)
  - [translate](#translate)
  - [write](#write)
  - [watch](#watch)
  - [hooks](#hooks)
  - [glossary](#glossary)
  - [cache](#cache)
  - [config](#config)
  - [usage](#usage)
  - [languages](#languages)
  - [auth](#auth)
- [Configuration](#configuration)
- [Exit Codes](#exit-codes)
- [Environment Variables](#environment-variables)

---

## Global Options

Options that work with all commands:

```bash
--version           Show version number
--help              Show help message
--quiet, -q         Suppress all non-essential output (errors and results only)
--config, -c FILE   Use alternate configuration file
```

**Examples:**

```bash
# Show version
deepl --version

# Get help
deepl --help
deepl translate --help

# Quiet mode - suppress informational messages, keep errors and results
deepl --quiet translate "Hello" --to es
# Output: Hola (no "Translation (ES):" label)

deepl -q cache stats
# Shows cache statistics without decorative output

# Quiet mode with batch operations (no spinners or progress indicators)
deepl --quiet translate docs/ --to es --output docs-es/
# Shows final statistics only, no progress updates

# Use custom config file
deepl --config ~/.deepl-work.json translate "Hello" --to es

# Use custom config directory (via environment variable)
export DEEPL_CONFIG_DIR=/path/to/config
deepl translate "Hello" --to es

# Disable cache
deepl cache disable
deepl translate "Hello" --to es
deepl cache enable
```

**Quiet Mode Behavior:**

- ✅ **Always shown**: Errors, warnings about critical issues, essential output (translation results, JSON data, command output)
- ❌ **Suppressed**: Informational messages, success confirmations, progress spinners, status updates
- 🎯 **Use cases**: CI/CD pipelines, scripting, parsing output, quiet automation

**Example comparison:**

```bash
# Normal mode
$ deepl cache enable
✓ Cache enabled

# Quiet mode
$ deepl --quiet cache enable
(no output - command succeeded silently)

# Normal mode with errors
$ deepl translate "Hello" --to invalid
Error: Invalid target language: invalid

# Quiet mode with errors (errors always shown)
$ deepl --quiet translate "Hello" --to invalid
Error: Invalid target language: invalid
```

**Custom Configuration Files:**

The `--config` flag allows you to use alternate configuration files for different projects, environments, or accounts:

```bash
# Use work configuration
deepl --config ~/.deepl-work.json translate "Hello" --to es

# Use project-specific configuration
deepl --config ./project/.deepl.json translate docs/ --to fr --output docs-fr/

# Use test environment configuration
deepl --config /path/to/test-config.json usage
```

**Use cases:**

- **Multiple API keys**: Switch between free and paid accounts
- **Project isolation**: Different settings per project (glossaries, formality, etc.)
- **Team configurations**: Share standardized configs via version control
- **Environment separation**: Separate configs for dev/staging/production
- **Testing**: Use test configurations without affecting default settings

**Precedence:** `--config` overrides `DEEPL_CONFIG_DIR`. If neither is specified, uses default location.

---

## Commands

### translate

Translate text, files, or directories.

#### Synopsis

```bash
deepl translate [OPTIONS] [TEXT|FILE|DIRECTORY]
```

#### Description

Translate text directly, from stdin, from files, or entire directories. Supports multiple target languages, code preservation, and context-aware translation.

**Input Sources:**

- Direct text argument: `deepl translate "Hello" --to es`
- From stdin: `echo "Hello" | deepl translate --to es`
- Single file: `deepl translate README.md --to es --output README.es.md`
- Directory: `deepl translate docs/ --to es --output docs-es/`

**Note:** When reading from stdin or translating files, omit the text argument.

#### Options

**Required:**

- `--to, -t LANGS` - Target language(s), comma-separated (e.g., `es`, `es,fr,de`)

**Source Options:**

- `--from, -f LANG` - Source language (auto-detect if omitted)
- `--context TEXT` - Additional context for better translation

**Output Options:**

- `--output, -o PATH` - Output file or directory (required for file/directory translation, optional for text)
- `--output-format FORMAT` - Convert document format during translation (e.g., `pdf`, `docx`, `pptx`, `xlsx`, `html`)
- `--format FORMAT` - Output format: `json` for machine-readable output (default: plain text)

**Translation Options:**

- `--formality LEVEL` - Formality: `default`, `less`, `more`, `prefer_less`, `prefer_more`
- `--model-type TYPE` - Model type: `quality_optimized` (default), `prefer_quality_optimized`, `latency_optimized`
- `--preserve-code` - Preserve code blocks (markdown, etc.)
- `--preserve-vars` - Preserve variables like `{name}`, `${var}`
- `--preserve-formatting` - Preserve line breaks and whitespace formatting
- `--split-sentences LEVEL` - Sentence splitting: `on` (default), `off`, `nonewlines`
- `--tag-handling MODE` - XML tag handling: `xml`, `html`
- `--glossary NAME-OR-ID` - Use glossary by name or ID for consistent terminology
- `--no-cache` - Bypass cache for this translation (useful for testing/forcing fresh translation)

**API Options:**

- `--api-url URL` - Custom API endpoint URL (for testing or private instances)

**Batch Options (for directories):**

- `--recursive, -r` - Process subdirectories recursively (default: true)
- `--pattern GLOB` - File pattern (e.g., `*.md`, `**/*.txt`)
- `--concurrency N` - Number of parallel translations (default: 5)

#### Examples

**Basic text translation:**

```bash
# Single language
deepl translate "Hello, world!" --to es

# Multiple languages
deepl translate "Hello, world!" --to es,fr,de

# With source language
deepl translate "Bonjour" --from fr --to en
```

**From stdin:**

```bash
# Pipe text
echo "Hello" | deepl translate --to es

# From file via stdin
cat README.md | deepl translate --to fr
```

**File translation:**

```bash
# Single file
deepl translate README.md --to es --output README.es.md

# Multiple languages
deepl translate README.md --to es,fr,de --output translations/

# With code preservation
deepl translate tutorial.md --to es --output tutorial.es.md --preserve-code
```

**Document translation:**

```bash
# Translate PDF document
deepl translate document.pdf --to es --output document.es.pdf

# Translate PowerPoint with formality
deepl translate presentation.pptx --to de --formality more --output presentation.de.pptx

# Translate Excel spreadsheet
deepl translate report.xlsx --to fr --output report.fr.xlsx

# Translate HTML file
deepl translate website.html --to ja --output website.ja.html

# Convert format during translation (DOCX to PDF)
deepl translate document.docx --to es --output document.es.pdf --output-format pdf
```

**Supported Document Formats:**

- `.pdf` - PDF documents (up to 10MB)
- `.docx`, `.doc` - Microsoft Word
- `.pptx` - Microsoft PowerPoint
- `.xlsx` - Microsoft Excel
- `.html`, `.htm` - HTML files
- `.txt` - Plain text files (up to 30MB)
- `.srt` - Subtitle files
- `.xlf`, `.xliff` - XLIFF localization files

**Document Translation Notes:**

- Documents are translated on DeepL servers using async processing
- Progress updates show status (queued → translating → done)
- Billed characters are displayed after completion
- Formatting, structure, and layout are automatically preserved
- Large documents may take several seconds to translate
- Maximum file sizes: 10MB (PDF), 30MB (other formats)

**Directory translation:**

```bash
# Translate all supported files
deepl translate docs/ --to es --output docs-es/

# With glob pattern
deepl translate docs/ --to es --output docs-es/ --pattern "*.md"

# Recursive with custom concurrency
deepl translate src/ --to es,fr --output translations/ --recursive --concurrency 10
```

**Context-aware translation:**

```bash
# Add context for better disambiguation
deepl translate "Bank" --to es --context "Financial institution"
# → "Banco" (not "Orilla" for riverbank)

deepl translate app.json --to es --context "E-commerce checkout flow"
```

**Note:** The `--context` feature may not be supported by all DeepL API tiers. Check your API plan for context support availability.

**Formality levels:**

```bash
# Formal
deepl translate "How are you?" --to de --formality more
# → "Wie geht es Ihnen?" (formal)

# Informal
deepl translate "How are you?" --to de --formality less
# → "Wie geht es dir?" (informal)
```

**Sentence splitting:**

```bash
# Default behavior (sentences split on punctuation and newlines)
deepl translate "Hello. How are you?" --to es
# → "Hola. ¿Cómo estás?"

# Disable sentence splitting (treat as one unit)
deepl translate "Hello. How are you?" --to es --split-sentences off
# → May produce different translation

# Split only on punctuation, not newlines
deepl translate "Line 1\nLine 2" --to es --split-sentences nonewlines
# → Preserves line breaks while splitting sentences
```

**Tag handling (XML/HTML):**

```bash
# Translate XML while preserving tags
deepl translate "<p>Hello world</p>" --to es --tag-handling xml
# → "<p>Hola mundo</p>"

# Translate HTML content
deepl translate "<div><span>Welcome</span></div>" --to de --tag-handling html
# → "<div><span>Willkommen</span></div>"

# Useful for localizing markup files
deepl translate content.html --to fr --tag-handling html --output content.fr.html
```

**Glossary usage:**

```bash
# Use glossary for consistent terminology
deepl translate "API documentation" --to es --glossary tech-terms

# Use glossary by ID
deepl translate README.md --to fr --glossary abc-123-def-456 --output README.fr.md
```

**Cache control:**

```bash
# Bypass cache for fresh translation
deepl translate "Hello" --to es --no-cache

# Useful for testing or when you need the latest translation
deepl translate document.md --to es --output document.es.md --no-cache
```

**JSON output:**

```bash
# Get machine-readable JSON output
deepl translate "Hello" --to es --format json
# {"text":"Hola","detectedSourceLang":"en","targetLang":"es","cached":false}

# Useful for scripting and automation
deepl translate "Test" --to es,fr,de --format json
```

---

### write

Improve text with DeepL Write API (grammar, style, tone enhancement).

#### Synopsis

```bash
deepl write [OPTIONS] TEXT
```

#### Description

Enhance text quality with AI-powered grammar checking, style improvement, and tone adjustment. Supports 8 languages.

**File Detection:** The command automatically detects if the text argument is a file path. If a file exists at that path, it operates on the file; otherwise, it treats the argument as text to improve.

#### Options

**Required:**

- `--lang, -l LANG` - Target language: `de`, `en-GB`, `en-US`, `es`, `fr`, `it`, `pt-BR`, `pt-PT`

**Style Options (mutually exclusive with tone):**

- `--style STYLE` - Writing style:
  - `simple` - Simpler, more accessible language
  - `business` - Professional business language
  - `academic` - Formal academic language
  - `casual` - Conversational, informal language
  - `prefer_simple`, `prefer_business`, etc. - Soft preferences

**Tone Options (mutually exclusive with style):**

- `--tone TONE` - Tone:
  - `enthusiastic` - More enthusiastic and positive
  - `friendly` - Warmer, more approachable
  - `confident` - More assertive and certain
  - `diplomatic` - More careful and tactful
  - `prefer_enthusiastic`, `prefer_friendly`, etc. - Soft preferences

**Output Options:**

- `--alternatives, -a` - Show all improvement alternatives
- `--interactive, -i` - Interactive mode: choose from multiple alternatives
- `--diff, -d` - Show diff between original and improved text
- `--check, -c` - Check if text needs improvement without modifying (exits with 0 if no changes, 1 if improvements suggested)
- `--fix, -f` - Auto-fix files in place
- `--output, -o FILE` - Write output to file
- `--in-place` - Edit file in place
- `--backup, -b` - Create backup before fixing (use with `--fix`)
- `--format FORMAT` - Output format: `json` for machine-readable output (default: plain text)

#### Supported Languages

- `de` - German
- `en-GB` - British English
- `en-US` - American English
- `es` - Spanish
- `fr` - French
- `it` - Italian
- `pt-BR` - Brazilian Portuguese
- `pt-PT` - European Portuguese

#### Examples

**Basic improvement:**

```bash
deepl write "Me and him went to store." --lang en-US
# → "He and I went to the store."
```

**With writing style:**

```bash
# Business style
deepl write "We want to tell you about our product." --lang en-US --style business
# → "We are pleased to inform you about our product."

# Casual style
deepl write "The analysis demonstrates significant findings." --lang en-US --style casual
# → "The analysis shows some pretty big findings."
```

**With tone:**

```bash
# Confident tone
deepl write "I think this might work." --lang en-US --tone confident
# → "This will work."

# Diplomatic tone
deepl write "Your approach is wrong." --lang en-US --tone diplomatic
# → "Perhaps we could consider an alternative approach."
```

**Show alternatives:**

```bash
deepl write "This is good." --lang en-US --alternatives
```

**File operations:**

```bash
# Improve file and save to new location
deepl write document.txt --lang en-US --output improved.txt

# Edit file in place
deepl write document.txt --lang en-US --in-place

# Auto-fix with backup
deepl write document.txt --lang en-US --fix --backup
```

**Interactive mode:**

```bash
# Choose from multiple alternatives interactively
deepl write "Text to improve." --lang en-US --interactive
```

**Check mode:**

```bash
# Check if file needs improvement (exit code 1 if changes needed)
deepl write document.md --lang en-US --check
```

**Diff view:**

```bash
# Show differences between original and improved
deepl write file.txt --lang en-US --diff
```

**JSON output:**

```bash
# Get machine-readable JSON output
deepl write "This are good." --lang en-US --format json
# {"original":"This are good.","improved":"This is good.","changes":1,"language":"en-US"}
```

---

### watch

Watch files or directories for changes and auto-translate.

#### Synopsis

```bash
deepl watch [OPTIONS] PATH
```

#### Description

Monitor files or directories for changes and automatically translate them. Supports debouncing, glob patterns, and multiple target languages.

**Behavior:**

- Runs continuously until interrupted (Ctrl+C)
- Shows translation statistics on exit
- Detects file changes using filesystem watch
- Debounces rapid changes to avoid duplicate translations

#### Options

**Required:**

- `--targets, -t LANGS` - Target language(s), comma-separated

**Watch Options:**

- `--output, -o DIR` - Output directory (default: `<path>/translations` for directories, same dir for files)
- `--pattern GLOB` - File pattern filter (e.g., `*.md`, `**/*.json`)
- `--debounce MS` - Debounce delay in milliseconds (default: 300)

**Translation Options:**

- `--from, -f LANG` - Source language (auto-detect if omitted)
- `--formality LEVEL` - Formality level
- `--preserve-code` - Preserve code blocks
- `--preserve-formatting` - Preserve line breaks and whitespace formatting
- `--glossary NAME-OR-ID` - Use glossary by name or ID for consistent terminology

**Git Integration:**

- `--auto-commit` - Auto-commit translations to git after each change
- `--git-staged` - Only watch git-staged files (not yet implemented)

#### Examples

**Watch single file:**

```bash
# Basic watching
deepl watch README.md --targets es

# With custom output
deepl watch README.md --targets es,fr --output translations/

# With options
deepl watch tutorial.md --targets es --preserve-code --formality more
```

**Watch directory:**

```bash
# Watch all supported files
deepl watch docs/ --targets es

# Watch with pattern
deepl watch docs/ --targets es,fr --pattern "*.md"

# With custom debounce (wait 1 second after changes)
deepl watch docs/ --targets es --debounce 1000
```

**With auto-commit:**

```bash
# Automatically commit translations
deepl watch docs/ --targets es --auto-commit
```

---

### hooks

Manage git hooks for translation workflow automation.

#### Synopsis

```bash
deepl hooks <SUBCOMMAND>
```

#### Description

Install, uninstall, and manage git hooks that validate translations before committing or pushing.

#### Subcommands

##### `install <hook-type>`

Install a git hook.

**Arguments:**

- `hook-type` - Hook type: `pre-commit`, `pre-push`

**Examples:**

```bash
deepl hooks install pre-commit
deepl hooks install pre-push
```

##### `uninstall <hook-type>`

Uninstall a git hook.

**Examples:**

```bash
deepl hooks uninstall pre-commit
deepl hooks uninstall pre-push
```

##### `list`

List all hooks and their installation status.

**Examples:**

```bash
deepl hooks list
```

##### `path <hook-type>`

Show the path to a hook file.

**Examples:**

```bash
deepl hooks path pre-commit
```

---

### glossary

Manage translation glossaries.

#### Synopsis

```bash
deepl glossary <SUBCOMMAND>
```

#### Subcommands

##### `create <name> <source-lang> <target-lang> <file>`

Create a new glossary from a TSV or CSV file.

**Arguments:**

- `name` - Glossary name
- `source-lang` - Source language code (e.g., `en`, `de`, `fr`)
- `target-lang` - Target language code (e.g., `es`, `fr`, `ja`)
- `file` - Path to TSV or CSV file with term pairs

**File Format:**

- **TSV** (Tab-Separated Values): `source_term<TAB>target_term`
- **CSV** (Comma-Separated Values): `source_term,target_term`
- One term pair per line
- No header row required

**Example file (glossary.tsv):**

```
API	API
authentication	autenticación
cache	caché
```

**Examples:**

```bash
# Create glossary from TSV file
deepl glossary create tech-terms en es glossary.tsv

# Create glossary from CSV file
deepl glossary create product-names en fr terms.csv
```

##### `list`

List all glossaries with their IDs, language pairs, and entry counts.

**Example:**

```bash
deepl glossary list
```

##### `show <name-or-id>`

Show glossary details including name, ID, languages, creation date, and entry count.

**Example:**

```bash
deepl glossary show tech-terms
deepl glossary show abc-123-def-456
```

##### `delete <name-or-id>`

Delete a glossary by name or ID.

**Example:**

```bash
deepl glossary delete tech-terms
deepl glossary delete abc-123-def-456
```

##### `entries <name-or-id>`

Get glossary entries in TSV format (suitable for backup or editing).

**Example:**

```bash
# Export to file
deepl glossary entries tech-terms > backup.tsv

# View entries
deepl glossary entries tech-terms
```

##### `languages`

List all supported glossary language pairs.

**Description:**
Shows which source-target language combinations are available for glossary creation. Not all language pairs supported by DeepL translation are available for glossaries.

**Example:**

```bash
deepl glossary languages
# en → de
# en → es
# en → fr
# de → en
# ...
```

##### `add-entry <name-or-id> <source> <target>`

Add a new entry to an existing glossary.

**Arguments:**

- `name-or-id` - Glossary name or ID
- `source` - Source language term
- `target` - Target language term

**Behavior:**

- Creates new glossary with updated entries (delete + recreate)
- Returns new glossary ID
- Preserves all other entries and metadata
- Fails if entry already exists

**Examples:**

```bash
# Add entry by glossary name
deepl glossary add-entry tech-terms "API" "API"

# Add entry by glossary ID
deepl glossary add-entry abc-123-def-456 "cache" "caché"

# Add phrase
deepl glossary add-entry tech-terms "user interface" "interfaz de usuario"
```

**Note:** Since DeepL API doesn't provide direct entry editing, this command fetches all entries, adds the new entry, deletes the old glossary, and creates a new one. The glossary ID will change but the name remains the same.

##### `update-entry <name-or-id> <source> <new-target>`

Update an existing entry in a glossary.

**Arguments:**

- `name-or-id` - Glossary name or ID
- `source` - Source language term to update
- `new-target` - New target language translation

**Behavior:**

- Updates existing entry's target text
- Creates new glossary with updated entries (delete + recreate)
- Returns new glossary ID
- Fails if entry doesn't exist

**Examples:**

```bash
# Update entry by glossary name
deepl glossary update-entry tech-terms "cache" "caché del sistema"

# Update entry by glossary ID
deepl glossary update-entry abc-123-def-456 "API" "Interfaz de programación de aplicaciones"
```

**Note:** Like `add-entry`, this command recreates the glossary with updated entries. The glossary ID will change but the name remains the same.

##### `remove-entry <name-or-id> <source>`

Remove an entry from a glossary.

**Arguments:**

- `name-or-id` - Glossary name or ID
- `source` - Source language term to remove

**Behavior:**

- Removes entry from glossary
- Creates new glossary with remaining entries (delete + recreate)
- Returns new glossary ID
- Fails if entry doesn't exist
- Fails if removing the last entry (delete glossary instead)

**Examples:**

```bash
# Remove entry by glossary name
deepl glossary remove-entry tech-terms "obsolete-term"

# Remove entry by glossary ID
deepl glossary remove-entry abc-123-def-456 "deprecated"
```

**Note:** You cannot remove the last entry from a glossary. If you need to remove all entries, use `deepl glossary delete` instead.

##### `rename <name-or-id> <new-name>`

Rename a glossary.

**Arguments:**

- `name-or-id` - Glossary name or ID
- `new-name` - New name for the glossary

**Behavior:**

- Changes glossary name
- Creates new glossary with new name (delete + recreate)
- Returns new glossary ID
- Preserves all entries and language pair
- Fails if new name matches current name

**Examples:**

```bash
# Rename by glossary name
deepl glossary rename tech-terms "Technical Terminology v2"

# Rename by glossary ID
deepl glossary rename abc-123-def-456 "Product Names 2024"
```

**Note:** Since DeepL API doesn't provide a direct rename endpoint, this command fetches all entries, deletes the old glossary, and creates a new one with the new name. The glossary ID will change but all entries are preserved.

---

### cache

Manage translation cache.

#### Synopsis

```bash
deepl cache <SUBCOMMAND>
```

#### Subcommands

##### `stats`

Show cache statistics (status, entries count, size, percentage used).

##### `clear`

Clear all cache entries (displays: "✓ Cache cleared successfully").

##### `enable`

Enable cache (displays: "✓ Cache enabled").

**Options:**
- `--max-size <size>` - Maximum cache size (e.g., `100M`, `1G`, `500MB`)

**Examples:**
```bash
# Enable cache with default size
deepl cache enable

# Enable cache with custom size
deepl cache enable --max-size 100M
deepl cache enable --max-size 1G
```

**Note:** You can also configure max cache size separately: `deepl config set cache.maxSize <bytes>`

##### `disable`

Disable cache (displays: "✓ Cache disabled").

---

### config

Manage CLI configuration.

#### Synopsis

```bash
deepl config <SUBCOMMAND>
```

#### Subcommands

##### `list`

List all configuration values (same as `get` without arguments).

##### `get [key]`

Get a specific configuration value, or all values if key is omitted.

**Arguments:**

- `key` (optional) - Configuration key in dot notation (e.g., `cache.maxSize`, `auth.apiKey`)

**Examples:**

```bash
# Get all configuration
deepl config get

# Get specific value
deepl config get cache.maxSize
deepl config get auth.apiKey
```

##### `set <key> <value>`

Set a configuration value.

**Arguments:**

- `key` - Configuration key in dot notation
- `value` - Value to set

**Examples:**

```bash
deepl config set cache.maxSize 52428800
deepl config set defaults.formality more
```

##### `reset`

Reset configuration to defaults (keeps API key).

---

### usage

Show API usage statistics.

#### Synopsis

```bash
deepl usage
```

#### Description

Display your DeepL API character usage and remaining quota. Helps you monitor consumption and avoid exceeding your account limits.

#### Examples

```bash
# Show usage statistics
deepl usage
# Character Usage:
#   Used: 123,456 / 500,000 (24.7%)
#   Remaining: 376,544
```

**Output Fields:**

- **Used**: Number of characters translated this billing period
- **Limit**: Total character limit for your account
- **Percentage**: Usage as a percentage of total quota
- **Remaining**: Characters remaining in your quota

**Notes:**

- Usage resets monthly for most accounts
- Free tier: typically 500,000 characters/month
- Pro accounts: varies by subscription level
- Shows warning when usage exceeds 80%

---

### languages

List supported source and target languages.

#### Synopsis

```bash
deepl languages [OPTIONS]
```

#### Description

Display all languages supported by DeepL API. You can filter to show only source languages, only target languages, or both (default).

#### Options

- `--source, -s` - Show only source languages
- `--target, -t` - Show only target languages

#### Examples

```bash
# Show all supported languages (both source and target)
deepl languages
# Source Languages:
#   en      English
#   de      German
#   fr      French
#   es      Spanish
#   ...
#
# Target Languages:
#   en-us   English (American)
#   en-gb   English (British)
#   de      German
#   fr      French
#   ...

# Show only source languages
deepl languages --source
# Source Languages:
#   en      English
#   de      German
#   fr      French
#   ...

# Show only target languages
deepl languages --target
# Target Languages:
#   en-us   English (American)
#   en-gb   English (British)
#   de      German
#   fr      French
#   es      Spanish
#   ja      Japanese
#   ...
```

**Output Format:**

- Language codes are displayed in the first column
- Language names are displayed in the second column
- Codes are left-aligned and padded for readability

**Notes:**

- Source and target language lists may differ
- Some languages are only available as target languages (e.g., English variants `en-us`, `en-gb`)
- Some languages are only available as source languages
- The list is fetched directly from DeepL API and reflects current language support

---

### auth

Manage API authentication.

#### Synopsis

```bash
deepl auth <SUBCOMMAND>
```

#### Subcommands

##### `set-key <api-key>`

Set your DeepL API key and validate it with the DeepL API.

**Arguments:**

- `api-key` - Your DeepL API authentication key

**Examples:**

```bash
deepl auth set-key YOUR-API-KEY-HERE
# ✓ API key saved and validated successfully
```

##### `show`

Show current API key (masked for security).

**Output Format:** `API Key: abcdefgh...xyz123` (first 8 and last 4 characters visible)

**Examples:**

```bash
deepl auth show
# API Key: 12345678...abcd

deepl auth show
# No API key set
```

##### `clear`

Clear stored API key from configuration.

**Examples:**

```bash
deepl auth clear
# ✓ API key removed
```

---

## Configuration

**Configuration file location:**

- **macOS**: `~/Library/Preferences/deepl-cli-nodejs/config.json`
- **Linux**: `~/.config/deepl-cli-nodejs/config.json`
- **Windows**: `%APPDATA%\deepl-cli-nodejs\Config\config.json`

**Override location:** Set `DEEPL_CONFIG_DIR` environment variable

### Configuration Schema

```json
{
  "auth": {
    "apiKey": "your-api-key"
  },
  "api": {
    "baseUrl": null,
    "usePro": false
  },
  "defaults": {
    "targetLangs": [],
    "sourceLang": null,
    "formality": "default",
    "preserveCode": false,
    "splitSentences": "on"
  },
  "cache": {
    "enabled": true,
    "maxSize": 104857600,
    "ttl": 2592000
  },
  "output": {
    "format": "text",
    "color": true
  }
}
```

**Note:** Most users configure settings via `deepl config set` command rather than editing the file directly.

---

## Exit Codes

| Code | Meaning          |
| ---- | ---------------- |
| 0    | Success          |
| 1    | Error (any type) |

**Special Cases:**

- `deepl write --check`: Exits with 0 if no changes needed, 1 if improvements suggested

**Note:** Detailed exit codes (2-7) are planned for a future release. Currently, all errors exit with code 1.

---

## Environment Variables

### `DEEPL_API_KEY`

Set your API key via environment variable.

```bash
export DEEPL_API_KEY="your-api-key"
deepl translate "Hello" --to es
```

### `DEEPL_CONFIG_DIR`

Override default config directory.

```bash
export DEEPL_CONFIG_DIR="/custom/path"
```

### `NO_COLOR`

Disable colored output.

```bash
export NO_COLOR=1
```

---

## See Also

- [Examples](../examples/)
- [DeepL API Documentation](https://www.deepl.com/docs-api)

---

**Last Updated**: October 12, 2025
**DeepL CLI Version**: 0.4.0
