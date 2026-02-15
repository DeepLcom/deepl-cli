#!/bin/bash
# Example 27: Admin API
# Manage API keys and view organization usage analytics (requires admin API key)

set -e

echo "=== DeepL CLI Example 27: Admin API ==="
echo
echo "Note: Admin API requires an admin-level API key."
echo "These commands manage developer keys and usage analytics for your organization."
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "API key configured"
echo

# 1. List API keys
echo "1. Listing API keys"
echo "   Shows all developer API keys in your organization."
deepl admin keys list || echo "   (Admin API access required)"
echo

# 2. List keys in JSON format
echo "2. JSON output format"
echo "   Useful for scripting and automation..."
deepl admin keys list --format json || echo "   (Admin API access required)"
echo

# 3. Create a new API key
echo "3. Creating a new API key (skipped in demo)"
echo '   Command: deepl admin keys create --label "My New Key"'
echo "   This would create a new developer API key with the given label."
echo

# 4. Rename an API key
echo "4. Renaming an API key (skipped in demo)"
echo '   Command: deepl admin keys rename <key-id> "New Label"'
echo "   This would update the label of an existing API key."
echo

# 5. Set usage limit
echo "5. Setting usage limits (skipped in demo)"
echo '   Command: deepl admin keys set-limit <key-id> 1000000'
echo '   Command: deepl admin keys set-limit <key-id> unlimited'
echo "   This would set or remove character usage limits for a key."
echo

echo "   Set STT (speech-to-text) limit:"
echo "   deepl admin keys set-limit <key-id> 1000000 --stt-limit 3600000"
echo
echo "   Deactivate a key (irreversible!):"
echo "   deepl admin keys deactivate <key-id> --yes"
echo

# 6. View organization usage
echo "6. Viewing organization usage analytics"
echo "   Shows translation usage across all keys for a date range."
deepl admin usage --start 2024-01-01 --end 2024-12-31 || echo "   (Admin API access required)"
echo

# 7. Usage grouped by key
echo "7. Usage grouped by key"
echo "   Groups usage data by individual API key."
deepl admin usage --start 2024-01-01 --end 2024-12-31 --group-by key || echo "   (Admin API access required)"
echo

# 8. Usage grouped by key and day
echo "8. Usage grouped by key and day"
echo "   Provides daily usage breakdown per key."
deepl admin usage --start 2024-01-01 --end 2024-01-31 --group-by key_and_day || echo "   (Admin API access required)"
echo

# 9. Usage in JSON format
echo "9. Usage analytics in JSON format"
deepl admin usage --start 2024-01-01 --end 2024-12-31 --format json || echo "   (Admin API access required)"
echo

echo "=== All examples completed successfully! ==="
