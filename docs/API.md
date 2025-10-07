# DeepL CLI - API Reference

> Complete command-line interface reference for DeepL CLI v0.1.0

## Table of Contents

- [Overview](#overview)
- [Global Options](#global-options)
- [Commands](#commands)
  - [translate](#translate)
  - [auth](#auth)
  - [config](#config)
  - [cache](#cache)
  - [glossary](#glossary)
- [Environment Variables](#environment-variables)
- [Configuration File](#configuration-file)
- [Exit Codes](#exit-codes)
- [Examples](#examples)

## Overview

DeepL CLI provides a comprehensive command-line interface for the DeepL translation API. All commands follow the pattern:

```bash
deepl [global-options] <command> [command-options] [arguments]
```

## Global Options

Available for all commands:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Display help for command |
| `--version`, `-V` | Display version number |

## Commands

### translate

Translate text or files using the DeepL API.

#### Synopsis

```bash
deepl translate [options] [text]
deepl translate [options] <file>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `[text]` | Text to translate (optional if using stdin or file) |

#### Options

| Option | Alias | Type | Required | Description |
|--------|-------|------|----------|-------------|
| `--to <language>` | `-t` | string | Yes | Target language(s), comma-separated for multiple |
| `--from <language>` | `-f` | string | No | Source language (auto-detect if not specified) |
| `--output <path>` | `-o` | string | Yes* | Output file path or directory (*required for file translation) |
| `--formality <level>` | | string | No | Formality level: `default`, `more`, `less`, `prefer_more`, `prefer_less` |
| `--preserve-code` | | boolean | No | Preserve code blocks and variables during translation |
| `--api-url <url>` | | string | No | Custom API endpoint (e.g., `https://api.deepl.com/v2` for Pro) |

#### Supported Languages

**Source languages** (auto-detect if not specified):
- `AR` - Arabic
- `BG` - Bulgarian
- `CS` - Czech
- `DA` - Danish
- `DE` - German
- `EL` - Greek
- `EN` - English
- `ES` - Spanish
- `ET` - Estonian
- `FI` - Finnish
- `FR` - French
- `HU` - Hungarian
- `ID` - Indonesian
- `IT` - Italian
- `JA` - Japanese
- `KO` - Korean
- `LT` - Lithuanian
- `LV` - Latvian
- `NB` - Norwegian (Bokmål)
- `NL` - Dutch
- `PL` - Polish
- `PT` - Portuguese
- `RO` - Romanian
- `RU` - Russian
- `SK` - Slovak
- `SL` - Slovenian
- `SV` - Swedish
- `TR` - Turkish
- `UK` - Ukrainian
- `ZH` - Chinese

**Target languages**:
All source languages plus:
- `EN-GB` - English (British)
- `EN-US` - English (American)
- `PT-BR` - Portuguese (Brazilian)
- `PT-PT` - Portuguese (European)

#### Examples

```bash
# Basic text translation
deepl translate "Hello world" --to ja

# Multiple target languages
deepl translate "Good morning" --to es,fr,de

# Specify source language
deepl translate "Bonjour" --from fr --to en

# From stdin
echo "Hello world" | deepl translate --to es
cat input.txt | deepl translate --to ja

# File translation
deepl translate README.md --to es --output README.es.md

# Multiple languages to directory
deepl translate docs.md --to es,fr,de --output ./translated/

# With code preservation
deepl translate tutorial.md --to ja --output tutorial.ja.md --preserve-code

# Set formality
deepl translate "How are you?" --formality more --to de --output formal.txt

# Use Pro API
deepl translate "Hello" --to es --api-url https://api.deepl.com/v2
```

#### Input Methods

1. **Direct text**: `deepl translate "text" --to es`
2. **Stdin**: `echo "text" | deepl translate --to es`
3. **File**: `deepl translate file.txt --to es --output file.es.txt`

#### Output

- **Text translation**: Prints to stdout in format:
  ```
  Translation (ES):
  Translated text here
  ```

- **File translation**: Creates output file(s) and prints:
  ```
  Translated file.txt to 1 language(s):
    [ES] file.es.txt
  ```

#### Supported File Formats

- `.txt` - Plain text files
- `.md` - Markdown files (with `--preserve-code` to preserve code blocks)

### auth

Manage DeepL API authentication.

#### Subcommands

##### `auth set-key`

Set or update the DeepL API key.

```bash
deepl auth set-key <api-key>
```

**Arguments:**
- `<api-key>` - Your DeepL API key (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx`)

**Example:**
```bash
deepl auth set-key a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx
```

**Output:**
```
✓ API key configured successfully
Account type: DeepL API Free
```

##### `auth show`

Display the currently configured API key (masked) and validation status.

```bash
deepl auth show
```

**Output:**
```
API Key: abc12***********:fx (masked)
Status: Valid
```

##### `auth clear`

Remove the stored API key.

```bash
deepl auth clear
```

**Output:**
```
✓ API key cleared
```

### config

Manage CLI configuration.

#### Subcommands

##### `config list`

Display all configuration values as JSON.

```bash
deepl config list
```

**Output:**
```json
{
  "auth": {
    "apiKey": "..."
  },
  "api": {
    "baseUrl": "https://api-free.deepl.com/v2",
    "usePro": false
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
    "color": true,
    "verbose": false
  },
  "watch": {
    "debounceMs": 500,
    "autoCommit": false,
    "pattern": "**/*"
  },
  "team": {}
}
```

##### `config get`

Get a specific configuration value.

```bash
deepl config get <key>
```

**Arguments:**
- `<key>` - Configuration key (dot notation for nested values)

**Examples:**
```bash
deepl config get cache.enabled
# Output: true

deepl config get defaults.targetLangs
# Output: ["es","fr","de"]

deepl config get api.baseUrl
# Output: https://api-free.deepl.com/v2
```

##### `config set`

Set a configuration value.

```bash
deepl config set <key> <value>
```

**Arguments:**
- `<key>` - Configuration key (dot notation for nested values)
- `<value>` - Value to set (auto-parsed as JSON, arrays as comma-separated)

**Examples:**
```bash
# Set boolean
deepl config set cache.enabled false

# Set number
deepl config set cache.maxSize 2147483648

# Set string
deepl config set output.format json

# Set array (comma-separated)
deepl config set defaults.targetLangs es,fr,de
```

##### `config reset`

Reset all configuration to defaults.

```bash
deepl config reset
```

**Output:**
```
✓ Configuration reset to defaults
```

#### Configuration Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `auth.apiKey` | string | `undefined` | DeepL API key |
| `api.baseUrl` | string | `https://api-free.deepl.com/v2` | API endpoint |
| `api.usePro` | boolean | `false` | Use Pro API endpoint |
| `defaults.sourceLang` | string | `undefined` | Default source language |
| `defaults.targetLangs` | array | `[]` | Default target languages |
| `defaults.formality` | string | `default` | Default formality level |
| `defaults.preserveFormatting` | boolean | `true` | Preserve formatting by default |
| `cache.enabled` | boolean | `true` | Enable translation caching |
| `cache.maxSize` | number | `1073741824` | Max cache size in bytes (1GB) |
| `cache.ttl` | number | `2592000` | Cache TTL in seconds (30 days) |
| `output.format` | string | `text` | Output format (text/json) |
| `output.color` | boolean | `true` | Use colored output |
| `output.verbose` | boolean | `false` | Verbose logging |
| `watch.debounceMs` | number | `500` | File watch debounce (ms) |
| `watch.autoCommit` | boolean | `false` | Auto-commit translations |
| `watch.pattern` | string | `**/*` | File watch pattern |

#### Configuration File

Location: `~/.deepl-cli/config.json`

You can manually edit this file, but using `deepl config` commands is recommended.

### cache

Manage the local translation cache.

#### Subcommands

##### `cache stats`

Display cache statistics.

```bash
deepl cache stats
```

**Output:**
```
Cache Status: enabled
Entries: 42
Size: 1.23 MB / 1024.00 MB (0.1% used)
```

##### `cache clear`

Clear all cached translations.

```bash
deepl cache clear
```

**Output:**
```
✓ Cache cleared (removed 42 entries)
```

##### `cache enable`

Enable caching (persists to config).

```bash
deepl cache enable
```

**Output:**
```
✓ Cache enabled
```

##### `cache disable`

Disable caching (persists to config).

```bash
deepl cache disable
```

**Output:**
```
✓ Cache disabled
```

#### Cache Details

- **Storage**: SQLite database at `~/.deepl-cli/cache.db`
- **Strategy**: LRU (Least Recently Used) eviction when max size is reached
- **TTL**: 30 days by default (configurable via `cache.ttl`)
- **Key**: SHA-256 hash of `(text + options)`

### glossary

Manage DeepL glossaries for consistent terminology.

#### Subcommands

##### `glossary create`

Create a new glossary from a TSV/CSV file.

```bash
deepl glossary create <name> <source-lang> <target-lang> <file>
```

**Arguments:**
- `<name>` - Glossary name
- `<source-lang>` - Source language code (e.g., `en`)
- `<target-lang>` - Target language code (e.g., `de`)
- `<file>` - Path to TSV/CSV file with term pairs

**File Format (TSV):**
```tsv
source_term	target_term
API	API
REST	REST
authentication	Authentifizierung
```

**Example:**
```bash
echo -e "API\tAPI\nREST\tREST" > glossary.tsv
deepl glossary create tech-terms en de glossary.tsv
```

**Output:**
```
✓ Glossary created: tech-terms (ID: abc123...)
Language pair: EN → DE
Entries: 2
```

##### `glossary list`

List all glossaries.

```bash
deepl glossary list
```

**Output:**
```
Glossaries:

Name: tech-terms
ID: abc123...
Languages: EN → DE
Entries: 3
Created: 2024-10-07
```

##### `glossary show`

Show glossary details.

```bash
deepl glossary show <name-or-id>
```

**Arguments:**
- `<name-or-id>` - Glossary name or ID

**Example:**
```bash
deepl glossary show tech-terms
```

**Output:**
```
Glossary: tech-terms
ID: abc123...
Language Pair: EN → DE
Entry Count: 3
Created: 2024-10-07T12:34:56Z
```

##### `glossary entries`

Show all entries in a glossary.

```bash
deepl glossary entries <name-or-id>
```

**Arguments:**
- `<name-or-id>` - Glossary name or ID

**Example:**
```bash
deepl glossary entries tech-terms
```

**Output:**
```
Entries for glossary 'tech-terms':

API → API
REST → REST
authentication → Authentifizierung
```

##### `glossary delete`

Delete a glossary.

```bash
deepl glossary delete <name-or-id>
```

**Arguments:**
- `<name-or-id>` - Glossary name or ID

**Example:**
```bash
deepl glossary delete tech-terms
```

**Output:**
```
✓ Glossary deleted: tech-terms
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEEPL_API_KEY` | DeepL API key (alternative to `deepl auth set-key`) |
| `DEEPL_CONFIG_DIR` | Custom config directory (default: `~/.deepl-cli`) |

**Example:**
```bash
export DEEPL_API_KEY=a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx
deepl translate "Hello" --to es
```

## Configuration File

### Location

- Default: `~/.deepl-cli/config.json`
- Custom: Set `DEEPL_CONFIG_DIR` environment variable

### Format

JSON file with the following structure:

```json
{
  "auth": {
    "apiKey": "your-api-key"
  },
  "api": {
    "baseUrl": "https://api-free.deepl.com/v2",
    "usePro": false
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
    "color": true,
    "verbose": false
  },
  "watch": {
    "debounceMs": 500,
    "autoCommit": false,
    "pattern": "**/*"
  },
  "team": {}
}
```

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error (invalid arguments, API error, etc.) |
| `2` | Configuration error (missing API key, invalid config) |

## Examples

### Basic Translation Workflow

```bash
# Setup
deepl auth set-key YOUR_API_KEY

# Translate text
deepl translate "Hello world" --to es,fr,de

# Translate file
deepl translate README.md --to es --output README.es.md

# Check cache
deepl cache stats
```

### File Translation with Multiple Languages

```bash
# Create translated versions in a directory
mkdir translated
deepl translate docs.md --to es,fr,de,ja --output translated/

# Result:
# translated/docs.es.md
# translated/docs.fr.md
# translated/docs.de.md
# translated/docs.ja.md
```

### Glossary Workflow

```bash
# Create glossary file
cat > terms.tsv << EOF
API	API
authentication	Authentifizierung
REST	REST
EOF

# Create glossary
deepl glossary create tech en de terms.tsv

# List glossaries
deepl glossary list

# View entries
deepl glossary entries tech

# Clean up
deepl glossary delete tech
```

### Configuration Management

```bash
# Set defaults
deepl config set defaults.targetLangs es,fr,de
deepl config set defaults.formality more

# View all config
deepl config list

# View specific value
deepl config get defaults.targetLangs

# Reset to defaults
deepl config reset
```

### Cache Management

```bash
# Check cache status
deepl cache stats

# Clear cache to free space
deepl cache clear

# Disable caching temporarily
deepl cache disable

# Re-enable caching
deepl cache enable
```

### Using with Scripts

```bash
#!/bin/bash
# Translate all markdown files in docs/

for file in docs/*.md; do
  filename=$(basename "$file" .md)
  deepl translate "$file" --to es --output "docs/es/${filename}.es.md"
  deepl translate "$file" --to fr --output "docs/fr/${filename}.fr.md"
done

echo "✓ All documentation translated"
```

### CI/CD Integration

```bash
#!/bin/bash
# .github/workflows/translate-docs.sh

export DEEPL_API_KEY=${{ secrets.DEEPL_API_KEY }}

# Translate changed markdown files
for file in $(git diff --name-only main | grep '\.md$'); do
  deepl translate "$file" --to es,fr,de --output ./i18n/
done

# Commit translations
git add i18n/
git commit -m "chore: update translations"
git push
```

## Error Handling

### Common Errors

**API Key Not Set:**
```
Error: API key not set
Run: deepl auth set-key <your-api-key>
```

**Solution:** Set API key with `deepl auth set-key` or `export DEEPL_API_KEY=...`

**Invalid Target Language:**
```
Error: Invalid target language: 'xyz'
```

**Solution:** Use valid language codes (run `deepl translate --help` for list)

**File Not Found:**
```
Error: File not found: input.txt
```

**Solution:** Check file path is correct

**Output Required for File Translation:**
```
Error: Output file path is required for file translation. Use --output <path>
```

**Solution:** Add `--output` flag when translating files

**API Quota Exceeded:**
```
Error: Translation quota exceeded
```

**Solution:** Wait for quota reset or upgrade DeepL plan

## Support

- **Documentation**: https://github.com/yourusername/deepl-cli
- **Issues**: https://github.com/yourusername/deepl-cli/issues
- **DeepL API Docs**: https://www.deepl.com/docs-api

---

**Version**: 0.1.0
**Last Updated**: 2025-10-07
