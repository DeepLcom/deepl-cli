#!/bin/bash
# Example 11: List Supported Languages
# Demonstrates listing source and target languages supported by DeepL

set -e  # Exit on error

echo "=== DeepL CLI Example 11: Supported Languages ===="
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
  echo "✗ Japanese is not supported"
  exit 1
fi
EOF
echo

echo "=== Language listing example completed! ===="
echo

echo "💡 Language listing benefits:"
echo "   - Discover all available languages"
echo "   - Check source vs target language differences"
echo "   - Validate language codes before translation"
echo "   - Script-friendly output for automation"
echo

echo "📚 Language notes:"
echo "   - Source languages: Languages you can translate FROM"
echo "   - Target languages: Languages you can translate TO"
echo "   - Some languages only available as targets (e.g., en-us, en-gb)"
echo "   - Language codes are case-insensitive in CLI commands"
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
echo
