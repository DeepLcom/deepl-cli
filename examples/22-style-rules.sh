#!/bin/bash
# Example 22: Style Rules
# List and use DeepL style rules for consistent translation styles (Pro API only)

set -e

echo "=== DeepL CLI Example 22: Style Rules ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "❌ Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "✓ API key configured"
echo

# 1. List available style rules
echo "1. Listing available style rules"
echo "   Note: Style rules are created via the DeepL web UI."
echo "   This lists rules available on your account."
deepl style-rules list || echo "   (No style rules found or Pro API required)"
echo

# 2. List with detailed information
echo "2. Detailed style rules listing"
echo "   Shows configured rules and custom instructions for each style rule..."
deepl style-rules list --detailed || echo "   (No style rules found or Pro API required)"
echo

# 3. JSON output format
echo "3. JSON output format"
echo "   Useful for scripting and automation..."
deepl style-rules list --format json || echo "   (No style rules found or Pro API required)"
echo

# 4. Pagination
echo "4. Paginated listing"
echo "   Useful when you have many style rules..."
deepl style-rules list --page 1 --page-size 5 || echo "   (No style rules found or Pro API required)"
echo

# 5. Using a style rule with translation
echo "5. Applying a style rule to translation"
echo "   Tip: Get the style ID from 'deepl style-rules list' and use it with --style-id"
echo "   Example: deepl translate \"Hello\" --to de --style-id \"your-style-uuid\""
echo "   Note: Style rules force the quality_optimized model type."
echo

echo "6. Use style rule with translation (if available):"
STYLE_RULE=$(deepl style-rules list --format json 2>/dev/null | jq -r '.[0] // empty' 2>/dev/null)
STYLE_ID=$(echo "$STYLE_RULE" | jq -r '.styleId // empty' 2>/dev/null)
STYLE_LANG=$(echo "$STYLE_RULE" | jq -r '.language // empty' 2>/dev/null)
if [ -n "$STYLE_ID" ] && [ -n "$STYLE_LANG" ]; then
  echo "   Found style rule: $STYLE_ID (language: $STYLE_LANG)"
  deepl translate "Hello world" --to "$STYLE_LANG" --style-id "$STYLE_ID"
else
  echo "   No style rules configured. Create them in the DeepL Pro dashboard."
  echo "   Usage: deepl translate \"Hello world\" --to <lang> --style-id \"YOUR-STYLE-UUID\""
fi
echo

echo "=== All examples completed successfully! ==="
