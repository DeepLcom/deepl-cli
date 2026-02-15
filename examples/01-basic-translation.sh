#!/bin/bash
# Example 1: Basic Translation
# Demonstrates simple text translation with various options

set -e  # Exit on error

echo "=== DeepL CLI Example 1: Basic Translation ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# Example 1: Simple translation
echo "1. Simple translation (English → Spanish)"
deepl translate "Hello, world!" --to es
echo

# Example 2: Auto-detect source language
echo "2. Auto-detect source language (French → English)"
deepl translate "Bonjour, comment allez-vous?" --to en
echo

# Example 3: Specify source language explicitly
echo "3. Explicit source language (German → English)"
deepl translate "Guten Tag" --from de --to en
echo

# Example 4: Multiple target languages
echo "4. Multiple target languages (English → ES, FR, DE)"
deepl translate "Good morning" --to es,fr,de
echo

# Example 5: Formality levels
echo "5a. Formal translation (English → German, more formal)"
deepl translate "How are you?" --formality more --to de
echo

echo "5b. Informal translation (English → German, less formal)"
deepl translate "How are you?" --formality less --to de
echo

echo "5c. Prefer formal (soft preference - degrades gracefully for unsupported languages):"
deepl translate "How are you?" --formality prefer_more --to de
echo
echo "5d. Prefer informal (soft preference):"
deepl translate "How are you?" --formality prefer_less --to de
echo

# Example 6: Reading from stdin
echo "6. Reading from stdin"
echo "This is a test message" | deepl translate --to ja
echo

# Example 7: Long text
echo "7. Translating longer text"
deepl translate "The quick brown fox jumps over the lazy dog. This is a common English pangram used for testing." --to es
echo

# Example 8: Control sentence splitting
echo "8. Control sentence splitting"
echo "8a. Split sentences OFF (treat input as single unit):"
deepl translate "First sentence. Second sentence. Third sentence." --to es --split-sentences off
echo
echo "8b. No splitting on newlines:"
printf "Line one.\nLine two.\nLine three." | deepl translate --to es --split-sentences nonewlines
echo

echo "=== All examples completed successfully! ==="
