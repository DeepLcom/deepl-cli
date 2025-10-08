# DeepL CLI - API Reference

**Version**: 0.2.0
**Last Updated**: October 8, 2025

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
  - [auth](#auth)
- [Configuration](#configuration)
- [Exit Codes](#exit-codes)
- [Environment Variables](#environment-variables)

---

## Global Options

Options that work with all commands:

```bash
--version, -v        Show version number
--help, -h           Show help message
--config FILE        Use alternate config file
--no-cache           Disable translation cache for this command
--verbose            Enable verbose logging
--quiet, -q          Suppress non-error output
```

**Examples:**

```bash
# Show version
deepl --version
deepl -v

# Get help
deepl --help
deepl translate --help

# Use custom config
deepl --config ~/.deepl-custom.json translate "Hello" --to es

# Disable cache for single command
deepl --no-cache translate "Hello" --to es
```

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

#### Options

**Required:**
- `--to, -t LANGS` - Target language(s), comma-separated (e.g., `es`, `es,fr,de`)

**Source Options:**
- `--from, -f LANG` - Source language (auto-detect if omitted)
- `--context TEXT` - Additional context for better translation

**Output Options:**
- `--output, -o PATH` - Output file or directory
- `--format FORMAT` - Output format: `text` (default), `json`

**Translation Options:**
- `--formality LEVEL` - Formality: `default`, `less`, `more`, `prefer_less`, `prefer_more`
- `--preserve-code` - Preserve code blocks (markdown, etc.)
- `--preserve-vars` - Preserve variables like `{name}`, `${var}`
- `--preserve-formatting` - Preserve line breaks and formatting
- `--split-sentences LEVEL` - Sentence splitting: `on`, `off`, `nonewlines`
- `--tag-handling MODE` - XML tag handling: `xml`, `html`

**Glossary:**
- `--glossary NAME` - Use glossary by name or ID

**Batch Options (for directories):**
- `--recursive, -r` - Process subdirectories recursively
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

**With glossary:**
```bash
deepl translate docs/ --to es --glossary tech-terms --output docs-es/
```

**Formality levels:**
```bash
# Formal
deepl translate "How are you?" --to de --formality more
# → "Wie geht es Ihnen?" (formal)

# Informal
deepl translate "How are you?" --to de --formality less
# → "Wie geht es dir?" (informal)
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
- `--alternatives` - Show all improvement alternatives
- `--format FORMAT` - Output format: `text` (default), `json`
- `--interactive, -i` - Interactive mode: choose from multiple alternatives
- `--diff` - Show diff between original and improved text
- `--check` - Check if text needs improvement without modifying
- `--fix` - Auto-fix files in place
- `--output, -o FILE` - Write output to file
- `--in-place` - Edit file in place
- `--backup` - Create backup before fixing (use with `--fix`)

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

---

### watch

Watch files or directories for changes and auto-translate.

#### Synopsis

```bash
deepl watch [OPTIONS] PATH
```

#### Description

Monitor files or directories for changes and automatically translate them. Supports debouncing, glob patterns, and multiple target languages.

#### Options

**Required:**
- `--targets, -t LANGS` - Target language(s), comma-separated

**Watch Options:**
- `--output, -o DIR` - Output directory (default: `./translations` for directories, same dir for files)
- `--pattern GLOB` - File pattern filter (e.g., `*.md`, `**/*.json`)
- `--debounce MS` - Debounce delay in milliseconds (default: 300)

**Translation Options:**
- `--from, -f LANG` - Source language (auto-detect if omitted)
- `--formality LEVEL` - Formality level
- `--preserve-code` - Preserve code blocks
- `--glossary NAME` - Use glossary

**Git Integration:**
- `--auto-commit` - Auto-commit translations to git after each change

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

##### `create <name> <source-lang> <target-lang> [file]`

Create a new glossary.

**Examples:**
```bash
deepl glossary create tech-terms en es glossary.tsv
```

##### `list`

List all glossaries.

##### `show <name-or-id>`

Show glossary details and entries.

##### `delete <name-or-id>`

Delete a glossary.

##### `entries <name-or-id>`

Get glossary entries in TSV format.

---

### cache

Manage translation cache.

#### Synopsis

```bash
deepl cache <SUBCOMMAND>
```

#### Subcommands

##### `stats`
Show cache statistics.

##### `clear`
Clear all cache entries.

##### `enable [--max-size SIZE]`
Enable cache.

##### `disable`
Disable cache.

---

### config

Manage CLI configuration.

#### Synopsis

```bash
deepl config <SUBCOMMAND>
```

#### Subcommands

##### `list`
List all configuration values.

##### `get <key>`
Get a specific configuration value.

##### `set <key> <value>`
Set a configuration value.

##### `reset`
Reset configuration to defaults.

---

### auth

Manage API authentication.

#### Synopsis

```bash
deepl auth <SUBCOMMAND>
```

#### Subcommands

##### `set-key <api-key>`
Set your DeepL API key.

##### `show`
Show current API key (masked).

##### `clear`
Clear stored API key.

---

## Configuration

Configuration file location: `~/.deepl-cli/config.json`

### Configuration Schema

```json
{
  "apiKey": "your-api-key",
  "defaults": {
    "targetLang": "es",
    "sourceLang": null,
    "formality": "default",
    "preserveFormatting": false,
    "preserveCode": true,
    "splitSentences": "on"
  },
  "cache": {
    "enabled": true,
    "maxSize": 104857600,
    "ttl": 2592000
  },
  "output": {
    "format": "text",
    "colorize": true
  }
}
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Authentication error |
| 4 | API error (quota, rate limit, etc.) |
| 5 | Network error |
| 6 | File not found |
| 7 | Configuration error |

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

- [Quickstart Guide](./QUICKSTART.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [Examples](../examples/)
- [DeepL API Documentation](https://www.deepl.com/docs-api)

---

**Last Updated**: October 8, 2025
**DeepL CLI Version**: 0.2.0
