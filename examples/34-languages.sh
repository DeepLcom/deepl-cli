#!/bin/bash
# List Supported Languages
# Demonstrates listing source and target languages supported by DeepL,
# including extended languages and graceful degradation without an API key

set -e  # Exit on error

echo "=== DeepL CLI: Supported Languages ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl init, or: deepl auth set-key --from-stdin < keyfile"
  exit 1
fi

echo "✓ API key configured"
echo

# Example 1: List all languages (both source and target)
echo "1. List all supported languages (both source and target)"
deepl languages
echo

# Example 2: List only source languages
echo "2. List only source languages"
deepl languages --source
echo

# Example 3: List only target languages
echo "3. List only target languages"
deepl languages --target
echo

# Example 4: Use in scripts to check language support
echo "4. Checking language support in scripts"
echo "   Example: Check if Japanese is supported as target language"
echo
cat << 'EOF'
# Bash script snippet for checking language support:
if deepl languages --target | grep -q "ja"; then
  echo "✓ Japanese is supported as a target language"
  # Proceed with Japanese translation
else
  echo "❌ Japanese is not supported"
  exit 1
fi
EOF
echo

echo "5. Languages in JSON format (for scripting):"
deepl languages --format json | head -10
echo

echo "6. Target languages in JSON format:"
deepl languages --target --format json | head -10
echo

# Example 7: Which features each language supports
echo "7. Feature support per language"
echo "   Columns only appear for features that differ between languages;"
echo "   one supported by all of them is summarised on the last line."
deepl languages --target --features | head -12
echo

echo "8. The same matrix as columns"
deepl languages --target --features --format table | head -10
echo

# Example 9: Preflight a feature in a script
echo "9. Checking feature support before using a flag"
echo
cat << 'EOF'
# Bash snippet: only pass --glossary when the target supports glossaries.
supports() {  # supports <lang> <feature>
  deepl languages --target --features --format json \
    | jq -e --arg l "$1" --arg f "$2" \
        '.[] | select(.language == $l) | .features | has($f)' >/dev/null
}

if supports th glossary; then
  deepl translate --from en --to th --glossary my-terms "Hello"
else
  echo "Thai does not support glossaries; translating without one"
  deepl translate --to th "Hello"
fi
EOF
echo

echo "=== Language listing example completed! ===="
echo

echo "💡 Language categories:"
echo "   - Core (32): Full support - formality, glossaries, all model types"
echo "   - Regional (11): Target-only variants (en-us, en-gb, de-ch, fr-ca, pt-br, etc.)"
echo "   - Extended (82): quality_optimized only, no formality or glossaries"
echo "   - --features is finer-grained than these tiers: some extended languages"
echo "     do support style rules and translation memory"
echo

echo "📚 Language notes:"
echo "   - Source languages: Languages you can translate FROM"
echo "   - Target languages: Languages you can translate TO"
echo "   - Regional variants only available as targets (e.g., en-us, en-gb)"
echo "   - Extended languages shown in a separate section"
echo "   - Works without API key (shows local registry data with a warning)"
echo

echo "🔍 Common language codes:"
echo "   - en: English (source only)"
echo "   - en-us: English (American) - target only"
echo "   - en-gb: English (British) - target only"
echo "   - de: German"
echo "   - fr: French"
echo "   - es: Spanish"
echo "   - ja: Japanese"
echo "   - zh: Chinese"
echo "   - hi: Hindi (extended)"
echo "   - sw: Swahili (extended)"
echo

echo "=== All examples completed successfully! ==="
