#!/bin/bash
# Example 33: Translation Memory listing
# Lists all translation memories on the current DeepL account.
# TM files are authored and uploaded via the DeepL web UI; this CLI
# surfaces them so you can copy a UUID or name into a translate or
# sync invocation without leaving the terminal.

set -e

echo "=== DeepL CLI Example 33: deepl tm list ==="
echo

if ! deepl auth show &>/dev/null; then
  echo "ERROR: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "Text output (human-readable):"
echo "---"
deepl tm list
echo
echo "JSON output (scriptable — pipe through jq):"
echo "---"
deepl tm list --format json
echo

echo "Tip: once you have a UUID or name, use it with:"
echo "  deepl translate --from en --to de --translation-memory <name-or-uuid> file.txt"
echo "Or in .deepl-sync.yaml under translation.translation_memory."
