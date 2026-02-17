#!/bin/bash
# Example 28: Setup Wizard (deepl init)
# Demonstrates first-time interactive setup

set -e  # Exit on error

echo "=== DeepL CLI Example 28: Setup Wizard ==="
echo

# Note: deepl init is an interactive wizard that requires terminal input.
# This example shows the command usage and what to expect.

echo "The 'deepl init' command provides an interactive setup wizard"
echo "for first-time configuration of the DeepL CLI."
echo

echo "=== Running the Setup Wizard ==="
echo
echo "To start the wizard, simply run:"
echo "  deepl init"
echo
echo "The wizard will guide you through:"
echo "  1. Entering your DeepL API key"
echo "  2. Validating the key against the DeepL API"
echo "  3. Choosing a default target language"
echo

echo "=== What to Expect ==="
echo
echo "Step 1: API Key"
echo "  ? Enter your DeepL API key: ********"
echo "  Validating API key..."
echo "  API key validated and saved."
echo
echo "Step 2: Default Target Language"
echo "  ? Choose a default target language:"
echo "    German (DE)"
echo "    Spanish (ES)"
echo "    French (FR)"
echo "    Italian (IT)"
echo "    Japanese (JA)"
echo "    Dutch (NL)"
echo "    Polish (PL)"
echo "    Portuguese - Brazilian (PT-BR)"
echo "    Russian (RU)"
echo "    Chinese (ZH)"
echo "    English - American (EN-US)"
echo "    English - British (EN-GB)"
echo "    Skip (set later)"
echo

echo "=== Getting an API Key ==="
echo
echo "If you don't have an API key yet:"
echo "  1. Sign up at https://www.deepl.com/pro-api"
echo "  2. Go to your account settings"
echo "  3. Copy your Authentication Key"
echo

echo "=== Alternative: Non-Interactive Setup ==="
echo
echo "The init wizard requires a terminal. For scripts and CI/CD,"
echo "use individual commands instead:"
echo
echo "  # Set API key directly"
echo "  deepl auth set-key YOUR_API_KEY"
echo
echo "  # Or from stdin (for CI/CD pipelines)"
echo '  echo "$DEEPL_API_KEY" | deepl auth set-key --from-stdin'
echo
echo "  # Set default target language"
echo "  deepl config set defaults.targetLangs es"
echo

echo "=== After Setup ==="
echo
echo "Once configured, try these commands:"
echo '  deepl translate "Hello world" --to es    Translate text'
echo '  deepl write "Check this text" --to en    Improve writing'
echo "  deepl glossary list                      List glossaries"
echo "  deepl usage                              Check API usage"
echo "  deepl --help                             See all commands"
echo

echo "=== All examples completed successfully! ==="
